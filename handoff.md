# Handoff — Screenshot Extension
Last updated: 2026-10-04 | Last chat ended after: T1

## Status
| Task | Title | Status (DONE / IN PROGRESS / PENDING) | Commit |
|------|-------|---------------------------------------|--------|
| T0 | Scaffold & handoff | DONE | (see git log) |
| T1 | Activation + overlay | DONE | |
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
T2: Selection box — implement `content/selection.js` exporting `attachSelection(api)` (overlay.js already imports it
and passes `api`: setSelection/getSelection(document coords)/root/shadow/onClose/setCaptureHandler/relayout/showToast).
Create `.selection` div with 8 `.handle[data-dir]` + `.size-label` (CSS already in overlay.css). Pointer events on
`api.root`: drag to create, drag inside to move, handles to resize, min size 10×10, label "W × H px", reposition on scroll.

## What exists now (file map, 1 line per file)
- manifest.json — MV3, permissions activeTab/scripting/storage/clipboardWrite, action, command `start-capture` (Alt+Shift+S), module service worker, web_accessible_resources for content/* and shared/*
- background.js — action/command → `startCapture(tab)`: restricted-URL check + badge, PING→inject `content/content.js`→TOGGLE_OVERLAY; `captureVisible()` serialized with 600 ms min interval; onMessage handlers CAPTURE_VISIBLE / SAVE_CAPTURE (dataUrl frames → Blobs → IndexedDB) / OPEN_EDITOR
- shared/messages.js — `MSG` names, `CAPTURE_MIN_INTERVAL_MS`, `CAPTURE_RETENTION_MS`, canvas limits, `makeCaptureId()`
- shared/db.js — IndexedDB `scrollshot` / store `captures` (keyPath id, index createdAt): `putCapture`, `getCapture`, `deleteCapture`, `pruneCaptures`
- content/content.js — classic script; guard `window.__scrollshotLoaded`; onMessage PING→{ok}, TOGGLE_OVERLAY→ dynamic `import(content/overlay.js)` → `toggleOverlay()`
- content/overlay.js — Shadow DOM host `#scrollshot-host`, 4 dim+blur `.panel`s laid out around selection (document coords → viewport), hint, toast, Esc closes / Enter → capture handler; exports `toggleOverlay, openOverlay, closeOverlay, setSelection, getSelection, hideUi, showUi, showToast, api`; dynamically imports `content/selection.js` and calls `attachSelection(api)` if present
- content/overlay.css — fetched & injected into shadow root; styles for .root/.panel/.hint/.selection/.handle/.size-label/.toast
- content/selection.js, autoscroll.js, toolbar.js, capture.js — empty placeholders
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
1. chrome://extensions → Developer mode → Load unpacked → select repo folder (or Reload).
2. Open any normal https page (e.g. wikipedia). Click the toolbar icon or press Alt+Shift+S → page dims and blurs, a white hint card appears in the center.
3. Press Esc → overlay disappears completely; page is untouched.
4. Press Alt+Shift+S twice → second press closes the overlay (toggle). Clicking the icon again re-opens without console errors (no double injection).
5. On chrome://extensions itself click the icon → red "!" badge for ~2.5 s, nothing else.
