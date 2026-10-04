// CanvasView — holds the base image canvas + overlay canvas inside a
// transformed "stage" element and manages zoom / pan.
//
// Rendering model: both canvases keep their intrinsic size in IMAGE PIXELS
// (never resized on zoom). The stage element gets a CSS transform
// `translate(panX, panY) scale(zoom)`. Pointer positions are converted to
// image coordinates with toImage(clientX, clientY), so all tools (crop,
// annotations) work in image pixels independent of zoom.
//
// Usage:
//   const view = new CanvasView({ viewport, stage, base, overlay });
//   view.setImage(canvas);           // sets size + draws base
//   view.onViewChange = ({zoom}) => …

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 8;
export const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

export class CanvasView {
  constructor({ viewport, stage, base, overlay }) {
    this.viewport = viewport;
    this.stage = stage;
    this.base = base;
    this.overlay = overlay;
    this.baseCtx = base.getContext('2d');
    this.overlayCtx = overlay.getContext('2d');

    this.width = 0;
    this.height = 0;
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.fitMode = true;            // re-fit on resize until the user zooms manually
    this.onViewChange = null;
    this.spaceDown = false;
    this._pan = null;               // active pan drag state

    this._bind();
  }

  /* ───────── image ───────── */

  setImage(source) {
    this.width = source.width;
    this.height = source.height;
    this.base.width = this.width;
    this.base.height = this.height;
    this.overlay.width = this.width;
    this.overlay.height = this.height;
    this.stage.style.width = `${this.width}px`;
    this.stage.style.height = `${this.height}px`;
    this.baseCtx.drawImage(source, 0, 0);
    this.fitMode = true;
    this.fit();
  }

  clearOverlay() {
    this.overlayCtx.clearRect(0, 0, this.width, this.height);
  }

  /* ───────── zoom / pan ───────── */

  viewportSize() {
    const r = this.viewport.getBoundingClientRect();
    return { w: r.width, h: r.height, left: r.left, top: r.top };
  }

  fit() {
    const { w, h } = this.viewportSize();
    if (!this.width || !this.height || !w || !h) return;
    const pad = 40;
    const z = Math.min((w - pad) / this.width, (h - pad) / this.height, 1);
    this.zoom = clamp(z, ZOOM_MIN, ZOOM_MAX);
    this.panX = Math.round((w - this.width * this.zoom) / 2);
    this.panY = Math.round((h - this.height * this.zoom) / 2);
    this.fitMode = true;
    this._apply();
  }

  /** Zoom to an absolute factor, keeping the viewport point (vx, vy) fixed. */
  setZoom(z, vx, vy) {
    const { w, h } = this.viewportSize();
    if (vx == null) { vx = w / 2; vy = h / 2; }
    z = clamp(z, ZOOM_MIN, ZOOM_MAX);
    const ix = (vx - this.panX) / this.zoom;
    const iy = (vy - this.panY) / this.zoom;
    this.zoom = z;
    this.panX = vx - ix * z;
    this.panY = vy - iy * z;
    this.fitMode = false;
    this._apply();
  }

  zoomIn(vx, vy) { this.setZoom(nextPreset(this.zoom, +1), vx, vy); }
  zoomOut(vx, vy) { this.setZoom(nextPreset(this.zoom, -1), vx, vy); }

  panBy(dx, dy) {
    this.panX += dx;
    this.panY += dy;
    this.fitMode = false;
    this._apply();
  }

  _apply() {
    // Keep the image reachable: don't let it be dragged entirely off-screen.
    const { w, h } = this.viewportSize();
    const sw = this.width * this.zoom, sh = this.height * this.zoom;
    const margin = 48;
    this.panX = clamp(this.panX, margin - sw, w - margin);
    this.panY = clamp(this.panY, margin - sh, h - margin);
    this.stage.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    this.stage.classList.toggle('pixelated', this.zoom >= 3);
    this.onViewChange?.({ zoom: this.zoom, width: this.width, height: this.height });
  }

  /* ───────── coordinate helpers ───────── */

  /** Client (screen) → image pixel coordinates. */
  toImage(clientX, clientY) {
    const { left, top } = this.viewportSize();
    return {
      x: (clientX - left - this.panX) / this.zoom,
      y: (clientY - top - this.panY) / this.zoom,
    };
  }

  /** Image pixel → client coordinates. */
  toClient(x, y) {
    const { left, top } = this.viewportSize();
    return { x: left + this.panX + x * this.zoom, y: top + this.panY + y * this.zoom };
  }

  /** True when a pan gesture should consume the pointer event. */
  isPanTrigger(e) {
    return e.button === 1 || (e.button === 0 && this.spaceDown);
  }

  /* ───────── events ───────── */

  _bind() {
    const vp = this.viewport;

    vp.addEventListener('wheel', (e) => {
      e.preventDefault();
      const { left, top } = this.viewportSize();
      const vx = e.clientX - left, vy = e.clientY - top;
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.0015);
        this.setZoom(this.zoom * factor, vx, vy);
      } else if (e.shiftKey) {
        this.panBy(-(e.deltaY || e.deltaX), 0);
      } else {
        this.panBy(-e.deltaX, -e.deltaY);
      }
    }, { passive: false });

    vp.addEventListener('pointerdown', (e) => {
      if (!this.isPanTrigger(e)) return;
      e.preventDefault();
      this._pan = { id: e.pointerId, x: e.clientX, y: e.clientY };
      vp.setPointerCapture(e.pointerId);
      vp.classList.add('pan-active');
    }, true);
    vp.addEventListener('pointermove', (e) => {
      if (!this._pan || e.pointerId !== this._pan.id) return;
      this.panBy(e.clientX - this._pan.x, e.clientY - this._pan.y);
      this._pan.x = e.clientX;
      this._pan.y = e.clientY;
    });
    const endPan = (e) => {
      if (!this._pan || e.pointerId !== this._pan.id) return;
      this._pan = null;
      vp.classList.remove('pan-active');
      try { vp.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    };
    vp.addEventListener('pointerup', endPan);
    vp.addEventListener('pointercancel', endPan);
    vp.addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !isEditable(e.target)) {
        if (!this.spaceDown) { this.spaceDown = true; vp.classList.add('panning'); }
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') { this.spaceDown = false; vp.classList.remove('panning'); }
    });
    window.addEventListener('blur', () => { this.spaceDown = false; vp.classList.remove('panning'); });

    new ResizeObserver(() => {
      if (this.fitMode) this.fit(); else this._apply();
    }).observe(vp);
  }
}

/* ───────── helpers ───────── */

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

function nextPreset(zoom, dir) {
  const steps = [0.1, 0.15, 0.2, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8];
  // Skip steps within 3% of the current zoom so "fit" values don't produce a no-op step.
  if (dir > 0) return steps.find((s) => s > zoom * 1.03) ?? ZOOM_MAX;
  return [...steps].reverse().find((s) => s < zoom / 1.03) ?? ZOOM_MIN;
}

export function isEditable(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}
