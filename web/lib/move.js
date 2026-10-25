const { circleRect } = require('./physics.js');

const JUMP_V = 520, GRAVITY = 1800, HOP_WINDOW = 150;
const SUB_DT = 1 / 120;
// Circle against rectangles: push out along the closest-point normal and drop the
// velocity into it, so walls slide and corners round off. A position that cannot be
// untangled (a gap narrower than the player) is rejected and the player stays put.
function blockers(p, map) {
  const out = map.solid || [];
  const low = (map.low || []).filter((rect) => rect.height > 1 || p.z <= (rect.height || 0) * 40);
  return low.length ? out.concat(low) : out;
}
function resolve(p, radius, rects) {
  let clear = true;
  for (const rect of rects) {
    if (!circleRect(p.x, p.y, radius, rect)) continue;
    clear = false;
    const cx = Math.max(rect.x, Math.min(p.x, rect.x + rect.w)), cy = Math.max(rect.y, Math.min(p.y, rect.y + rect.h));
    let nx = p.x - cx, ny = p.y - cy, d = Math.hypot(nx, ny);
    if (d) { nx /= d; ny /= d; }
    else {
      const gaps = [p.x - rect.x, rect.x + rect.w - p.x, p.y - rect.y, rect.y + rect.h - p.y];
      const side = gaps.indexOf(Math.min(...gaps));
      nx = side === 0 ? -1 : side === 1 ? 1 : 0; ny = side === 2 ? -1 : side === 3 ? 1 : 0;
      d = -gaps[side];
    }
    const push = radius - d + 1e-6;
    p.x += nx * push; p.y += ny * push;
    const into = p.vx * nx + p.vy * ny;
    if (into < 0) {
      const speed = Math.hypot(p.vx, p.vy);
      p.vx -= into * nx; p.vy -= into * ny;
      // on a corner the speed turns along the tangent instead of dying, so corners round off
      const corner = (cx === rect.x || cx === rect.x + rect.w) && (cy === rect.y || cy === rect.y + rect.h);
      const left = Math.hypot(p.vx, p.vy);
      if (corner && left > 1e-9) { p.vx *= speed / left; p.vy *= speed / left; }
    }
  }
  return clear;
}
function stepMove(p, dx, dy, radius, map) {
  if (!dx && !dy) return;
  const rects = blockers(p, map);
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / radius));
  for (let j = 0; j < steps; j++) {
    const ox = p.x, oy = p.y;
    p.x += dx / steps; p.y += dy / steps;
    let clear = false;
    for (let pass = 0; pass < 4 && !clear; pass++) clear = resolve(p, radius, rects);
    if (!clear && rects.some((rect) => circleRect(p.x, p.y, radius, rect))) { p.x = ox; p.y = oy; p.vx = 0; p.vy = 0; return; }
  }
}

function movePlayer(p, dt, mx, my, speed, map, width, height, radius, t) {
  p.vx ||= 0; p.vy ||= 0; p.z ||= 0; p.vz ||= 0;
  const grounded = p.z === 0;
  const pressed = !!p.input.j && !p.jumpHeld;
  p.jumpHeld = !!p.input.j;
  let jumped = false, landed = false, hopped = false;
  const magnitude = Math.hypot(mx, my);
  if (magnitude > 1) { mx /= magnitude; my /= magnitude; }
  const targetX = mx * speed, targetY = my * speed;
  if (grounded && pressed) {
    hopped = p.hasJumped && t - (p.lastLand ?? -Infinity) <= HOP_WINDOW;
    if (hopped) {
      p.hop = (p.hop || 0) + 1;
      p.vx *= 1.08; p.vy *= 1.08;
    } else p.hop = 0;
    p.vz = JUMP_V; p.hasJumped = true; jumped = true;
  }
  // A paused server cannot spend an unbounded number of steps catching up.
  p._moveRemainder = (p._moveRemainder || 0) + Math.min(0.25, Math.max(0, dt));
  const steps = Math.floor((p._moveRemainder + 1e-10) / SUB_DT);
  p._moveRemainder = Math.max(0, p._moveRemainder - steps * SUB_DT);
  for (let i = 0; i < steps; i++) {
    const stepTime = t - (steps - 1 - i) * SUB_DT * 1000 - p._moveRemainder * 1000;
    const onGround = p.z === 0 && p.vz === 0;
    const accel = speed / 0.12 * (onGround ? 1 : 0.2);
    const preserving = p.hop && Math.hypot(p.vx, p.vy) > speed &&
      (!onGround || stepTime - (p.lastLand ?? -Infinity) <= HOP_WINDOW) && p.vx * mx + p.vy * my > 0;
    if ((mx || my) && !preserving) {
      p.vx += Math.max(-accel * SUB_DT, Math.min(accel * SUB_DT, targetX - p.vx));
      p.vy += Math.max(-accel * SUB_DT, Math.min(accel * SUB_DT, targetY - p.vy));
    } else if (onGround && stepTime - (p.lastLand ?? -Infinity) > HOP_WINDOW) {
      const drag = Math.max(0, 1 - SUB_DT / 0.12);
      p.vx *= drag; p.vy *= drag;
    }
    const cap = speed * (p.hop ? 1.6 : 1);
    const velocity = Math.hypot(p.vx, p.vy);
    if (velocity > cap) { p.vx *= cap / velocity; p.vy *= cap / velocity; }
    if (p.z > 0 || p.vz > 0) {
      const nextVz = p.vz - GRAVITY * SUB_DT;
      p.z += (p.vz + nextVz) * 0.5 * SUB_DT;
      p.vz = nextVz;
      if (p.z <= 0) { p.z = 0; p.vz = 0; p.lastLand = stepTime; landed = true; }
    } else if (stepTime - (p.lastLand ?? -Infinity) > HOP_WINDOW && Math.hypot(p.vx, p.vy) < speed * 1.01) p.hop = 0;
    stepMove(p, p.vx * SUB_DT, p.vy * SUB_DT, radius, map);
    p.x = Math.max(radius, Math.min(width - radius, p.x));
    p.y = Math.max(radius, Math.min(height - radius, p.y));
  }
  return { jumped, landed, hopped };
}
module.exports = { movePlayer, JUMP_V, GRAVITY, HOP_WINDOW };
