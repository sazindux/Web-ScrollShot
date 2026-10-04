// Scroll-and-stitch driver for selections larger than the viewport (and Full Page).
// Scrolls the page in viewport-sized steps, grabs one frame per step and streams
// each frame to the service worker (SAVE_FRAME) so memory stays low. The editor
// composes frames by their document offsets (editor/compose.js), so overlapping
// last frames are handled there.
import { grabFrame } from './capture.js';

const SETTLE_MS = 150;         // wait after each scroll before capturing
const MSG = { SAVE_FRAME: 'ss:save-frame', DELETE_CAPTURE: 'ss:delete-capture' };

function sendMessage(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (res) => {
      const err = chrome.runtime.lastError;
      if (err) return reject(new Error(err.message));
      if (res?.error) return reject(new Error(res.error));
      resolve(res);
    });
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function docSize() {
  const de = document.documentElement;
  const b = document.body;
  return {
    width: Math.max(de.scrollWidth, b?.scrollWidth || 0, de.clientWidth),
    height: Math.max(de.scrollHeight, b?.scrollHeight || 0, de.clientHeight),
  };
}

function makeId() {
  return `cap_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Positions to scroll to so that [start, start+size) is fully covered by viewport-sized windows. */
function steps(start, size, view, docMax) {
  const out = [];
  const end = start + size;
  let pos = start;
  while (true) {
    const clamped = Math.max(0, Math.min(pos, docMax));
    if (!out.length || clamped !== out[out.length - 1]) out.push(clamped);
    if (clamped + view >= end || clamped >= docMax) break;
    pos = clamped + view;
  }
  return out;
}

// ---- fixed / sticky neutralisation ----------------------------------------

function neutraliseFixed() {
  const touched = [];
  const all = document.querySelectorAll('body *');
  for (const node of all) {
    if (node.id === 'scrollshot-host') continue;
    let cs;
    try { cs = getComputedStyle(node); } catch { continue; }
    if (cs.position === 'fixed') {
      touched.push({ node, prop: 'visibility', value: node.style.visibility, priority: node.style.getPropertyPriority('visibility') });
      node.style.setProperty('visibility', 'hidden', 'important');
    } else if (cs.position === 'sticky') {
      touched.push({ node, prop: 'position', value: node.style.position, priority: node.style.getPropertyPriority('position') });
      node.style.setProperty('position', 'static', 'important');
    }
  }
  return touched;
}

function restoreStyles(touched) {
  for (const t of touched) {
    try {
      if (t.value) t.node.style.setProperty(t.prop, t.value, t.priority);
      else t.node.style.removeProperty(t.prop);
    } catch { /* node may be gone */ }
  }
}

function hideScrollbars() {
  const style = document.createElement('style');
  style.id = 'scrollshot-hide-scrollbars';
  style.textContent = 'html, body { scrollbar-width: none !important; } html::-webkit-scrollbar, body::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }';
  document.documentElement.appendChild(style);
  const prev = document.documentElement.style.scrollBehavior;
  document.documentElement.style.setProperty('scroll-behavior', 'auto', 'important');
  return () => {
    style.remove();
    if (prev) document.documentElement.style.scrollBehavior = prev;
    else document.documentElement.style.removeProperty('scroll-behavior');
  };
}

// ---- main driver ------------------------------------------------------------

/**
 * @returns capture record (frames stored separately via SAVE_FRAME) or null when cancelled.
 */
export async function captureStitched(api, selection) {
  const id = makeId();
  const origX = window.scrollX;
  const origY = window.scrollY;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const doc = docSize();
  const dpr = window.devicePixelRatio || 1;

  const xs = steps(selection.x, selection.width, vw, Math.max(0, doc.width - vw));
  const ys = steps(selection.y, selection.height, vh, Math.max(0, doc.height - vh));
  const total = xs.length * ys.length;

  let cancelled = false;
  api.setCancelHandler(() => { cancelled = true; });

  let touched = [];
  let restoreScrollbars = () => {};
  let frameCount = 0;

  try {
    restoreScrollbars = hideScrollbars();
    api.showProgress(`Capturing 0 / ${total}`, 0);

    let index = 0;
    for (const y of ys) {
      for (const x of xs) {
        if (cancelled) throw new Error('__cancelled__');
        window.scrollTo(x, y);
        await sleep(SETTLE_MS);
        if (cancelled) throw new Error('__cancelled__');

        const frame = await grabFrame(api);
        frameCount++;
        if (frameCount === 1 && total > 1) {
          // After the first frame, hide fixed headers / un-stick sticky bars so they don't repeat.
          touched = neutraliseFixed();
        }
        api.showProgress(`Capturing ${index + 1} / ${total}`, (index + 1) / total);

        const { dataUrl, ...meta } = frame;
        await sendMessage({ type: MSG.SAVE_FRAME, id, index, dataUrl, ...meta });
        index++;
      }
    }

    api.showProgress('Building image…', 1);
    return {
      id,
      kind: 'stitched',
      dpr,
      viewport: { width: vw, height: vh },
      document: doc,
      selection: { ...selection },
      pageUrl: location.href,
      pageTitle: document.title,
      frames: [],
      frameCount,
    };
  } catch (err) {
    sendMessage({ type: MSG.DELETE_CAPTURE, id }).catch(() => {});
    if (err?.message === '__cancelled__') {
      api.showToast('Capture cancelled');
      return null;
    }
    throw err;
  } finally {
    api.setCancelHandler(null);
    api.hideProgress();
    restoreStyles(touched);
    restoreScrollbars();
    window.scrollTo(origX, origY);
  }
}
