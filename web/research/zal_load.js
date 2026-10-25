#!/usr/bin/env node
'use strict';

// Зал на 32: N клиентов в одной комнате, хост жмёт «Старт», все бегают и стреляют.
// Проверяет: старт по кнопке хоста, вход опоздавшего в идущий бой, уход игрока не роняет бой в лобби.
// node research/zal_load.js [url] [--n 30] [--sec 30]; все клиенты в одном процессе, интервал снапшота завышен тестером (30 в трёх процессах: p50 83 мс)
const path = require('node:path');
const { performance } = require('node:perf_hooks');
let io;
try { io = require('socket.io-client'); }
catch (_) { io = require(path.join(__dirname, '..', 'node_modules', 'socket.io', 'client-dist', 'socket.io.js')); }

const args = process.argv.slice(2);
const url = args[0] && !args[0].startsWith('--') ? args[0] : 'http://localhost:3000';
const arg = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : Number(args[i + 1]); };
const N = arg('--n', 30), SEC = arg('--sec', 30);
const code = 'zal' + process.pid.toString(36).slice(-5);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const own = (c) => c.state?.players.find((p) => p.id === c.id);

async function until(test, ms, label) {
  const end = performance.now() + ms;
  while (performance.now() < end) { if (test()) return; await sleep(33); }
  throw new Error(`${label}: timeout ${ms} ms`);
}

function connect(name) {
  const socket = io(url, { transports: ['websocket'], reconnection: false, timeout: 8000, forceNew: true });
  const c = { socket, id: null, state: null, times: [], bytes: [], drops: 0, error: null };
  socket.on('state', (s) => {
    const t = performance.now();
    if (c.last) c.times.push(t - c.last);
    c.last = t; c.state = s;
    if (c.measure && c.bytes.length < 2000) c.bytes.push(JSON.stringify(s).length);
  });
  socket.on('connect', () => { c.id = socket.id; socket.emit('join', { code, name, mode: 'zal' }); });
  socket.on('nope', (m) => { c.error = m; });
  socket.on('connect_error', (e) => { c.error = e.message; });
  socket.on('disconnect', () => { c.drops++; });
  return until(() => { if (c.error) throw Error(c.error); return own(c); }, 8000, 'join ' + name).then(() => c);
}

const pct = (xs, q) => { const s = [...xs].sort((a, b) => a - b); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(s.length * q))]) : 0; };

(async () => {
  const cs = [];
  for (let i = 0; i < N; i++) cs.push(await connect('игрок' + i));
  const host = cs[0]; host.measure = true;
  if (host.state.phase !== 'lobby') throw Error('зал стартовал до кнопки');
  cs[1].socket.emit('start');  // не хост: старта быть не должно
  await sleep(300);
  if (host.state.phase !== 'lobby') throw Error('стартовал не хост');
  host.socket.emit('start');
  await until(() => cs.every((c) => c.state?.phase === 'playing'), 4000, 'start');
  console.log(`ok старт по кнопке хоста, ${N} игроков, у всех phase=playing`);

  const late = await connect('опоздун');
  await until(() => own(late)?.alive && late.state.phase === 'playing', 5000, 'late join');
  console.log('ok опоздавший зашёл в идущий бой и появился живым');
  cs.push(late);

  const leaver = cs.splice(5, 1)[0];
  leaver.socket.disconnect();
  await sleep(500);
  if (host.state.phase !== 'playing') throw Error('уход игрока уронил бой в ' + host.state.phase);
  console.log('ok уход игрока не роняет бой');

  for (const c of cs) { c.times = []; c.bytes = []; }
  const t0 = performance.now();
  while (performance.now() - t0 < SEC * 1000) {
    for (const c of cs) {
      const me = own(c), foe = c.state.players.find((p) => p.id !== c.id && p.alive);
      if (!me || !foe) continue;
      const k = Math.random();
      c.socket.emit('input', { u: k < 0.3, d: k > 0.7, l: k < 0.5, r: k >= 0.5, j: 0, ax: foe.x, ay: foe.y });
      if (Math.random() < 0.3) c.socket.emit('cast', { slot: 'a', x: foe.x, y: foe.y });
    }
    await sleep(50);
  }
  const times = cs.flatMap((c) => c.times), bytes = cs.flatMap((c) => c.bytes);
  const kbps = Math.round(pct(bytes, 0.5) * (1000 / pct(times, 0.5)) * cs.length * 8 / 1000);
  const kills = host.state.players.reduce((a, p) => a + p.kills, 0);
  console.log(`снапшот интервал p50/p95/p99 ${pct(times, 0.5)}/${pct(times, 0.95)}/${pct(times, 0.99)} мс; размер p50 ${pct(bytes, 0.5)} симв; исходящий поток ~${kbps} кбит/с; фрагов ${kills}; обрывов ${cs.reduce((a, c) => a + c.drops, 0)}; фаза ${host.state.phase}`);
  for (const c of cs) c.socket.disconnect();
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
