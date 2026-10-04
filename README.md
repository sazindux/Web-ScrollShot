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
| Editor | `+` / `-` / `0` | Zoom in / out / fit |

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
