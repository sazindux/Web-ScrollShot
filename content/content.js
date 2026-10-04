// Content script entry (classic script injected via chrome.scripting.executeScript).
// Loads the real overlay implementation as an ES module from the extension origin.
// Guarded against double injection by a window flag.
(() => {
  if (window.__scrollshotLoaded) return;
  window.__scrollshotLoaded = true;
  // T1 will wire up the message listener + Shadow DOM overlay here.
})();
