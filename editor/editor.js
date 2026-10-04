// Editor entry point. T3: load the capture from IndexedDB, compose the final
// image (crop to selection, DPR-aware) and display it. Later tasks add the
// full shell, crop, annotations and export.
import { getCapture, deleteCapture } from '../shared/db.js';
import { composeCapture } from './compose.js';

const params = new URLSearchParams(location.search);
const captureId = params.get('id');

const statusEl = document.getElementById('status');
const canvas = document.getElementById('base-canvas');

function setStatus(text, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.classList.toggle('error', isError);
  statusEl.style.display = text ? '' : 'none';
}

async function main() {
  if (!captureId) {
    setStatus('No capture ID in URL. Start a capture from the extension icon.', true);
    return;
  }
  setStatus('Loading capture…');
  let record;
  try {
    record = await getCapture(captureId);
  } catch (err) {
    setStatus(`Could not open storage: ${err.message}`, true);
    return;
  }
  if (!record) {
    setStatus('This capture is no longer available (it may have been opened already or expired).', true);
    return;
  }

  try {
    const { canvas: composed, notice } = await composeCapture(record);
    canvas.width = composed.width;
    canvas.height = composed.height;
    canvas.getContext('2d').drawImage(composed, 0, 0);
    canvas.style.display = '';
    document.title = `Screenshot ${composed.width}×${composed.height} — ScrollShot`;
    setStatus(notice || '');
    window.__scrollshotImage = canvas; // handy for debugging / later modules
  } catch (err) {
    console.error(err);
    setStatus(`Failed to build the image: ${err.message}`, true);
  } finally {
    // One-shot: remove from storage once loaded (per spec).
    deleteCapture(captureId).catch(() => {});
  }
}

main();
