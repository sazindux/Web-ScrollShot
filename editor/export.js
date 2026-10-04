// Export suite — copy to clipboard, PNG / JPEG / WEBP download, PDF export.
//
// Everything renders through renderExport(): an offscreen canvas sized to the
// crop rect (full original resolution, never the zoomed view) containing the
// base image + annotations (editor.hooks.renderAnnotations, T10). Zoom never
// affects the output.
import { showToast } from './ui.js';
import { isEditable } from './canvas-view.js';

const $ = (sel) => document.querySelector(sel);

export const FORMATS = {
  png: { mime: 'image/png', ext: 'png', label: 'PNG' },
  jpeg: { mime: 'image/jpeg', ext: 'jpg', label: 'JPG', quality: 0.92, background: '#ffffff' },
  webp: { mime: 'image/webp', ext: 'webp', label: 'WEBP', quality: 0.92 },
};

/** Render base image + annotations clipped to the crop rect at full resolution. */
export function renderExport(editor, { background } = {}) {
  const crop = editor.crop ?? { x: 0, y: 0, width: editor.image.width, height: editor.image.height };
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(crop.width));
  canvas.height = Math.max(1, Math.round(crop.height));
  const ctx = canvas.getContext('2d');
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.save();
  ctx.translate(-Math.round(crop.x), -Math.round(crop.y));
  ctx.drawImage(editor.image, 0, 0);
  editor.hooks.renderAnnotations?.(ctx);   // draws in full-image coordinates
  ctx.restore();
  return canvas;
}

export function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error(`Could not encode ${mime}`))), mime, quality);
  });
}

export function timestampName(ext, date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
  return `screenshot-${stamp}.${ext}`;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/* ───────── actions ───────── */

async function copyImage(editor) {
  const canvas = renderExport(editor);
  const blob = await canvasToBlob(canvas, 'image/png');
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('Clipboard image writing is not supported in this browser');
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

async function downloadImage(editor, format) {
  const f = FORMATS[format] ?? FORMATS.png;
  const canvas = renderExport(editor, { background: f.background });
  const blob = await canvasToBlob(canvas, f.mime, f.quality);
  // Browsers without WEBP encoding silently fall back to PNG — detect that.
  if (blob.type && blob.type !== f.mime) throw new Error(`${f.label} is not supported by this browser`);
  downloadBlob(blob, timestampName(f.ext));
  return f;
}

async function exportPdf(editor) {
  const jsPDF = globalThis.jspdf?.jsPDF;
  if (!jsPDF) throw new Error('PDF library failed to load');
  const canvas = renderExport(editor, { background: '#ffffff' });
  // Image px → PDF points (CSS 96 dpi → 72 pt/in).
  const wPt = canvas.width * 0.75, hPt = canvas.height * 0.75;
  // jsPDF caps page sizes at 14400 pt; scale down proportionally if needed.
  const MAX_PT = 14400;
  const s = Math.min(1, MAX_PT / wPt, MAX_PT / hPt);
  const doc = new jsPDF({
    unit: 'pt',
    format: [wPt * s, hPt * s],
    orientation: wPt >= hPt ? 'landscape' : 'portrait',
    compress: true,
  });
  // JPEG keeps the PDF small; use PNG for small images where quality matters more.
  const usePng = canvas.width * canvas.height < 1_500_000;
  const dataUrl = usePng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.92);
  doc.addImage(dataUrl, usePng ? 'PNG' : 'JPEG', 0, 0, wPt * s, hPt * s, undefined, 'FAST');
  doc.save(timestampName('pdf'));
  return s < 1 ? `PDF page scaled to ${Math.round(s * 100)}% (page size limit)` : null;
}

/* ───────── wiring ───────── */

export function initExport(editor) {
  let busy = false;
  const run = async (label, fn) => {
    if (!editor.image) { showToast('Nothing to export yet'); return; }
    if (busy) return;
    busy = true;
    document.body.classList.add('exporting');
    try {
      const msg = await fn();
      if (msg !== false) showToast(msg || label);
    } catch (err) {
      console.error(err);
      showToast(err.message || `${label} failed`, { error: true, duration: 3200 });
    } finally {
      busy = false;
      document.body.classList.remove('exporting');
    }
  };

  const api = {
    copy: () => run('Copied!', async () => { await copyImage(editor); return 'Copied!'; }),
    download: (fmt) => run('Downloaded', async () => { const f = await downloadImage(editor, fmt); return `Downloaded ${f.label}`; }),
    pdf: () => run('PDF exported', async () => (await exportPdf(editor)) || 'PDF exported'),
    render: () => renderExport(editor),
  };
  editor.hooks.export = api;

  const dispatch = (kind) => {
    if (kind === 'copy') return api.copy();
    if (kind === 'pdf') return api.pdf();
    if (kind === 'download') return api.download($('#file-format').value);
    if (kind in FORMATS) return api.download(kind);
    return undefined;
  };

  $('#btn-copy')?.addEventListener('click', api.copy);
  $('#btn-pdf')?.addEventListener('click', api.pdf);
  document.querySelectorAll('[data-format]').forEach((b) => b.addEventListener('click', () => api.download(b.dataset.format)));
  document.querySelectorAll('[data-export]').forEach((b) => b.addEventListener('click', () => dispatch(b.dataset.export)));

  // Ctrl/Cmd+C copies the image when no annotation is selected.
  window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'c' || isEditable(e.target)) return;
    if (editor.hooks.hasSelection?.()) return;
    if (window.getSelection()?.toString()) return;  // let real text copies through
    e.preventDefault();
    api.copy();
  });
  return api;
}
