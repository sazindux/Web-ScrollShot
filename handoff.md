# Handoff — Screenshot Extension
Last updated: 2026-10-04 | Last chat ended after: T5

## Status
| Task | Title | Status (DONE / IN PROGRESS / PENDING) | Commit |
|------|-------|---------------------------------------|--------|
| T0 | Scaffold & handoff | DONE | (see git log) |
| T1 | Activation + overlay | DONE | |
| T2 | Selection box | DONE | |
| T3 | Single-viewport capture + editor stub | DONE | |
| T4 | Edge auto-scroll | DONE | |
| T5 | Floating toolbar & fit presets | DONE | |
| T6 | Scroll-and-stitch capture | PENDING | |
| T7 | Editor shell | PENDING | |
| T8 | Crop tool | PENDING | |
| T9 | Export suite | PENDING | |
| T10 | Annotation engine + shapes | PENDING | |
| T11 | Freehand, highlighter, eraser, delete, polish | PENDING | |

## NEXT TASK
T6: Scroll-and-stitch capture — create `content/stitch.js` exporting `async captureStitched(api, selection)` → record
(same shape as capture.js `captureSingle`, kind:'stitched', frames[] each {dataUrl, scrollX, scrollY, width, height}) or `null` if cancelled.
capture.js already dynamic-imports it when selection is larger than the viewport. Use `grabFrame(api)` from capture.js
(hides UI + 2 rAF + CAPTURE_VISIBLE; background enforces 600 ms spacing — still add ~150 ms settle after each scrollTo).
Steps: save scrollX/Y + html/body overflow; hide scrollbars (`document.documentElement.style.overflow='hidden'` may change
layout — prefer `scrollbar-width:none` + `::-webkit-scrollbar{display:none}` style tag); iterate columns×rows over the selection
in viewport-sized steps (last step clamps to doc end → overlapping frame, compose.js handles overlap since it draws by document
offset); after first frame, neutralise fixed/sticky: walk `document.querySelectorAll('*')`, getComputedStyle position fixed/sticky →
set `visibility:hidden` (fixed) / `position:static` (sticky) inline, remember originals, restore in finally. Progress indicator:
a `.progress` card inside api.root — but UI is hidden during grabs, so render progress in a separate non-hidden element
(add `api.showProgress(text)`/`api.hideProgress()` in overlay.js using a node outside `.root` in the shadow, and hide it too in
grabFrame — simpler: progress element outside .root, toggled hidden inside grabFrame via api.hideUi/showUi which should hide
it as well; show it between grabs). Esc: `api.setCancelHandler(() => cancelled = true)` — check flag each iteration, restore and
return null; clear handler in finally. Canvas-limit scaling already in editor/compose.js (notice shown).

## What exists now (file map, 1 line per file)
- manifest.json — MV3, permissions activeTab/scripting/storage/clipboardWrite, action, command `start-capture` (Alt+Shift+S), module service worker, web_accessible_resources for content/* and shared/*
- background.js — action/command → `startCapture(tab)`: restricted-URL check + badge, PING→inject `content/content.js`→TOGGLE_OVERLAY; `captureVisible()` serialized with 600 ms min interval; onMessage handlers CAPTURE_VISIBLE / SAVE_CAPTURE (dataUrl frames → Blobs → IndexedDB) / OPEN_EDITOR
- shared/messages.js — `MSG` names, `CAPTURE_MIN_INTERVAL_MS`, `CAPTURE_RETENTION_MS`, canvas limits, `makeCaptureId()`
- shared/db.js — IndexedDB `scrollshot` / store `captures` (keyPath id, index createdAt): `putCapture`, `getCapture`, `deleteCapture`, `pruneCaptures`
- content/content.js — classic script; guard `window.__scrollshotLoaded`; onMessage PING→{ok}, TOGGLE_OVERLAY→ dynamic `import(content/overlay.js)` → `toggleOverlay()`
- content/overlay.js — Shadow DOM host `#scrollshot-host`, 4 dim+blur `.panel`s laid out around selection (document coords → viewport), hint, toast, Esc closes / Enter → capture handler; exports `toggleOverlay, openOverlay, closeOverlay, setSelection, getSelection, hideUi, showUi, showToast, api`; dynamically imports `content/selection.js` and calls `attachSelection(api)` if present
- content/overlay.css — fetched & injected into shadow root; styles for .root/.panel/.hint/.selection/.handle/.size-label/.toast
- content/selection.js — `attachSelection(api)`: builds `.selection` + 8 handles + size label inside api.root; pointerdown on root → create/move/resize drag (document coords, min 10×10, clamped to docSize()); `applyDrag()` re-derives pointer doc position from lastClient+scroll so wheel/autoscroll grow the selection; calls optional `createAutoScroll(api)` from autoscroll.js (T4) with start(cb)/update(cx,cy)/stop(); exports `render, docSize, selectionApi`
- content/capture.js — `captureSelection(api)`: if selection fits viewport → `captureSingle` (scrolls selection into view if needed, restores scroll) else dynamic-import `content/stitch.js` `captureStitched(api, sel)` (T6; falls back to visible part); `grabFrame(api)` = hideUi → 2 rAF → CAPTURE_VISIBLE → {dataUrl, scrollX, scrollY, width, height}; then SAVE_CAPTURE → OPEN_EDITOR → api.close(). Record: {kind, dpr, viewport, document, selection, pageUrl, pageTitle, frames[]}
- content/overlay.js additions — imports capture.js and registers `api.setCaptureHandler`; `api.capture()`, `api.setCancelHandler(fn)` (Esc calls it instead of closing when set — for T6); tries `toolbar.js attachToolbar(api)` (T5)
- editor/compose.js — `composeCapture(record)` → {canvas, notice, scale}: draws every frame at its document offset relative to selection (DPR-aware, uses bitmap/frame CSS ratio), scales down to canvas limits with notice. Already handles multi-frame stitched records.
- editor/editor.js — stub: reads ?id, getCapture, composeCapture → draws into `#base-canvas`, sets title, shows notice/errors in `#status`, then deleteCapture(id)
- content/autoscroll.js — `createAutoScroll(api)` → {start(onFrame), update(cx,cy), stop(), isActive}; rAF loop, 60 px edge zone (all 4 edges), speed 2→25 px/frame quadratic, clamps to docSize, calls onFrame after each scroll; shows `.autoscroll-pill` (bottom-center, data-dir up/down) while scrolling
- content/toolbar.js — `attachToolbar(api)`: `.toolbar.no-select` fixed top-center with Full Page / Full Width / Fit Left / Right / Top / Bottom / divider / indigo Capture (inline SVG icons); `applyPreset(api, action)` implements the exact preset definitions using selection.js `docSize()`+`clampRect()` then `render()`; Capture → `api.capture()`
- content/selection.js — now also exports `clampRect`
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
1. Reload extension; open a long page; Alt+Shift+S → white rounded toolbar centered at the top (not blurred) with 6 preset buttons + indigo Capture.
2. Draw a selection in the middle. Full Width → box spans whole page width, same top/bottom. Fit Left → only left edge jumps to x=0. Fit Right → only right edge to page right. Fit Top → top edge to y=0 (scroll up to verify). Fit Bottom → bottom edge to document bottom (label height grows). Full Page → label shows docWidth × docHeight.
3. With no selection, Fit presets start from the current viewport rect. Capture button = Enter (selection ≤ viewport captures; larger shows "Large captures arrive in a later version" and captures the visible part — T6 fixes).

Previous (T4):
1. Reload extension; open a long page; Alt+Shift+S; start dragging a selection and move the pointer to within ~60 px of the bottom edge (keep button held).
2. Page scrolls continuously (faster nearer the edge); the selection grows; a white "Auto Scroll" pill with the ↓ arrow highlighted appears at the bottom; scrolling stops at document end.
3. Move pointer back up near the top edge → scrolls up, ↑ highlighted. Release → pill disappears, selection stays correct (check label W×H and that the box stays aligned to content while scrolling normally afterwards).
4. Also works when dragging a resize handle (e.g. bottom "s" handle) and when moving the box. Mouse wheel while dragging also grows the selection.

Previous (T3):
1. Reload extension; open any page; Alt+Shift+S; drag a selection smaller than the window; press Enter.
2. Overlay disappears; a new tab "Screenshot W×H — ScrollShot" opens showing exactly the selected area (check on a DPR 2 display: image is 2× pixel size, sharp).
3. Select an area partially scrolled off-screen (still smaller than viewport) → page scrolls, captures, scroll position restored.
4. Press Enter with no selection → toast "Drag to select an area first". Reloading the editor tab → "no longer available" message (one-shot storage).

Previous (T2):
1. Reload extension; open a long page (e.g. a Wikipedia article), scroll down a bit first.
2. Alt+Shift+S → drag on the page → dashed blue box with 8 handles and "W × H px" label; area inside is sharp, outside dim+blurred.
3. Drag inside box to move; drag handles to resize (all 8 directions); scroll the page with wheel (not dragging) → box stays glued to page content.
4. Click outside the box → starts a new selection. Tiny click (<10px) clears selection, hint re-appears. Esc closes.

Previous (T1):
1. chrome://extensions → Developer mode → Load unpacked → select repo folder (or Reload).
2. Open any normal https page (e.g. wikipedia). Click the toolbar icon or press Alt+Shift+S → page dims and blurs, a white hint card appears in the center.
3. Press Esc → overlay disappears completely; page is untouched.
4. Press Alt+Shift+S twice → second press closes the overlay (toggle). Clicking the icon again re-opens without console errors (no double injection).
5. On chrome://extensions itself click the icon → red "!" badge for ~2.5 s, nothing else.
