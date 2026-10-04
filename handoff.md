# Handoff — Screenshot Extension
Last updated: 2026-10-04 | Last chat ended after: T7

## Status
| Task | Title | Status (DONE / IN PROGRESS / PENDING) | Commit |
|------|-------|---------------------------------------|--------|
| T0 | Scaffold & handoff | DONE | (see git log) |
| T1 | Activation + overlay | DONE | |
| T2 | Selection box | DONE | |
| T3 | Single-viewport capture + editor stub | DONE | |
| T4 | Edge auto-scroll | DONE | |
| T5 | Floating toolbar & fit presets | DONE | |
| T6 | Scroll-and-stitch capture | DONE | |
| T7 | Editor shell | DONE | |
| T8 | Crop tool | PENDING | |
| T9 | Export suite | PENDING | |
| T10 | Annotation engine + shapes | PENDING | |
| T11 | Freehand, highlighter, eraser, delete, polish | PENDING | |

## NEXT TASK
T8: Crop tool — implement `editor/crop.js` exporting `initCrop(editor)`; register `editor.hooks.crop = { start, apply, cancel }` and call it from
`#btn-crop` (editor.js currently shows a "Crop tool coming soon" toast when `editor.hooks.crop` is absent — replace that wiring by importing
crop.js in editor.js main() after setupView()). Crop box UI lives in `#crop-layer` (div inside `#stage`, image-pixel coordinates; since the
stage is CSS-scaled, size handles with `transform: scale(1/zoom)` or re-render on `view.onViewChange`). 8 handles + drag-move, numeric inputs
`#crop-w` / `#crop-h`, `#crop-link` + `#crop-aspect` lock, `#crop-actions` (Apply/Cancel, un-hide while cropping). Crop state = rectangle
{x,y,width,height} in image px stored on `editor.crop`; applying = push to history (`editor/history.js`: class History(max 100) with
push/undo/redo + `#btn-undo/#btn-redo` wiring) and visually clip: simplest is to set `view.setImage(croppedCanvas)` from `editor.image`
drawn with the crop offset AND remember the cumulative offset so annotations (T10) keep image coords; or keep the base full and clip via
`stage` width/height + canvas translate. Status bar "Canvas: W × H" must reflect the crop. Also pre-fill `#crop-w/#crop-h` with image size on load (`editor.hooks.onImageLoaded`).

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
- content/stitch.js — `captureStitched(api, selection)` → record {id, kind:'stitched', dpr, viewport, document, selection, frames:[], frameCount} or null if cancelled. Hides scrollbars (style tag + scroll-behavior auto), computes scroll step positions (`steps()`, last clamped to doc end → overlap), scrollTo → 150 ms settle → `grabFrame` → SAVE_FRAME per frame (streamed; background stores Blob in `frames` store); after 1st frame `neutraliseFixed()` (fixed → visibility hidden !important, sticky → position static); Esc via `api.setCancelHandler` → DELETE_CAPTURE + toast; finally restores styles, scrollbars, scroll position, progress hidden
- content/overlay.js additions — `.progress` card outside `.root` (hidden by hideUi, re-shown by showUi while active); `api.showProgress(text, ratio)` / `api.hideProgress()`
- shared/db.js — DB v2: store `frames` (key `${captureId}:${index}`, index captureId); `putFrame`, `getCapture` joins inline+stored frames sorted by index, `deleteCapture`/`pruneCaptures` also remove frames
- background.js additions — SAVE_FRAME (dataUrl→Blob→putFrame), DELETE_CAPTURE; SAVE_CAPTURE honours a provided `record.id`
- editor/compose.js — `composeCapture(record)` → {canvas, notice, scale}: draws every frame at its document offset relative to selection (DPR-aware, uses bitmap/frame CSS ratio), scales down to canvas limits with notice. Already handles multi-frame stitched records.
- editor/editor.js — stub: reads ?id, getCapture, composeCapture → draws into `#base-canvas`, sets title, shows notice/errors in `#status`, then deleteCapture(id)
- content/autoscroll.js — `createAutoScroll(api)` → {start(onFrame), update(cx,cy), stop(), isActive}; rAF loop, 60 px edge zone (all 4 edges), speed 2→25 px/frame quadratic, clamps to docSize, calls onFrame after each scroll; shows `.autoscroll-pill` (bottom-center, data-dir up/down) while scrolling
- content/toolbar.js — `attachToolbar(api)`: `.toolbar.no-select` fixed top-center with Full Page / Full Width / Fit Left / Right / Top / Bottom / divider / indigo Capture (inline SVG icons); `applyPreset(api, action)` implements the exact preset definitions using selection.js `docSize()`+`clampRect()` then `render()`; Capture → `api.capture()`
- content/selection.js — now also exports `clampRect`
- editor/editor.html — full shell: `.topbar` (brand, #btn-crop, #btn-copy, #dd-download [data-format png/jpeg/webp], #btn-pdf, #dd-export primary [data-export copy/png/jpeg/webp/pdf]); `.main` = `.workspace` (#viewport > #stage > #base-canvas + #overlay-canvas + #crop-layer; #notice; #empty-state; `.statusbar` #status-size, #dd-zoom [data-zoom fit/0.25…4], #zoom-out/#zoom-in) + `.side` (Crop Settings: #crop-w, #crop-h, #crop-link, #crop-aspect, #crop-actions #crop-apply/#crop-cancel; Quick Actions [data-export copy/download/pdf]; #file-format select); `.annobar` (#dd-shapes [data-tool rect/ellipse/arrow/line], [data-tool pen/highlighter/eraser], #btn-delete, #btn-undo, #btn-redo, #pen-size + #pen-size-label, #palette .swatch[data-color] + #custom-color); #toast
- editor/editor.css — design tokens (--primary #5B4CF0, --accent #2F6BFF), .btn/.btn-primary, .dropdown(.open/.dropup/.dropdown-menu-right), workspace grid bg, .stage (transform-origin 0 0, checkerboard), statusbar, side cards/toggle, annobar .tool(.active)/.swatch(.active), .toast(.show/.error), .empty-card(.error)
- editor/canvas-view.js — `class CanvasView({viewport, stage, base, overlay})`: setImage(canvas) (sets both canvases to image px, stage size, fit), fit(), setZoom(z, vx, vy), zoomIn/zoomOut (step list 10%…800%), panBy, toImage(clientX, clientY)/toClient(x,y), isPanTrigger(e), spaceDown; wheel = pan, Ctrl/Cmd+wheel = zoom around pointer, Space+drag / middle-drag = pan, ResizeObserver re-fits while fitMode; `onViewChange({zoom,width,height})`; exports ZOOM_MIN/MAX, ZOOM_PRESETS, isEditable(el)
- editor/ui.js — `initDropdowns()` (generic .dropdown toggle/outside-click/Esc), `showToast(text, {error, duration})`
- editor/editor.js — ES module; exports `editor = { view, image, captureId, color, hooks: {} }`; main(): initDropdowns → setupView (status bar, zoom dropdown, +/−/0 and Ctrl+0/+/− keys) → setupPlaceholders (pen size label, palette active state → editor.color + hooks.onColorChange, tool buttons → hooks.setTool or toast, crop/export buttons → toast unless hooks.crop / hooks.export set) → loadCapture (getCapture → composeCapture → view.setImage → hooks.onImageLoaded → deleteCapture; empty/error states in #empty-state)
- editor/crop.js, export.js, annotations.js, history.js, tools/ — still placeholders
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
- Editor: Space+drag pan uses capture-phase pointerdown on #viewport, so later tools must check `view.spaceDown`/`view.isPanTrigger(e)` and bail out.
- Editor headless test (seeded IndexedDB record, 1200×3000 image) passed: fit → 25%, status bar/zoom dropdown/keys OK. Not yet verified in a real Chrome extension context by the user.

## Manual test steps for the user (for the last finished task)
1. Reload extension; capture anything (single or Full Page). Editor tab opens with the new layout: top bar (ScrollShot logo, Crop, Copy, Download ▾, Export PDF, indigo Export ▾), gray dotted workspace with the image centered and fitted, right panel (Crop Settings / Quick Actions / File Format), bottom annotation toolbar.
2. Bottom-left status shows "Canvas: W × H" (true image pixels, e.g. 2× on a Retina screen) and a zoom % button; click it → Fit / 25%…400% presets. +/− buttons and keys `+ − 0`, `Ctrl/Cmd + wheel` zoom around the pointer; wheel pans; Space+drag or middle-mouse drag pans. Window resize re-fits while in Fit mode.
3. Dropdowns (Download, Export, Shapes, zoom) open/close on click, outside click and Esc. Not-yet-built actions show a dark toast "… coming soon".
4. Open `editor/editor.html` without `?id` → "No capture to show" card; open with a bogus id → red "Capture unavailable" card.

Previous (T6):
1. Reload extension; open a long article (e.g. a Wikipedia page with a sticky/fixed header site like github.com or MDN). Alt+Shift+S → Full Page → Capture.
2. Page scrolls step by step; a white progress card "Capturing n / N" with a violet bar shows; page UI (toolbar/dim) is hidden at each shot. Afterwards scroll position restored, scrollbars/fixed elements back to normal.
3. Editor tab shows one seamless image of the whole page; fixed header appears only once at the top (not repeated per slice); bottom slice is not duplicated.
4. Repeat with a tall selection (drag + auto-scroll or Fit Bottom) → only that region is captured. Press Esc mid-capture → "Capture cancelled" toast, page restored, no editor tab.
5. Very long page (> 16384 px tall at DPR) → editor shows a notice "Image was scaled to …%".

Previous (T5):
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
