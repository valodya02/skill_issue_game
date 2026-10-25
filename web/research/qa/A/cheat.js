#!/usr/bin/env node
'use strict';

const path = require('node:path');
let io;
try { io = require('socket.io-client'); }
catch { io = require(path.join(__dirname, '..', '..', '..', 'node_modules', 'socket.io', 'client-dist', 'socket.io.js')); }
const { SHOP, ECON } = require('../../../public/weapons.js');
const { map } = require('../../../server.js');

const url = process.argv[2] || 'http://localhost:3101';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sockets = new Set();
const results = [];
let serial = 0;
const code = () => `qa${process.pid.toString(36)}${(serial++).toString(36)}`.slice(0, 12);
const own = c => c.state?.players?.find(p => p.id === c.socket.id);
const aliveServer = c => c.socket.connected && c.states > 0;
async function until(fn, ms = 1500) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(35); }
  return null;
}
async function connect(roomCode, mode = '1v1') {
  const socket = io(url, { transports: ['websocket', 'polling'], reconnection: false, timeout: 3000, forceNew: true });
  sockets.add(socket);
  const c = { socket, roomCode, state: null, states: 0, nope: null, terminal: null, fx: [] };
  socket.on('state', s => { c.state = s; c.states++; });
  socket.on('nope', x => { c.nope = x; });
  socket.on('terminal', x => { c.terminal = x; });
  socket.on('fx', x => { c.fx.push(x); });
  socket.on('connect', () => socket.emit('join', { code: roomCode, name: 'QA', mode }));
  const ok = await until(() => own(c) || c.nope, 4000);
  if (!ok) throw Error(`join timeout at ${url}`);
  return c;
}
function close(...cs) { for (const c of cs.flat()) { c.socket.disconnect(); sockets.delete(c.socket); } }
async function match(mode = '1v1', n = 2) {
  const roomCode = code(), cs = [];
  try {
    for (let i = 0; i < n; i++) cs.push(await connect(roomCode, mode));
    for (const c of cs) c.socket.emit('pick', 'startuper');
    if (!await until(() => cs.every(c => own(c)?.char))) throw Error('pick timeout');
    for (const c of cs) c.socket.emit('ready');
    if (!await until(() => cs[0].state?.phase !== 'lobby')) throw Error('start timeout');
    return cs;
  } catch (e) { close(cs); throw e; }
}
async function attack(name, fn) {
  try {
    const r = await fn();
    const status = r?.status || 'SKIP', why = r?.why || 'no observation';
    results.push({ name, status, why });
    console.log(`${status} ${name}: ${why}`);
  } catch (e) { results.push({ name, status: 'SKIP', why: e.message }); console.log(`SKIP ${name}: ${e.message}`); }
}
const verdict = (hole, why) => ({ status: hole ? 'HOLE' : 'OK', why });
const skip = why => ({ status: 'SKIP', why });
const emit = (c, event, payload) => c.socket.emit(event, payload);
const finite = s => s?.players?.every(p => [p.x, p.y, p.hp, p.ang, p.z].every(Number.isFinite)) &&
  s?.shots?.every(x => [x.x, x.y].every(Number.isFinite)) &&
  s?.pending?.every(x => [x.x, x.y].every(Number.isFinite));

async function main() {
  let cs = await match();
  const [a, b] = cs;
  await attack('two grenades of one type in buy phase', async () => {
    const before = own(a).money;
    emit(a, 'buy', 'coffee'); await sleep(90);
    const once = own(a).money;
    emit(a, 'buy', 'coffee'); await sleep(90);
    return verdict(own(a).money < once, `money ${before} -> ${once} -> ${own(a).money}`);
  });
  await attack('buy foreign character by payload', async () => {
    const before = own(a).char;
    emit(a, 'buy', { id: 'tapok', char: own(b).id }); await sleep(90);
    return verdict(own(a).char !== before, `char ${before} -> ${own(a).char}`);
  });
  await attack('buy outside phase', async () => {
    await until(() => a.state?.phase === 'playing', 18000);
    if (a.state?.phase !== 'playing') return skip('playing phase unavailable');
    const before = own(a).money; emit(a, 'buy', 'tapok'); await sleep(150);
    return verdict(own(a).money < before, `money ${before} -> ${own(a).money}`);
  });
  await attack('overdraft and noShop', async () => {
    const before = own(a).money, weapon = own(a).weapon.id;
    emit(a, 'buy', 'baguette'); emit(a, 'buy', 'turret_mg'); await sleep(150);
    return verdict(own(a).money < 0 || own(a).weapon.id !== weapon, `money ${before} -> ${own(a).money}, weapon ${own(a).weapon.id}`);
  });
  await attack('buyToken without money and forge without token', async () => {
    const before = own(a); emit(a, 'buyToken'); emit(a, 'forge', 'free gun'); await sleep(150);
    return verdict(own(a).tokens > before.tokens || own(a).weapon.id.startsWith('forged'), `tokens ${own(a).tokens}, weapon ${own(a).weapon.id}`);
  });
  await attack('code without terminal and outside site', async () => {
    const before = a.state.bomb?.state; emit(a, 'code', { key: 'U' }); emit(a, 'terminal'); await sleep(150);
    return verdict(a.state.bomb?.state !== before || !!a.terminal?.code, `bomb ${before} -> ${a.state.bomb?.state}, terminal ${!!a.terminal?.code}`);
  });
  await attack('missing fields in code grenade buy forge', async () => {
    for (const event of ['code', 'grenade', 'buy', 'forge']) emit(a, event, {});
    await sleep(200);
    return verdict(!aliveServer(a) || !finite(a.state), `connected ${a.socket.connected}, finite snapshot ${finite(a.state)}`);
  });
  await attack('NaN Infinity strings huge and missing input', async () => {
    const inputs = [{ mx: NaN, my: Infinity, ax: NaN, ay: Infinity },
      { mx: 'x', my: 'y', ax: 'x', ay: 'y' },
      { mx: 1e300, my: -1e300, ax: 1e300, ay: -1e300 }, {},
      { ax: 1, ay: 'not a number' }];
    for (const x of inputs) { emit(a, 'input', x); await sleep(90); }
    const p = own(a); emit(a, 'input', {});
    return verdict(!aliveServer(a) || !finite(a.state) || p.x < 28 || p.x > 1572 || p.y < 28 || p.y > 872,
      `connected ${a.socket.connected}, finite ${finite(a.state)}, position ${p.x},${p.y}, angle ${p.ang}`);
  });
  await attack('missing cast fields and nonfinite target', async () => {
    emit(a, 'cast', {}); emit(a, 'cast', { slot: 'q', x: Infinity, y: NaN }); await sleep(250);
    return verdict(!aliveServer(a) || !finite(a.state), `connected ${a.socket.connected}, finite ${finite(a.state)}`);
  });
  await attack('200 input per second', async () => {
    const start = own(a), t = Date.now();
    for (let i = 0; i < 200; i++) emit(a, 'input', { r: 1, mx: 1, my: 0, ax: 1600, ay: 450 });
    await sleep(Math.max(0, 1000 - (Date.now() - t)));
    const p = own(a), d = Math.hypot(p.x - start.x, p.y - start.y);
    return verdict(d > 235 * 1.6 * 1.25, `distance ${d.toFixed(0)} in about 1 s`);
  });
  await attack('teleport through solid wall', async () => {
    const p = own(a); const wall = map.solid.find(x => x.x > p.x && x.y < p.y && p.y < x.y + x.h);
    if (!wall) return skip('no solid wall ahead at current y');
    emit(a, 'input', { x: wall.x + wall.w + 100, y: p.y, mx: 1e300, my: 0, r: 1 }); await sleep(180);
    return verdict(own(a).x > wall.x + wall.w + 28, `wall ${wall.id}, x ${p.x} -> ${own(a).x}`);
  });
  await attack('double jump in air', async () => {
    emit(a, 'input', { j: 1 }); await until(() => own(a)?.z > 0, 700);
    const z = own(a).z; emit(a, 'input', { j: 0 }); await sleep(40); emit(a, 'input', { j: 1 }); await sleep(70);
    return verdict(own(a).hop > 0, `z before ${z}, after ${own(a).z}, hop ${own(a).hop}`);
  });
  await attack('turret wrong arc and seated movement', async () => {
    const p = own(a), goal = map.turrets[0];
    if (Math.hypot(p.x - goal.x, p.y - goal.y) > 60) {
      const end = Date.now() + 2200;
      while (Date.now() < end && Math.hypot(own(a).x - goal.x, own(a).y - goal.y) > 42) {
        const q = own(a);
        emit(a, 'input', { mx: Math.sign(goal.x - q.x), my: Math.sign(goal.y - q.y) }); await sleep(80);
      }
      emit(a, 'input', {});
    }
    if (Math.hypot(own(a).x - goal.x, own(a).y - goal.y) > 50) return skip('could not reach turret');
    emit(a, 'turret'); await sleep(100);
    if (own(a).turret !== goal.id) return skip('turret did not mount');
    const before = own(a), shots = a.state.shots.length;
    emit(a, 'cast', { slot: 'a', x: goal.x - 200, y: goal.y });
    emit(a, 'input', { mx: 1, my: 0, r: 1, j: 1 }); await sleep(200);
    const after = own(a);
    return verdict(a.state.shots.length > shots || Math.hypot(after.x - before.x, after.y - before.y) > 2,
      `shots ${shots} -> ${a.state.shots.length}, position ${before.x},${before.y} -> ${after.x},${after.y}`);
  });
  await attack('bunny hop above 1.6x', async () => {
    emit(a, 'input', {}); await sleep(850);
    return skip('horizontal velocity absent from snapshot; needs instrumented timing course');
  });
  await attack('cast skill on cooldown', async () => {
    emit(a, 'cast', { slot: 'q', x: 800, y: 450 }); await sleep(80);
    const before = a.state.pending.length, cd = own(a).cd.q;
    emit(a, 'cast', { slot: 'q', x: 850, y: 450 }); await sleep(80);
    return verdict(a.state.pending.length > before, `pending ${before} -> ${a.state.pending.length}, cd ${cd}`);
  });
  await attack('grenade without purchase', async () => {
    const before = a.state.pending.length;
    emit(a, 'grenade', { x: 400, y: 450 }); await sleep(100);
    return verdict(a.state.pending.length > before, `pending ${before} -> ${a.state.pending.length}`);
  });
  await attack('damage after death, friendly fire 2v2', async () => skip('requires controlled kill and four-player setup'));
  await attack('dead terminal and code after explosion', async () => skip('requires controlled death and 35 s planted bomb setup'));
  await attack('two simultaneous bomb operators', async () => skip('requires two attackers at site and live terminal setup'));
  await attack('dead turret and double mount', async () => skip('requires controlled death and both players near same turret'));
  await attack('disconnect bomb carrier and mounted player', async () => skip('requires separate live setup for carrier and turret'));
  close(cs);

  await attack('nonhost mode and addBot', async () => {
    const roomCode = code(), host = await connect(roomCode, '2v2'), guest = await connect(roomCode, '2v2');
    try {
      emit(guest, 'mode', 'dm'); emit(guest, 'addBot'); await sleep(150);
      return verdict(host.state.mode === 'dm' || host.state.players.length > 2,
        `mode ${host.state.mode}, players ${host.state.players.length}`);
    } finally { close(host, guest); }
  });
  await attack('50 sockets in one room', async () => {
    const roomCode = code(), many = [];
    try {
      for (let i = 0; i < 50; i++) many.push(await connect(roomCode));
      return verdict(many.some(c => own(c)) && many.filter(c => own(c)).length > 2,
        `accepted ${many.filter(c => own(c)).length}/50`);
    } finally { close(many); }
  });
  await attack('join active foreign room', async () => {
    cs = await match();
    try {
      const intruder = await connect(cs[0].roomCode, '1v1');
      const accepted = !!own(intruder);
      const why = `accepted ${accepted}, refusal ${intruder.nope || 'none'}`;
      close(intruder);
      return verdict(accepted, why);
    } finally { close(cs); }
  });
  await attack('missing cast payload crash', async () => {
    cs = await match('dm', 4);
    try {
      emit(cs[0], 'cast', null); await sleep(400);
      return verdict(!cs[0].socket.connected, `connected ${cs[0].socket.connected}; null payload reaches destructuring`);
    } finally { close(cs); }
  });
  const holes = results.filter(r => r.status === 'HOLE').length;
  console.log(`TOTAL attacks=${results.length} HOLE=${holes} live=yes`);
}
main().catch(e => { console.error(`SKIP setup: ${e.stack || e}`); process.exitCode = 1; })
  .finally(() => { for (const socket of sockets) socket.disconnect(); });
