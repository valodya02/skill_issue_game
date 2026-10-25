const { performance } = require('node:perf_hooks');
const map = require('../public/maps/rayon.json');
const { movePlayer } = require('../lib/move.js');
const { moveCircle, firstSolidHit, reflect, createRng } = require('../lib/physics.js');

const rng = createRng(20261025);
const players = Array.from({ length: 4 }, (_, i) => ({
  x: i % 2 ? 1450 : 120, y: 350 + i * 65, vx: 0, vy: 0,
  z: 0, vz: 0, hop: 0, input: { j: 0 },
}));
const npcs = Array.from({ length: 4 }, (_, i) => ({ x: 680 + i * 65, y: 680 }));
const shots = Array.from({ length: 150 }, () => {
  const angle = rng() * Math.PI * 2;
  return { x: 80 + rng() * 1440, y: 80 + rng() * 740,
    vx: Math.cos(angle) * 1700, vy: Math.sin(angle) * 1700, r: 4 };
});
const times = [];
const dt = 1 / 30;
for (let tick = 0; tick < 1000; tick++) {
  const start = performance.now();
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    p.input.j = tick % 18 === 0 ? 1 : 0;
    movePlayer(p, dt, Math.cos(tick / 20 + i), Math.sin(tick / 20 + i), 300,
      map, map.W, map.H, 28, (tick + 1) * dt * 1000);
  }
  for (let i = 0; i < npcs.length; i++) {
    const n = npcs[i];
    const moved = moveCircle(n.x, n.y, Math.cos(tick / 30 + i) * 3,
      Math.sin(tick / 30 + i) * 3, 22, map.solid, map.low);
    n.x = moved.x; n.y = moved.y;
  }
  for (const shot of shots) {
    const x1 = shot.x + shot.vx * dt, y1 = shot.y + shot.vy * dt;
    const hit = firstSolidHit(shot.x, shot.y, x1, y1, shot.r, map);
    if (hit) {
      shot.x += (x1 - shot.x) * hit.t;
      shot.y += (y1 - shot.y) * hit.t;
      const bounced = reflect(shot.vx, shot.vy, hit.axis);
      shot.vx = bounced.vx; shot.vy = bounced.vy;
      shot.x += Math.sign(shot.vx) * 0.1;
      shot.y += Math.sign(shot.vy) * 0.1;
    } else { shot.x = x1; shot.y = y1; }
    if (shot.x < 0 || shot.x > map.W) shot.vx *= -1;
    if (shot.y < 0 || shot.y > map.H) shot.vy *= -1;
    shot.x = Math.max(0, Math.min(map.W, shot.x));
    shot.y = Math.max(0, Math.min(map.H, shot.y));
  }
  times.push(performance.now() - start);
}
times.sort((a, b) => a - b);
const p50 = times[Math.floor(times.length * 0.5)];
const p99 = times[Math.floor(times.length * 0.99)];
console.log(`bench_physics: 4 players, 4 npcs, 150 projectiles, 1000 ticks; p50=${p50.toFixed(3)} ms p99=${p99.toFixed(3)} ms`);
if (p99 > 2) process.exitCode = 1;
