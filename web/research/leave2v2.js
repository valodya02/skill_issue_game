#!/usr/bin/env node
'use strict';
// 2v2: игрок уходит посреди боя → его место берёт бот, бой не падает в лобби; перезашедший забирает бота
const path = require('node:path');
const io = require(path.join(__dirname, '..', 'node_modules', 'socket.io', 'client-dist', 'socket.io.js'));
const url = process.argv[2] || 'http://localhost:3000', code = 'lv' + process.pid.toString(36).slice(-6);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { CHARS } = require('../public/chars.js'); const ids = Object.keys(CHARS);
async function until(f, ms, l) { const e = Date.now() + ms; while (Date.now() < e) { if (f()) return; await sleep(50); } throw Error(l + ': timeout'); }
function connect(i) {
  const s = io(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  const c = { s, st: null };
  s.on('state', (x) => { c.st = x; });
  s.on('connect', () => s.emit('join', { code, name: 'p' + i, mode: '2v2' }));
  return until(() => c.st, 5000, 'join').then(() => { s.emit('pick', ids[i % ids.length]); s.emit('ready'); return c; });
}
(async () => {
  const cs = []; for (let i = 0; i < 4; i++) cs.push(await connect(i));
  await until(() => ['buy', 'playing'].includes(cs[0].st.phase), 8000, 'start');
  cs[3].s.disconnect(); await sleep(800);
  const ph = cs[0].st.phase, bots = cs[0].st.players.filter((p) => p.bot).length;
  if (!['buy', 'playing', 'roundEnd'].includes(ph) || bots !== 1) throw Error(`после ухода фаза ${ph}, ботов ${bots}`);
  console.log(`ok ушёл игрок: фаза ${ph}, его место занял бот, игроков ${cs[0].st.players.length}`);
  const back = await connect(3); await sleep(800);
  const b2 = cs[0].st.players.filter((p) => p.bot).length;
  if (b2 !== 0 || !cs[0].st.players.find((p) => p.id === back.s.id)) throw Error('перезашедший не забрал бота, ботов ' + b2);
  console.log('ok перезашедший забрал место бота, бой продолжается в фазе ' + cs[0].st.phase);
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
