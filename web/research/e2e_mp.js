#!/usr/bin/env node
'use strict';

// Live black-box checks. No server internals are imported or patched.
const path = require('node:path');
const { performance } = require('node:perf_hooks');
let io;
try { io = require('socket.io-client'); }
catch (_) { io = require(path.join(__dirname, '..', 'node_modules', 'socket.io', 'client-dist', 'socket.io.js')); }
const { ECON, SHOP } = require('../public/weapons.js');

const args = process.argv.slice(2);
const url = args[0] && !args[0].startsWith('--') ? args[0] : 'http://localhost:3000';
const roomsArg = args.indexOf('--rooms');
const roomCount = roomsArg < 0 ? 1 : Number(args[roomsArg + 1]);
const json = args.includes('--json');
const onlyArg = args.indexOf('--only');
const only = onlyArg < 0 ? null : args[onlyArg + 1];
if (!Number.isInteger(roomCount) || roomCount < 1 || roomCount > 100) {
  console.error('--rooms must be an integer from 1 to 100'); process.exit(2);
}

const results = [];
const active = new Set();
let serial = 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const unique = (prefix) => `${prefix}${process.pid.toString(36)}${(serial++).toString(36)}`.slice(0, 12);
const own = (client) => client.state?.players.find((p) => p.id === client.id);
const players = (client) => client.state?.players || [];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

async function until(test, ms, label) {
  const deadline = performance.now() + ms;
  while (performance.now() < deadline) {
    const value = test();
    if (value) return value;
    await sleep(33);
  }
  throw new Error(`${label}: timeout ${ms} ms`);
}

async function connect(code, mode, name) {
  const socket = io(url, { transports: ['websocket', 'polling'], reconnection: false, timeout: 5000, forceNew: true });
  active.add(socket);
  const client = { socket, state: null, id: null, times: [], positions: [], disconnected: 0, events: [], terminal: null };
  socket.on('state', (state) => {
    client.wc = client.wc || new Map();  // сервер шлёт оружие только при смене
    for (const p of state.players) { if (p.weapon) client.wc.set(p.id, p.weapon); else p.weapon = client.wc.get(p.id); }
    const t = performance.now();
    if (client.lastState) client.times.push(t - client.lastState);
    client.lastState = t;
    client.state = state;
    const me = own(client);
    if (me) client.positions.push({ t, x: me.x, y: me.y });
    if (client.positions.length > 300) client.positions.shift();
  });
  socket.on('fx', (fx) => client.events.push(fx));
  socket.on('terminal', (payload) => { client.terminal = payload; });
  socket.on('disconnect', () => { client.disconnected++; });
  socket.on('connect', () => { client.id = socket.id; socket.emit('join', { code, name, mode }); });
  socket.on('connect_error', (err) => { client.error = err.message; });
  socket.on('nope', (why) => { client.error = `server refused join: ${why}`; });
  await until(() => { if (client.error) throw Error(client.error); return client.id && own(client); }, 7000, 'join');
  return client;
}

function close(clients) {
  for (const c of clients) { c.socket.disconnect(); active.delete(c.socket); }
}

async function room(mode, count, prefix, withBot = false) {
  const code = unique(prefix);
  const clients = [];
  try {
    for (let i = 0; i < count; i++) clients.push(await connect(code, mode, `${prefix}${i}`));
    if (withBot) clients[0].socket.emit('addBot');
    await until(() => players(clients[0]).length === count + (withBot ? 1 : 0), 3000, 'room full');
    for (const c of clients) c.socket.emit('pick', 'startuper');
    await until(() => clients.every((c) => own(c)?.char === 'startuper'), 3000, 'pick');
    for (const c of clients) c.socket.emit('ready');
    await until(() => clients.every((c) => c.state?.phase !== 'lobby'), 3000, 'ready');
    return clients;
  } catch (err) { close(clients); throw err; }
}

async function playing(c, ms = 18000) { await until(() => c.state?.phase === 'playing', ms, 'playing phase'); }
function input(c, fields = {}, target) {
  const me = own(c);
  c.socket.emit('input', { u: 0, d: 0, l: 0, r: 0, j: 0, ax: target?.x ?? me?.x ?? 0, ay: target?.y ?? me?.y ?? 0, ...fields });
}
function stop(c) { input(c); }
async function walk(c, point, ms = 14000, radius = 35) {
  const deadline = performance.now() + ms;
  let mark = null, side = 1;
  while (performance.now() < deadline) {
    const me = own(c);
    if (me && distance(me, point) <= radius) { stop(c); return; }
    // упёрся (бабка, машина, угол): 300 мс шаг вбок, потом снова к цели
    if (!mark || performance.now() - mark.t > 600) {
      if (mark && distance(me, mark) < 4) {
        const vertical = Math.abs(point.y - me.y) > Math.abs(point.x - me.x);
        input(c, vertical ? { r: +(side > 0), l: +(side < 0) } : { d: +(side > 0), u: +(side < 0) }, point);
        side = -side; await sleep(300);
      }
      mark = { t: performance.now(), x: own(c).x, y: own(c).y };
    }
    input(c, { r: +(point.x > me.x + 8), l: +(point.x < me.x - 8), d: +(point.y > me.y + 8), u: +(point.y < me.y - 8) }, point);
    await sleep(70);
  }
  stop(c);
  throw Error(`could not reach (${point.x},${point.y}), at (${own(c)?.x},${own(c)?.y})`);
}
function shoot(c, target) { c.socket.emit('cast', { slot: 'a', x: target.x, y: target.y }); }
function percentile(a, p) {
  if (!a.length) return null;
  const sorted = [...a].sort((x, y) => x - y);
  return +(sorted[Math.ceil(p * sorted.length) - 1] || sorted[0]).toFixed(1);
}
function stats(a) { return { mean: a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : null, p95: percentile(a, .95), p99: percentile(a, .99), n: a.length }; }

async function scenario(name, ms, fn) {
  if (only && only !== name) return;
  const begun = performance.now();
  let result;
  let timer;
  try {
    result = await Promise.race([fn(), new Promise((_, reject) => { timer = setTimeout(() => reject(Error(`scenario timeout ${ms} ms`)), ms); })]);
    results.push({ name, status: result?.skip ? 'SKIP' : 'PASS', reason: result?.reason || 'assertions met', ms: Math.round(performance.now() - begun), ...(result?.metrics || {}) });
  } catch (err) { results.push({ name, status: 'FAIL', reason: err.message, ms: Math.round(performance.now() - begun) }); }
  finally { clearTimeout(timer); for (const socket of [...active]) socket.disconnect(), active.delete(socket); }
  const r = results.at(-1);
  if (!json) console.log(`${r.status} ${r.name}: ${r.reason} (${r.ms} ms)`);
}

async function twoVsTwo() {
  const cs = await room('2v2', 4, 'duo');
  try {
    const before = cs[0].state.players.map((p) => ({ id: p.id, money: p.money }));
    if (cs[0].state.phase !== 'buy') throw Error('2v2 did not enter buy phase');
    for (const c of cs) c.socket.emit('buy', 'stones');
    await until(() => cs.every((c) => own(c)?.weapon?.id === 'stones'), 2000, 'each player buys');
    await playing(cs[0]);
    const side0 = cs.filter((c) => own(c).team === 0), side1 = cs.filter((c) => own(c).team === 1);
    const a = side0[0], b = side1[0];
    // The centre lane runs between the two arch buildings.
    await Promise.all([
      ...side0.map((c) => (async () => { await walk(c, { x: 500, y: 300 }, 9000); await walk(c, { x: 700, y: 300 }, 6000); await walk(c, { x: 700, y: 430 }, 5000); })()),
      ...side1.map((c) => (async () => { await walk(c, { x: 1100, y: 370 }, 9000); await walk(c, { x: 900, y: 370 }, 6000); await walk(c, { x: 900, y: 430 }, 5000); })()),
    ]);
    const deadline = performance.now() + 33000;
    while (performance.now() < deadline && cs[0].state.phase === 'playing') {
      shoot(a, own(b)); shoot(b, own(a));
      for (const c of cs) {
        const foe = players(c).find((p) => p.team !== own(c).team && p.alive);
        if (foe && own(c).alive) shoot(c, foe);
      }
      await sleep(110);
    }
    await until(() => cs[0].state.phase === 'roundEnd', 15000, 'round end');
    const end = cs[0].state;
    if (end.score[0] + end.score[1] !== 1) throw Error(`score did not change: ${end.score}`);
    if (!end.players.some((p) => !p.alive)) throw Error('no player died');
    for (const p of end.players) {
      const initial = before.find((x) => x.id === p.id);
      const spent = SHOP.stones.price;
      const award = p.team === end.score.findIndex((n) => n === 1) ? ECON.win : ECON.lose;
      const expected = Math.min(ECON.max, initial.money - spent + award + p.kills * ECON.kill);
      if (p.money !== expected) throw Error(`ECON mismatch for ${p.name}: ${p.money} != ${expected}`);
    }
    return { reason: '4 humans bought, fought, one died; score and ECON verified' };
  } finally { close(cs); }
}

async function deathmatch() {
  const cs = await room('dm', 3, 'dm', true);
  try {
    await playing(cs[0], 3000);
    const a = cs[0], b = cs[1];
    for (const c of cs) c.socket.emit('buy', 'makaroni');
    await until(() => cs.every((c) => own(c)?.weapon?.id === 'makaroni'), 2000, 'dm weapons');
    await Promise.all([
      (async () => { await walk(a, { x: 500, y: 300 }, 9000); await walk(a, { x: 700, y: 300 }, 6000); await walk(a, { x: 700, y: 430 }, 5000); })(),
      (async () => { await walk(b, { x: 1100, y: 370 }, 9000); await walk(b, { x: 900, y: 370 }, 6000); await walk(b, { x: 900, y: 430 }, 5000); })(),
    ]);
    const deadline = performance.now() + 25000;
    while (performance.now() < deadline && own(b)?.alive) {
      const target = own(b);
      if (own(a)?.alive) shoot(a, target);
      await sleep(120);
    }
    stop(a);
    if (own(b)?.alive) throw Error(`target did not die: a=${JSON.stringify({ x: own(a)?.x, y: own(a)?.y, hp: own(a)?.hp })} b=${JSON.stringify({ x: own(b)?.x, y: own(b)?.y, hp: own(b)?.hp })} phase=${a.state.phase} kills=${players(a).map((p) => p.kills)}`);
    const kills = players(a).reduce((n, p) => n + p.kills, 0);
    if (kills < 1) throw Error('kill score did not increase');
    await until(() => own(b)?.alive, 4500, '3-second respawn');
    if (players(a).reduce((n, p) => n + p.kills, 0) < kills) throw Error('kill score lost on respawn');
    return { reason: `target respawned in about 3 s, match has ${kills} kill(s)` };
  } finally { close(cs); }
}

async function bomb() {
  const cs = await room('1v1', 2, 'bomb');
  try {
    await playing(cs[0]);
    const attacker = cs.find((c) => own(c).team === 0), defender = cs.find((c) => own(c).team === 1);
    if (attacker.state.bomb.carrier !== attacker.id) throw Error('team 0 has no carrier');
    await walk(attacker, { x: 500, y: 300 }, 9000);
    await walk(attacker, { x: 720, y: 300 }, 7000);
    await walk(attacker, { x: 720, y: 105 }, 6000);
    await walk(attacker, { x: 850, y: 105 }, 5000, 35);
    await sleep(300);
    attacker.socket.emit('terminal');
    await until(() => attacker.terminal?.code?.length === 4, 1500, 'plant code');
    for (const key of attacker.terminal.code) {
      attacker.socket.emit('code', { key });
      await sleep(60);
    }
    await until(() => attacker.state.bomb?.state === 'planted', 2000, 'bomb planted');
    if (attacker.state.bomb.progress !== 0) throw Error('plant progress not reset');
    // A defender can arrive and disarm via a six-arrow code.
    await walk(defender, { x: 1190, y: 370 }, 9000);
    await walk(defender, { x: 1190, y: 170 }, 7000);
    await walk(defender, { x: 900, y: 170 }, 9000);
    await walk(defender, { x: 900, y: 105 }, 4000);
    await walk(defender, { x: 850, y: 105 }, 5000, 45);
    await sleep(300);
    defender.socket.emit('terminal');
    await until(() => defender.terminal?.code?.length === 6, 1500, 'defuse code');
    for (const key of defender.terminal.code) { defender.socket.emit('code', { key }); await sleep(60); }
    await until(() => defender.state.phase === 'roundEnd', 2000, 'defuse round end');
    if (defender.state.score[1] !== 1) throw Error('defuse did not award defenders');
    return { reason: 'plant and defuse codes completed, defenders awarded round' };
  } finally { close(cs); }
}

async function kiosk() {
  const cs = await room('dm', 3, 'kiosk', true);
  try {
    const c = cs[0]; await playing(c, 3000);
    // Buying in DM is permitted throughout play, but molotov exists only in kiosk stock.
    const money = own(c).money;
    c.socket.emit('buy', 'molotov'); await sleep(150);
    if (own(c).money !== money || own(c).weapon.id === 'molotov') throw Error('molotov sold outside kiosk');
    await walk(c, { x: 690, y: 710 }, 14000, 45);
    const before = own(c).money;
    c.socket.emit('buy', 'molotov');
    await until(() => own(c)?.weapon?.id === 'molotov', 1500, 'kiosk purchase');
    if (before - own(c).money !== 2800) throw Error('kiosk charged wrong price');
    return { reason: 'outside denied, inside sold molotov for 2800' };
  } finally { close(cs); }
}

async function grandma() {
  const cs = await room('dm', 3, 'grandma', true);
  try {
    const c = cs[0]; await playing(c, 3000);
    const npc = c.state.npcs?.find((n) => n.alive);
    if (!npc) return { skip: true, reason: 'server snapshot has no live NPC' };
    await walk(c, { x: 470, y: 390 }, 12000, 50);
    const target = c.state.npcs.find((n) => n.id === npc.id);
    const hp = target.hp;
    const start = c.events.length;
    const deadline = performance.now() + 8000;
    while (performance.now() < deadline && c.state.npcs.find((n) => n.id === npc.id)?.hp === hp) {
      shoot(c, npc); await sleep(120);
    }
    await until(() => c.state.npcs.find((n) => n.id === npc.id)?.hp < hp, 500, 'grandma hit');
    await until(() => c.state.npcs.find((n) => n.id === npc.id)?.target === c.id ||
      c.state.shots.some((s) => s.team === -1) || c.events.slice(start).some((e) => e.k === 'dmg' && e.x === Math.round(own(c).x)), 2500, 'grandma retaliates');
    return { reason: 'NPC lost hp and targeted/shot the attacker' };
  } finally { close(cs); }
}

async function coreV2() {
  const cs = await room('dm', 3, 'core', true);
  try {
    const c = cs[0]; await playing(c, 3000);
    if (!('z' in own(c)) || !Array.isArray(c.state.turrets)) return { skip: true, reason: 'v2 z/turrets absent in snapshot' };
    input(c, { j: 1 });
    await until(() => own(c).z > 0, 800, 'jump z > 0');
    stop(c);
    const jump = own(c).z;
    const turret = c.state.turrets[0];
    if (!turret) throw Error('v2 snapshot has no turret');
    await walk(c, { x: 215, y: 475 }, 4000, 40);
    c.socket.emit('turret');
    await until(() => c.state.turrets.some((t) => t.id === turret.id && t.by === c.id), 1500, 'mount turret');
    const turretFx = c.events.filter((e) => e.k === 'turret').length;
    shoot(c, { x: 600, y: 475 });
    await until(() => c.events.filter((e) => e.k === 'turret').length > turretFx, 1500, 'turret fires');
    const before = own(c).money;
    c.socket.emit('buy', 'coffee');
    await until(() => own(c).grenades?.coffee, 1500, 'coffee purchase');
    c.socket.emit('grenade', { x: own(c).x + 50, y: own(c).y });
    await until(() => c.state.zones?.some((z) => z.kind === 'coffee'), 2500, 'coffee zone');
    return { reason: `jump z=${jump}, turret mounted and fired, coffee zone; coffee cost ${before - own(c).money}` };
  } finally { close(cs); }
}

async function load() {
  const groups = [];
  try {
    for (let i = 0; i < roomCount; i++) groups.push(await room('2v2', 4, 'load'));
    const clients = groups.flat();
    await until(() => groups.every((g) => g[0].state?.phase === 'buy'), 2000, 'load buy phase');
    for (const c of clients) c.socket.emit('buy', 'stones');
    await playing(clients[0]);
    const start = performance.now(), end = start + 60000;
    const probes = [];
    while (performance.now() < end) {
      for (const c of clients) {
        const p = own(c);
        if (!p?.alive) continue;
        const foe = players(c).find((x) => x.team !== p.team && x.alive);
        if (!foe) continue;
        input(c, { r: +(foe.x > p.x + 40), l: +(foe.x < p.x - 40), d: +(foe.y > p.y + 30), u: +(foe.y < p.y - 30), j: 0 }, foe);
        shoot(c, foe);
        if (Math.random() < .08) c.socket.emit('cast', { slot: 'q', x: foe.x, y: foe.y });
        if (Math.random() < .02) c.socket.emit('buy', 'stones');
        probes.push({ c, at: performance.now(), x: p.x, y: p.y, done: false });
      }
      await sleep(130);
    }
    await sleep(150);
    const intervals = clients.flatMap((c) => c.times);
    const latency = [];
    for (const probe of probes) {
      const pos = probe.c.positions.find((p) => p.t >= probe.at && p.t - probe.at <= 500 && (p.x !== probe.x || p.y !== probe.y));
      if (pos) latency.push(pos.t - probe.at);
    }
    const disconnected = clients.reduce((n, c) => n + c.disconnected, 0);
    const interval = stats(intervals), movement = stats(latency);
    if (disconnected) throw Error(`${disconnected} sockets disconnected`);
    if (!intervals.length) throw Error('no snapshots received');
    return { reason: `${roomCount} rooms, ${clients.length} sockets, 60 s; snapshot ${interval.mean}/${interval.p95}/${interval.p99} ms mean/p95/p99; movement ${movement.mean}/${movement.p95}/${movement.p99} ms; disconnects ${disconnected}`, metrics: { rooms: roomCount, sockets: clients.length, durationMs: Math.round(performance.now() - start), snapshotMs: interval, inputToMovementMs: movement, disconnected } };
  } finally { for (const g of groups) close(g); }
}

async function main() {
  await scenario('2v2', 100000, twoVsTwo);
  await scenario('dm', 65000, deathmatch);
  await scenario('bomb', 85000, bomb);
  await scenario('kiosk', 25000, kiosk);
  await scenario('grandma', 25000, grandma);
  await scenario('core-v2', 20000, coreV2);
  await scenario('load', 85000 + roomCount * 8000, load);
  if (json) console.log(JSON.stringify({ url, results }, null, 2));
  process.exitCode = results.some((r) => r.status === 'FAIL') ? 1 : 0;
}
main().catch((err) => { console.error(err.stack || err); process.exitCode = 1; });
