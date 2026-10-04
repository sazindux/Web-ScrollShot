// Capture driver: hides the overlay UI, asks the service worker for
// captureVisibleTab frames, stores them in IndexedDB (via background) and
// opens the editor. T3: single-viewport selection. T6 extends with
// scroll-and-stitch for selections larger than the viewport.

const MSG = {
  CAPTURE_VISIBLE: 'ss:capture-visible',
  SAVE_CAPTURE: 'ss:save-capture',
  OPEN_EDITOR: 'ss:open-editor',
};

let busy = false;

export function isCapturing() {
  return busy;
}

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

function nextFrames(n = 2) {
  return new Promise((resolve) => {
    const step = () => (--n <= 0 ? resolve() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  });
}

function docSize() {
  const de = document.documentElement;
  const b = document.body;
  return {
    width: Math.max(de.scrollWidth, b?.scrollWidth || 0, de.clientWidth),
    height: Math.max(de.scrollHeight, b?.scrollHeight || 0, de.clientHeight),
  };
}

/** Grab one viewport frame (data URL) with the UI hidden. */
export async function grabFrame(api) {
  api.hideUi();
  try {
    await nextFrames(2);
    const { dataUrl } = await sendMessage({ type: MSG.CAPTURE_VISIBLE });
    return {
      dataUrl,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      width: window.innerWidth,
      height: window.innerHeight,
    };
  } finally {
    api.showUi();
  }
}

/**
 * Capture the current selection. If the selection fits in the viewport it is
 * captured in a single frame (scrolling it into view first if needed).
 * Larger selections are delegated to the stitch driver (T6) when available.
 */
export async function captureSelection(api) {
  if (busy) return;
  const selection = api.getSelection();
  if (!selection) {
    api.showToast('Drag to select an area first');
    return;
  }
  busy = true;
  try {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const fits = selection.width <= vw && selection.height <= vh;

    let record;
    if (fits) {
      record = await captureSingle(api, selection);
    } else {
      const stitch = await import(chrome.runtime.getURL('content/stitch.js')).catch(() => null);
      if (stitch?.captureStitched) {
        record = await stitch.captureStitched(api, selection);
        if (!record) return; // cancelled
      } else {
        // Fallback until T6: clamp to the visible part of the viewport.
        api.showToast('Large captures arrive in a later version — capturing visible part');
        record = await captureSingle(api, clampToViewport(selection));
      }
    }

    const { id } = await sendMessage({ type: MSG.SAVE_CAPTURE, capture: record });
    await sendMessage({ type: MSG.OPEN_EDITOR, id });
    api.close();
  } catch (err) {
    console.error('[ScrollShot] capture failed', err);
    api.showToast(`Capture failed: ${err.message || err}`, 3000);
  } finally {
    busy = false;
  }
}

function clampToViewport(sel) {
  const x1 = Math.max(sel.x, window.scrollX);
  const y1 = Math.max(sel.y, window.scrollY);
  const x2 = Math.min(sel.x + sel.width, window.scrollX + window.innerWidth);
  const y2 = Math.min(sel.y + sel.height, window.scrollY + window.innerHeight);
  return { x: x1, y: y1, width: Math.max(1, x2 - x1), height: Math.max(1, y2 - y1) };
}

async function captureSingle(api, selection) {
  const origX = window.scrollX;
  const origY = window.scrollY;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const visible =
    selection.x >= origX && selection.y >= origY &&
    selection.x + selection.width <= origX + vw &&
    selection.y + selection.height <= origY + vh;
  try {
    if (!visible) {
      window.scrollTo(selection.x, selection.y);
      await nextFrames(2);
      await new Promise((r) => setTimeout(r, 120)); // let lazy content / scroll settle
    }
    const frame = await grabFrame(api);
    return {
      kind: 'single',
      dpr: window.devicePixelRatio || 1,
      viewport: { width: vw, height: vh },
      document: docSize(),
      selection: { ...selection },
      pageUrl: location.href,
      pageTitle: document.title,
      frames: [frame],
    };
  } finally {
    if (!visible) window.scrollTo(origX, origY);
  }
}
