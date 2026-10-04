# Handoff — Screenshot Extension
Last updated: 2026-10-04 | Last chat ended after: T0

## Status
| Task | Title | Status (DONE / IN PROGRESS / PENDING) | Commit |
|------|-------|---------------------------------------|--------|
| T0 | Scaffold & handoff | DONE | (see git log) |
| T1 | Activation + overlay | PENDING | |
| T2 | Selection box | PENDING | |
| T3 | Single-viewport capture + editor stub | PENDING | |
| T4 | Edge auto-scroll | PENDING | |
| T5 | Floating toolbar & fit presets | PENDING | |
| T6 | Scroll-and-stitch capture | PENDING | |
| T7 | Editor shell | PENDING | |
| T8 | Crop tool | PENDING | |
| T9 | Export suite | PENDING | |
| T10 | Annotation engine + shapes | PENDING | |
| T11 | Freehand, highlighter, eraser, delete, polish | PENDING | |

## NEXT TASK
T1: Activation + overlay — in `content/content.js` add `chrome.runtime.onMessage` listener handling
`MSG.PING` (reply `{ok:true}`) and `MSG.TOGGLE_OVERLAY`; create Shadow DOM host `<div id="scrollshot-host">`
with dim+blur overlay (4 panels), Esc to cancel, body scroll lock not required. `background.js` already
does injection guard (PING first), restricted-page badge, command + action handlers.

## What exists now (file map, 1 line per file)
- manifest.json — MV3, permissions activeTab/scripting/storage/clipboardWrite, action, command `start-capture` (Alt+Shift+S), module service worker, web_accessible_resources for content/* and shared/*
- background.js — action/command → `startCapture(tab)`: restricted-URL check + badge, PING→inject `content/content.js`→TOGGLE_OVERLAY; `captureVisible()` serialized with 600 ms min interval; onMessage handlers CAPTURE_VISIBLE / SAVE_CAPTURE (dataUrl frames → Blobs → IndexedDB) / OPEN_EDITOR
- shared/messages.js — `MSG` names, `CAPTURE_MIN_INTERVAL_MS`, `CAPTURE_RETENTION_MS`, canvas limits, `makeCaptureId()`
- shared/db.js — IndexedDB `scrollshot` / store `captures` (keyPath id, index createdAt): `putCapture`, `getCapture`, `deleteCapture`, `pruneCaptures`
- content/content.js — placeholder with double-injection guard (`window.__scrollshotLoaded`)
- content/selection.js, autoscroll.js, toolbar.js, capture.js, overlay.css — empty placeholders
- editor/editor.html, editor.css, editor.js (+ canvas-view, crop, export, annotations, history, tools/) — placeholders
- lib/README.js — jsPDF to be vendored in T9
- icons/16,32,48,128.png — generated indigo camera placeholder icons
- README.md — load-unpacked instructions, shortcuts

## Decisions & assumptions
- Content script is injected as a classic script (`content/content.js`); it may dynamically `import()` ES modules from `chrome.runtime.getURL('content/…')` (hence web_accessible_resources).
- Frames are passed content→background as PNG data URLs inside `SAVE_CAPTURE` (one message per capture; background converts to Blobs for IndexedDB). If this proves too large for very long pages, switch to one `SAVE_FRAME` message per frame.
- `downloads` permission NOT requested; editor uses `<a download>` blob links.
- Restricted URL detection in `isRestrictedUrl()` also treats `*.pdf` URLs as restricted; `file://` failures are caught by the executeScript try/catch and show the badge.

## Message/API contracts
- `MSG.PING` → `{ok:true}`; `MSG.TOGGLE_OVERLAY`; `MSG.CAPTURE_VISIBLE` → `{dataUrl}|{error}`;
  `MSG.SAVE_CAPTURE {capture}` → `{id}`; `MSG.OPEN_EDITOR {id}` → `{ok}`; `MSG.OVERLAY_CLOSED`
- IndexedDB record shape documented at top of `shared/db.js` (frames: [{blob, scrollX, scrollY, width, height}], selection in document CSS px, dpr, viewport, document)
- Editor URL: `editor/editor.html?id=<captureId>`
- Constants: capture min interval 600 ms; retention 24 h; canvas max 16384/side, 268M px

## Known issues / TODO
- None yet.

## Manual test steps for the user (for the last finished task)
1. chrome://extensions → Developer mode → Load unpacked → select repo folder.
2. Expect no errors on the extension card (manifest loads, service worker "active" when clicked).
3. On a chrome:// page click the icon → red "!" badge appears for ~2.5 s.
