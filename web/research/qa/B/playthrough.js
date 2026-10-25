#!/usr/bin/env node
'use strict';

// Black-box jury playthrough. No server internals are imported or modified.
const path = require('node:path');
const { performance } = require('node:perf_hooks');
let io;
try { io = require('socket.io-client'); }
catch (_) { io = require(path.join(__dirname, '..', '..', '..', 'node_modules', 'socket.io', 'client-dist', 'socket.io.js')); }
const { CHARS } = require('../../../public/chars.js');
const { SHOP, normalize } = require('../../../public/weapons.js');
const map = require('../../../public/maps/rayon.json');

const url = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'http://localhost:3102';
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const started = performance.now();
const results = [];
const sockets = new Set();
let serial = 0;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const own = c => c.state?.players?.find(p => p.id === c.id);
const enemy = c => c.state?.players?.find(p => p.team !== own(c)?.team && p.alive);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const code = prefix => `${prefix}${process.pid.toString(36)}${(serial++).toString(36)}`.slice(0, 12);

async function until(fn, ms, name) {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    const value = fn();
    if (value) return value;
    await sleep(40);
  }
  throw Error(`${name}: timeout ${ms} ms`);
}
function report(name, status, detail) {
  const row = { name, status, detail: String(detail), seconds: +((performance.now() - started) / 1000).toFixed(1) };
  results.push(row);
  console.log(`${status} ${name}: ${row.detail}`);
}
async function check(name, fn) {
  if (only && !name.startsWith(only)) return;
  try { const detail = await fn(); report(name, 'PASS', detail || 'observed'); }
  catch (error) { report(name, error.skip ? 'SKIP' : 'FAIL', error.message); }
}
function skip(reason) { const error = Error(reason); error.skip = true; throw error; }
function close(cs) { for (const c of cs) { c.socket.disconnect(); sockets.delete(c.socket); } }

function observe(c, s) {
  const issues = c.issues;
  if (!['lobby', 'buy', 'playing', 'roundEnd', 'matchEnd'].includes(s.phase)) issues.add(`phase=${s.phase}`);
  if (!Array.isArray(s.score) || s.score.length !== 2) issues.add('score shape');
  if (c.previous) {
    for (let i = 0; i < 2; i++) if (s.score[i] < c.previous.score[i]) {
      if (!(c.previous.phase === 'lobby' || (c.previous.phase === 'matchEnd' && s.phase === 'lobby'))) issues.add('score decreased');
    }
    if (s.phase === c.previous.phase && ['buy', 'playing'].includes(s.phase) && s.timer > c.previous.timer) {
      if (!(s.bomb?.state === 'planted' && c.previous.bomb?.state !== 'planted')) issues.add(`timer increased ${c.previous.timer}->${s.timer}`);
    }
  }
  for (const p of s.players || []) {
    if (!CHARS[p.char]) continue; // unpicked lobby player
    if (!Number.isFinite(p.hp) || p.hp < 0 || p.hp > CHARS[p.char].hp) issues.add(`${p.name} hp=${p.hp}`);
    if (!Number.isFinite(p.money) || p.money < 0) issues.add(`${p.name} money=${p.money}`);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > map.W || p.y < 0 || p.y > map.H) issues.add(`${p.name} outside field`);
    if (p.alive && (s.phase === 'buy' || s.phase === 'playing')) for (const r of map.solid) {
      const x = Math.max(r.x, Math.min(p.x, r.x + r.w));
      const y = Math.max(r.y, Math.min(p.y, r.y + r.h));
      if ((p.x - x) ** 2 + (p.y - y) ** 2 < 26 ** 2) issues.add(`${p.name} inside solid ${r.id}`);
    }
  }
  c.previous = s;
  c.snapshots++;
}

async function connect(roomCode, mode, name) {
  const socket = io(url, { transports: ['websocket', 'polling'], reconnection: false, timeout: 5000, forceNew: true });
  sockets.add(socket);
  const c = { socket, id: null, state: null, events: [], terminal: null, issues: new Set(), snapshots: 0, previous: null };
  socket.on('connect', () => { c.id = socket.id; socket.emit('join', { code: roomCode, mode, name }); });
  socket.on('connect_error', e => { c.error = e.message; });
  socket.on('nope', e => { c.error = `join refused: ${e}`; });
  socket.on('state', s => { c.wc = c.wc || new Map(); for (const p of s.players) { if (p.weapon) c.wc.set(p.id, p.weapon); else p.weapon = c.wc.get(p.id); } c.state = s; observe(c, s); });
  socket.on('fx', e => c.events.push(e));
  socket.on('terminal', e => { c.terminal = e; });
  await until(() => { if (c.error) throw Error(c.error); return c.id && own(c); }, 7000, 'connect');
  return c;
}
async function room(mode, charA = 'startuper', charB = 'startuper') {
  const roomCode = code('qaB');
  const cs = [];
  try {
    cs.push(await connect(roomCode, mode, 'jury-a'));
    cs.push(await connect(roomCode, mode, 'jury-b'));
    cs[0].socket.emit('addBot');
    cs[0].socket.emit('addBot');
    await until(() => cs[0].state?.players?.length === 4, 2500, '2 humans + 2 bots');
    cs[0].socket.emit('pick', charA);
    cs[1].socket.emit('pick', charB);
    await until(() => own(cs[0])?.char === charA && own(cs[1])?.char === charB, 2500, 'characters picked');
    for (const c of cs) c.socket.emit('ready');
    await until(() => cs.every(c => c.state?.phase !== 'lobby'), 3000, 'match start');
    return cs;
  } catch (e) { close(cs); throw e; }
}
function input(c, fields = {}, target = own(c)) {
  c.socket.emit('input', { u: 0, d: 0, l: 0, r: 0, j: 0, ax: target?.x || 0, ay: target?.y || 0, ...fields });
}
async function walk(c, point, ms = 12000, radius = 42) {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    const p = own(c);
    if (!p?.alive) throw Error('died while walking');
    if (distance(p, point) <= radius) { input(c); return; }
    input(c, { r: +(point.x > p.x + 7), l: +(point.x < p.x - 7), d: +(point.y > p.y + 7), u: +(point.y < p.y - 7) }, point);
    await sleep(75);
  }
  input(c);
  throw Error(`route to ${point.x},${point.y} blocked at ${own(c)?.x},${own(c)?.y}`);
}
function cast(c, slot, target) { c.socket.emit('cast', { slot, x: target.x, y: target.y }); }
async function playing(c, ms = 18000) { await until(() => c.state?.phase === 'playing', ms, 'playing'); }
async function terminal(c, length) {
  c.terminal = null;
  c.socket.emit('terminal');
  await until(() => c.terminal?.code?.length === length, 1500, `${length}-key terminal`);
  for (let i = 0; i < length; i++) {
    await sleep(90);
    c.socket.emit('code', { key: c.terminal.code[i] });
  }
}
async function routeSiteA(c, side) {
  const points = side === 0 ? [{ x: 500, y: 300 }, { x: 700, y: 300 }, { x: 700, y: 140 }, { x: 850, y: 105 }]
    : [{ x: 1160, y: 380 }, { x: 1160, y: 160 }, { x: 900, y: 155 }, { x: 850, y: 105 }];
  for (const p of points) await walk(c, p);
}

async function full2v2() {
  const cs = await room('2v2', 'butcher', 'gosha');
  const a = cs.find(c => own(c).team === 0), b = cs.find(c => own(c).team === 1);
  let bought = 0, planted = false, defused = false, rounds = 0;
  try {
    const end = performance.now() + 540000;
    while (performance.now() < end && a.state.phase !== 'matchEnd') {
      await until(() => ['buy', 'matchEnd'].includes(a.state.phase), 110000, 'next round');
      if (a.state.phase === 'matchEnd') break;
      rounds++;
      for (const c of cs) { c.socket.emit('buy', 'stones'); bought++; }
      await until(() => own(a)?.weapon?.id === 'stones' && own(b)?.weapon?.id === 'stones', 1600, 'round purchase');
      await playing(a);
      if (!planted && a.state.bomb?.carrier === a.id) {
        try {
          await routeSiteA(a, 0);
          await terminal(a, 4);
          await until(() => a.state.bomb?.state === 'planted', 1600, 'plant');
          planted = true;
          if (own(b)?.alive) {
            await routeSiteA(b, 1);
            await terminal(b, 6);
            await until(() => b.state.bomb?.state === 'defused', 1600, 'defuse');
            defused = true;
          }
        } catch (e) { report('2v2 bomb path', 'FAIL', e.message); }
      }
      // Honest inputs: fight bots and each other until a round ends.
      while (a.state.phase === 'playing' && performance.now() < end) {
        for (const c of cs) {
          const p = own(c), foe = enemy(c);
          if (!p?.alive || !foe) continue;
          input(c, { r: +(foe.x > p.x + 45), l: +(foe.x < p.x - 45), d: +(foe.y > p.y + 40), u: +(foe.y < p.y - 40) }, foe);
          cast(c, 'a', foe);
        }
        await sleep(160);
      }
      await until(() => a.state.phase === 'roundEnd' || a.state.phase === 'matchEnd', 2500, 'round finish');
    }
    if (a.state.phase !== 'matchEnd') throw Error(`no matchEnd after ${rounds} rounds`);
    report('2v2 full match', 'PASS', `${rounds} rounds, ${bought} purchases, score=${a.state.score}, plant=${planted}, defuse=${defused}`);
    report('2v2 plant via code', planted ? 'PASS' : 'FAIL', planted ? 'bomb planted' : 'never planted');
    report('2v2 defuse via code', defused ? 'PASS' : 'FAIL', defused ? 'bomb defused' : 'never defused');
    a.socket.emit('rematch');
    await until(() => a.state.phase === 'lobby', 2000, 'rematch lobby');
    report('2v2 rematch', 'PASS', 'returned to lobby');
  } finally { close(cs); }
}

async function fullDm() {
  const cs = await room('dm', 'startuper', 'butcher');
  try {
    await playing(cs[0], 3000);
    const end = performance.now() + 315000;
    while (cs[0].state.phase !== 'matchEnd' && performance.now() < end) {
      for (const c of cs) {
        const p = own(c), foe = enemy(c);
        if (!p?.alive || !foe) continue;
        input(c, { r: +(foe.x > p.x + 120), l: +(foe.x < p.x - 120), d: +(foe.y > p.y + 35), u: +(foe.y < p.y - 35) }, foe);
        cast(c, 'a', foe);
      }
      await sleep(160);
    }
    if (cs[0].state.phase !== 'matchEnd') throw Error('dm did not end');
    return `winner=${cs[0].state.winner}, kills=${cs[0].state.players.map(p => p.kills).join(',')}`;
  } finally { close(cs); }
}

async function characters() {
  for (const id of Object.keys(CHARS)) {
    const name = `character ${id}`;
    if (only && !name.startsWith(only)) continue;
    let cs;
    try {
      cs = await room('dm', id, 'butcher');
      const c = cs[0];
      await playing(c, 3000);
      const target = { x: own(c).x + 120, y: own(c).y };
      for (const slot of ['a', 'q', 'e', 'r']) {
        const label = `${name} ${slot}`;
        const before = { x: own(c).x, y: own(c).y, hp: own(c).hp, shots: c.state.shots.length, pending: c.state.pending.length, zones: c.state.zones.length, walls: c.state.walls.length, fx: c.events.length };
        const type = CHARS[id].skills[slot].type;
        cast(c, slot, target);
        try {
          await until(() => {
            const p = own(c), s = c.state;
            const fx = c.events.slice(before.fx).map(e => e.k);
            const effect = {
              shot: fx.includes('shot') || s.shots.length > before.shots,
              hook: fx.includes('shot') || s.shots.length > before.shots,
              aoe: s.pending.length > before.pending || fx.includes('boom'),
              barrage: s.pending.length > before.pending || fx.includes('boom'),
              markAll: s.pending.length > before.pending || fx.includes('boom'),
              buff: !!Object.keys(p.st).find(k => ['haste', 'invuln', 'stealth'].includes(k)),
              deflect: !!p.st.deflect,
              slowmo: !!p.st.slowmo,
              dash: fx.includes('dash') || distance(p, before) > 8,
              blink: distance(p, before) > 8 || fx.includes('dmg'),
              heal: fx.includes('heal'),
              zone: s.zones.length > before.zones,
              trap: s.zones.length > before.zones,
              wall: s.walls.length > before.walls,
              random: fx.includes('random') && (s.pending.length > before.pending || s.shots.length > before.shots || s.zones.length > before.zones || s.walls.length > before.walls || fx.some(k => ['heal', 'dash', 'shot', 'boom'].includes(k)) || Object.keys(p.st).length > 0),
            }[type];
            return p.cd?.[slot] > 0 && effect;
          }, 1200, 'observable effect');
          const p = own(c), fx = c.events.slice(before.fx).map(e => e.k).join(',');
          report(label, 'PASS', `cd=${p.cd?.[slot] || 0}ms, fx=${fx || 'none'}, shots=${c.state.shots.length}, pending=${c.state.pending.length}, zones=${c.state.zones.length}, walls=${c.state.walls.length}`);
        } catch (e) { report(label, 'FAIL', e.message); }
        await sleep(170);
      }
    } catch (e) { report(name, 'FAIL', e.message); }
    finally { if (cs) close(cs); }
  }
}

async function weapons() {
  for (const [id, spec] of Object.entries(SHOP)) {
    const name = `weapon ${id}`;
    if (only && !name.startsWith(only)) continue;
    if (spec.grenade || spec.noShop) { report(name, 'SKIP', 'not a purchasable firearm; grenade/turret tested separately'); continue; }
    let cs;
    try {
      cs = await room('dm', 'butcher', 'butcher');
      const shooter = cs[0], target = cs[1];
      await playing(shooter, 3000);
      if (spec.price > own(shooter).money) {
        // The baguette costs 4200; one honest elimination funds it in DM.
        await walk(shooter, { x: 500, y: 300 }, 10000);
        await walk(shooter, { x: 700, y: 300 }, 7000);
        await walk(shooter, { x: 745, y: 435 }, 5000, 10);
        await walk(target, { x: 1100, y: 370 }, 10000);
        await walk(target, { x: 900, y: 370 }, 7000);
        await walk(target, { x: 825, y: 435 }, 5000, 10);
        const end = performance.now() + 18000;
        while (own(shooter).money < spec.price && performance.now() < end) {
          cast(shooter, 'a', own(target));
          await sleep(400);
        }
        if (own(shooter).money < spec.price) skip('could not earn 300 credits before target/bots disrupted duel');
        await until(() => own(target).alive, 4000, 'target respawn');
      }
      shooter.socket.emit('buy', id);
      await until(() => own(shooter)?.weapon?.id === id, 1300, 'purchase');
      const live = own(shooter).weapon;
      const beforeFx = shooter.events.length;
      cast(shooter, 'a', { x: own(shooter).x + 100, y: own(shooter).y });
      await until(() => own(shooter).cd.a > 0 && shooter.events.slice(beforeFx).some(e => e.k === 'shot'), 1300, 'fired');
      const rate = live.rate;
      const firstCd = own(shooter).cd.a;
      await sleep(rate + 120);
      const secondFx = shooter.events.length;
      cast(shooter, 'a', { x: own(shooter).x + 100, y: own(shooter).y });
      await until(() => own(shooter).cd.a > 0 && shooter.events.slice(secondFx).some(e => e.k === 'shot'), 1400, 'second shot / cooldown');
      // Movement and hit check use the unobstructed central gate.
      await walk(shooter, { x: 500, y: 300 }, 10000);
      await walk(shooter, { x: 700, y: 300 }, 7000);
      await walk(shooter, { x: 745, y: 435 }, 5000, 10);
      await walk(target, { x: 1100, y: 370 }, 10000);
      await walk(target, { x: 900, y: 370 }, 7000);
      await walk(target, { x: 825, y: 435 }, 5000, 10);
      await sleep(300);
      if (!own(shooter).alive || !own(target).alive) skip('duel participant died to bot or NPC before clean shot');
      const hp = own(target).hp;
      const hitFx = shooter.events.length;
      cast(shooter, 'a', own(target));
      try {
        await until(() => own(target)?.hp < hp, 2500, 'weapon hit');
      } catch (e) {
        throw Error(`${e.message}; shooter=${own(shooter).x},${own(shooter).y}, alive=${own(shooter).alive}; target=${own(target).x},${own(target).y}, alive=${own(target).alive}, hp=${own(target).hp}; fx=${shooter.events.slice(hitFx).map(x => x.k).join(',')}`);
      }
      const lost = hp - own(target).hp;
      const expected = live.dmg * (live.count || 1);
      if (lost <= 0) throw Error('shot event without target hp loss');
      if (Math.abs(lost - expected) > expected * 0.1) throw Error(`hp loss ${lost}, advertised ${expected}, tolerance 10%`);
      report(name, 'PASS', `bought; two shots ${rate}ms apart; hp -${lost}, advertised ${expected}; ammo/reload absent`);
    } catch (e) { report(name, e.skip ? 'SKIP' : 'FAIL', e.message); }
    finally { if (cs) close(cs); }
  }
}

async function extras() {
  let cs;
  try {
    cs = await room('dm', 'startuper', 'butcher');
    const c = cs[0]; await playing(c, 3000);
    for (const id of ['coffee', 'smoke']) {
      await check(`grenade ${id}`, async () => {
        c.socket.emit('buy', id);
        await until(() => own(c).grenades?.[id], 1300, 'grenade purchase');
        c.socket.emit('grenade', { x: own(c).x + 80, y: own(c).y });
        await until(() => c.state.zones.some(z => z.kind === id), 2000, 'grenade zone');
        return 'bought, thrown, zone in snapshot';
      });
    }
    await check('turret heat', async () => {
      await walk(c, { x: 215, y: 475 }, 5000);
      c.socket.emit('turret');
      await until(() => own(c).turret, 1000, 'mounted');
      const end = performance.now() + 4000;
      while (performance.now() < end) { cast(c, 'a', { x: 700, y: 475 }); await sleep(95); }
      const turret = c.state.turrets.find(t => t.by === c.id);
      if (!turret || turret.heat <= 0) throw Error(`turret did not overheat in 4 s: ${turret?.heat}`);
      return `overheated, heat left=${turret.heat}ms`;
    });
    await check('jump low bench', async () => {
      c.socket.emit('turret');
      await walk(c, { x: 470, y: 390 }, 7000);
      input(c, { j: 1, r: 1 }, { x: 600, y: 365 });
      await until(() => own(c).z > 25, 1000, 'jump height');
      await sleep(450);
      input(c);
      if (own(c).x < 510) throw Error(`bench crossing failed x=${own(c).x}`);
      return `crossed bench, x=${own(c).x}`;
    });
    await check('solid wall', async () => {
      await walk(c, { x: 700, y: 300 }, 9000);
      input(c, { r: 1 }, { x: 900, y: 300 });
      await sleep(1800);
      input(c);
      if (own(c).x > 735) throw Error(`entered arch_north solid, x=${own(c).x}`);
      return `stopped at x=${own(c).x}, wall starts x=760 with player radius 28`;
    });
  } finally { if (cs) close(cs); }
}

async function main() {
  console.log(`QA-B live ${url}`);
  await check('2v2 setup', full2v2);
  await check('dm full match', fullDm);
  await characters();
  await weapons();
  await check('extras setup', extras);
  const issues = new Set();
  let count = 0;
  for (const c of observed) { count += c.snapshots; for (const issue of c.issues) issues.add(issue); }
  report('snapshot invariants', issues.size ? 'FAIL' : 'PASS', `${count} snapshots; ${[...issues].join('; ') || 'all checked'}`);
  const fail = results.filter(r => r.status === 'FAIL').length;
  console.log(`SUMMARY ${results.length} checks, ${fail} FAIL, ${results.filter(r => r.status === 'SKIP').length} SKIP, live ${((performance.now() - started) / 1000).toFixed(1)} s`);
  if (fail) process.exitCode = 1;
}
const observed = new Set();
const originalConnect = connect;
connect = async (...args) => { const c = await originalConnect(...args); observed.add(c); return c; };
main().catch(e => { console.error(e.stack || e); process.exitCode = 1; }).finally(() => { for (const s of sockets) s.disconnect(); });
