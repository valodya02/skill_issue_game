// Pure 2D collision helpers. Rectangles use their top-left corner and size.
function circleRect(x, y, r, rect) {
  const cx = Math.max(rect.x, Math.min(x, rect.x + rect.w));
  const cy = Math.max(rect.y, Math.min(y, rect.y + rect.h));
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy < r * r;
}

function moveCircle(x, y, dx, dy, r, solid, low = []) {
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
  return { x, y };
}

// Swept point against a rectangle expanded by projectile radius.
function shotRect(x0, y0, x1, y1, r, rect) {
  const left = rect.x - r, right = rect.x + rect.w + r;
  const top = rect.y - r, bottom = rect.y + rect.h + r;
  const dx = x1 - x0, dy = y1 - y0;
  let enter = 0, leave = 1, axis = null;
  if (!dx) { if (x0 < left || x0 > right) return null; }
  else {
    const a = (left - x0) / dx, b = (right - x0) / dx;
    const near = Math.min(a, b), far = Math.max(a, b);
    if (near > enter) { enter = near; axis = 'x'; }
    leave = Math.min(leave, far);
  }
  if (!dy) { if (y0 < top || y0 > bottom) return null; }
  else {
    const a = (top - y0) / dy, b = (bottom - y0) / dy;
    const near = Math.min(a, b), far = Math.max(a, b);
    if (near > enter) { enter = near; axis = 'y'; }
    leave = Math.min(leave, far);
  }
  return enter <= leave && enter <= 1 ? { t: enter, axis: axis || (Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y') } : null;
}

function firstSolidHit(x0, y0, x1, y1, r, map) {
  let impact = null;
  for (const rect of map.solid || []) {
    if (rect.x > Math.max(x0, x1) + r || rect.x + rect.w < Math.min(x0, x1) - r ||
        rect.y > Math.max(y0, y1) + r || rect.y + rect.h < Math.min(y0, y1) - r) continue;
    const hit = shotRect(x0, y0, x1, y1, r, rect);
    if (hit && (!impact || hit.t < impact.t)) impact = hit;
  }
  return impact;
}

function reflect(vx, vy, axis) { return axis === 'x' ? { vx: -vx, vy } : { vx, vy: -vy }; }

module.exports = { circleRect, moveCircle, shotRect, firstSolidHit, reflect };
