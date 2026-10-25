#!/usr/bin/env node
'use strict';

// Зал на 100 из нескольких процессов: одна комната, хост ждёт --total игроков и жмёт «Старт».
// node research/zal100.js [url] --code zalX --role host|crowd --n 25 --total 100 --sec 30
const path = require('node:path');
const { performance } = require('node:perf_hooks');
let io;
try { io = require('socket.io-client'); }
catch (_) { io = require(path.join(__dirname, '..', 'node_modules', 'socket.io', 'client-dist', 'socket.io.js')); }

const args = process.argv.slice(2);
const url = args[0] && !args[0].startsWith('--') ? args[0] : 'http://localhost:3000';
const opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
const N = +opt('--n', 25), TOTAL = +opt('--total', 100), SEC = +opt('--sec', 30);
const code = opt('--code', 'zal100'), host = opt('--role', 'crowd') === 'host';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const own = (c) => c.state?.players.find((p) => p.id === c.id);

async function until(test, ms, label) {
  const end = performance.now() + ms;
  while (performance.now() < end) { if (test()) return; await sleep(50); }
  throw new Error(`${label}: timeout ${ms} ms`);
}

function connect(name) {
  const socket = io(url, { transports: ['websocket'], reconnection: false, timeout: 15000, forceNew: true });
  const c = { socket, id: null, state: null, me: null, times: [], bytes: [], drops: 0, banners: [], error: null };
  socket.on('state', (s) => {
    const t = performance.now();
    if (c.last && c.measure) c.times.push(t - c.last);
    c.last = t; c.state = s;
    if (c.measure && c.bytes.length < 3000) c.bytes.push(JSON.stringify(s).length);
  });
  socket.on('me', (m) => { c.me = m; });
  socket.on('fx', (f) => { for (const e of [].concat(f)) if (e?.k === 'banner') c.banners.push(e.text); });
  socket.on('connect', () => { c.id = socket.id; socket.emit('join', { code, name, mode: 'zal' }); });
  socket.on('nope', (m) => { c.error = m; });
  socket.on('connect_error', (e) => { c.error = e.message; });
  socket.on('disconnect', () => { c.drops++; });
  return until(() => { if (c.error) throw Error(c.error); return own(c); }, 15000, 'join ' + name).then(() => c);
}

const pct = (xs, q) => { const s = [...xs].sort((a, b) => a - b); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(s.length * q))]) : 0; };

(async () => {
  const cs = [];
  for (let i = 0; i < N; i++) { cs.push(await connect(`${host ? 'h' : 'p'}${process.pid % 1000}-${i}`)); await sleep(40); }
  const first = cs[0];
  if (host) {
    await until(() => first.state.players.length >= TOTAL, 90000, `ждём ${TOTAL}`);
    console.log(`host: в зале ${first.state.players.length}, жму старт`);
    first.socket.emit('start');
  }
  await until(() => cs.every((c) => c.state?.phase === 'playing'), 30000, 'playing').catch((e) => { console.error('фазы', cs.map((c) => (c.state?.phase || '-') + (c.drops ? '!' : '')).join(','), 'игроков', first.state?.players.length); throw e; });
  for (const c of cs) c.measure = true;
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
  const kills = first.state.players.reduce((a, p) => a + p.kills, 0);
  const hud = cs.filter((c) => c.me && typeof c.me.money === 'number').length;
  console.log(`${host ? 'host' : 'crowd'} pid ${process.pid}: игроков ${first.state.players.length}, интервал p50/p95/p99 ${pct(times, 0.5)}/${pct(times, 0.95)}/${pct(times, 0.99)} мс, снапшот p50 ${pct(bytes, 0.5)} симв, HUD 'me' у ${hud}/${cs.length}, фрагов ${kills}, обрывов ${cs.reduce((a, c) => a + c.drops, 0)}, фаза ${first.state.phase}, баннеры ${[...new Set(cs.flatMap((c) => c.banners))].join(' | ') || 'нет'}`);
  for (const c of cs) c.socket.disconnect();
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
