const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { movePlayer } = require('../lib/move.js');
const map = require('../public/maps/rayon.json');

const mutation = Number(process.env.MUT || 0);
function physicsUnderTest() {
  if (!mutation) return require('../lib/physics.js');
  const source = fs.readFileSync(path.join(__dirname, '../lib/physics.js'), 'utf8');
  const edits = {
    1: ['candidate(t, -1, 0)', 'candidate(t, 1, 0)'],
    2: ['if (enter > leave) return null;', 'if (enter >= leave) return null;'],
    3: ['function sweepCircleRect(x0, y0, x1, y1, r, rect) {', 'function sweepCircleRect(x0, y0, x1, y1, r, rect) { r = 0;'],
  };
  assert.ok(edits[mutation], `unknown MUT=${mutation}`);
  const [before, after] = edits[mutation];
  assert.ok(source.includes(before), `mutation ${mutation} target missing`);
  const module = { exports: {} };
  vm.runInNewContext(source.replace(before, after), { module }, { filename: 'physics.mutated.js' });
  return module.exports;
}
const physics = physicsUnderTest();
const { circleRect, moveCircle, firstSolidHit, sweepCircleRect, createRng } = physics;

function checkSweep() {
  const thin = map.solid.reduce((best, rect) => Math.min(rect.w, rect.h) < Math.min(best.w, best.h) ? rect : best);
  const centerX = thin.x + thin.w / 2, centerY = thin.y + thin.h / 2;
  let maxError = 0;
  for (let angle = 0; angle < 360; angle++) {
    const radians = angle * Math.PI / 180, ux = Math.cos(radians), uy = Math.sin(radians);
    const exit = Math.min((thin.w / 2) / (Math.abs(ux) || Infinity), (thin.h / 2) / (Math.abs(uy) || Infinity));
    const x0 = centerX + ux * (exit + 28), y0 = centerY + uy * (exit + 28);
    const length = 1700 / 30, x1 = x0 - ux * length, y1 = y0 - uy * length;
    const hit = firstSolidHit(x0, y0, x1, y1, 4, { solid: [thin] });
    assert.ok(hit, `thin solid missed at ${angle} degrees`);
    let oracle = null;
    for (let distance = 0; distance <= length + 0.25; distance += 0.25) {
      const along = Math.min(distance, length);
      if (circleRect(x0 - ux * along, y0 - uy * along, 4, thin)) { oracle = along; break; }
    }
    assert.notEqual(oracle, null, `oracle missed at ${angle} degrees`);
    const error = Math.abs(hit.t * length - oracle);
    maxError = Math.max(maxError, error);
    assert.ok(error <= 0.5, `sweep angle ${angle}: ${error.toFixed(3)} px`);
  }
  const face = sweepCircleRect(0, 1, 10, 1, 2, { x: 5, y: 0, w: 2, h: 2 });
  assert.ok(face, 'radius face hit');
  assert.ok(Math.abs(face.t - 0.3) < 1e-10, `radius face t=${face.t}`);
  assert.equal(face.nx, -1, 'outward face normal');
  assert.ok(sweepCircleRect(0, 2, 2, 0, 0, { x: 1, y: 1, w: 1, h: 1 }), 'closed slab must include tangent corner');
  assert.equal(sweepCircleRect(89, 93, 93, 89, 10, { x: 100, y: 100, w: 20, h: 80 }), null, 'rounded corner has no phantom hit');
  return maxError;
}

function checkStarts() {
  const rng = createRng(20261025), radius = 28;
  for (let i = 0; i < 10000; i++) {
    const x = rng() * map.W, y = rng() * map.H;
    const dx = (rng() - 0.5) * 100, dy = (rng() - 0.5) * 100;
    const moved = moveCircle(x, y, dx, dy, radius, map.solid, map.low);
    for (const rect of map.solid) assert.equal(circleRect(moved.x, moved.y, radius, rect), false, `inside ${rect.id} at case ${i}`);
  }
}

function jumpSeries(dt) {
  const p = { x: 100, y: 450, vx: 0, vy: 0, z: 0, vz: 0, hop: 0, input: { j: 0 } };
  const empty = { solid: [], low: [] };
  let t = 0, peak = 0, jumps = 0, wasAirborne = false;
  for (let i = 0; i < 600 && jumps < 5; i++) {
    const press = p.z === 0 && !wasAirborne && (jumps === 0 || p.hasJumped);
    p.input.j = press ? 1 : 0;
    t += dt * 1000;
    const fx = movePlayer(p, dt, 1, 0, 300, empty, 2000, 900, 28, t);
    if (fx.jumped) jumps++;
    if (jumps === 1) peak = Math.max(peak, p.z);
    wasAirborne = p.z > 0;
    if (fx.landed) wasAirborne = false;
    if (jumps === 5) return { peak, speed: Math.hypot(p.vx, p.vy), hops: p.hop };
  }
  assert.fail(`only ${jumps} jumps at dt=${dt}`);
}

function replay() {
  const rng = createRng(1701), empty = { solid: [], low: [] };
  const p = { x: 100, y: 450, vx: 0, vy: 0, z: 0, vz: 0, hop: 0, input: { j: 0 } };
  const hash = crypto.createHash('sha256');
  for (let i = 0; i < 1000; i++) {
    p.input.j = i % 70 === 0 ? 1 : 0;
    movePlayer(p, 1 / 120, rng() * 2 - 1, rng() * 2 - 1, 300, empty, 1600, 900, 28, (i + 1) * 1000 / 120);
    hash.update([p.x, p.y, p.z, p.vx, p.vy, p.hop].map(v => v.toFixed(6)).join(','));
  }
  return hash.digest('hex');
}

try {
  const maxError = checkSweep();
  checkStarts();
  const a = jumpSeries(0.033), b = jumpSeries(0.046);
  assert.ok(Math.abs(a.peak - b.peak) <= 0.5, `jump peak diff ${Math.abs(a.peak - b.peak)}`);
  assert.ok(Math.abs(a.speed - b.speed) / Math.max(a.speed, b.speed) <= 0.01, `hop speed ${a.speed} vs ${b.speed}`);
  assert.equal(a.hops, 4); assert.equal(b.hops, 4);
  const first = replay(), second = replay();
  assert.equal(first, second, 'seeded replay hash');
  console.log(`check_physics: 360 sweeps max error ${maxError.toFixed(3)} px; 10000 starts clear`);
  console.log(`jump 33/46 ms: peaks ${a.peak.toFixed(3)}/${b.peak.toFixed(3)} px, speeds ${a.speed.toFixed(3)}/${b.speed.toFixed(3)} px/s; replay ${first.slice(0, 16)}`);
  if (mutation) assert.fail(`MUT=${mutation} survived`);
} catch (error) {
  if (mutation) console.error(`MUT=${mutation} killed by: ${error.message}`);
  else console.error(`check_physics FAIL: ${error.stack}`);
  process.exitCode = 1;
}
