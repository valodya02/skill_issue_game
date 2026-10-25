'use strict';
// Спрей как в КС на живом сервере: первая пуля стоя летит ровно в прицел, очередь уводит по паттерну,
// пауза сбрасывает очередь. Запуск: PORT=3111 node server.js, потом node research/check_spray.js http://localhost:3111
const path = require('node:path');
let io;
try { io = require('socket.io-client'); }
catch (_) { io = require(path.join(__dirname, '..', 'node_modules', 'socket.io', 'client-dist', 'socket.io.js')); }
const url = process.argv[2] || 'http://localhost:3111';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sock = io(url, { transports: ['websocket'] });
let S = null;
sock.on('state', (s) => { S = s; });
sock.on('connect', () => sock.emit('join', { code: 'spray' + Date.now() % 1e6, name: 'spray', mode: '1v1' }));
const fail = (m) => { console.log('FAIL', m); process.exit(1); };
(async () => {
  await sleep(500); sock.emit('addBot'); sock.emit('pick', 'startuper'); await sleep(200); sock.emit('ready');
  for (let i = 0; i < 100 && S?.phase !== 'playing'; i++) await sleep(250);
  if (S?.phase !== 'playing') fail('match did not start');
  const me = () => S.players.find((p) => p.id === sock.id);
  const p0 = me(); const tx = p0.x + 600, ty = p0.y;  // целимся строго вправо, угол 0 (позиция в снапшоте округлена, ошибка до 0.002)
  // в снапшоте у пули нет id: одна пуля в окно 250 мс (пистолет стреляет раз в 400), угол округлён до 0.01
  const angles = [];
  let lastSeen = 0;
  sock.on('state', (s) => {
    const m = s.players.find((p) => p.id === sock.id);
    const sh = s.shots.find((v) => v.f && v.team === m.team && Math.hypot(v.x - m.x, v.y - m.y) < 400);
    if (sh && Date.now() - lastSeen > 250) { lastSeen = Date.now(); angles.push(sh.a); }
  });
  const burst = async (n, gap) => { for (let i = 0; i < n; i++) { sock.emit('cast', { slot: 'a', x: tx, y: ty }); await sleep(gap); } };
  // пистолет 380 мс: очередь держится, если пауза меньше rate + 260
  await burst(6, 400);
  const first = angles.slice(0, 6);
  await sleep(1200); angles.length = 0;
  await burst(1, 300);
  const reset = angles.slice(0, 1);
  sock.close();
  console.log('burst angles', first.map((a) => a.toFixed(3)).join(' '), '| after pause', reset.map((a) => a.toFixed(3)).join(' '));
  if (first.length < 4) fail('too few shots seen: ' + first.length);
  if (Math.abs(first[0]) > 0.011) fail('first shot not accurate: ' + first[0]);
  if (!first.slice(2).some((a) => Math.abs(a) > 0.011)) fail('spray never drifted');
  if (!reset.length || Math.abs(reset[0]) > 0.011) fail('pause did not reset burst: ' + reset[0]);
  console.log('check_spray: first shot exact, burst drifts, pause resets');
  process.exit(0);
})();
