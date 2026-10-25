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

// Invariants from prompts-v7/argon-physics.md, measured through movePlayer itself.
function runPlayer(p, map, seconds, mx, my, speed = 300, onTick) {
  const dt = 1 / 30;
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    p.t = (p.t || 0) + dt * 1000;
    movePlayer(p, dt, mx, my, speed, map, 1600, 900, 28, p.t);
    if (onTick) onTick(p, i * dt);
  }
}
function freshPlayer(x, y) { return { x, y, vx: 0, vy: 0, z: 0, vz: 0, hop: 0, input: { j: 0 } }; }

function checkWallSlide() {
  const wall = { solid: [{ id: 'w', x: 800, y: 0, w: 40, h: 900, height: 9 }], low: [] };
  const p = freshPlayer(800 - 28.5, 800);
  const a = 30 * Math.PI / 180;
  let speedSum = 0, n = 0;
  runPlayer(p, wall, 1.2, Math.sin(a), -Math.cos(a), 300, (q, time) => {
    if (time > 0.4) { speedSum += Math.hypot(q.vx, q.vy); n++; }
  });
  const loss = 1 - speedSum / n / 300;
  assert.ok(loss <= 0.15, `wall slide at 30 degrees loses ${(loss * 100).toFixed(1)}%`);
  return loss;
}

function checkCorner() {
  const box = { solid: [{ id: 'b', x: 400, y: 400, w: 200, h: 200, height: 9 }], low: [] };
  const p = freshPlayer(300, 390);
  let contact = null, cleared = null;
  runPlayer(p, box, 3, 1, 0, 300, (q, time) => {
    if (contact === null && q.x > 400 - Math.sqrt(28 * 28 - 10 * 10) - 1) contact = time;
    if (cleared === null && q.x >= 400) cleared = time;
  });
  assert.ok(contact !== null, 'corner never reached');
  const took = cleared === null ? Infinity : cleared - contact;
  assert.ok(took <= 0.5, `corner took ${took.toFixed(2)} s`);
  return took;
}

function checkHopCap() {
  const empty = { solid: [], low: [] };
  const p = freshPlayer(100, 450);
  let jumps = 0, maxSpeed = 0, airborne = false;
  for (let i = 0; i < 2000 && jumps < 10; i++) {
    p.input.j = p.z === 0 && !airborne ? 1 : 0;
    p.t = (p.t || 0) + 1000 / 30;
    const fx = movePlayer(p, 1 / 30, 1, 0, 300, empty, 100000, 900, 28, p.t);
    if (fx.jumped) jumps++;
    airborne = p.z > 0;
    maxSpeed = Math.max(maxSpeed, Math.hypot(p.vx, p.vy));
  }
  assert.equal(jumps, 10, `only ${jumps} hops`);
  assert.ok(maxSpeed <= 300 * 1.6 + 1e-6, `bhop speed ${maxSpeed.toFixed(1)} > 480`);
  return maxSpeed / 300;
}

function checkNeverInside() {
  const rng = createRng(77);
  for (let k = 0; k < 200; k++) {
    let p;
    do { p = freshPlayer(28 + rng() * (map.W - 56), 28 + rng() * (map.H - 56)); }
    while (map.solid.concat(map.low).some(r => circleRect(p.x, p.y, 28, r)));
    let mx = 0, my = 0;
    for (let i = 0; i < 90; i++) {
      if (i % 15 === 0) { const a = rng() * Math.PI * 2; mx = Math.cos(a); my = Math.sin(a); }
      p.input.j = rng() < 0.05 ? 1 : 0;
      p.t = (p.t || 0) + 1000 / 30;
      movePlayer(p, 1 / 30, mx, my, 300, map, map.W, map.H, 28, p.t);
      for (const rect of map.solid) {
        const cx = Math.max(rect.x, Math.min(p.x, rect.x + rect.w)), cy = Math.max(rect.y, Math.min(p.y, rect.y + rect.h));
        assert.ok(Math.hypot(p.x - cx, p.y - cy) >= 28 - 0.05, `player inside ${rect.id} (run ${k}, tick ${i})`);
      }
    }
  }
}

const strict = !process.env.SOFT;
function soft(name, fn) {
  try { return fn(); } catch (error) { if (strict) throw error; console.log(`  SOFT ${name}: ${error.message}`); return NaN; }
}

try {
  const slide = soft('slide', checkWallSlide), corner = soft('corner', checkCorner);
  const hopCap = soft('hop', checkHopCap); soft('inside', checkNeverInside);
  console.log(`invariants: slide loss ${(slide * 100).toFixed(1)}%, corner ${corner.toFixed(2)} s, 10 hops ${hopCap.toFixed(3)}x, 200x90 ticks never inside solid`);
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
