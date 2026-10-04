// Editor entry point.
// Flow: read ?id → getCapture → composeCapture → CanvasView.setImage → deleteCapture.
// T7: shell + zoom/pan + status bar. Crop (T8), export (T9) and annotations
// (T10/T11) plug into the hooks exposed on `editor` below.
import { getCapture, deleteCapture } from '../shared/db.js';
import { composeCapture } from './compose.js';
import { CanvasView, isEditable } from './canvas-view.js';
import { initDropdowns, showToast } from './ui.js';
import { initHistory } from './history.js';
import { initCrop } from './crop.js';

const $ = (sel) => document.querySelector(sel);

export const editor = {
  view: null,
  image: null,         // HTMLCanvasElement with the full-resolution base image
  crop: null,          // {x,y,width,height} visible/exported region in image px (crop.js)
  history: null,       // History instance (history.js)
  captureId: null,
  // Hooks filled by later modules (crop.js / export.js / annotations.js)
  hooks: {},
};

function showEmpty(title, text, isError = false) {
  const box = $('#empty-state');
  box.hidden = false;
  box.querySelector('.empty-card').classList.toggle('error', isError);
  $('#empty-title').textContent = title;
  $('#empty-text').textContent = text;
}

function showNotice(text) {
  const el = $('#notice');
  el.hidden = !text;
  el.textContent = text || '';
}

function setupView() {
  const view = new CanvasView({
    viewport: $('#viewport'),
    stage: $('#stage'),
    base: $('#base-canvas'),
    overlay: $('#overlay-canvas'),
  });
  editor.view = view;

  const sizeEl = $('#status-size');
  const zoomLabel = $('#zoom-label');
  view.onViewChange = ({ zoom, width, height }) => {
    sizeEl.textContent = `Canvas: ${width} × ${height}`;
    zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
    document.querySelectorAll('#dd-zoom [data-zoom]').forEach((b) => {
      const z = b.dataset.zoom;
      b.classList.toggle('active', z !== 'fit' && Math.abs(parseFloat(z) - zoom) < 0.005);
    });
  };

  $('#zoom-in').addEventListener('click', () => view.zoomIn());
  $('#zoom-out').addEventListener('click', () => view.zoomOut());
  $('#dd-zoom').addEventListener('click', (e) => {
    const b = e.target.closest('[data-zoom]');
    if (!b) return;
    if (b.dataset.zoom === 'fit') view.fit(); else view.setZoom(parseFloat(b.dataset.zoom));
  });

  // Keyboard: + / − / 0 zoom (ignored while typing in inputs).
  window.addEventListener('keydown', (e) => {
    if (isEditable(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '+' || e.key === '=') { view.zoomIn(); e.preventDefault(); }
    else if (e.key === '-' || e.key === '_') { view.zoomOut(); e.preventDefault(); }
    else if (e.key === '0') { view.fit(); e.preventDefault(); }
  });
  // Ctrl/Cmd + 0 / + / − (browser zoom shortcuts) → editor zoom instead.
  window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || isEditable(e.target)) return;
    if (e.key === '0') { view.fit(); e.preventDefault(); }
    else if (e.key === '+' || e.key === '=') { view.zoomIn(); e.preventDefault(); }
    else if (e.key === '-') { view.zoomOut(); e.preventDefault(); }
  });
  return view;
}

function setupPlaceholders() {
  // Pen size label + palette active state (purely visual until T10).
  const range = $('#pen-size');
  const label = $('#pen-size-label');
  range.addEventListener('input', () => { label.textContent = `${range.value} px`; });

  const palette = $('#palette');
  palette.addEventListener('click', (e) => {
    const sw = e.target.closest('.swatch[data-color]');
    if (!sw) return;
    palette.querySelectorAll('.swatch').forEach((s) => s.classList.remove('active'));
    sw.classList.add('active');
    editor.color = sw.dataset.color;
    editor.hooks.onColorChange?.(editor.color);
  });
  $('#custom-color').addEventListener('input', (e) => {
    palette.querySelectorAll('.swatch').forEach((s) => s.classList.remove('active'));
    e.target.closest('.swatch').classList.add('active');
    e.target.closest('.swatch').style.setProperty('--c', e.target.value);
    editor.color = e.target.value;
    editor.hooks.onColorChange?.(editor.color);
  });
  editor.color = '#2F6BFF';

  // Tool buttons: toggle "active" look; real tools registered in T10/T11.
  document.querySelectorAll('.annobar [data-tool]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tool = btn.dataset.tool;
      if (editor.hooks.setTool) { editor.hooks.setTool(tool); return; }
      showToast('Annotation tools arrive in a later update');
    });
  });

  // Actions that are implemented later show a friendly toast for now.
  document.querySelectorAll('[data-export], #btn-copy, #btn-pdf, [data-format]').forEach((b) => {
    b.addEventListener('click', (e) => {
      if (editor.hooks.export) return; // export.js handles it
      e.preventDefault();
      showToast('Export coming soon');
    });
  });
}

async function loadCapture(view) {
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  editor.captureId = id;
  if (!id) {
    showEmpty('No capture to show', 'Start a capture from the extension icon or press Alt+Shift+S on any page.');
    return;
  }
  let record;
  try {
    record = await getCapture(id);
  } catch (err) {
    showEmpty('Storage error', `Could not open storage: ${err.message}`, true);
    return;
  }
  if (!record) {
    showEmpty('Capture unavailable', 'This capture is no longer available — it may have been opened already or expired (captures are kept for 24 h).', true);
    return;
  }
  try {
    const { canvas, notice } = await composeCapture(record);
    editor.image = canvas;
    view.setImage(canvas);
    $('#empty-state').hidden = true;
    document.title = `Screenshot ${canvas.width}×${canvas.height} — ScrollShot`;
    showNotice(notice);
    editor.hooks.onImageLoaded?.(canvas);
    window.__scrollshotImage = canvas;
  } catch (err) {
    console.error(err);
    showEmpty('Failed to build the image', err.message, true);
  } finally {
    deleteCapture(id).catch(() => {});
  }
}

async function main() {
  initDropdowns();
  const view = setupView();
  initHistory(editor);
  initCrop(editor);
  setupPlaceholders();
  $('#empty-state').hidden = false;
  $('#empty-title').textContent = 'Loading capture…';
  await loadCapture(view);
}

main();
