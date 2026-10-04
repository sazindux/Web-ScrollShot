// Pure per-type geometry + drawing for annotation objects.
//
// Object model (all coordinates in FULL-image pixels, independent of zoom/crop):
//   { id, type, points: [{x,y}, …], color, size, opacity }
//   rect / ellipse / hl-rect : points = [corner A, corner B] (any order)
//   line / arrow             : points = [start, end]
//   pen / hl-pen             : points = polyline (≥ 2)
// `size` = stroke width in image px. `opacity` 0..1. hl-* types use multiply.

export const SHAPE_TYPES = ['rect', 'ellipse', 'arrow', 'line'];
export const BOX_TYPES = new Set(['rect', 'ellipse', 'hl-rect']);
export const STROKE_TYPES = new Set(['pen', 'hl-pen']);
export const HIGHLIGHT_TYPES = new Set(['hl-rect', 'hl-pen']);

/* ───────── bounds ───────── */

export function boundsOf(obj) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of obj.points) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Bounds grown by half the stroke width (for selection outline). */
export function outerBounds(obj) {
  const b = boundsOf(obj);
  const pad = HIGHLIGHT_TYPES.has(obj.type) && obj.type === 'hl-rect' ? 0 : obj.size / 2;
  return { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 };
}

/* ───────── drawing ───────── */

export function drawShape(ctx, obj) {
  ctx.save();
  ctx.globalAlpha = obj.opacity ?? 1;
  ctx.strokeStyle = obj.color;
  ctx.fillStyle = obj.color;
  ctx.lineWidth = obj.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (HIGHLIGHT_TYPES.has(obj.type)) ctx.globalCompositeOperation = 'multiply';
  const [p0, p1] = obj.points;
  switch (obj.type) {
    case 'rect': {
      const b = boundsOf(obj);
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      break;
    }
    case 'hl-rect': {
      const b = boundsOf(obj);
      ctx.fillRect(b.x, b.y, b.w, b.h);
      break;
    }
    case 'ellipse': {
      const b = boundsOf(obj);
      ctx.beginPath();
      ctx.ellipse(b.x + b.w / 2, b.y + b.h / 2, Math.max(0.1, b.w / 2), Math.max(0.1, b.h / 2), 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'line':
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
      break;
    case 'arrow':
      drawArrow(ctx, p0, p1, obj.size);
      break;
    case 'pen':
    case 'hl-pen':
      drawPolyline(ctx, obj.points);
      break;
    default:
      break;
  }
  ctx.restore();
}

export function arrowHeadLength(size) { return Math.max(10, size * 3.2); }

function drawArrow(ctx, p0, p1, size) {
  const dx = p1.x - p0.x, dy = p1.y - p0.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return;
  const head = Math.min(arrowHeadLength(size), len);
  const ux = dx / len, uy = dy / len;
  // Shaft stops where the head begins so the stroke cap doesn't poke out.
  const sx = p1.x - ux * head * 0.8, sy = p1.y - uy * head * 0.8;
  ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(sx, sy); ctx.stroke();
  const half = head * 0.45;
  const bx = p1.x - ux * head, by = p1.y - uy * head;
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(bx - uy * half, by + ux * half);
  ctx.lineTo(bx + uy * half, by - ux * half);
  ctx.closePath();
  ctx.fill();
}

function drawPolyline(ctx, pts) {
  if (pts.length === 1) {
    ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  if (pts.length === 2) { ctx.lineTo(pts[1].x, pts[1].y); ctx.stroke(); return; }
  // Smooth with quadratic curves through midpoints.
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
}

/* ───────── hit testing ───────── */

function distToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** True when `pt` (image px) is on the object. `tol` = extra tolerance in image px. */
export function hitTest(obj, pt, tol) {
  const half = obj.size / 2 + tol;
  const [p0, p1] = obj.points;
  switch (obj.type) {
    case 'rect': {
      const b = boundsOf(obj);
      const inOuter = pt.x >= b.x - half && pt.x <= b.x + b.w + half && pt.y >= b.y - half && pt.y <= b.y + b.h + half;
      const inInner = pt.x > b.x + half && pt.x < b.x + b.w - half && pt.y > b.y + half && pt.y < b.y + b.h - half;
      return inOuter && !inInner;
    }
    case 'hl-rect': {
      const b = boundsOf(obj);
      return pt.x >= b.x - tol && pt.x <= b.x + b.w + tol && pt.y >= b.y - tol && pt.y <= b.y + b.h + tol;
    }
    case 'ellipse': {
      const b = boundsOf(obj);
      const a = Math.max(0.5, b.w / 2), c = Math.max(0.5, b.h / 2);
      const nx = (pt.x - (b.x + a)) / a, ny = (pt.y - (b.y + c)) / c;
      const r = Math.hypot(nx, ny);
      return Math.abs(r - 1) * Math.min(a, c) <= half;
    }
    case 'line':
      return distToSegment(pt, p0, p1) <= half;
    case 'arrow':
      return distToSegment(pt, p0, p1) <= Math.max(half, arrowHeadLength(obj.size) * 0.45 + tol);
    case 'pen':
    case 'hl-pen': {
      const pts = obj.points;
      if (pts.length === 1) return Math.hypot(pt.x - pts[0].x, pt.y - pts[0].y) <= half;
      for (let i = 0; i < pts.length - 1; i++) if (distToSegment(pt, pts[i], pts[i + 1]) <= half) return true;
      return false;
    }
    default:
      return false;
  }
}

/* ───────── transforms ───────── */

export function translateShape(obj, dx, dy) {
  for (const p of obj.points) { p.x += dx; p.y += dy; }
}

/** Handles available for an object: 8 box handles, or 2 endpoint handles for lines. */
export function handlesOf(obj) {
  if (obj.type === 'line' || obj.type === 'arrow') {
    return [{ id: 'p0', ...obj.points[0] }, { id: 'p1', ...obj.points[1] }];
  }
  const b = boundsOf(obj);
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  return [
    { id: 'nw', x: b.x, y: b.y }, { id: 'n', x: cx, y: b.y }, { id: 'ne', x: b.x + b.w, y: b.y },
    { id: 'e', x: b.x + b.w, y: cy }, { id: 'se', x: b.x + b.w, y: b.y + b.h }, { id: 's', x: cx, y: b.y + b.h },
    { id: 'sw', x: b.x, y: b.y + b.h }, { id: 'w', x: b.x, y: cy },
  ];
}

export const HANDLE_CURSORS = {
  nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize',
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', p0: 'move', p1: 'move',
};

/**
 * Resize `obj` (mutated) given the drag `handle`, the original snapshot
 * `orig` (points at drag start) and the current pointer `pt`.
 */
export function resizeShape(obj, handle, orig, pt) {
  if (handle === 'p0' || handle === 'p1') {
    const i = handle === 'p0' ? 0 : 1;
    obj.points[i] = { x: pt.x, y: pt.y };
    return;
  }
  const b = boundsOf({ points: orig.points });
  let x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h;
  if (handle.includes('w')) x0 = pt.x;
  if (handle.includes('e')) x1 = pt.x;
  if (handle.includes('n')) y0 = pt.y;
  if (handle.includes('s')) y1 = pt.y;
  if (BOX_TYPES.has(obj.type)) {
    obj.points = [{ x: x0, y: y0 }, { x: x1, y: y1 }];
    return;
  }
  // Polylines: scale every point from the original bounds into the new box.
  const nb = { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
  const flipX = x1 < x0, flipY = y1 < y0;
  obj.points = orig.points.map((p) => {
    let fx = b.w ? (p.x - b.x) / b.w : 0, fy = b.h ? (p.y - b.y) / b.h : 0;
    if (flipX) fx = 1 - fx;
    if (flipY) fy = 1 - fy;
    return { x: nb.x + fx * nb.w, y: nb.y + fy * nb.h };
  });
}

export function cloneShape(obj) {
  return { ...obj, points: obj.points.map((p) => ({ x: p.x, y: p.y })) };
}

/* ───────── gesture helpers ───────── */

/** Light 3-point moving average (endpoints kept) to remove pointer jitter. */
export function smoothStroke(pts) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    out.push({
      x: (pts[i - 1].x + pts[i].x * 2 + pts[i + 1].x) / 4,
      y: (pts[i - 1].y + pts[i].y * 2 + pts[i + 1].y) / 4,
    });
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Shift-constraint: squares for boxes, 45° steps for line/arrow. */
export function constrain(a, b, type) {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (type === 'line' || type === 'arrow') {
    const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    const len = Math.hypot(dx, dy);
    return { x: a.x + Math.cos(ang) * len, y: a.y + Math.sin(ang) * len };
  }
  const s = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: a.x + Math.sign(dx || 1) * s, y: a.y + Math.sign(dy || 1) * s };
}
