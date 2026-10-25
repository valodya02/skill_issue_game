// Pure 2D collision helpers. Rectangles use their top-left corner and size.
function circleRect(x, y, r, rect) {
  const cx = Math.max(rect.x, Math.min(x, rect.x + rect.w));
  const cy = Math.max(rect.y, Math.min(y, rect.y + rect.h));
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy < r * r;
}

// Resolve a spawn inside geometry before applying the requested displacement.
function pushOut(x, y, r, obstacles) {
  for (let pass = 0; pass < obstacles.length + 1; pass++) {
    let changed = false;
    for (const rect of obstacles) {
      if (!circleRect(x, y, r, rect)) continue;
      const cx = Math.max(rect.x, Math.min(x, rect.x + rect.w));
      const cy = Math.max(rect.y, Math.min(y, rect.y + rect.h));
      const dx = x - cx, dy = y - cy, distance = Math.hypot(dx, dy);
      if (distance > 0) {
        x = cx + dx / distance * r;
        y = cy + dy / distance * r;
      } else {
        const exits = [
          { d: x - (rect.x - r), x: rect.x - r, y },
          { d: rect.x + rect.w + r - x, x: rect.x + rect.w + r, y },
          { d: y - (rect.y - r), x, y: rect.y - r },
          { d: rect.y + rect.h + r - y, x, y: rect.y + rect.h + r },
        ];
        const nearest = exits.reduce((a, b) => b.d < a.d ? b : a);
        x = nearest.x; y = nearest.y;
      }
      changed = true;
    }
    if (!changed) break;
  }
  return { x, y };
}

function moveCircle(x, y, dx, dy, r, solid, low = []) {
  const obstacles = solid.concat(low);
  ({ x, y } = pushOut(x, y, r, obstacles));
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / r));
  const sx = dx / steps, sy = dy / steps;
  for (let step = 0; step < steps; step++) {
    let nx = x + sx;
    for (let i = 0; i < solid.length + low.length; i++) {
      const rect = i < solid.length ? solid[i] : low[i - solid.length];
      if (circleRect(nx, y, r, rect)) nx = sx > 0 ? Math.min(nx, rect.x - r) : sx < 0 ? Math.max(nx, rect.x + rect.w + r) : x;
    }
    x = nx;
    let ny = y + sy;
    for (let i = 0; i < solid.length + low.length; i++) {
      const rect = i < solid.length ? solid[i] : low[i - solid.length];
      if (circleRect(x, ny, r, rect)) ny = sy > 0 ? Math.min(ny, rect.y - r) : sy < 0 ? Math.max(ny, rect.y + rect.h + r) : y;
    }
    y = ny;
  }
  return pushOut(x, y, r, obstacles);
}

// Minkowski broad phase plus exact straight faces and circular corners.
function sweepCircleRect(x0, y0, x1, y1, r, rect) {
  const dx = x1 - x0, dy = y1 - y0;
  const left = rect.x, right = rect.x + rect.w;
  const top = rect.y, bottom = rect.y + rect.h;
  const cx = Math.max(left, Math.min(x0, right));
  const cy = Math.max(top, Math.min(y0, bottom));
  const ox = x0 - cx, oy = y0 - cy;
  if (ox * ox + oy * oy <= r * r) {
    let nx = ox, ny = oy;
    const length = Math.hypot(nx, ny);
    if (length) { nx /= length; ny /= length; }
    else {
      const edges = [x0 - left, right - x0, y0 - top, bottom - y0];
      const closest = edges.indexOf(Math.min(...edges));
      nx = closest === 0 ? -1 : closest === 1 ? 1 : 0;
      ny = closest === 2 ? -1 : closest === 3 ? 1 : 0;
    }
    return { t: 0, axis: Math.abs(nx) >= Math.abs(ny) ? 'x' : 'y', nx, ny };
  }
  let enter = 0, leave = 1;
  for (const [start, delta, min, max] of [[x0, dx, left - r, right + r], [y0, dy, top - r, bottom + r]]) {
    if (!delta) { if (start < min || start > max) return null; }
    else {
      enter = Math.max(enter, Math.min((min - start) / delta, (max - start) / delta));
      leave = Math.min(leave, Math.max((min - start) / delta, (max - start) / delta));
      if (enter > leave) return null;
    }
  }
  let best = null;
  function candidate(t, nx, ny) {
    if (t < 0 || t > 1 || (best && t >= best.t)) return;
    best = { t, axis: Math.abs(nx) >= Math.abs(ny) ? 'x' : 'y', nx, ny };
  }
  if (dx > 0) { const t = (left - r - x0) / dx; if (y0 + dy * t >= top && y0 + dy * t <= bottom) candidate(t, -1, 0); }
  if (dx < 0) { const t = (right + r - x0) / dx; if (y0 + dy * t >= top && y0 + dy * t <= bottom) candidate(t, 1, 0); }
  if (dy > 0) { const t = (top - r - y0) / dy; if (x0 + dx * t >= left && x0 + dx * t <= right) candidate(t, 0, -1); }
  if (dy < 0) { const t = (bottom + r - y0) / dy; if (x0 + dx * t >= left && x0 + dx * t <= right) candidate(t, 0, 1); }
  const a = dx * dx + dy * dy;
  if (a && r) for (const [cornerX, cornerY, sx, sy] of [
    [left, top, -1, -1], [right, top, 1, -1], [left, bottom, -1, 1], [right, bottom, 1, 1],
  ]) {
    const px = x0 - cornerX, py = y0 - cornerY;
    const b = 2 * (px * dx + py * dy);
    const disc = b * b - 4 * a * (px * px + py * py - r * r);
    if (disc < 0) continue;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    const hx = x0 + dx * t - cornerX, hy = y0 + dy * t - cornerY;
    if (hx * sx >= 0 && hy * sy >= 0) candidate(t, hx / r, hy / r);
  }
  return best;
}

function shotRect(x0, y0, x1, y1, r, rect) {
  return sweepCircleRect(x0, y0, x1, y1, r, rect);
}

function firstSolidHit(x0, y0, x1, y1, r, map) {
  let impact = null;
  for (const rect of map.solid || []) {
    if (rect.x > Math.max(x0, x1) + r || rect.x + rect.w < Math.min(x0, x1) - r ||
        rect.y > Math.max(y0, y1) + r || rect.y + rect.h < Math.min(y0, y1) - r) continue;
    const hit = sweepCircleRect(x0, y0, x1, y1, r, rect);
    if (hit && (!impact || hit.t < impact.t)) impact = hit;
  }
  return impact;
}

function reflect(vx, vy, axis) { return axis === 'x' ? { vx: -vx, vy } : { vx, vy: -vy }; }

function createRng(seed = 1337) {
  let state = seed >>> 0;
  return function rng() {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

module.exports = { circleRect, moveCircle, shotRect, firstSolidHit, reflect, sweepCircleRect, createRng };
