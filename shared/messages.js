// Message names shared between background, content script and editor.
// All runtime messages are objects: { type: MSG.X, ...payload }

export const MSG = Object.freeze({
  // background -> content
  TOGGLE_OVERLAY: 'ss:toggle-overlay',     // start (or cancel if already open) the capture overlay
  PING: 'ss:ping',                         // check whether content script is injected -> { ok: true }

  // content -> background
  CAPTURE_VISIBLE: 'ss:capture-visible',   // request one captureVisibleTab -> { dataUrl } | { error }
  SAVE_CAPTURE: 'ss:save-capture',         // { capture } metadata (+ optional inline frames as dataUrls) -> { id }
  SAVE_FRAME: 'ss:save-frame',             // { id, index, dataUrl, scrollX, scrollY, width, height } -> { ok }
  DELETE_CAPTURE: 'ss:delete-capture',     // { id } remove a cancelled capture -> { ok }
  OPEN_EDITOR: 'ss:open-editor',           // { id } opens editor tab
  OVERLAY_CLOSED: 'ss:overlay-closed',     // overlay was dismissed (informational)
});

// Timing constants
export const CAPTURE_MIN_INTERVAL_MS = 600;   // chrome.tabs.captureVisibleTab rate-limit guard
export const CAPTURE_RETENTION_MS = 24 * 60 * 60 * 1000; // delete stored captures after 24h
export const CANVAS_MAX_SIDE = 16384;         // browser canvas side limit
export const CANVAS_MAX_PIXELS = 268_000_000; // browser canvas total pixel limit

export function makeCaptureId() {
  return `cap_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
