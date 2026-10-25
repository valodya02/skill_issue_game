const { moveCircle } = require('./physics.js');
const DIRS = 'UDLR';
function newCode(length, random = Math.random) {
  let code = '';
  for (let i = 0; i < length; i++) code += DIRS[Math.floor(random() * 4)];
  return code;
}
function advanceCode(task, key, random = Math.random) {
  if (!task || !DIRS.includes(key) || key.length !== 1) return 'ignored';
  if (task.code[task.index] !== key) {
    task.code = newCode(task.code.length, random); task.index = 0;
    return 'fail';
  }
  task.index++;
  return task.index === task.code.length ? 'done' : 'ok';
}
function inSmoke(a, b, zones) {
  for (const z of zones) {
    if (z.kind !== 'smoke') continue;
    const dx = b.x - a.x, dy = b.y - a.y, len = dx * dx + dy * dy || 1;
    const k = Math.max(0, Math.min(1, ((z.x - a.x) * dx + (z.y - a.y) * dy) / len));
    const x = a.x + k * dx - z.x, y = a.y + k * dy - z.y;
    if (x * x + y * y <= z.r * z.r) return true;
  }
  return false;
}
function turretCanFire(turret, x, y) {
  const target = Math.atan2(y - turret.y, x - turret.x);
  const center = turret.ang * Math.PI / 180;
  const diff = Math.atan2(Math.sin(target - center), Math.cos(target - center));
  return Math.abs(diff) <= turret.arc * Math.PI / 180;
}
function deflectShot(shot, player) {
  shot.vx = -shot.vx; shot.vy = -shot.vy;
  shot.team = player.team; shot.owner = player.id;
  shot.x += shot.vx * 0.02; shot.y += shot.vy * 0.02;
  return shot;
}
function applyCoffee(players, zone, t, onHit = () => {}) {
  for (const p of players) {
    if (!p.alive || p.team === zone.team) continue;
    const dx = p.x - zone.x, dy = p.y - zone.y;
    if (dx * dx + dy * dy > (zone.r + 28) ** 2 || (p.st.jitter || 0) > t) continue;
    p.st.jitter = t + 3000;
    onHit(p);
  }
}
function fireTurret(turret, x, y, t) {
  if (!turretCanFire(turret, x, y) || turret.heat > t) return false;
  if (!turret.firingAt || t - (turret.lastShot || 0) > 180) turret.firingAt = t;
  turret.lastShot = t;
  if (t - turret.firingAt >= 3000) { turret.heat = t + 2000; turret.firingAt = 0; return false; }
  return true;
}
function pullTarget(target, caster, dt, map, radius = 28) {
  const dx = caster.x - target.x, dy = caster.y - target.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= radius * 2) return false;
  const amount = Math.min(distance - radius * 2, distance * dt / 0.25);
  const moved = moveCircle(target.x, target.y, dx / distance * amount, dy / distance * amount, radius, map.solid || [], map.low || []);
  target.x = moved.x; target.y = moved.y;
  return true;
}
module.exports = { newCode, advanceCode, inSmoke, turretCanFire, fireTurret, deflectShot, pullTarget, applyCoffee };
