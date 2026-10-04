# Capture More. Edit Better. — Web Screenshot Extension

A Manifest V3 Chromium extension (Chrome / Edge / Brave) for area, full-page and
scroll-and-stitch screenshots with a built-in annotation editor.
Plain HTML + CSS + vanilla JavaScript — no bundler, no frameworks.

## Load unpacked

1. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`).
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this repository folder (the one containing `manifest.json`).
4. Pin the extension icon from the puzzle-piece menu if you like.

After editing files, click the **Reload** (↻) button on the extension card, then reload the web page you are testing on.

## Usage

<p align="center">
  <img src="https://i.ibb.co/BVhLR1DM/file-360.jpg" width="30%" alt="Area Selection Overlay">
  <img src="https://i.ibb.co/R44S0ywg/file-361.jpg" width="30%" alt="Annotation Editor">
</p>

- Click the toolbar icon **or** press `Alt+Shift+S` to start a capture on the current page.
- Drag to select an area; use the floating toolbar for Full Page / Full Width / Fit presets.
- `Enter` or the **Capture** button captures; `Esc` cancels.
- The result opens in the editor tab where you can crop, annotate and export
  (Copy, PNG, JPG, WEBP, PDF).

## Keyboard shortcuts

| Where | Keys | Action |
|-------|------|--------|
| Any page | `Alt+Shift+S` | Start capture (change at `chrome://extensions/shortcuts`) |
| Overlay | `Esc` | Cancel |
| Overlay | `Enter` | Capture current selection |
| Editor | `Ctrl/Cmd+Z` | Undo |
| Editor | `Ctrl/Cmd+Shift+Z`, `Ctrl+Y` | Redo |
| Editor | `Delete` / `Backspace` | Delete selected annotation |
| Editor | `Ctrl/Cmd+C` | Copy image (when nothing is selected) |
| Editor | `+` / `-` / `0`, `Ctrl/Cmd+wheel` | Zoom in / out / fit, zoom around pointer |
| Editor | `Space`+drag, middle-drag, wheel | Pan |
| Editor | `C` | Toggle crop mode (`Enter` apply, `Esc` cancel) |
| Editor | `V` `R` `O` `A` `L` `P` `H` `E` | Select, Rectangle, Circle, Arrow, Line, Freehand, Highlighter, Eraser |
| Editor | `Shift` while drawing | Square / circle / 45° line |
| Editor | `Esc` | Cancel drag → back to Select → deselect |

## Editor tools

- **Crop** — drag box with 8 handles, numeric Width/Height, aspect lock; non-destructive and undoable.
- **Shapes** — Rectangle, Circle, Arrow, Line. Click a shape in Select mode to move/resize it;
  the palette and Pen Size slider change the selected object.
- **Freehand** — smoothed pen stroke. **Highlighter** — yellow, 35 % multiply; the ▾ next to it
  switches between *Area highlight* and *Freehand highlight*.
- **Eraser** — removes the whole annotation under the pointer (click or drag across); **Delete** removes
  the selected one. Undo/Redo cover every add, move, resize, colour, size, delete, clear and crop (100 steps).
- **Export** — Copy, PNG, JPG, WEBP, PDF at full original resolution; zoom never affects output.

## Manual test checklist

1. **Load** — extension loads with no manifest errors; icon badge `!` on `chrome://` pages.
2. **Overlay** — icon / `Alt+Shift+S` dims + blurs the page; `Esc` closes; second press toggles.
3. **Selection** — drag to select, 8 handles, move, W × H label; box stays glued to content while scrolling.
4. **Auto-scroll** — drag a handle near the top/bottom edge: page scrolls, selection grows, pill shows direction.
5. **Presets** — Full Width / Fit Left / Right / Top / Bottom / Full Page behave as defined.
6. **Stitch** — Full Page on a long article with a sticky header → one seamless image, header once; `Esc` mid-capture restores the page.
7. **Editor** — image opens fitted; zoom/pan smooth; status bar shows true pixel size.
8. **Crop** — apply, undo, redo; numeric inputs + aspect lock exact to the pixel.
9. **Export** — Copy, PNG, JPG (white bg), WEBP, PDF all match the preview incl. annotations and crop.
10. **Annotations** — draw each shape, freehand, both highlighter modes; select/move/resize; recolour/resize selected; eraser click + drag; Delete key; Undo/Redo through everything; export contains them.
11. **Large image** — very tall Full Page (>16k px) shows a scale notice and still annotates fluidly.

## Restricted pages

Chrome does not allow extensions on `chrome://` pages, the Chrome Web Store,
the built-in PDF viewer, or `file://` URLs without file access. On those pages the
toolbar icon shows a red `!` badge ("Can't capture this page").

## Project layout

```
manifest.json      MV3 manifest
background.js      service worker: activation, captureVisibleTab, IndexedDB, editor tab
content/           in-page overlay (Shadow DOM): selection, toolbar, autoscroll, capture driver
editor/            editor page: canvas view, crop, annotations, history, export
shared/            message names + IndexedDB helper
lib/               vendored third-party libs (jsPDF)
icons/             extension icons
handoff.md         development status / resume notes
```

## Development status

See [`handoff.md`](handoff.md).
