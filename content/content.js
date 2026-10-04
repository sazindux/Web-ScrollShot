// Content script entry (classic script injected via chrome.scripting.executeScript).
// Registers the runtime message listener once and lazily loads the overlay
// implementation as an ES module from the extension origin.
(() => {
  if (window.__scrollshotLoaded) return;
  window.__scrollshotLoaded = true;

  const PING = 'ss:ping';
  const TOGGLE = 'ss:toggle-overlay';

  let overlayModulePromise = null;
  function loadOverlay() {
    if (!overlayModulePromise) {
      overlayModulePromise = import(chrome.runtime.getURL('content/overlay.js'));
    }
    return overlayModulePromise;
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg.type !== 'string') return false;

    if (msg.type === PING) {
      sendResponse({ ok: true });
      return false;
    }

    if (msg.type === TOGGLE) {
      loadOverlay()
        .then((mod) => mod.toggleOverlay())
        .then(() => sendResponse({ ok: true }))
        .catch((err) => {
          console.error('[ScrollShot] overlay failed:', err);
          sendResponse({ error: String(err?.message || err) });
        });
      return true; // async response
    }

    return false;
  });
})();
