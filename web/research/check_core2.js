const assert = require('node:assert/strict');
const { movePlayer } = require('../lib/move.js');
const { newCode, advanceCode, fireTurret, deflectShot, pullTarget, applyCoffee } = require('../lib/core2.js');

const empty = { solid: [], low: [] };
const player = (x = 100, y = 150) => ({ x, y, vx: 0, vy: 0, z: 0, vz: 0, hop: 0, input: { j: 0 } });
const tick = (p, t, map = empty, mx = 1, my = 0) => movePlayer(p, 1 / 120, mx, my, 300, map, 2000, 900, 28, t);
function jump(p, t, map = empty) {
  p.input.j = 1;
  const result = tick(p, t, map);
  p.input.j = 0;
  return result;
}

let p = player(), t = 0, top = 0;
jump(p, t);
for (let i = 0; i < 80; i++) { t += 1000 / 120; tick(p, t); top = Math.max(top, p.z); }
assert.ok(top >= 70 && top <= 80, `jump peak ${top}`);
assert.equal(p.z, 0);
for (let n = 0; n < 5; n++) {
  const result = jump(p, t += 1000 / 120);
  assert.equal(result.hopped, true);
  for (let i = 0; i < 70; i++) tick(p, t += 1000 / 120);
}
assert.ok(Math.hypot(p.vx, p.vy) > 300 && Math.hypot(p.vx, p.vy) <= 480, 'five hops boost within cap');
for (let i = 0; i < 40; i++) tick(p, t += 1000 / 120, empty, 0, 0);
assert.equal(jump(p, t += 1000 / 120).hopped, false, 'missed hop window resets');
assert.equal(p.hop, 0);

const low = { x: 180, y: 100, w: 30, h: 100, height: 0.6 };
p = player(80, 150); t = 0;
for (let i = 0; i < 15; i++) tick(p, t += 1000 / 120, { solid: [], low: [low] });
jump(p, t += 1000 / 120, { solid: [], low: [low] });
for (let i = 0; i < 65; i++) tick(p, t += 1000 / 120, { solid: [], low: [low] });
assert.ok(p.x > 210, `jump crosses bench: ${p.x}`);
p = player(80, 150); t = 0;
for (let i = 0; i < 15; i++) tick(p, t += 1000 / 120, { solid: [low], low: [] });
jump(p, t += 1000 / 120, { solid: [low], low: [] });
for (let i = 0; i < 65; i++) tick(p, t += 1000 / 120, { solid: [low], low: [] });
assert.ok(p.x <= 152, `solid blocks jump: ${p.x}`);

const ally = { x: 0, y: 0, team: 0, alive: true, st: {} };
const enemy = { x: 10, y: 0, team: 1, alive: true, st: {} };
applyCoffee([ally, enemy], { x: 0, y: 0, r: 110, team: 0 }, 1000);
assert.equal(ally.st.jitter, undefined);
assert.equal(enemy.st.jitter, 4000);

const turret = { x: 0, y: 0, ang: 0, arc: 60, heat: 0, firingAt: 0, lastShot: 0 };
assert.equal(fireTurret(turret, -100, 0, 1000), false, 'no shot outside arc');
for (let at = 1000; at <= 4060; at += 90) fireTurret(turret, 100, 0, at);
assert.ok(turret.heat > 4060, 'turret overheats after three seconds');
assert.equal(fireTurret(turret, 100, 0, 4100), false, 'overheated turret cannot fire');

const wall = { x: 150, y: 100, w: 20, h: 100 };
const target = { x: 220, y: 150 }, caster = { x: 80, y: 150 };
for (let i = 0; i < 30; i++) pullTarget(target, caster, 1 / 120, { solid: [wall], low: [] });
assert.ok(target.x >= 198, `hook stops at wall: ${target.x}`);

const shot = { vx: 900, vy: -30, team: 1, owner: 'enemy', x: 100, y: 100 };
deflectShot(shot, { id: 'hero', team: 0 });
assert.equal(shot.vx, -900); assert.equal(shot.vy, 30);
assert.equal(shot.team, 0); assert.equal(shot.owner, 'hero');

const code = { code: newCode(4, () => 0), index: 0 };
assert.equal(advanceCode(code, 'U'), 'ok');
assert.equal(code.index, 1);
assert.equal(advanceCode(code, 'R', () => 0.4), 'fail');
assert.equal(code.index, 0);
assert.equal(code.code, 'DDDD');

const { performance } = require('node:perf_hooks');
const server = require('../server.js');
const firstChar = Object.keys(require('../public/chars.js').CHARS)[0];
const codeRoom = server.getRoom('core2code', '1v1');
codeRoom.phase = 'playing'; codeRoom.phaseUntil = Date.now() + 100000;
const coder = server.addPlayer(codeRoom, 'coder', 'coder', true);
coder.char = firstChar; coder.team = 0; coder.x = server.map.sites.A.x; coder.y = server.map.sites.A.y;
codeRoom.bomb = { state: 'carried', carrier: coder.id, x: coder.x, y: coder.y, progress: 0 };
server.startCode(codeRoom, coder, Date.now());
assert.equal(coder.hold.code.length, 4);
server.codeInput(codeRoom, coder, coder.hold.code[0], Date.now());
assert.equal(codeRoom.bomb.progress, 0.25);
const wrong = 'UDLR'.replace(coder.hold.code[1], '')[0];
server.codeInput(codeRoom, coder, wrong, Date.now());
assert.equal(codeRoom.bomb.progress, 0);
assert.equal(coder.hold.index, 0);
const room = server.getRoom('core2test', '2v2');
room.phase = 'playing'; room.phaseUntil = Date.now() + 100000;
for (let i = 0; i < 4; i++) {
  const actor = server.addPlayer(room, 'player' + i, 'player', false);
  actor.char = firstChar; actor.team = i % 2;
  actor.x = i % 2 ? 1450 : 120; actor.y = 400 + i * 70; actor.hp = 1000;
}
room.npcs = Array.from({ length: 4 }, (_, i) => ({ id: 'npc' + i, x: 500 + i * 50, y: 200, alive: true, hp: 100, nextShot: Infinity }));
const makeShots = () => Array.from({ length: 100 }, (_, i) => ({ id: i, owner: 'bot0', team: 0, x: 700 + i % 10, y: 400 + i % 8,
  vx: 500, vy: 0, r: 4, left: 1000, dmg: 10, emoji: 'x' }));
for (let i = 0; i < 20; i++) { room.shots = makeShots(); server.step(room, 1 / 30); }
let total = 0;
for (let i = 0; i < 100; i++) {
  room.shots = makeShots();
  const start = performance.now(); server.step(room, 1 / 30); total += performance.now() - start;
}
assert.ok(total / 100 < 2, `server tick average ${total / 100}ms exceeds 2ms`);
console.log(`check_core2: jump, bhop, collisions, coffee, turret, hook, deflect, code passed; step ${(total / 100).toFixed(3)} ms average`);
