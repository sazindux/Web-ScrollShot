// Service worker: activation, content-script injection, captureVisibleTab,
// IndexedDB storage of captures and opening the editor tab.
import { MSG, CAPTURE_MIN_INTERVAL_MS, CAPTURE_RETENTION_MS, makeCaptureId } from './shared/messages.js';
import { putCapture, putFrame, deleteCapture, pruneCaptures } from './shared/db.js';

const CONTENT_SCRIPT = 'content/content.js';

// ---------- Activation ----------
chrome.action.onClicked.addListener((tab) => startCapture(tab));
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'start-capture') startCapture(tab);
});

chrome.runtime.onInstalled.addListener(() => {
  pruneCaptures(CAPTURE_RETENTION_MS).catch(() => {});
});
chrome.runtime.onStartup?.addListener(() => {
  pruneCaptures(CAPTURE_RETENTION_MS).catch(() => {});
});

function isRestrictedUrl(url) {
  if (!url) return true;
  const u = url.toLowerCase();
  if (u.startsWith('chrome://') || u.startsWith('chrome-extension://') ||
      u.startsWith('edge://') || u.startsWith('brave://') || u.startsWith('about:') ||
      u.startsWith('devtools://') || u.startsWith('view-source:')) return true;
  if (u.startsWith('https://chrome.google.com/webstore') ||
      u.startsWith('https://chromewebstore.google.com') ||
      u.startsWith('https://microsoftedge.microsoft.com/addons')) return true;
  if (u.endsWith('.pdf') || u.includes('.pdf?')) return true;
  return false;
}

async function showBadge(tabId, text, color, title) {
  try {
    await chrome.action.setBadgeBackgroundColor({ tabId, color });
    await chrome.action.setBadgeText({ tabId, text });
    if (title) await chrome.action.setTitle({ tabId, title });
    setTimeout(() => {
      chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
      chrome.action.setTitle({ tabId, title: 'Capture screenshot (Alt+Shift+S)' }).catch(() => {});
    }, 2500);
  } catch { /* tab may be gone */ }
}

async function startCapture(tab) {
  if (!tab || tab.id == null) return;
  if (isRestrictedUrl(tab.url)) {
    await showBadge(tab.id, '!', '#DC2626', "Can't capture this page");
    return;
  }
  try {
    // Is the content script already there? (guard against double injection)
    const alive = await sendToTab(tab.id, { type: MSG.PING });
    if (!alive?.ok) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: [CONTENT_SCRIPT],
      });
    }
    await sendToTab(tab.id, { type: MSG.TOGGLE_OVERLAY });
  } catch (err) {
    console.warn('[ScrollShot] cannot start capture:', err);
    await showBadge(tab.id, '!', '#DC2626', "Can't capture this page");
  }
}

function sendToTab(tabId, message) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        // Swallow "Receiving end does not exist"
        void chrome.runtime.lastError;
        resolve(response);
      });
    } catch {
      resolve(undefined);
    }
  });
}

// ---------- captureVisibleTab with rate limiting ----------
let lastCaptureAt = 0;
let captureChain = Promise.resolve();

function captureVisible(windowId) {
  // Serialize all captures and enforce a minimum interval between them.
  const run = async () => {
    const wait = lastCaptureAt + CAPTURE_MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
    lastCaptureAt = Date.now();
    return dataUrl;
  };
  const p = captureChain.then(run, run);
  captureChain = p.catch(() => {});
  return p;
}

// ---------- Messages from content script ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string') return false;

  if (msg.type === MSG.CAPTURE_VISIBLE) {
    captureVisible(sender.tab?.windowId)
      .then((dataUrl) => sendResponse({ dataUrl }))
      .catch((err) => sendResponse({ error: String(err?.message || err) }));
    return true;
  }

  if (msg.type === MSG.SAVE_CAPTURE) {
    (async () => {
      const record = msg.capture || {};
      record.id = record.id || makeCaptureId();
      record.createdAt = Date.now();
      // Frames arrive as data URLs (structured clone of Blobs is not allowed in messages);
      // convert to Blobs for compact IndexedDB storage.
      record.frames = await Promise.all((record.frames || []).map(async (f) => {
        if (typeof f.dataUrl === 'string') {
          const blob = await (await fetch(f.dataUrl)).blob();
          const { dataUrl, ...rest } = f;
          return { ...rest, blob };
        }
        return f;
      }));
      await putCapture(record);
      pruneCaptures(CAPTURE_RETENTION_MS).catch(() => {});
      sendResponse({ id: record.id });
    })().catch((err) => sendResponse({ error: String(err?.message || err) }));
    return true;
  }

  if (msg.type === MSG.SAVE_FRAME) {
    (async () => {
      const { id, index, dataUrl, ...meta } = msg;
      const blob = await (await fetch(dataUrl)).blob();
      await putFrame({ captureId: id, index, blob, ...meta });
      sendResponse({ ok: true });
    })().catch((err) => sendResponse({ error: String(err?.message || err) }));
    return true;
  }

  if (msg.type === MSG.DELETE_CAPTURE) {
    deleteCapture(msg.id)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ error: String(err?.message || err) }));
    return true;
  }

  if (msg.type === MSG.OPEN_EDITOR) {
    const url = chrome.runtime.getURL(`editor/editor.html?id=${encodeURIComponent(msg.id)}`);
    chrome.tabs.create({ url, index: sender.tab ? sender.tab.index + 1 : undefined })
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ error: String(err?.message || err) }));
    return true;
  }

  return false;
});
