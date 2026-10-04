// Capture overlay: Shadow DOM host, dim+blur panels, keyboard handling.
// Exposes toggleOverlay() for content.js and a small API used by the
// selection / toolbar / capture modules.

const HOST_ID = 'scrollshot-host';
let state = null; // { host, shadow, root, panels, hint, toast, selection, onKey, onResize, onScroll }

export function isOpen() {
  return !!state;
}

export async function toggleOverlay() {
  if (state) {
    closeOverlay();
    return;
  }
  await openOverlay();
}

export async function openOverlay() {
  if (state) return;
  const existing = document.getElementById(HOST_ID);
  if (existing) existing.remove();

  const host = document.createElement('div');
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: 'open' });

  const cssText = await loadCss();
  const style = document.createElement('style');
  style.textContent = cssText;
  shadow.appendChild(style);

  const root = el('div', 'root');
  const panels = {
    top: el('div', 'panel'),
    bottom: el('div', 'panel'),
    left: el('div', 'panel'),
    right: el('div', 'panel'),
  };
  Object.values(panels).forEach((p) => root.appendChild(p));

  const hint = el('div', 'hint');
  hint.innerHTML = 'Drag to select an area &nbsp;·&nbsp; <kbd>Enter</kbd> capture &nbsp;·&nbsp; <kbd>Esc</kbd> cancel';
  root.appendChild(hint);

  const toast = el('div', 'toast');
  root.appendChild(toast);

  shadow.appendChild(root);
  (document.body || document.documentElement).appendChild(host);

  state = { host, shadow, root, panels, hint, toast, selection: null, toastTimer: 0 };

  state.onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (state?.cancelCapture) { state.cancelCapture(); return; }
      closeOverlay();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      state?.onCapture?.();
    }
  };
  state.onResize = () => layoutPanels();
  state.onScroll = () => layoutPanels();
  window.addEventListener('keydown', state.onKey, true);
  window.addEventListener('resize', state.onResize, true);
  window.addEventListener('scroll', state.onScroll, true);

  layoutPanels();

  // Load selection behaviour (T2) if available.
  try {
    const sel = await import(chrome.runtime.getURL('content/selection.js'));
    if (typeof sel.attachSelection === 'function') sel.attachSelection(api);
  } catch (err) {
    console.warn('[ScrollShot] selection module not available yet', err);
  }

  // Capture driver (T3): Enter key / Capture button.
  try {
    const cap = await import(chrome.runtime.getURL('content/capture.js'));
    api.setCaptureHandler(() => cap.captureSelection(api));
    state && (state.captureModule = cap);
  } catch (err) {
    console.warn('[ScrollShot] capture module not available yet', err);
  }

  // Floating toolbar (T5) if available.
  try {
    const tb = await import(chrome.runtime.getURL('content/toolbar.js'));
    if (typeof tb.attachToolbar === 'function') tb.attachToolbar(api);
  } catch { /* not yet */ }
}

export function closeOverlay() {
  if (!state) return;
  const s = state;
  state = null;
  try {
    s.onClose?.forEach((fn) => { try { fn(); } catch {} });
  } finally {
    window.removeEventListener('keydown', s.onKey, true);
    window.removeEventListener('resize', s.onResize, true);
    window.removeEventListener('scroll', s.onScroll, true);
    s.host.remove();
    try { chrome.runtime.sendMessage({ type: 'ss:overlay-closed' }, () => void chrome.runtime.lastError); } catch {}
  }
}

// ---- Layout -------------------------------------------------------------

/** Set the current selection in DOCUMENT coordinates (or null) and re-layout. */
export function setSelection(rect) {
  if (!state) return;
  state.selection = rect ? { ...rect } : null;
  layoutPanels();
}

export function getSelection() {
  return state?.selection ? { ...state.selection } : null;
}

function layoutPanels() {
  if (!state) return;
  const { panels, hint } = state;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const sel = state.selection;

  if (!sel) {
    setRect(panels.top, 0, 0, vw, vh);
    setRect(panels.bottom, 0, 0, 0, 0);
    setRect(panels.left, 0, 0, 0, 0);
    setRect(panels.right, 0, 0, 0, 0);
    hint.classList.remove('hidden');
    return;
  }
  hint.classList.add('hidden');

  // Convert document -> viewport coordinates, then clamp to viewport.
  const x1 = Math.max(0, Math.min(vw, sel.x - window.scrollX));
  const y1 = Math.max(0, Math.min(vh, sel.y - window.scrollY));
  const x2 = Math.max(0, Math.min(vw, sel.x + sel.width - window.scrollX));
  const y2 = Math.max(0, Math.min(vh, sel.y + sel.height - window.scrollY));

  setRect(panels.top, 0, 0, vw, y1);
  setRect(panels.bottom, 0, y2, vw, vh - y2);
  setRect(panels.left, 0, y1, x1, y2 - y1);
  setRect(panels.right, x2, y1, vw - x2, y2 - y1);
}

function setRect(node, x, y, w, h) {
  node.style.left = `${x}px`;
  node.style.top = `${y}px`;
  node.style.width = `${Math.max(0, w)}px`;
  node.style.height = `${Math.max(0, h)}px`;
}

// ---- UI visibility (used while capturing) ------------------------------

export function hideUi() {
  state?.root.classList.add('hidden');
}
export function showUi() {
  state?.root.classList.remove('hidden');
}

export function showToast(text, ms = 1800) {
  if (!state) return;
  const t = state.toast;
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

// ---- Shared API for sibling modules ------------------------------------

export const api = {
  get root() { return state?.root; },
  get shadow() { return state?.shadow; },
  get host() { return state?.host; },
  isOpen,
  close: closeOverlay,
  setSelection,
  getSelection,
  hideUi,
  showUi,
  showToast,
  relayout: layoutPanels,
  /** Register a cleanup callback run when the overlay closes. */
  onClose(fn) { if (state) (state.onClose ||= []).push(fn); },
  /** Register the function run on Enter / Capture button. */
  setCaptureHandler(fn) { if (state) state.onCapture = fn; },
  /** Trigger the registered capture handler. */
  capture() { state?.onCapture?.(); },
  /** While a multi-frame capture runs, Esc calls this instead of closing (T6). */
  setCancelHandler(fn) { if (state) state.cancelCapture = fn; },
  el,
};

// ---- helpers -------------------------------------------------------------

function el(tag, className) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  return n;
}

let cssCache = null;
async function loadCss() {
  if (cssCache) return cssCache;
  const res = await fetch(chrome.runtime.getURL('content/overlay.css'));
  cssCache = await res.text();
  return cssCache;
}
