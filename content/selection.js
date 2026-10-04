// Selection box: create by drag, move by dragging inside, resize with 8 handles.
// The selection rectangle is kept in DOCUMENT coordinates (api.setSelection),
// so it survives / grows across page scrolling. Rendering converts to viewport.

const MIN_SIZE = 10;
const DIRS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

let ctx = null; // { api, box, label, drag, autoscroll }

export function attachSelection(api) {
  if (ctx) detach();
  const root = api.root;
  const box = api.el('div', 'selection hidden');
  DIRS.forEach((dir) => {
    const h = api.el('div', 'handle');
    h.dataset.dir = dir;
    box.appendChild(h);
  });
  const label = api.el('div', 'size-label');
  box.appendChild(label);
  root.appendChild(box);

  ctx = { api, box, label, drag: null, autoscroll: null };

  root.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove, true);
  window.addEventListener('pointerup', onPointerUp, true);
  window.addEventListener('pointercancel', onPointerUp, true);
  window.addEventListener('scroll', render, true);
  window.addEventListener('resize', render, true);
  window.addEventListener('wheel', onWheel, { capture: true, passive: false });

  api.onClose(detach);

  // Optional: edge auto-scroll engine (T4)
  import(chrome.runtime.getURL('content/autoscroll.js'))
    .then((m) => { if (ctx && typeof m.createAutoScroll === 'function') ctx.autoscroll = m.createAutoScroll(api); })
    .catch(() => {});

  render();
  return selectionApi;
}

function detach() {
  if (!ctx) return;
  const { api } = ctx;
  ctx.autoscroll?.stop?.();
  api.root?.removeEventListener('pointerdown', onPointerDown);
  window.removeEventListener('pointermove', onPointerMove, true);
  window.removeEventListener('pointerup', onPointerUp, true);
  window.removeEventListener('pointercancel', onPointerUp, true);
  window.removeEventListener('scroll', render, true);
  window.removeEventListener('resize', render, true);
  window.removeEventListener('wheel', onWheel, { capture: true });
  ctx = null;
}

// ---- document geometry helpers ------------------------------------------

export function docSize() {
  const de = document.documentElement;
  const b = document.body;
  return {
    width: Math.max(de.scrollWidth, b?.scrollWidth || 0, de.clientWidth),
    height: Math.max(de.scrollHeight, b?.scrollHeight || 0, de.clientHeight),
  };
}

export function clampRect(r) {
  const d = docSize();
  let x = Math.max(0, Math.min(r.x, d.width - MIN_SIZE));
  let y = Math.max(0, Math.min(r.y, d.height - MIN_SIZE));
  let w = Math.max(MIN_SIZE, Math.min(r.width, d.width - x));
  let h = Math.max(MIN_SIZE, Math.min(r.height, d.height - y));
  return { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) };
}

function normalize(x1, y1, x2, y2) {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

// ---- pointer handling ----------------------------------------------------

function onPointerDown(e) {
  if (!ctx || e.button !== 0) return;
  const path = e.composedPath();
  // Ignore clicks on toolbar / other UI inside the shadow root
  if (path.some((n) => n?.classList?.contains?.('toolbar') || n?.classList?.contains?.('no-select'))) return;

  const docX = e.clientX + window.scrollX;
  const docY = e.clientY + window.scrollY;
  const handle = path.find((n) => n?.classList?.contains?.('handle'));
  const sel = ctx.api.getSelection();

  if (handle && sel) {
    ctx.drag = { mode: 'resize', dir: handle.dataset.dir, start: sel, pointer: { x: docX, y: docY } };
  } else if (sel && path.includes(ctx.box)) {
    ctx.drag = { mode: 'move', start: sel, pointer: { x: docX, y: docY }, pointer0: { x: docX, y: docY } };
  } else {
    ctx.drag = { mode: 'create', origin: { x: docX, y: docY }, pointer: { x: docX, y: docY } };
    ctx.api.setSelection(null);
  }
  ctx.drag.lastClient = { x: e.clientX, y: e.clientY };
  e.preventDefault();
  e.stopPropagation();
  ctx.autoscroll?.start?.(() => applyDrag());
}

function onPointerMove(e) {
  if (!ctx?.drag) return;
  ctx.drag.lastClient = { x: e.clientX, y: e.clientY };
  ctx.drag.pointer = { x: e.clientX + window.scrollX, y: e.clientY + window.scrollY };
  ctx.autoscroll?.update?.(e.clientX, e.clientY);
  applyDrag();
  e.preventDefault();
}

function onPointerUp(e) {
  if (!ctx?.drag) return;
  ctx.autoscroll?.stop?.();
  const d = ctx.drag;
  ctx.drag = null;
  if (d.mode === 'create') {
    const sel = ctx.api.getSelection();
    if (!sel || sel.width < MIN_SIZE || sel.height < MIN_SIZE) {
      ctx.api.setSelection(null);
    }
  }
  render();
}

function onWheel(e) {
  // While dragging, let the wheel scroll the page and keep the selection following the pointer.
  if (!ctx?.drag) return;
  // Allow native scroll to happen, then recompute using the last known client position.
  requestAnimationFrame(() => {
    if (!ctx?.drag) return;
    const c = ctx.drag.lastClient;
    ctx.drag.pointer = { x: c.x + window.scrollX, y: c.y + window.scrollY };
    applyDrag();
  });
}

/** Recompute the selection from the current drag state (also called by autoscroll each frame). */
function applyDrag() {
  if (!ctx?.drag) return;
  const d = ctx.drag;
  if (d.lastClient) {
    // Pointer document position must track the current scroll offset.
    d.pointer = { x: d.lastClient.x + window.scrollX, y: d.lastClient.y + window.scrollY };
  }
  let rect;
  if (d.mode === 'create') {
    rect = normalize(d.origin.x, d.origin.y, d.pointer.x, d.pointer.y);
    if (rect.width < 1 && rect.height < 1) return;
  } else if (d.mode === 'move') {
    const dx = d.pointer.x - d.pointer0.x;
    const dy = d.pointer.y - d.pointer0.y;
    const ds = docSize();
    rect = {
      x: Math.max(0, Math.min(d.start.x + dx, ds.width - d.start.width)),
      y: Math.max(0, Math.min(d.start.y + dy, ds.height - d.start.height)),
      width: d.start.width,
      height: d.start.height,
    };
  } else {
    rect = resizeRect(d.start, d.dir, d.pointer);
  }
  ctx.api.setSelection(clampRect(rect));
  render();
}

function resizeRect(start, dir, p) {
  let x1 = start.x, y1 = start.y, x2 = start.x + start.width, y2 = start.y + start.height;
  if (dir.includes('w')) x1 = p.x;
  if (dir.includes('e')) x2 = p.x;
  if (dir.includes('n')) y1 = p.y;
  if (dir.includes('s')) y2 = p.y;
  return normalize(x1, y1, x2, y2);
}

// ---- rendering -------------------------------------------------------------

export function render() {
  if (!ctx) return;
  const { api, box, label } = ctx;
  const sel = api.getSelection();
  if (!sel) {
    box.classList.add('hidden');
    return;
  }
  box.classList.remove('hidden');
  const left = sel.x - window.scrollX;
  const top = sel.y - window.scrollY;
  box.style.left = `${left}px`;
  box.style.top = `${top}px`;
  box.style.width = `${sel.width}px`;
  box.style.height = `${sel.height}px`;
  label.textContent = `${sel.width} × ${sel.height} px`;
  box.classList.toggle('label-inside', top < 36);
  api.relayout();
}

export const selectionApi = {
  render,
  docSize,
  clampRect,
  MIN_SIZE,
};
