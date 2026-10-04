// Annotation engine — vector object model drawn on the overlay canvas.
//
// editor.annotations = [ {id, type, points, color, size, opacity}, … ]  (full-image px)
// Tools: select (default), rect, ellipse, arrow, line, pen, highlighter, eraser.
// Pointer events are taken from #viewport and converted with view.toImage so
// everything is zoom-independent. Rendering runs through a rAF-batched
// requestRender(). All mutations push {undo, redo} commands to editor.history.
//
// Hooks provided: hooks.setTool(name), hooks.renderAnnotations(ctx),
// hooks.hasSelection(), hooks.requestRender(). Hooks consumed: onColorChange,
// onCropStart (deselect), crop.isActive (bail while cropping).
import { showToast } from './ui.js';
import { isEditable } from './canvas-view.js';
import {
  drawShape, hitTest, boundsOf, outerBounds, handlesOf, resizeShape, translateShape,
  cloneShape, HANDLE_CURSORS, SHAPE_TYPES, STROKE_TYPES, HIGHLIGHT_TYPES,
} from './tools/shapes.js';

const $ = (s) => document.querySelector(s);
const HIGHLIGHT_COLOR = '#FACC15';
const HIGHLIGHT_OPACITY = 0.35;
const HANDLE_PX = 9;         // handle square size in SCREEN px
const HIT_TOL_PX = 6;        // extra hit tolerance in SCREEN px
let nextId = 1;

export function initAnnotations(editor) {
  const view = editor.view;
  const viewport = view.viewport;
  const ctx = view.overlayCtx;
  const objects = editor.annotations = [];
  const state = {
    tool: 'select',
    selectedId: null,
    drag: null,            // active gesture
    hoverCursor: '',
    highlightMode: 'rect', // 'rect' | 'pen' (T11 toggles)
    renderQueued: false,
  };
  const label = $('#shape-label');

  /* ───────── helpers ───────── */
  const size = () => parseInt($('#pen-size').value, 10) || 4;
  const selected = () => objects.find((o) => o.id === state.selectedId) ?? null;
  const screenToImage = (px) => px / view.zoom;
  const cropActive = () => editor.hooks.crop?.isActive?.() === true;

  function requestRender() {
    if (state.renderQueued) return;
    state.renderQueued = true;
    requestAnimationFrame(() => { state.renderQueued = false; render(); });
  }

  function renderObjects(c, list = objects) {
    for (const o of list) drawShape(c, o);
  }

  function render() {
    if (!view.imageWidth) return;
    ctx.clearRect(0, 0, view.imageWidth, view.imageHeight);
    renderObjects(ctx);
    if (state.drag?.draft) drawShape(ctx, state.drag.draft);
    const sel = selected();
    if (sel && state.tool === 'select') drawSelection(sel);
  }

  function drawSelection(obj) {
    const b = outerBounds(obj);
    const lw = screenToImage(1.5);
    ctx.save();
    ctx.strokeStyle = '#2F6BFF';
    ctx.lineWidth = lw;
    ctx.setLineDash([screenToImage(5), screenToImage(4)]);
    if (obj.type !== 'line' && obj.type !== 'arrow') ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.setLineDash([]);
    const hs = screenToImage(HANDLE_PX);
    for (const h of handlesOf(obj)) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(h.x - hs / 2, h.y - hs / 2, hs, hs);
      ctx.strokeRect(h.x - hs / 2, h.y - hs / 2, hs, hs);
    }
    ctx.restore();
  }

  /* ───────── model mutations (all undoable) ───────── */
  function addObject(obj) {
    objects.push(obj);
    editor.history.push({
      label: `Add ${obj.type}`,
      undo: () => { remove(obj.id); },
      redo: () => { objects.push(obj); requestRender(); },
    });
    requestRender();
  }

  function remove(id) {
    const i = objects.findIndex((o) => o.id === id);
    if (i >= 0) objects.splice(i, 1);
    if (state.selectedId === id) state.selectedId = null;
    requestRender();
  }

  function deleteObject(obj) {
    const index = objects.indexOf(obj);
    if (index < 0) return;
    remove(obj.id);
    editor.history.push({
      label: 'Delete annotation',
      undo: () => { objects.splice(Math.min(index, objects.length), 0, obj); requestRender(); },
      redo: () => { remove(obj.id); },
    });
  }

  function deleteSelected() {
    const sel = selected();
    if (!sel) { showToast('Select an annotation first'); return; }
    deleteObject(sel);
  }

  function commitTransform(obj, before, labelText) {
    const after = cloneShape(obj).points;
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    editor.history.push({
      label: labelText,
      undo: () => { obj.points = before.map((p) => ({ ...p })); requestRender(); },
      redo: () => { obj.points = after.map((p) => ({ ...p })); requestRender(); },
    });
  }

  /* ───────── hit testing ───────── */
  function handleAt(obj, pt) {
    const r = screenToImage(HANDLE_PX / 2 + 3);
    for (const h of handlesOf(obj)) {
      if (Math.abs(pt.x - h.x) <= r && Math.abs(pt.y - h.y) <= r) return h.id;
    }
    return null;
  }

  function objectAt(pt) {
    const tol = screenToImage(HIT_TOL_PX);
    for (let i = objects.length - 1; i >= 0; i--) if (hitTest(objects[i], pt, tol)) return objects[i];
    return null;
  }

  /* ───────── tools ───────── */
  function setTool(name) {
    // Clicking the already-active tool toggles back to Select.
    state.tool = (name !== 'select' && name === state.tool) ? 'select' : name;
    if (state.tool !== 'select') state.selectedId = null;
    document.querySelectorAll('.annobar [data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === state.tool));
    const shapeBtn = $('#dd-shapes .dropdown-toggle');
    const isShape = SHAPE_TYPES.includes(state.tool);
    shapeBtn.classList.toggle('active', isShape);
    if (label) label.textContent = isShape ? ({ rect: 'Rectangle', ellipse: 'Circle', arrow: 'Arrow', line: 'Line' })[state.tool] : 'Shapes';
    viewport.dataset.tool = state.tool;
    updateCursor();
    requestRender();
  }

  function updateCursor(pt) {
    let cur = '';
    if (view.spaceDown) { /* pan cursor comes from CSS */ }
    else if (state.tool === 'select') {
      const sel = selected();
      const h = sel && pt ? handleAt(sel, pt) : null;
      if (h) cur = HANDLE_CURSORS[h];
      else if (pt && objectAt(pt)) cur = 'move';
    } else if (state.tool === 'eraser') {
      cur = pt && objectAt(pt) ? 'pointer' : 'not-allowed';
    } else cur = 'crosshair';
    if (cur !== state.hoverCursor) { state.hoverCursor = cur; viewport.style.cursor = cur; }
  }

  function newObject(type, pt) {
    const hl = HIGHLIGHT_TYPES.has(type);
    return {
      id: nextId++, type,
      points: [{ ...pt }, { ...pt }],
      color: hl ? (editor.color === '#2F6BFF' ? HIGHLIGHT_COLOR : editor.color) : editor.color,
      size: hl && type === 'hl-pen' ? Math.max(size(), 12) : size(),
      opacity: hl ? HIGHLIGHT_OPACITY : 1,
    };
  }

  /* ───────── pointer gestures ───────── */
  function onDown(e) {
    if (e.button !== 0 || view.isPanTrigger(e) || view.spaceDown || cropActive() || !view.imageWidth) return;
    const pt = view.toImage(e.clientX, e.clientY);
    const tool = state.tool;
    e.preventDefault();

    if (tool === 'select') {
      const sel = selected();
      const h = sel ? handleAt(sel, pt) : null;
      if (h) {
        state.drag = { kind: 'resize', obj: sel, handle: h, orig: cloneShape(sel), before: cloneShape(sel).points };
      } else {
        const hit = objectAt(pt);
        state.selectedId = hit?.id ?? null;
        if (hit) state.drag = { kind: 'move', obj: hit, last: pt, before: cloneShape(hit).points, moved: false };
      }
      requestRender();
    } else if (tool === 'eraser') {
      const hit = objectAt(pt);
      if (hit) deleteObject(hit);
      state.drag = { kind: 'erase' };
    } else {
      const type = tool === 'highlighter' ? (state.highlightMode === 'pen' ? 'hl-pen' : 'hl-rect') : tool;
      const draft = newObject(type, pt);
      if (STROKE_TYPES.has(type)) draft.points = [{ ...pt }];
      state.drag = { kind: 'draw', draft, start: pt };
      requestRender();
    }
    if (state.drag) viewport.setPointerCapture(e.pointerId);
  }

  function onMove(e) {
    if (!view.imageWidth || cropActive()) return;
    const pt = view.toImage(e.clientX, e.clientY);
    const d = state.drag;
    if (!d) { updateCursor(pt); return; }
    switch (d.kind) {
      case 'draw':
        if (STROKE_TYPES.has(d.draft.type)) {
          const last = d.draft.points[d.draft.points.length - 1];
          if (Math.hypot(pt.x - last.x, pt.y - last.y) >= screenToImage(1.5)) d.draft.points.push({ ...pt });
        } else {
          d.draft.points[1] = e.shiftKey ? constrain(d.start, pt, d.draft.type) : { ...pt };
        }
        break;
      case 'move':
        translateShape(d.obj, pt.x - d.last.x, pt.y - d.last.y);
        d.last = pt; d.moved = true;
        break;
      case 'resize':
        resizeShape(d.obj, d.handle, d.orig, pt);
        break;
      case 'erase': {
        const hit = objectAt(pt);
        if (hit) deleteObject(hit);
        break;
      }
      default: break;
    }
    requestRender();
  }

  function onUp(e) {
    const d = state.drag;
    if (!d) return;
    state.drag = null;
    try { viewport.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (d.kind === 'draw') {
      const b = boundsOf(d.draft);
      const minPx = screenToImage(3);
      const tooSmall = STROKE_TYPES.has(d.draft.type) ? d.draft.points.length < 2 && b.w < minPx : (b.w < minPx && b.h < minPx);
      if (tooSmall) { requestRender(); return; }
      addObject(d.draft);
      if (STROKE_TYPES.has(d.draft.type)) return;             // keep drawing tool active for strokes
      // Shapes: stay on tool too (user can press Esc / click Select to leave).
    } else if (d.kind === 'move' && d.moved) {
      commitTransform(d.obj, d.before, 'Move annotation');
    } else if (d.kind === 'resize') {
      commitTransform(d.obj, d.before, 'Resize annotation');
    }
    requestRender();
  }

  function constrain(a, b, type) {
    const dx = b.x - a.x, dy = b.y - a.y;
    if (type === 'line' || type === 'arrow') {
      const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
      const len = Math.hypot(dx, dy);
      return { x: a.x + Math.cos(ang) * len, y: a.y + Math.sin(ang) * len };
    }
    const s = Math.max(Math.abs(dx), Math.abs(dy));
    return { x: a.x + Math.sign(dx || 1) * s, y: a.y + Math.sign(dy || 1) * s };
  }

  viewport.addEventListener('pointerdown', onDown);
  viewport.addEventListener('pointermove', onMove);
  viewport.addEventListener('pointerup', onUp);
  viewport.addEventListener('pointercancel', onUp);
  viewport.addEventListener('pointerleave', () => { if (!state.drag) updateCursor(); });

  /* ───────── toolbar + keyboard ───────── */
  $('#btn-delete').addEventListener('click', deleteSelected);
  $('#pen-size').addEventListener('input', () => {
    const sel = selected();
    if (!sel || state.tool !== 'select') return;
    const before = sel.size, after = size();
    if (before === after) return;
    sel.size = after;
    editor.history.push({ label: 'Pen size', undo: () => { sel.size = before; requestRender(); }, redo: () => { sel.size = after; requestRender(); } });
    requestRender();
  });

  const prevColor = editor.hooks.onColorChange;
  editor.hooks.onColorChange = (color) => {
    prevColor?.(color);
    const sel = selected();
    if (!sel || sel.color === color) return;
    const before = sel.color;
    sel.color = color;
    editor.history.push({ label: 'Color', undo: () => { sel.color = before; requestRender(); }, redo: () => { sel.color = color; requestRender(); } });
    requestRender();
  };

  const prevCropStart = editor.hooks.onCropStart;
  editor.hooks.onCropStart = () => {
    if (prevCropStart?.() === false) return false;
    state.selectedId = null;
    state.drag = null;
    requestRender();
    return true;
  };

  const prevLoaded = editor.hooks.onImageLoaded;
  editor.hooks.onImageLoaded = (canvas) => {
    prevLoaded?.(canvas);
    objects.length = 0;
    state.selectedId = null;
    requestRender();
  };

  window.addEventListener('keydown', (e) => {
    if (isEditable(e.target) || cropActive()) return;
    if (e.code === 'Space') { state.hoverCursor = ''; viewport.style.cursor = ''; return; }
    const mod = e.ctrlKey || e.metaKey;
    if ((e.key === 'Delete' || e.key === 'Backspace') && !mod) {
      if (selected()) { deleteSelected(); e.preventDefault(); }
    } else if (e.key === 'Escape') {
      if (state.drag) { state.drag = null; requestRender(); }
      else if (state.tool !== 'select') setTool('select');
      else if (state.selectedId) { state.selectedId = null; requestRender(); }
    } else if (!mod && !e.altKey) {
      const map = { v: 'select', r: 'rect', o: 'ellipse', a: 'arrow', l: 'line', p: 'pen', h: 'highlighter', e: 'eraser' };
      const t = map[e.key.toLowerCase()];
      if (t) { setTool(t); e.preventDefault(); }
    }
  });

  // Re-render selection handles (screen-size constant) whenever zoom changes.
  const prevView = view.onViewChange;
  view.onViewChange = (info) => { prevView?.(info); if (state.selectedId || state.drag) requestRender(); };

  /* ───────── hooks ───────── */
  editor.hooks.setTool = setTool;
  editor.hooks.getTool = () => state.tool;
  editor.hooks.setHighlightMode = (m) => { state.highlightMode = m; };
  editor.hooks.getHighlightMode = () => state.highlightMode;
  editor.hooks.renderAnnotations = (c) => renderObjects(c);
  editor.hooks.hasSelection = () => !!state.selectedId;
  editor.hooks.requestRender = requestRender;
  editor.hooks.clearAnnotations = () => {
    if (!objects.length) return;
    const snapshot = objects.slice();
    objects.length = 0; state.selectedId = null;
    editor.history.push({
      label: 'Clear all',
      undo: () => { objects.push(...snapshot); requestRender(); },
      redo: () => { objects.length = 0; state.selectedId = null; requestRender(); },
    });
    requestRender();
  };
  setTool('select');
  return editor.hooks;
}
