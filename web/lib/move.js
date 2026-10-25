const { circleRect } = require('./physics.js');

const JUMP_V = 520, GRAVITY = 1800, HOP_WINDOW = 150;
function axisMove(p, delta, axis, radius, map) {
  if (!delta) return;
  const other = axis === 'x' ? 'y' : 'x';
  const old = p[axis];
  const steps = Math.max(1, Math.ceil(Math.abs(delta) / radius));
  const part = delta / steps;
  for (let j = 0; j < steps; j++) {
    let next = p[axis] + part;
    for (const rect of map.solid || []) {
      if (!circleRect(axis === 'x' ? next : p.x, axis === 'y' ? next : p.y, radius, rect)) continue;
      next = part > 0 ? Math.min(next, rect[axis] - radius) : Math.max(next, rect[axis] + rect[axis === 'x' ? 'w' : 'h'] + radius);
    }
    for (const rect of map.low || []) {
      if (rect.height > 1 || p.z <= (rect.height || 0) * 40) {
        if (circleRect(axis === 'x' ? next : p.x, axis === 'y' ? next : p.y, radius, rect))
          next = part > 0 ? Math.min(next, rect[axis] - radius) : Math.max(next, rect[axis] + rect[axis === 'x' ? 'w' : 'h'] + radius);
      }
    }
    p[axis] = next;
  }
  if (p[axis] === old) p[axis === 'x' ? 'vx' : 'vy'] = 0;
}

function movePlayer(p, dt, mx, my, speed, map, width, height, radius, t) {
  p.vx ||= 0; p.vy ||= 0; p.z ||= 0; p.vz ||= 0;
  const grounded = p.z === 0;
  const pressed = !!p.input.j && !p.jumpHeld;
  p.jumpHeld = !!p.input.j;
  let jumped = false, landed = false, hopped = false;
  const magnitude = Math.hypot(mx, my);
  if (magnitude > 1) { mx /= magnitude; my /= magnitude; }
  const accel = speed / 0.12 * (grounded ? 1 : 0.2);
  const targetX = mx * speed, targetY = my * speed;
  const preserving = p.hop && Math.hypot(p.vx, p.vy) > speed &&
    (!grounded || t - (p.lastLand ?? -Infinity) <= HOP_WINDOW) && p.vx * mx + p.vy * my > 0;
  if ((mx || my) && !preserving) {
    p.vx += Math.max(-accel * dt, Math.min(accel * dt, targetX - p.vx));
    p.vy += Math.max(-accel * dt, Math.min(accel * dt, targetY - p.vy));
  } else if (grounded && t - (p.lastLand ?? -Infinity) > HOP_WINDOW) {
    const drag = Math.max(0, 1 - dt / 0.12);
    p.vx *= drag; p.vy *= drag;
  }
  if (grounded && pressed) {
    hopped = p.hasJumped && t - (p.lastLand ?? -Infinity) <= HOP_WINDOW;
    if (hopped) {
      p.hop = (p.hop || 0) + 1;
      p.vx *= 1.08; p.vy *= 1.08;
    } else p.hop = 0;
    p.vz = JUMP_V; p.hasJumped = true; jumped = true;
  }
  const cap = speed * (p.hop ? 1.6 : 1);
  const velocity = Math.hypot(p.vx, p.vy);
  if (velocity > cap) { p.vx *= cap / velocity; p.vy *= cap / velocity; }
  if (p.z > 0 || jumped) {
    p.z += p.vz * dt - 0.5 * GRAVITY * dt * dt;
    p.vz -= GRAVITY * dt;
    if (p.z <= 0) { p.z = 0; p.vz = 0; p.lastLand = t; landed = true; }
  } else if (t - (p.lastLand ?? -Infinity) > HOP_WINDOW && Math.hypot(p.vx, p.vy) < speed * 1.01) p.hop = 0;
  axisMove(p, p.vx * dt, 'x', radius, map);
  axisMove(p, p.vy * dt, 'y', radius, map);
  p.x = Math.max(radius, Math.min(width - radius, p.x));
  p.y = Math.max(radius, Math.min(height - radius, p.y));
  return { jumped, landed, hopped };
}
module.exports = { movePlayer, JUMP_V, GRAVITY, HOP_WINDOW };
