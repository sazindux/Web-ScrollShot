// Crop tool.
//
// Model: `editor.crop` = { x, y, width, height } in FULL-IMAGE pixels — the
// region that is shown in the workspace and exported. The base image is never
// modified; CanvasView.setCropRect() just offsets the canvases, so annotation
// coordinates (T10) stay valid across crops. Applying a crop pushes a command
// onto editor.history (undo restores the previous rect).
//
// While crop mode is active the full image is shown again and a draft rect is
// edited through a viewport-space box (#crop-layer) with 8 handles, drag-move,
// drag-to-create, numeric inputs and an aspect-ratio lock.
import { showToast } from './ui.js';
import { isEditable } from './canvas-view.js';

const $ = (sel) => document.querySelector(sel);
const MIN_SIZE = 1;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function initCrop(editor) {
  const view = editor.view;
  const layer = $('#crop-layer');
  const box = $('#crop-box');
  const label = $('#crop-label');
  const inputW = $('#crop-w');
  const inputH = $('#crop-h');
  const linkBtn = $('#crop-link');
  const aspectToggle = $('#crop-aspect');
  const actions = $('#crop-actions');
  const cropBtn = $('#btn-crop');
  const workspace = $('#workspace');

  const state = {
    active: false,
    draft: null,          // rect being edited (image px, integers)
    ratio: null,          // locked aspect ratio (w / h) or null
    drag: null,
  };

  /* ───────── helpers ───────── */

  const fullRect = () => ({ x: 0, y: 0, width: view.imageWidth, height: view.imageHeight });
  const sameRect = (a, b) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

  function normalise(r) {
    const W = view.imageWidth, H = view.imageHeight;
    let x = Math.round(clamp(r.x, 0, W - MIN_SIZE));
    let y = Math.round(clamp(r.y, 0, H - MIN_SIZE));
    let w = Math.round(clamp(r.width, MIN_SIZE, W - x));
    let h = Math.round(clamp(r.height, MIN_SIZE, H - y));
    return { x, y, width: w, height: h };
  }

  function setDraft(r) {
    state.draft = normalise(r);
    render();
    syncInputs();
  }

  function syncInputs() {
    const r = state.active ? state.draft : editor.crop;
    if (!r) return;
    if (document.activeElement !== inputW) inputW.value = r.width;
    if (document.activeElement !== inputH) inputH.value = r.height;
  }

  function render() {
    if (!state.active || !state.draft) return;
    const r = state.draft;
    const p = view.toViewport(r.x, r.y);
    const w = r.width * view.zoom, h = r.height * view.zoom;
    box.style.left = `${p.x}px`;
    box.style.top = `${p.y}px`;
    box.style.width = `${w}px`;
    box.style.height = `${h}px`;
    label.textContent = `${r.width} × ${r.height}`;
    const vh = view.viewportSize().h;
    box.classList.toggle('label-inside', p.y + h + 36 > vh);
  }

  /* ───────── mode switching ───────── */

  function start() {
    if (!editor.image || state.active) return;
    if (editor.hooks.onCropStart?.() === false) return;
    state.active = true;
    state.draft = { ...editor.crop };
    view.setCropRect(fullRect());         // reveal the whole image while editing
    layer.hidden = false;
    actions.hidden = false;
    cropBtn.classList.add('active');
    workspace.classList.add('cropping');
    render();
    syncInputs();
  }

  function finish() {
    state.active = false;
    state.drag = null;
    layer.hidden = true;
    actions.hidden = true;
    cropBtn.classList.remove('active');
    workspace.classList.remove('cropping');
    view.setCropRect(editor.crop);
    syncInputs();
    editor.hooks.onCropEnd?.();
  }

  function cancel() {
    if (!state.active) return;
    finish();
  }

  function applyRect(rect) {
    editor.crop = { ...rect };
    if (!state.active) view.setCropRect(editor.crop);
    syncInputs();
    editor.hooks.onCropChange?.(editor.crop);
  }

  function apply() {
    if (!state.active) return;
    const prev = { ...editor.crop };
    const next = normalise(state.draft);
    if (sameRect(prev, next)) { finish(); return; }
    applyRect(next);
    editor.history?.push({
      label: 'Crop',
      undo: () => applyRect(prev),
      redo: () => applyRect(next),
    });
    finish();
    showToast(`Cropped to ${next.width} × ${next.height}`);
  }

  function toggle() { state.active ? cancel() : start(); }

  /* ───────── pointer interaction ───────── */

  layer.addEventListener('pointerdown', (e) => {
    if (!state.active || e.button !== 0 || view.isPanTrigger(e)) return;
    e.preventDefault();
    const handle = e.target.closest('.crop-handle')?.dataset.handle;
    const inside = !handle && e.target.closest('.crop-box');
    const pt = view.toImage(e.clientX, e.clientY);
    const r = { ...state.draft };
    if (handle) {
      state.drag = { kind: 'resize', handle, start: r, ratio: state.ratio };
    } else if (inside) {
      state.drag = { kind: 'move', start: r, px: pt.x, py: pt.y };
    } else {
      // Drag on the dimmed area → create a fresh rect from this point.
      const ax = clamp(pt.x, 0, view.imageWidth), ay = clamp(pt.y, 0, view.imageHeight);
      state.drag = { kind: 'create', ax, ay, ratio: state.ratio, moved: false };
      setDraft({ x: ax, y: ay, width: MIN_SIZE, height: MIN_SIZE });
    }
    state.drag.id = e.pointerId;
    layer.setPointerCapture(e.pointerId);
  });

  layer.addEventListener('pointermove', (e) => {
    const d = state.drag;
    if (!d || e.pointerId !== d.id) return;
    const pt = view.toImage(e.clientX, e.clientY);
    const W = view.imageWidth, H = view.imageHeight;
    if (d.kind === 'move') {
      const r = d.start;
      const nx = clamp(Math.round(r.x + pt.x - d.px), 0, W - r.width);
      const ny = clamp(Math.round(r.y + pt.y - d.py), 0, H - r.height);
      setDraft({ ...r, x: nx, y: ny });
    } else if (d.kind === 'resize') {
      setDraft(resizeRect(d.start, d.handle, pt, d.ratio, W, H));
    } else if (d.kind === 'create') {
      d.moved = true;
      const cx = clamp(pt.x, 0, W), cy = clamp(pt.y, 0, H);
      let x = Math.min(d.ax, cx), y = Math.min(d.ay, cy);
      let w = Math.abs(cx - d.ax), h = Math.abs(cy - d.ay);
      if (d.ratio) {
        // Fit the ratio inside the dragged extent, anchored at the start corner.
        if (w / Math.max(h, 1) > d.ratio) w = h * d.ratio; else h = w / d.ratio;
        x = cx < d.ax ? d.ax - w : d.ax;
        y = cy < d.ay ? d.ay - h : d.ay;
      }
      setDraft({ x, y, width: Math.max(w, MIN_SIZE), height: Math.max(h, MIN_SIZE) });
    }
  });

  const endDrag = (e) => {
    const d = state.drag;
    if (!d || e.pointerId !== d.id) return;
    try { layer.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    state.drag = null;
    // A plain click on the dimmed area (no drag) keeps the previous rect.
    if (d.kind === 'create' && !d.moved) setDraft(editor.crop);
  };
  layer.addEventListener('pointerup', endDrag);
  layer.addEventListener('pointercancel', endDrag);
  box.addEventListener('dblclick', (e) => { e.preventDefault(); apply(); });

  /* ───────── numeric inputs + aspect lock ───────── */

  function setAspectLock(on) {
    state.ratio = on ? (state.draft ?? editor.crop).width / (state.draft ?? editor.crop).height : null;
    aspectToggle.checked = on;
    linkBtn.setAttribute('aria-pressed', String(on));
  }
  aspectToggle.addEventListener('change', () => setAspectLock(aspectToggle.checked));
  linkBtn.addEventListener('click', () => setAspectLock(!aspectToggle.checked));

  function fromInputs(changed) {
    if (!editor.image) return;
    if (!state.active) start();
    const r = { ...state.draft };
    const W = view.imageWidth, H = view.imageHeight;
    let w = parseInt(inputW.value, 10), h = parseInt(inputH.value, 10);
    if (changed === 'w') {
      if (!Number.isFinite(w)) return;
      w = clamp(w, MIN_SIZE, W);
      if (state.ratio) h = clamp(Math.round(w / state.ratio), MIN_SIZE, H);
      else h = r.height;
    } else {
      if (!Number.isFinite(h)) return;
      h = clamp(h, MIN_SIZE, H);
      if (state.ratio) w = clamp(Math.round(h * state.ratio), MIN_SIZE, W);
      else w = r.width;
    }
    // Keep the top-left anchored; shift it only when the rect would overflow.
    const x = Math.min(r.x, W - w), y = Math.min(r.y, H - h);
    setDraft({ x, y, width: w, height: h });
    if (changed === 'w') inputH.value = state.draft.height; else inputW.value = state.draft.width;
  }
  inputW.addEventListener('change', () => fromInputs('w'));
  inputH.addEventListener('change', () => fromInputs('h'));
  for (const el of [inputW, inputH]) {
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); fromInputs(el === inputW ? 'w' : 'h'); apply(); }
      if (e.key === 'Escape') { e.preventDefault(); el.blur(); cancel(); }
    });
  }

  /* ───────── buttons + keys ───────── */

  cropBtn.addEventListener('click', toggle);
  $('#crop-apply').addEventListener('click', apply);
  $('#crop-cancel').addEventListener('click', cancel);

  window.addEventListener('keydown', (e) => {
    if (isEditable(e.target)) return;
    if (state.active) {
      if (e.key === 'Escape') { cancel(); e.preventDefault(); }
      else if (e.key === 'Enter') { apply(); e.preventDefault(); }
    } else if ((e.key === 'c' || e.key === 'C') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      start(); e.preventDefault();
    }
  });

  // Re-position the box whenever zoom / pan / viewport size change.
  const prevViewChange = view.onViewChange;
  view.onViewChange = (info) => { prevViewChange?.(info); render(); };

  // Undo/redo during an active crop edit would desync the draft → cancel first.
  const prevBefore = editor.hooks.beforeHistory;
  editor.hooks.beforeHistory = () => {
    if (prevBefore && prevBefore() === false) return false;
    if (state.active) cancel();
    return true;
  };

  // Image loaded → crop = full image, inputs pre-filled.
  const prevLoaded = editor.hooks.onImageLoaded;
  editor.hooks.onImageLoaded = (canvas) => {
    prevLoaded?.(canvas);
    editor.crop = { x: 0, y: 0, width: canvas.width, height: canvas.height };
    inputW.max = canvas.width;
    inputH.max = canvas.height;
    syncInputs();
  };

  editor.hooks.crop = { start, apply, cancel, toggle, isActive: () => state.active };
  return editor.hooks.crop;
}

/* ───────── geometry ───────── */

/** Resize `start` by dragging `handle` to image point `pt`, optionally keeping `ratio`. */
export function resizeRect(start, handle, pt, ratio, W, H) {
  let left = start.x, top = start.y, right = start.x + start.width, bottom = start.y + start.height;
  const px = clamp(pt.x, 0, W), py = clamp(pt.y, 0, H);
  const hasW = handle.includes('w'), hasE = handle.includes('e');
  const hasN = handle.includes('n'), hasS = handle.includes('s');

  if (hasW) left = Math.min(px, right - MIN_SIZE);
  if (hasE) right = Math.max(px, left + MIN_SIZE);
  if (hasN) top = Math.min(py, bottom - MIN_SIZE);
  if (hasS) bottom = Math.max(py, top + MIN_SIZE);

  if (ratio) {
    let w = right - left, h = bottom - top;
    const horizontalOnly = (hasW || hasE) && !(hasN || hasS);
    const verticalOnly = (hasN || hasS) && !(hasW || hasE);
    if (horizontalOnly) h = w / ratio;
    else if (verticalOnly) w = h * ratio;
    else if (w / h > ratio) h = w / ratio; else w = h * ratio;

    // Anchor the opposite edge/corner; edge handles grow symmetrically on the other axis.
    if (hasW) left = right - w; else if (hasE) right = left + w;
    else { const cx = (left + right) / 2; left = cx - w / 2; right = cx + w / 2; }
    if (hasN) top = bottom - h; else if (hasS) bottom = top + h;
    else { const cy = (top + bottom) / 2; top = cy - h / 2; bottom = cy + h / 2; }

    // Keep inside the image without breaking the ratio: shrink toward the anchor if needed.
    const overflow = Math.max(0 - left, right - W, 0 - top, bottom - H, 0);
    if (overflow > 0) {
      // Clamp the box to the image, then re-fit the ratio inside the clamped bounds.
      left = clamp(left, 0, W); right = clamp(right, 0, W);
      top = clamp(top, 0, H); bottom = clamp(bottom, 0, H);
      let cw = right - left, ch = bottom - top;
      if (cw / ch > ratio) cw = ch * ratio; else ch = cw / ratio;
      if (hasW) left = right - cw; else right = left + cw;
      if (hasN) top = bottom - ch; else bottom = top + ch;
    }
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}
