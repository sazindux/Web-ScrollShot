// Compose stored frames into one image cropped to the selection.
// Works for single-frame and multi-frame (stitched) captures: each frame is a
// viewport screenshot taken at (scrollX, scrollY); we draw it at its document
// position relative to the selection, in device pixels.
import { CANVAS_MAX_SIDE, CANVAS_MAX_PIXELS } from '../shared/messages.js';

/**
 * @param {object} record  IndexedDB capture record (see shared/db.js)
 * @returns {Promise<{canvas: HTMLCanvasElement, notice: string|null, scale: number}>}
 */
export async function composeCapture(record) {
  const dpr = record.dpr || 1;
  const sel = record.selection;
  const frames = record.frames || [];
  if (!sel || !frames.length) throw new Error('Capture has no frames');

  // Target size in device pixels, possibly scaled down to fit canvas limits.
  const fullW = Math.round(sel.width * dpr);
  const fullH = Math.round(sel.height * dpr);
  let scale = 1;
  if (fullW > CANVAS_MAX_SIDE || fullH > CANVAS_MAX_SIDE) {
    scale = Math.min(CANVAS_MAX_SIDE / fullW, CANVAS_MAX_SIDE / fullH);
  }
  if (fullW * scale * fullH * scale > CANVAS_MAX_PIXELS) {
    scale = Math.min(scale, Math.sqrt(CANVAS_MAX_PIXELS / (fullW * fullH)));
  }
  const outW = Math.max(1, Math.floor(fullW * scale));
  const outH = Math.max(1, Math.floor(fullH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';

  for (const frame of frames) {
    const bitmap = await decodeFrame(frame);
    // Actual pixels-per-CSS-px of this bitmap (robust against rounding).
    const fx = bitmap.width / frame.width;
    const fy = bitmap.height / frame.height;

    // Region of this frame (in frame CSS px) that intersects the selection.
    const ix1 = Math.max(sel.x, frame.scrollX);
    const iy1 = Math.max(sel.y, frame.scrollY);
    const ix2 = Math.min(sel.x + sel.width, frame.scrollX + frame.width);
    const iy2 = Math.min(sel.y + sel.height, frame.scrollY + frame.height);
    if (ix2 <= ix1 || iy2 <= iy1) { bitmap.close?.(); continue; }

    const sx = (ix1 - frame.scrollX) * fx;
    const sy = (iy1 - frame.scrollY) * fy;
    const sw = (ix2 - ix1) * fx;
    const sh = (iy2 - iy1) * fy;

    const dx = (ix1 - sel.x) * dpr * scale;
    const dy = (iy1 - sel.y) * dpr * scale;
    const dw = (ix2 - ix1) * dpr * scale;
    const dh = (iy2 - iy1) * dpr * scale;

    ctx.drawImage(bitmap, sx, sy, sw, sh, dx, dy, dw, dh);
    bitmap.close?.();
  }

  let notice = record.notice || null;
  if (scale < 1) {
    const pct = Math.round(scale * 100);
    notice = `Image was scaled to ${pct}% (${outW}×${outH}) to fit browser canvas limits.`;
  }
  return { canvas, notice, scale };
}

async function decodeFrame(frame) {
  if (frame.blob) return createImageBitmap(frame.blob);
  if (frame.dataUrl) {
    const blob = await (await fetch(frame.dataUrl)).blob();
    return createImageBitmap(blob);
  }
  throw new Error('Frame has no image data');
}
