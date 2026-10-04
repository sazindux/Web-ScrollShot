// Edge auto-scroll engine: while a drag is active and the pointer is near a
// viewport edge, scroll the page continuously (requestAnimationFrame) with a
// speed proportional to how close the pointer is to the edge.
// Used by selection.js: start(onFrame) on pointerdown, update(x, y) on
// pointermove, stop() on pointerup. onFrame() is called after every scroll so
// the selection can be recomputed in document coordinates.

const EDGE_PX = 60;       // activation zone from the viewport edge
const MAX_SPEED = 25;     // px per frame
const MIN_SPEED = 2;

export function createAutoScroll(api) {
  let raf = 0;
  let active = false;
  let pointer = null;     // { x, y } client coords
  let onFrame = null;
  let pill = null;
  let lastDir = '';

  function ensurePill() {
    if (pill || !api.root) return;
    pill = api.el('div', 'autoscroll-pill hidden no-select');
    pill.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>' +
      '<span>Auto Scroll</span>' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>';
    api.root.appendChild(pill);
  }

  function docSize() {
    const de = document.documentElement;
    const b = document.body;
    return {
      width: Math.max(de.scrollWidth, b?.scrollWidth || 0, de.clientWidth),
      height: Math.max(de.scrollHeight, b?.scrollHeight || 0, de.clientHeight),
    };
  }

  /** Speed for a distance-from-edge value: 0..EDGE_PX → MAX..MIN, outside → 0. */
  function speedFor(dist) {
    if (dist > EDGE_PX) return 0;
    const t = 1 - Math.max(0, dist) / EDGE_PX; // 0 at zone border, 1 at edge
    return MIN_SPEED + (MAX_SPEED - MIN_SPEED) * t * t;
  }

  function tick() {
    raf = 0;
    if (!active || !pointer) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const { x, y } = pointer;

    let dx = 0;
    let dy = 0;
    if (y <= EDGE_PX) dy = -speedFor(y);
    else if (y >= vh - EDGE_PX) dy = speedFor(vh - y);
    if (x <= EDGE_PX) dx = -speedFor(x);
    else if (x >= vw - EDGE_PX) dx = speedFor(vw - x);

    // Clamp to document bounds.
    const ds = docSize();
    const maxX = Math.max(0, ds.width - vw);
    const maxY = Math.max(0, ds.height - vh);
    const nx = Math.max(0, Math.min(maxX, window.scrollX + dx));
    const ny = Math.max(0, Math.min(maxY, window.scrollY + dy));
    const realDx = nx - window.scrollX;
    const realDy = ny - window.scrollY;

    const scrolling = Math.abs(realDx) >= 0.5 || Math.abs(realDy) >= 0.5;
    if (scrolling) {
      window.scrollTo(nx, ny);
      try { onFrame?.(); } catch (err) { console.warn('[ScrollShot] autoscroll frame error', err); }
    }
    setPill(scrolling, dy < 0 ? 'up' : dy > 0 ? 'down' : '');

    raf = requestAnimationFrame(tick);
  }

  function setPill(show, dir) {
    ensurePill();
    if (!pill) return;
    pill.classList.toggle('hidden', !show);
    if (dir !== lastDir) {
      pill.dataset.dir = dir;
      lastDir = dir;
    }
  }

  return {
    start(frameCb) {
      onFrame = frameCb || null;
      active = true;
      pointer = null;
      if (!raf) raf = requestAnimationFrame(tick);
    },
    update(clientX, clientY) {
      pointer = { x: clientX, y: clientY };
      if (active && !raf) raf = requestAnimationFrame(tick);
    },
    stop() {
      active = false;
      pointer = null;
      onFrame = null;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (pill) pill.classList.add('hidden');
    },
    get isActive() { return active; },
  };
}
