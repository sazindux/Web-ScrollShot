# Handoff — Screenshot Extension
Last updated: 2026-10-04 | Last chat ended after: T9

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
| T8 | Crop tool | DONE | |
| T9 | Export suite | DONE | |
| T10 | Annotation engine + shapes | PENDING | |
| T11 | Freehand, highlighter, eraser, delete, polish | PENDING | |

## NEXT TASK
T10: Annotation engine + shapes — create `editor/annotations.js` exporting `initAnnotations(editor)`; import/call it in editor.js main()
after initExport (editor.js tool buttons call `editor.hooks.setTool(tool)` when set; tools: rect/ellipse/arrow/line from `#dd-shapes
[data-tool]`, pen/highlighter/eraser buttons — pen/highlighter/eraser are T11 but register the names now). Model: `editor.annotations = []`
of objects {id, type, points|rect, color, size, opacity}; coordinates in FULL-image px (crop-independent). Render into `view.overlayCtx`
(overlay canvas is full-image sized and already offset by the crop) via a `requestRender()` rAF loop; also implement
`editor.hooks.renderAnnotations(ctx)` (export.js calls it with ctx already translated to full-image coords) and
`editor.hooks.hasSelection()` (export.js uses it for Ctrl+C). Pointer events: listen on `#viewport` (bail if `view.isPanTrigger(e)` /
`view.spaceDown` / crop active `editor.hooks.crop.isActive()`), convert with `view.toImage`. Selection: click selects top-most object
hit; draw handles on the overlay; move/resize with history commands; `#btn-delete` + Delete/Backspace remove selected. Color from
`editor.color` / `hooks.onColorChange`; size from `#pen-size`. Push History commands {undo, redo} for add/delete/move/resize; set
`hooks.onCropStart` to deselect. Shapes: Rectangle, Circle (ellipse), Arrow (line + filled head), Line; stroke width = pen size,
opacity 1. Create `editor/tools/shapes.js` with the per-type draw/hit-test/bounds functions to keep annotations.js < 400 lines.

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
- editor/history.js — `class History(max=100)` {push(cmd{label,undo,redo}) (cmd must already be applied), undo, redo, clear, canUndo/canRedo, onChange}; `initHistory(editor)` sets `editor.history`, wires #btn-undo/#btn-redo (disabled state) + Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y; respects `editor.hooks.beforeHistory()` veto
- editor/crop.js — `initCrop(editor)`: `editor.crop` {x,y,width,height} in FULL-image px (set to full image in `hooks.onImageLoaded`, inputs pre-filled); crop mode (#btn-crop toggle, key `C`) reveals the full image and edits a draft via viewport-space `#crop-layer > #crop-box` (8 `.crop-handle[data-handle]`, drag-move, drag-on-dim = create new rect, rule-of-thirds grid, `#crop-label` W × H), numeric `#crop-w/#crop-h` (change → draft; Enter → apply), `#crop-link`/`#crop-aspect` lock ratio (resize + inputs + create honour it), `#crop-apply`/Enter/dblclick apply → `editor.history.push` + `view.setCropRect`; `#crop-cancel`/Esc cancel. Hooks: `editor.hooks.crop = {start, apply, cancel, toggle, isActive}`, `hooks.onCropStart` (return false to veto), `hooks.onCropEnd`, `hooks.onCropChange(rect)`. Exports pure `resizeRect(start, handle, pt, ratio, W, H)`
- editor/canvas-view.js additions — `imageWidth/imageHeight` (full base), `width/height` = visible crop size, `origin` {x,y}; `setCropRect(rect)` shrinks the stage to the rect and offsets both canvases by `-rect.x/-rect.y` (canvas pixels untouched → tool coords stay full-image px); `toImage/toClient` account for origin; new `toViewport(x,y)`; `clearOverlay` clears full image
- editor/export.js — `initExport(editor)` → `editor.hooks.export = {copy, download(fmt), pdf, render}`; `renderExport(editor,{background})` = offscreen canvas of crop size, drawImage(base, -crop.x,-crop.y) then `hooks.renderAnnotations?.(ctx)` (ctx translated to full-image coords); `FORMATS` png/jpeg(white bg, q .92)/webp(q .92); `timestampName(ext)` → `screenshot-YYYYMMDD-HHmmss.ext`; `downloadBlob` via `<a download>`; copy = ClipboardItem image/png; PDF = vendored jsPDF (`globalThis.jspdf.jsPDF`, unit pt, page = px×0.75, PNG for <1.5 MP else JPEG .92, clamps to 14400 pt with notice). Wires #btn-copy, #btn-pdf, [data-format], [data-export] (copy/png/jpeg/webp/pdf/download→#file-format), Ctrl/Cmd+C when `!hooks.hasSelection?.()` and no text selection. Toasts "Copied!" / "Downloaded PNG" / "PDF exported"; errors as red toasts. Busy guard (`body.exporting`).
- lib/jspdf.umd.min.js — jsPDF 2.5.2 UMD (MIT), loaded via plain `<script>` in editor.html before the module script; verified free of eval/new Function (MV3 CSP-safe)
- editor/annotations.js, tools/ — still placeholders
- lib/README.js — jsPDF to be vendored in T9
- icons/16,32,48,128.png — generated indigo camera placeholder icons
- README.md — load-unpacked instructions, shortcuts

## Decisions & assumptions
- Content script is injected as a classic script (`content/content.js`); it may dynamically `import()` ES modules from `chrome.runtime.getURL('content/…')` (hence web_accessible_resources).
- Frames are passed content→background as PNG data URLs inside `SAVE_CAPTURE` (one message per capture; background converts to Blobs for IndexedDB). If this proves too large for very long pages, switch to one `SAVE_FRAME` message per frame.
- `downloads` permission NOT requested; editor uses `<a download>` blob links.
- Restricted URL detection in `isRestrictedUrl()` also treats `*.pdf` URLs as restricted; `file://` failures are caught by the executeScript try/catch and show the badge.

- Crop is NON-destructive: `editor.image` is never re-rendered; the visible region is `editor.crop` applied via `view.setCropRect`. Export (T9) must draw `editor.image` at `(-crop.x, -crop.y)` onto a crop-sized canvas. Annotations (T10) keep full-image coordinates and are clipped by the stage overflow + export canvas size.
- Crop UI is drawn in viewport space (unscaled) rather than inside the CSS-scaled stage so handles/labels stay crisp; `view.onViewChange` re-positions it.
- Undo/redo while a crop edit is in progress first cancels the edit (`hooks.beforeHistory`).
- `[hidden] { display: none !important; }` added to editor.css — `.empty-state { display:grid }` previously overrode the hidden attribute and intercepted pointer events.
- JPEG/WEBP quality fixed at 0.92 (no quality slider UI in the mockup); PDF embeds PNG for small images (<1.5 MP) and JPEG otherwise to keep file size sane.
- Headless testing: Playwright (python) + chromium can be installed in the sandbox (`pip install playwright && python3 -m playwright install chromium && sudo python3 -m playwright install-deps chromium`); serve the repo with `python3 -m http.server 8765` and open `editor/editor.html`, then seed `editor.image` via `import('./editor.js')`.

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
1. Reload extension; capture anything; optionally crop. **Copy** (top bar, Quick Actions, Export ▾ → Copy, or Ctrl/Cmd+C) → toast "Copied!"; paste into any image-accepting app → exactly the cropped preview at full resolution.
2. **Download ▾** → PNG / JPG / WEBP each save `screenshot-YYYYMMDD-HHmmss.<ext>` (JPG has a white background where the capture was transparent). Quick Actions → Download uses the "File Format" select.
3. **Export PDF** (top bar / Quick Actions / Export ▾) → one-page PDF whose page equals the image size (px × 0.75 pt); opens in Chrome's PDF viewer with the image filling the page.
4. Zoom in/out before exporting → output size unchanged (status bar "Canvas: W × H" = exported pixel size).
5. Undo a crop and export again → full image exported.

Previous (T8):
1. Reload extension; capture anything; in the editor press **Crop** (or key `C`). The whole image is shown with a dimmed overlay and a blue crop box with 8 handles + rule-of-thirds grid; Apply/Cancel appear in the right panel; Width/Height inputs show the box size live.
2. Drag the handles (corners + edges), drag inside to move, drag on the dimmed area to draw a fresh box. The label below the box shows W × H in true image pixels. Zoom (Ctrl+wheel / +−) while cropping: box stays aligned.
3. Type Width 600 / Height 400 → box resizes anchored at its top-left. Toggle "Keep aspect ratio" (or the link icon) → further resizes/inputs keep the ratio.
4. Apply (button, Enter, or double-click the box) → workspace shows only the cropped region, status bar "Canvas: 600 × 400", toast "Cropped to …". Undo (Ctrl+Z / button) restores the previous crop; Redo re-applies. Cancel/Esc discards the draft.
5. Pixel check: crop a region whose edge sits exactly on a colour boundary; the cropped result should start exactly on that boundary.

Previous (T7):
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
