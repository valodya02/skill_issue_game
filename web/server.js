// Брейнрот-битва: авторитарный сервер. Клиент шлёт ввод и касты, сервер считает всё.
const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { CHARS } = require('./public/chars.js');
const { ECON, SHOP, KIOSK = {}, NPC = {}, normalize } = require('./public/weapons.js');
const { forge } = require('./forge.js');
const { moveCircle, firstSolidHit, reflect } = require('./lib/physics.js');
const { movePlayer } = require('./lib/move.js');
const { newCode, advanceCode, inSmoke, fireTurret, deflectShot, pullTarget, applyCoffee } = require('./lib/core2.js');

const PORT = process.env.PORT || 3000;
const W = 1600, H = 900, PR = 28;           // арена и радиус игрока
const TICK = 30, ROUNDS_TO_WIN = 4, BUY_MS = 15000, ROUND_MS = 100000;
const CHAR_IDS = Object.keys(CHARS);

const app = express();
app.use('/models', express.static(path.join(__dirname, 'public', 'models'), { maxAge: '7d' }));
app.use('/music', express.static(path.join(__dirname, 'public', 'music'), { maxAge: '7d' }));
app.use('/sfx', express.static(path.join(__dirname, 'public', 'sfx'), { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, 'public')));
// three и модели не меняются между выкатками: неделя кэша, второй заход без мегабайта загрузки
app.use('/vendor', express.static(path.join(__dirname, 'node_modules', 'three', 'build'), { maxAge: '7d', immutable: true }));
const server = http.createServer(app);
// только websocket: без long-polling и апгрейда, сжатие выкл (снапшоты мелкие, CPU дороже)
const io = new Server(server, { transports: ['websocket'], perMessageDeflate: false });

const rooms = new Map();
// боты = клише ИИ-стартапов, до 16 символов (сервер режет имя)
const BOT_NAMES = ['Агент агентов', 'Notion с чатом', 'GPT-обёртка', 'ARR $0', 'Пивот-бот', 'Вейтлист 3 чел', 'Слоп-бот', 'Фиол. градиент', 'Воздухан', 'Сигма-бот', 'Скуф'];
// dm и zal: каждый сам за себя; zal = зал на 32, старт по кнопке хоста, вход в идущий бой
const MODES = ['1v1', '2v2', 'dm', 'zal'];
const ffa = (room) => room?.mode === 'dm' || room?.mode === 'zal';
const now = () => Date.now();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
let uid = 1;
const mapId = /^[a-z0-9_-]+$/i.test(process.env.MAP || '') ? process.env.MAP : 'rayon';
const mapFile = path.join(__dirname, 'public', 'maps', mapId + '.json');
const map = JSON.parse(fs.readFileSync(fs.existsSync(mapFile) ? mapFile : path.join(__dirname, 'public', 'maps', 'rayon.json'), 'utf8'));
const fieldW = map.W || W, fieldH = map.H || H;
const near = (a, b, r) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 <= r * r;
const inCircle = (p, c) => !!c && near(p, c, c.r);
const spawn = (room, p, index = 0) => {
  const team = ffa(room) ? String(index % 2) : String(p.team);
  const points = map.spawns[team] || map.spawns['0'] || [[fieldW / 2, fieldH / 2]];
  const point = ffa(room) ? points[Math.floor(Math.random() * points.length)] : points[index % points.length];
  p.x = point[0]; p.y = point[1];
};

function getRoom(code, mode) {
  if (!rooms.has(code)) {
    rooms.set(code, {
      code, mode: MODES.includes(mode) ? mode : '1v1', phase: 'lobby', map,
      players: new Map(), shots: [], pending: [], zones: [], walls: [], drops: [],
      npcs: [], turrets: [], bomb: null, score: [0, 0], roundWinner: null, phaseUntil: 0, winner: null,
      sentW: new Map(),  // кому какое оружие уже ушло в снапшоте
    });
  }
  return rooms.get(code);
}
const slots = (room) => ({ '1v1': 2, zal: 32 })[room.mode] || 4;

function addPlayer(room, id, name, bot = false) {
  const counts = [0, 0];
  for (const p of room.players.values()) if (p.team < 2) counts[p.team]++;
  const team = ffa(room) ? (room.nextTeam = (room.nextTeam || 0) + 1) : counts[0] <= counts[1] ? 0 : 1;
  const p = {
    id, name: String(name || 'NPC').slice(0, 16), team, bot,
    char: bot ? CHAR_IDS[Math.floor(Math.random() * CHAR_IDS.length)] : null,
    ready: bot, x: 0, y: 0, hp: 1, alive: true, ang: 0,
    input: { u: 0, d: 0, l: 0, r: 0, j: 0, ax: 0, ay: 0 },
    cd: { a: 0, q: 0, e: 0, r: 0 }, st: {}, kills: 0, respawnAt: 0, hold: null,
    vx: 0, vy: 0, z: 0, vz: 0, hop: 0, grenade: null, grenades: { coffee: false, smoke: false }, turret: null,
  };
  resetEconomy(p);
  room.players.set(id, p);
  return p;
}

const pistol = () => ({ ...normalize(SHOP.pistol), id: 'pistol' });
function resetEconomy(p, room) { p.money = ffa(room) ? 4000 : ECON.start; p.tokens = 0; p.weapon = pistol(); p.kills = 0; }

function resetRound(room) {
  room.shots = []; room.pending = []; room.zones = []; room.walls = []; room.drops = [];
  room.npcs = (map.npcs || []).map((n) => ({ id: 'npc' + uid++, kind: n.kind, x: n.x, y: n.y, hp: n.hp || 100, maxHp: n.hp || 100, alive: true, target: null, lastHit: null, nextShot: 0 }));
  room.turrets = (map.turrets || []).map((v) => ({ ...v, by: null, heat: 0, firingAt: 0, nextShot: 0 }));
  for (const p of room.players.values()) if (!p.alive) p.weapon = pistol(); // умер — остался с пистолетом
  const byTeam = [[], []];
  for (const p of room.players.values()) if (p.team < 2) byTeam[p.team].push(p);
  byTeam.forEach((list, t) => list.forEach((p, i) => {
    const c = CHARS[p.char];
    spawn(room, p, i);
    p.hp = c.hp; p.alive = true; p.st = {}; p.cd = { a: 0, q: 0, e: 0, r: 0 };
    p.ang = t === 0 ? 0 : Math.PI;
    Object.assign(p, { vx: 0, vy: 0, z: 0, vz: 0, hop: 0, grenade: null, grenades: { coffee: false, smoke: false }, turret: null, hold: null, hasJumped: false, jumpHeld: false, lastLand: -Infinity });
  }));
  if (ffa(room)) {
    let i = 0;
    for (const p of room.players.values()) { spawn(room, p, i++); p.hp = CHARS[p.char].hp; p.alive = true; p.st = {}; p.cd = { a: 0, q: 0, e: 0, r: 0 }; Object.assign(p, { vx: 0, vy: 0, z: 0, vz: 0, hop: 0, grenade: null, grenades: { coffee: false, smoke: false }, turret: null, hold: null, hasJumped: false, jumpHeld: false, lastLand: -Infinity }); }
  }
  for (const p of room.players.values()) {
    if (!p.bot || p.weapon.id !== 'pistol') continue;
    const best = Object.entries(SHOP).filter(([, w]) => !w.noShop && !w.grenade && w.price <= p.money).sort((x, y) => y[1].price - x[1].price)[0];
    if (best && best[0] !== 'pistol') { p.money -= best[1].price; p.weapon = { ...normalize(best[1]), id: best[0] }; }
  }
  if (ffa(room)) { room.bomb = null; room.phase = 'playing'; room.phaseUntil = now() + 300000; }
  else {
    const carriers = byTeam[0];
    const carrier = carriers[Math.floor(Math.random() * carriers.length)];
    room.bomb = { state: 'carried', x: carrier.x, y: carrier.y, carrier: carrier.id, plantedAt: 0, progress: 0 };
    room.phase = 'buy'; room.phaseUntil = now() + BUY_MS;
  }
}

function tryStart(room, force = false) {
  const ps = [...room.players.values()];
  if (room.phase !== 'lobby') return;
  if (room.mode === 'zal') {
    // зал не ждёт полной комнаты и чужих «готов»: стартует хост, без персонажа дадим случайного
    if (!force || ps.length < 2) return;
    for (const p of ps) { p.char = p.char || CHAR_IDS[Math.floor(Math.random() * CHAR_IDS.length)]; p.ready = true; }
  } else if (ps.length !== slots(room) || !ps.every((p) => p.char && p.ready)) return;
  room.score = [0, 0]; room.winner = null;
  for (const p of ps) { resetEconomy(p, room); p.alive = true; }
  resetRound(room);
}

function emitFx(room, fx) { io.to(room.code).emit('fx', fx); }

// --- урон и статусы ---
function has(p, s) { return (p.st[s] || 0) > now(); }
function applyFx(p, fx) {
  if (!fx) return;
  for (const k of ['stun', 'root', 'slow', 'bleed']) {
    if (fx[k]) p.st[k] = Math.max(p.st[k] || 0, now() + fx[k]);
  }
}
function damage(room, src, tgt, dmg, fx) {
  if (!tgt.alive || has(tgt, 'invuln')) return;
  if (dmg > 0) {
    tgt.hp -= dmg;
    cancelCode(room, tgt);
    emitFx(room, { k: 'dmg', x: tgt.x, y: tgt.y, v: Math.round(dmg) });
  }
  applyFx(tgt, fx);
  if (tgt.hp <= 0) {
    tgt.alive = false; tgt.hp = 0;
    if (tgt.turret) { const turret = room.turrets.find((v) => v.id === tgt.turret); if (turret) turret.by = null; tgt.turret = null; }
    if (src && src !== tgt) { src.kills++; src.money = Math.min(ECON.max, src.money + ECON.kill); }
    if (ffa(room)) tgt.respawnAt = now() + 3000;
    if (room.bomb?.state === 'carried' && room.bomb.carrier === tgt.id) {
      Object.assign(room.bomb, { state: 'dropped', carrier: null, x: tgt.x, y: tgt.y, progress: 0 });
    }
    if (tgt.weapon.id !== 'pistol') room.drops.push({ id: uid++, x: tgt.x, y: tgt.y, weapon: tgt.weapon });
    emitFx(room, { k: 'kill', x: tgt.x, y: tgt.y, who: tgt.name, by: src ? src.name : '' });
  }
}
function damageNpc(room, src, npc, amount) {
  if (!npc.alive) return;
  npc.hp -= amount; npc.lastHit = src.id; npc.target = src.id;
  emitFx(room, { k: 'dmg', x: npc.x, y: npc.y, v: Math.round(amount) });
  if (npc.hp <= 0) {
    npc.hp = 0; npc.alive = false;
    src.money = Math.max(0, src.money - 300);
    emitFx(room, { k: 'banner', text: `${src.name} обидел бабушку` });
  }
}
function ignite(room, s, x, y) {
  if (!s.ignite) return;
  room.zones.push({ id: uid++, kind: 'fire', x, y, r: s.ignite.r, until: now() + s.ignite.ms,
    team: s.team, owner: s.owner, dmg: s.ignite.dps / 4, nextHit: now(), emoji: '🔥' });
}
const enemiesOf = (room, p) => [...room.players.values()].filter((o) => o.alive && o.team !== p.team);
const alliesOf = (room, p) => [...room.players.values()].filter((o) => o.alive && o.team === p.team);

function aoeHit(room, src, x, y, r, dmg, fx) {
  for (const o of room.players.values()) {
    if (o.alive && o.team !== src.team && Math.hypot(o.x - x, o.y - y) < r + PR) damage(room, src, o, dmg, fx);
  }
}

// --- скиллы ---
// Скиллы персонажей Q/E/R включены; чистый режим КС (только оружие, гранаты, бомба) через SKILLS=0
const SKILLS = process.env.SKILLS !== '0';
// Пули огнестрела летят почти как хитскан, метательное остаётся видимым
const FAST = new Set(['pistol', 'tapok', 'makaroni', 'baguette', 'turret_mg']);
// Разброс как в КС, радианы: стоишь точно, бежишь и прыгаешь мажешь. Клиент рисует прицел по этому же числу
function inaccuracy(p) {
  const run = Math.min(1, Math.hypot(p.vx || 0, p.vy || 0) / 250);
  return 0.004 + run * 0.06 + ((p.z || 0) > 2 ? 0.14 : 0) + (p.recoil || 0);
}
// Спрей как в КС: первая пуля стоя летит в точку, дальше очередь уводит по паттерну (влево, вправо, змейкой).
// Паттерн выучивается: тот, кто тянет мышь против, кладёт очередь в голову. Пауза дольше BURST_RESET мс сбрасывает
const BURST_RESET = 260;
const SPRAY = [0, 0, 0.012, 0.022, 0.03, 0.026, 0.012, -0.008, -0.026, -0.036, -0.03, -0.014, 0.006, 0.024, 0.032, 0.02];
function sprayOffset(n) { return SPRAY[Math.min(n, SPRAY.length - 1)] * (n >= SPRAY.length ? (n % 2 ? 1 : -1) : 1); }

function cast(room, p, slot, tx, ty, skillOverride) {
  const c = CHARS[p.char];
  if (slot === 'a' && !skillOverride) return fire(room, p, tx, ty);
  if (!SKILLS && !skillOverride) return;
  const s = skillOverride || c.skills[slot];
  if (!skillOverride) {
    if (!p.alive || has(p, 'stun') || p.cd[slot] > now()) return;
    p.cd[slot] = now() + s.cd;
    if (slot === 'r') emitFx(room, { k: 'ult', char: p.char, x: p.x, y: p.y, label: s.label });
  }
  if (s.type !== 'buff') p.st.stealth = 0; // атака снимает невидимость
  const ang = Math.atan2(ty - p.y, tx - p.x);
  p.ang = ang;
  switch (s.type) {
    case 'hook':
    case 'shot':
    default: {
      const n = s.count || 1;
      for (let i = 0; i < n; i++) {
        const a = n > 1 ? ang - (s.spread || 0) / 2 + ((s.spread || 0) * i) / (n - 1) : ang;
        room.shots.push({
          id: uid++, owner: p.id, team: p.team, x: p.x, y: p.y,
          vx: Math.cos(a) * (s.speed || 900), vy: Math.sin(a) * (s.speed || 900), r: s.r || 8,
          left: s.range || 600, dmg: s.dmg || 0, fx: s.fx, emoji: c.emoji, hook: s.type === 'hook',
        });
      }
      emitFx(room, { k: 'shot', x: p.x, y: p.y });
      break;
    }
    case 'aoe': {
      const x = s.at === 'self' ? p.x : clamp(tx, 0, W), y = s.at === 'self' ? p.y : clamp(ty, 0, H);
      room.pending.push({ x, y, r: s.r, dmg: s.dmg, fx: s.fx, owner: p.id, team: p.team, at: now() + (s.delay || 0) });
      break;
    }
    case 'barrage': {
      const foes = enemiesOf(room, p);
      for (let i = 0; i < s.count; i++) {
        const f = foes.length ? foes[i % foes.length] : null;
        const x = f ? f.x + (Math.random() - 0.5) * 260 : Math.random() * W;
        const y = f ? f.y + (Math.random() - 0.5) * 260 : Math.random() * H;
        room.pending.push({ x, y, r: s.r, dmg: s.dmg, owner: p.id, team: p.team, at: now() + 500 + (s.over * i) / s.count });
      }
      break;
    }
    case 'markAll': {
      for (const f of enemiesOf(room, p)) {
        room.pending.push({ x: f.x, y: f.y, r: s.r, dmg: s.dmg, owner: p.id, team: p.team, at: now() + s.delay, follow: f.id });
      }
      break;
    }
    case 'dash': {
      const len = Math.min(s.dist, Math.hypot(tx - p.x, ty - p.y) || s.dist);
      const x0 = p.x, y0 = p.y;
      const moved = moveCircle(p.x, p.y, Math.cos(ang) * len, Math.sin(ang) * len, PR, map.solid, map.low);
      p.x = clamp(moved.x, PR, fieldW - PR);
      p.y = clamp(moved.y, PR, fieldH - PR);
      if (s.invuln) p.st.invuln = now() + s.invuln;
      if (s.dmg) {
        for (const o of enemiesOf(room, p)) if (segDist(o, x0, y0, p.x, p.y) < PR * 2) damage(room, p, o, s.dmg);
      }
      emitFx(room, { k: 'dash', x0, y0, x1: p.x, y1: p.y });
      break;
    }
    case 'heal': {
      const targets = s.r ? alliesOf(room, p).filter((o) => dist(o, p) < s.r) : [p];
      for (const o of targets) {
        o.hp = Math.min(CHARS[o.char].hp, o.hp + s.amount);
        emitFx(room, { k: 'heal', x: o.x, y: o.y, v: s.amount });
      }
      break;
    }
    case 'buff': {
      if (s.haste) p.st.haste = now() + s.haste;
      if (s.invuln) p.st.invuln = now() + s.invuln;
      if (s.stealth) p.st.stealth = now() + s.stealth;
      break;
    }
    case 'deflect': p.st.deflect = now() + s.ms; break;
    case 'slowmo': p.st.slowmo = now() + s.ms; p.slowmoR = s.r; break;
    case 'zone':
    case 'trap': {
      room.zones.push({
        id: uid++, kind: s.type, x: clamp(tx, 0, W), y: clamp(ty, 0, H), r: s.r,
        until: now() + s.ms, team: p.team, owner: p.id, dmg: s.dmg || 0, fx: s.fx, emoji: c.emoji,
      });
      break;
    }
    case 'wall': {
      // столбы поперёк направления взгляда, в точке курсора
      const cx = clamp(tx, 0, W), cy = clamp(ty, 0, H), nx = -Math.sin(ang), ny = Math.cos(ang);
      const n = Math.round(s.len / 30);
      for (let i = 0; i <= n; i++) {
        const off = -s.len / 2 + (s.len * i) / n;
        room.walls.push({ x: cx + nx * off, y: cy + ny * off, r: 18, until: now() + s.ms });
      }
      break;
    }
    case 'blink': {
      const foes = enemiesOf(room, p);
      if (!foes.length) break;
      const f = foes.reduce((a, b) => (dist(a, p) < dist(b, p) ? a : b));
      const moved = moveCircle(p.x, p.y, f.x - Math.cos(f.ang) * 60 - p.x, f.y - Math.sin(f.ang) * 60 - p.y, PR, map.solid, map.low);
      p.x = clamp(moved.x, PR, fieldW - PR);
      p.y = clamp(moved.y, PR, fieldH - PR);
      damage(room, p, f, s.dmg, s.fx);
      break;
    }
    case 'random': {
      const keys = s.pool === 'r' ? ['r'] : ['q', 'e'];
      const pool = [];
      for (const id of CHAR_IDS) if (id !== 'skebob') for (const k of keys) pool.push([id, k]);
      const [cid, k] = pool[Math.floor(Math.random() * pool.length)];
      const picked = CHARS[cid].skills[k];
      emitFx(room, { k: 'random', x: p.x, y: p.y, label: picked.label, emoji: CHARS[cid].emoji });
      cast(room, p, slot, tx, ty, picked);
      break;
    }
  }
}

function fire(room, p, tx, ty) {
  const turret = p.turret && room.turrets.find((v) => v.id === p.turret);
  const w = turret ? SHOP.turret_mg : p.weapon;
  const t = now();
  if (!p.alive || has(p, 'stun') || p.cd.a > t) return;
  if (turret && !fireTurret(turret, tx, ty, t)) return;
  p.cd.a = turret && t - p.cd.a < 200 ? p.cd.a + w.rate : t + w.rate;
  p.st.stealth = 0;
  const ang = Math.atan2(ty - p.y, tx - p.x);
  p.ang = ang;
  if (w.lob) {
    const len = Math.min(w.range, Math.hypot(tx - p.x, ty - p.y));
    const x = clamp(p.x + Math.cos(ang) * len, 0, fieldW), y = clamp(p.y + Math.sin(ang) * len, 0, fieldH);
    room.pending.push({ x, y, r: Math.max(40, w.r * 3), dmg: w.dmg, fx: w.fx, ignite: w.ignite, lob: true,
      owner: p.id, team: p.team, at: now() + Math.round(1000 * len / w.speed) });
    emitFx(room, { k: 'shot', x: p.x, y: p.y });
    return;
  }
  const n = w.count || 1, fast = !!turret || FAST.has(w.id), speed = fast ? Math.max(2600, w.speed * 3) : w.speed;
  // очередь: номер пули в спрее, сброс по паузе
  p.burst = t - (p.lastShot || 0) > w.rate + BURST_RESET ? 0 : (p.burst || 0) + 1;
  p.lastShot = t;
  const first = p.burst === 0 && Math.hypot(p.vx || 0, p.vy || 0) < 40 && (p.z || 0) <= 2;
  const spread = fast && !turret ? (first ? 0 : inaccuracy(p)) : 0;
  const drift = fast && n === 1 && !turret ? sprayOffset(p.burst) : 0;
  if (fast) p.recoil = Math.min(0.08, (p.recoil || 0) + (w.rate < 200 ? 0.015 : 0.03));
  for (let i = 0; i < n; i++) {
    const jitter = (has(p, 'jitter') ? (Math.random() * 2 - 1) * 20 * Math.PI / 180 : 0) + (Math.random() * 2 - 1) * spread;
    const a = (n > 1 ? ang - w.spread / 2 + (w.spread * i) / (n - 1) : ang) + jitter + drift;
    room.shots.push({
      id: uid++, owner: p.id, team: p.team, x: p.x, y: p.y,
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: w.r, fast, left: w.range, dmg: w.dmg, fx: w.fx, emoji: w.emoji,
      pierce: w.pierce || 0, bounce: w.bounce || 0, ignite: w.ignite, hit: new Set(),
    });
  }
  emitFx(room, { k: turret ? 'turret' : 'shot', x: p.x, y: p.y });
}

function segDist(o, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1;
  const t = clamp(((o.x - x0) * dx + (o.y - y0) * dy) / l2, 0, 1);
  return Math.hypot(o.x - (x0 + t * dx), o.y - (y0 + t * dy));
}

// --- боты: идут к ближайшему врагу, держат дистанцию, жмут всё подряд ---
function botThink(room, p) {
  const bomb = room.bomb;
  let objective = null, holdAt = 0;
  if (bomb && p.team === 0) {
    if (bomb.state === 'carried' && bomb.carrier === p.id) {
      const sites = Object.values(map.sites || {});
      objective = sites.reduce((best, site) => !best || dist(site, p) < dist(best, p) ? site : best, null);
      holdAt = 25;
    } else if (bomb.state === 'dropped') { objective = bomb; holdAt = 50; }
  } else if (bomb?.state === 'planted' && p.team === 1) { objective = bomb; holdAt = 40; }
  if (objective) {
    const d = dist(p, objective);
    p.input = { r: d > holdAt && objective.x > p.x ? 1 : 0, l: d > holdAt && objective.x < p.x ? 1 : 0,
      d: d > holdAt && objective.y > p.y ? 1 : 0, u: d > holdAt && objective.y < p.y ? 1 : 0, g: d <= holdAt };
    if (bomb.state === 'dropped' && d <= 50) { bomb.state = 'carried'; bomb.carrier = p.id; }
    return;
  }
  const foes = enemiesOf(room, p).filter((o) => !inSmoke(p, o, room.zones));
  if (!foes.length) { p.input = { u: 0, d: 0, l: 0, r: 0 }; return; }
  const f = foes.reduce((a, b) => (dist(a, p) < dist(b, p) ? a : b));
  const d = dist(f, p), want = p.weapon.range * 0.7;
  const dx = f.x - p.x, dy = f.y - p.y, dir = d > want ? 1 : d < want * 0.6 ? -1 : 0;
  const wob = Math.sin(now() / 400 + p.x) * 0.8;
  p.input = {
    r: dir * dx > 0 || wob > 0.5 ? 1 : 0, l: dir * dx < 0 || wob < -0.5 ? 1 : 0,
    d: dir * dy > 0 ? 1 : 0, u: dir * dy < 0 ? 1 : 0,
  };
  if (d < p.weapon.range) cast(room, p, 'a', f.x, f.y);
  if (Math.random() < 0.02) cast(room, p, Math.random() < 0.5 ? 'q' : 'e', f.x, f.y);
  if (p.hp < CHARS[p.char].hp * 0.5 && Math.random() < 0.02) cast(room, p, 'r', f.x, f.y);
}

function finishRound(room, winner, t) {
  if (room.phase !== 'playing') return;
  for (const p of room.players.values()) p.money = Math.min(ECON.max, p.money + (p.team === winner ? ECON.win : ECON.lose));
  room.score[winner]++;
  room.roundWinner = winner;
  if (room.score[winner] >= ROUNDS_TO_WIN) room.winner = winner;
  room.phase = 'roundEnd'; room.phaseUntil = t + 2500;
  emitFx(room, { k: 'round', x: fieldW / 2, y: fieldH / 2 });
  emitFx(room, { k: 'banner', text: room.winner !== null ? `КОМАНДА ${winner + 1} ЗАТАЩИЛА` : `РАУНД КОМАНДЕ ${winner + 1}` });
}

function sendTerminal(p, payload) {
  if (!p.bot) io.sockets.sockets.get(p.id)?.emit('terminal', payload);
}
function startCode(room, p, t) {
  const b = room.bomb;
  if (!b || p.hold || b.active || room.phase !== 'playing' || !p.alive) return;
  let action = null;
  if (p.team === 0 && b.state === 'carried' && b.carrier === p.id) {
    if (inCircle(p, map.sites?.A)) action = 'plantA';
    else if (inCircle(p, map.sites?.B)) action = 'plantB';
  } else if (p.team === 1 && b.state === 'planted' && near(p, b, 60)) action = 'defuse';
  if (!action) return;
  p.hold = { action, x: p.x, y: p.y, code: newCode(action === 'defuse' ? 6 : 4), index: 0, nextKey: t + 400 };
  b.active = p.id; b.progress = 0;
  sendTerminal(p, { code: p.hold.code, index: 0, action });
}
function cancelCode(room, p) {
  if (!p.hold) return;
  p.hold = null;
  if (room.bomb?.active === p.id) { room.bomb.active = null; room.bomb.progress = 0; }
  sendTerminal(p, { code: null });
}
function codeInput(room, p, key, t) {
  const b = room.bomb, task = p.hold;
  if (!task || !b || b.active !== p.id || !p.alive || Math.hypot(p.x - task.x, p.y - task.y) > 2) { cancelCode(room, p); return; }
  const result = advanceCode(task, key);
  if (result === 'ignored') return;
  if (result === 'fail') { b.progress = 0; sendTerminal(p, { code: task.code, index: 0, action: task.action, result: 'fail' }); return; }
  b.progress = task.index / task.code.length;
  if (result === 'ok') { sendTerminal(p, { code: task.code, index: task.index, action: task.action, result: 'ok' }); return; }
  const action = task.action;
  cancelCode(room, p);
  if (action === 'defuse') {
    b.state = 'defused'; p.money = Math.min(ECON.max, p.money + 300);
    emitFx(room, { k: 'defuse', x: b.x, y: b.y });
    emitFx(room, { k: 'banner', text: `${p.name} обезвредил тапок` });
    finishRound(room, 1, t);
  } else {
    b.state = 'planted'; b.carrier = null; b.plantedAt = t; b.x = p.x; b.y = p.y;
    p.money = Math.min(ECON.max, p.money + 300);
    emitFx(room, { k: 'plant', x: b.x, y: b.y });
    emitFx(room, { k: 'banner', text: 'ЯДЕРНЫЙ ТАПОК ЗАПРОГРАММИРОВАН' });
  }
}

function bombStep(room, t) {
  const b = room.bomb;
  if (!b || ['defused', 'boom'].includes(b.state)) return;
  if (b.state === 'carried') {
    const carrier = room.players.get(b.carrier);
    if (carrier?.alive) { b.x = carrier.x; b.y = carrier.y; }
  }
  if (b.state === 'planted' && t - b.plantedAt >= 35000) {
    b.state = 'boom'; b.progress = 0;
    const spec = SHOP.bomb_tapok || {};
    const radius = spec.r || 320, maxDamage = spec.dmg || 600;
    for (const p of room.players.values()) {
      const distance = Math.hypot(p.x - b.x, p.y - b.y);
      if (p.alive && distance < radius) damage(room, null, p, maxDamage * (1 - distance / radius));
    }
    emitFx(room, { k: 'boom', x: b.x, y: b.y, r: radius });
    finishRound(room, 0, t);
    return;
  }
  for (const p of room.players.values()) {
    if (p.hold && (!p.alive || Math.hypot(p.x - p.hold.x, p.y - p.hold.y) > 2)) cancelCode(room, p);
    if (p.bot && p.input.g) {
      if (!p.hold) startCode(room, p, t);
      else if (t >= p.hold.nextKey) { p.hold.nextKey = t + 400; codeInput(room, p, p.hold.code[p.hold.index], t); }
    }
  }
}

function npcStep(room, t) {
  const gun = SHOP.babka_seeds || NPC.babka_seeds || { dmg: 12, rate: 800, speed: 700, range: 350, r: 5, emoji: '🌻' };
  for (const n of room.npcs) {
    if (!n.alive || t < n.nextShot) continue;
    let target = room.players.get(n.lastHit);
    if (!target?.alive || !near(n, target, gun.range) || inSmoke(n, target, room.zones)) {
      target = null; let best = gun.range * gun.range;
      for (const p of room.players.values()) {
        const d = (p.x - n.x) ** 2 + (p.y - n.y) ** 2;
        if (p.alive && d < best && !inSmoke(n, p, room.zones)) { best = d; target = p; }
      }
    }
    if (!target) continue;
    n.target = target.id; n.nextShot = t + gun.rate;
    const angle = Math.atan2(target.y - n.y, target.x - n.x);
    room.shots.push({ id: uid++, owner: n.id, team: -1, x: n.x, y: n.y,
      vx: Math.cos(angle) * gun.speed, vy: Math.sin(angle) * gun.speed,
      r: gun.r, left: gun.range, dmg: gun.dmg, emoji: gun.emoji || '🌻' });
  }
}

// --- тик ---
function step(room, dt) {
  const t = now();
  if (room.phase === 'buy' && t > room.phaseUntil) { room.phase = 'playing'; room.phaseUntil = t + ROUND_MS; emitFx(room, { k: 'banner', text: 'FIGHT!' }); }
  if (room.phase === 'roundEnd' && t > room.phaseUntil) {
    if (room.winner !== null) room.phase = 'matchEnd';
    else resetRound(room);
  }
  if (!['buy', 'playing'].includes(room.phase)) return;

  room.walls = room.walls.filter((w) => w.until > t);
  room.zones = room.zones.filter((z) => z.until > t);

  for (const p of room.players.values()) {
    if (ffa(room) && !p.alive && t >= p.respawnAt) {
      spawn(room, p, Math.floor(Math.random() * 4)); p.hp = CHARS[p.char].hp; p.alive = true; p.st = {};
      Object.assign(p, { vx: 0, vy: 0, z: 0, vz: 0, hop: 0, hasJumped: false, jumpHeld: false, lastLand: -Infinity, grenade: null, grenades: { coffee: false, smoke: false }, turret: null });
      p.weapon = pistol(); p.cd = { a: 0, q: 0, e: 0, r: 0 };
    }
    if (!p.alive) continue;
    if (p.bot && room.phase === 'playing') botThink(room, p);
    if (room.phase === 'playing' && has(p, 'bleed')) damage(room, null, p, 40 * dt);
    if (!p.alive) continue;
    if (has(p, 'stun') || has(p, 'root')) continue;
    let sp = CHARS[p.char].speed;
    if (has(p, 'slow')) sp *= 0.5;
    if (has(p, 'haste')) sp *= 1.6;
    if (has(p, 'jitter')) sp *= 1.25;
    // 2D шлёт клавиши u/d/l/r, 3D — вектор mx/my относительно взгляда
    let mx = (p.input.r ? 1 : 0) - (p.input.l ? 1 : 0), my = (p.input.d ? 1 : 0) - (p.input.u ? 1 : 0);
    if (Number.isFinite(p.input.mx) && Number.isFinite(p.input.my)) { mx = clamp(p.input.mx, -1, 1); my = clamp(p.input.my, -1, 1); }
    const m = Math.hypot(mx, my);
    if (m) { mx /= m; my /= m; }
    if (p.turret) { mx = 0; my = 0; p.vx = 0; p.vy = 0; p.input.j = 0; }
    // ввод кода как плент в КС: стоишь намертво, нажал движение = отменил
    if (p.hold) { if (m) cancelCode(room, p); else { p.vx = 0; p.vy = 0; p.input.j = 0; } }
    const moveFx = movePlayer(p, dt, mx, my, sp, map, fieldW, fieldH, PR, t);
    if (p.recoil) p.recoil = Math.max(0, p.recoil - dt * 0.12);
    if (moveFx.jumped) emitFx(room, { k: moveFx.hopped ? 'hop' : 'jump', x: p.x, y: p.y });
    if (moveFx.landed) emitFx(room, { k: 'land', x: p.x, y: p.y });
    if (p.hold && Math.hypot(p.x - p.hold.x, p.y - p.hold.y) > 2) cancelCode(room, p);
    for (const w of room.walls) {
      const d = Math.hypot(p.x - w.x, p.y - w.y), min = PR + w.r;
      if (d < min && d > 0) { p.x = w.x + ((p.x - w.x) / d) * min; p.y = w.y + ((p.y - w.y) / d) * min; }
    }
    if (!p.bot && p.input.ax !== undefined) p.ang = Math.atan2(p.input.ay - p.y, p.input.ax - p.x);
  }

  if (room.phase !== 'playing') {
    if (room.bomb?.state === 'carried') { const carrier = room.players.get(room.bomb.carrier); if (carrier) { room.bomb.x = carrier.x; room.bomb.y = carrier.y; } }
    return;
  }

  bombStep(room, t);
  if (room.phase !== 'playing') return;
  npcStep(room, t);

  for (const p of room.players.values()) {
    if (!p.pull || !p.alive) continue;
    const caster = room.players.get(p.pull.by);
    if (!caster?.alive || t >= p.pull.until || !pullTarget(p, caster, dt, map, PR)) p.pull = null;
  }

  // снаряды
  room.shots = room.shots.filter((s) => {
    let slow = 1;
    for (const p of room.players.values()) if (p.alive && p.team !== s.team && has(p, 'slowmo') && near(p, s, p.slowmoR || 150)) { slow = 0.25; break; }
    const x0 = s.x, y0 = s.y, dx = s.vx * dt * slow, dy = s.vy * dt * slow;
    s.x += dx; s.y += dy; s.left -= Math.hypot(dx, dy);
    if (s.left <= 0 || s.x < 0 || s.x > fieldW || s.y < 0 || s.y > fieldH) return false;
    const impact = firstSolidHit(x0, y0, s.x, s.y, s.r, map);
    if (impact) {
      s.x = x0 + dx * impact.t; s.y = y0 + dy * impact.t;
      if (s.bounce > 0) {
        const v = reflect(s.vx, s.vy, impact.axis);
        s.vx = v.vx; s.vy = v.vy; s.bounce--;
        s.x += Math.sign(s.vx) * 0.1; s.y += Math.sign(s.vy) * 0.1;
      } else { ignite(room, s, s.x, s.y); return false; }
    }
    for (const w of room.walls) if (Math.hypot(s.x - w.x, s.y - w.y) < s.r + w.r) return false;
    for (const o of room.players.values()) {
      if (o.alive && o.team !== s.team && !(s.hit && s.hit.has(o.id)) && segDist(o, x0, y0, s.x, s.y) < PR + s.r) {
        if (has(o, 'deflect')) { deflectShot(s, o); return true; }
        damage(room, room.players.get(s.owner), o, s.dmg, s.fx);
        if (s.hook && o.alive) o.pull = { by: s.owner, until: t + 250 };
        if (s.hit) s.hit.add(o.id);
        ignite(room, s, s.x, s.y);
        if (s.pierce > 0) { s.pierce--; continue; }
        return false;
      }
    }
    if (s.team >= 0) for (const n of room.npcs) {
      if (n.alive && !(s.hit && s.hit.has(n.id)) && segDist(n, x0, y0, s.x, s.y) < 24 + s.r) {
        const src = room.players.get(s.owner);
        if (src) damageNpc(room, src, n, s.dmg);
        if (s.hit) s.hit.add(n.id);
        ignite(room, s, s.x, s.y);
        if (s.pierce > 0) { s.pierce--; continue; }
        return false;
      }
    }
    return true;
  });

  // отложенные взрывы
  room.pending = room.pending.filter((b) => {
    if (b.follow) { const f = room.players.get(b.follow); if (f && f.alive) { b.x = f.x; b.y = f.y; } }
    if (b.at > t) return true;
    const src = room.players.get(b.owner);
    if (b.kind === 'coffee' || b.kind === 'smoke') {
      room.zones.push({ id: uid++, kind: b.kind, x: b.x, y: b.y, r: b.kind === 'coffee' ? 110 : 130,
        until: t + (b.kind === 'coffee' ? 4000 : 8000), team: b.team, owner: b.owner });
      emitFx(room, { k: b.kind, x: b.x, y: b.y, r: b.kind === 'coffee' ? 110 : 130 });
      return false;
    }
    if (src) aoeHit(room, src, b.x, b.y, b.r, b.dmg, b.fx);
    if (src && b.lob) for (const n of room.npcs) if (n.alive && near(n, b, b.r + 24)) damageNpc(room, src, n, b.dmg);
    if (b.ignite) ignite(room, b, b.x, b.y);
    emitFx(room, { k: 'boom', x: b.x, y: b.y, r: b.r });
    return false;
  });

  // зоны и ловушки
  room.zones = room.zones.filter((z) => {
    if (z.kind === 'coffee') {
      applyCoffee(room.players.values(), z, t, (o) => emitFx(room, { k: 'feed', text: `${o.name} словил кофеиновый тремор`, x: o.x, y: o.y }));
      return true;
    }
    for (const o of room.players.values()) {
      if (!o.alive || o.team === z.team || Math.hypot(o.x - z.x, o.y - z.y) > z.r + PR) continue;
      if (z.kind === 'smoke') continue;
      else if (z.kind === 'zone') applyFx(o, z.fx);
      else if (z.kind === 'fire') { if (t >= z.nextHit) damage(room, room.players.get(z.owner), o, z.dmg); }
      else { damage(room, room.players.get(z.owner), o, z.dmg, z.fx); emitFx(room, { k: 'boom', x: z.x, y: z.y, r: 60 }); return false; }
    }
    if (z.kind === 'fire' && t >= z.nextHit) {
      const src = room.players.get(z.owner);
      if (src) for (const n of room.npcs) if (n.alive && near(n, z, z.r + 24)) damageNpc(room, src, n, z.dmg);
    }
    if (z.kind === 'fire' && t >= z.nextHit) z.nextHit = t + 250;
    return true;
  });

  if (ffa(room)) {
    let leader = null;
    for (const p of room.players.values()) if (!leader || p.kills > leader.kills) leader = p;
    if (leader && (leader.kills >= (room.mode === 'zal' ? 20 : 10) || t >= room.phaseUntil)) {
      room.winner = leader.team; room.phase = 'matchEnd'; emitFx(room, { k: 'banner', text: `${leader.name} затащил дезматч` });
    }
    return;
  }

  // конец раунда с бомбой
  const alive = [0, 0];
  for (const p of room.players.values()) if (p.alive) alive[p.team]++;
  const timeout = t > room.phaseUntil;
  if (!alive[1] && !(room.bomb?.state === 'planted')) finishRound(room, 0, t);
  else if (!alive[0] && room.bomb?.state !== 'planted') finishRound(room, 1, t);
  else if (timeout && room.bomb?.state !== 'planted') finishRound(room, 1, t);
}

function snapshot(room) {
  const t = now();
  return {
    phase: room.phase, mode: room.mode, score: room.score, winner: room.winner,
    timer: ['buy', 'playing'].includes(room.phase) ? Math.max(0, Math.ceil(((room.bomb?.state === 'planted' ? room.bomb.plantedAt + 35000 : room.phaseUntil) - t) / 1000)) : 0,
    players: [...room.players.values()].map((p) => ({
      id: p.id, name: p.name, team: p.team, char: p.char, ready: p.ready, bot: p.bot,
      x: Math.round(p.x), y: Math.round(p.y), hp: Math.round(p.hp), alive: p.alive, ang: +p.ang.toFixed(2), kills: p.kills,
      money: p.money, tokens: p.tokens, forging: !!p.forging,
      // оружие с 3D-моделью весит ~300 байт: шлём только при смене, клиент держит кэш
      ...(room.sentW.get(p.id) !== p.weapon && room.sentW.set(p.id, p.weapon) ? { weapon: p.weapon } : {}),
      z: Math.round(p.z), hop: p.hop || 0, spr: +inaccuracy(p).toFixed(3), grenade: p.grenade, grenades: p.grenades, turret: p.turret,
      cd: Object.fromEntries(Object.entries(p.cd).map(([k, v]) => [k, Math.max(0, v - t)])),
      st: Object.fromEntries(Object.entries(p.st).filter(([, v]) => v > t).map(([k, v]) => [k, v - t])),
    })),
    shots: room.shots.map((s) => ({ x: Math.round(s.x), y: Math.round(s.y), r: s.r, team: s.team, emoji: s.emoji, a: +Math.atan2(s.vy, s.vx).toFixed(2), f: s.fast ? 1 : 0 })),
    pending: room.pending.map((b) => ({ x: Math.round(b.x), y: Math.round(b.y), r: b.r, left: b.at - t })),
    zones: room.zones.map((z) => ({ x: Math.round(z.x), y: Math.round(z.y), r: z.r, kind: z.kind, team: z.team, emoji: z.emoji })),
    walls: room.walls.map((w) => ({ x: Math.round(w.x), y: Math.round(w.y), r: w.r })),
    drops: room.drops.map((d) => ({ id: d.id, x: Math.round(d.x), y: Math.round(d.y), emoji: d.weapon.emoji, name: d.weapon.name })),
    npcs: room.npcs.map((n) => ({ id: n.id, kind: n.kind, x: Math.round(n.x), y: Math.round(n.y), hp: Math.round(n.hp), maxHp: n.maxHp, alive: n.alive, target: n.target })),
    turrets: room.turrets.map((v) => ({ id: v.id, by: v.by, heat: Math.max(0, v.heat - t) })),
    bomb: room.bomb && { state: room.bomb.state, x: Math.round(room.bomb.x), y: Math.round(room.bomb.y),
      carrier: room.bomb.carrier, plantedAt: room.bomb.plantedAt, progress: +room.bomb.progress.toFixed(2),
      left: room.bomb.state === 'planted' ? Math.max(0, Math.ceil((room.bomb.plantedAt + 35000 - t) / 1000)) : 0 },
  };
}

let last = now();
function runTick() {
  const t = now(), dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  for (const room of rooms.values()) {
    step(room, dt);
    // volatile: забитый сокет пропускает кадр, а не копит очередь из старых снапшотов
    // зал: 30 человек × 30 Гц забивают канал, шлём каждый второй тик
    if (room.mode === 'zal' && (room.tick = (room.tick || 0) + 1) % 2) continue;
    io.to(room.code).volatile.emit('state', snapshot(room));
  }
}
if (require.main === module) setInterval(runTick, 1000 / TICK);

io.on('connection', (sock) => {
  let room = null;
  const me = () => room && room.players.get(sock.id);
  // null от клиента превращаем в undefined, чтобы сработали дефолты `= {}`; исключение в обработчике не роняет процесс
  const on = sock.on.bind(sock);
  sock.on = (ev, fn) => on(ev, (...args) => {
    const fail = (e) => console.error(`[sock ${ev}]`, e && e.message);
    try { const r = fn(...args.map((v) => (v === null ? undefined : v))); if (r && r.catch) r.catch(fail); } catch (e) { fail(e); }
  });

  sock.on('join', ({ code, name, mode } = {}) => {
    code = String(code || 'arena').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || 'arena';
    const r = getRoom(code, mode);
    const late = r.mode === 'zal' && ['buy', 'playing'].includes(r.phase);
    if (r.players.size >= slots(r) || (r.phase !== 'lobby' && !late)) return sock.emit('nope', 'Комната занята или бой уже идёт');
    room = r;
    sock.join(code);
    const np = addPlayer(room, sock.id, name);
    if (late) {
      // опоздавший в зал: случайный персонаж, деньги дезматча, появится на следующем тике через респаун
      np.char = CHAR_IDS[Math.floor(Math.random() * CHAR_IDS.length)]; np.ready = true;
      resetEconomy(np, room); np.alive = false; np.respawnAt = 0;
    }
    room.sentW.clear();  // новичок должен получить оружие всех
    sock.emit('meta', { you: sock.id, W: fieldW, H: fieldH, code, mode: room.mode, map: map.id, skills: SKILLS });
  });
  sock.on('pick', (cid) => { const p = me(); if (p && CHARS[cid] && room.phase === 'lobby') { p.char = cid; tryStart(room); } });
  sock.on('ready', () => { const p = me(); if (p && p.char) { p.ready = !p.ready; tryStart(room); } });
  sock.on('team', () => {
    const p = me(); if (!p || room.phase !== 'lobby' || ffa(room)) return;
    const other = 1 - p.team, half = slots(room) / 2;
    if ([...room.players.values()].filter((o) => o.team === other).length < half) p.team = other;
  });
  // режим и ботов меняет только хост: первый живой человек в комнате
  const isHost = () => !!room && [...room.players.values()].find((o) => !o.bot)?.id === sock.id;
  sock.on('mode', (mode) => {
    if (!isHost() || room.phase !== 'lobby' || !MODES.includes(mode)) return;
    if (room.players.size > slots({ mode })) return sock.emit('nope', 'Слишком много игроков для этого режима');
    room.mode = mode;
    let i = 0;
    for (const p of room.players.values()) p.team = mode === 'dm' || mode === 'zal' ? (room.nextTeam = (room.nextTeam || 0) + 1) : i++ % 2;
  });
  sock.on('start', () => { if (isHost()) tryStart(room, true); });
  sock.on('addBot', () => {
    if (!isHost() || room.phase !== 'lobby' || room.players.size >= slots(room)) return;
    addPlayer(room, 'bot' + uid++, BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)], true);
    tryStart(room);
  });
  sock.on('input', (inp) => {
    const p = me(); if (!p || typeof inp !== 'object') return;
    const n = (v, d) => (v != null && Number.isFinite(+v) ? +v : d);
    // mx/my без значения остаются undefined, иначе вектор 0 глушит WASD
    p.input = { u: !!inp.u, d: !!inp.d, l: !!inp.l, r: !!inp.r, j: !!inp.j, g: !!inp.g, ax: n(inp.ax, 0), ay: n(inp.ay, 0), mx: n(inp.mx), my: n(inp.my) };
  });
  sock.on('terminal', () => { const p = me(); if (p) startCode(room, p, now()); });
  sock.on('code', ({ key } = {}) => { const p = me(); if (p) codeInput(room, p, key, now()); });
  sock.on('turret', () => {
    const p = me(); if (!p?.alive || room.phase !== 'playing') return;
    if (p.turret) { const v = room.turrets.find((v) => v.id === p.turret); if (v) v.by = null; p.turret = null; return; }
    const v = room.turrets.find((v) => !v.by && near(p, v, 50));
    if (v) { v.by = p.id; p.turret = v.id; p.vx = 0; p.vy = 0; p.x = v.x; p.y = v.y; emitFx(room, { k: 'turret', x: v.x, y: v.y }); }
  });
  sock.on('grenade', ({ x, y, kind } = {}) => {
    const p = me(); if (!p?.alive || room.phase !== 'playing') return;
    // 4 кофе, 5 дым, как слоты гранат в КС; без kind летит та, что выбрана
    if (kind === 'coffee' || kind === 'smoke') { if (!p.grenades[kind]) return; p.grenade = kind; }
    if (!p.grenade || !p.grenades[p.grenade]) return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const w = SHOP[p.grenade], ang = Math.atan2(y - p.y, x - p.x);
    const len = Math.min(w.range, Math.hypot(x - p.x, y - p.y));
    room.pending.push({ kind: p.grenade, x: clamp(p.x + Math.cos(ang) * len, 0, fieldW), y: clamp(p.y + Math.sin(ang) * len, 0, fieldH),
      r: p.grenade === 'coffee' ? 110 : 130, dmg: 0, owner: p.id, team: p.team, at: now() + Math.round(1000 * len / w.speed), lob: true });
    p.grenades[p.grenade] = false;
    p.grenade = p.grenades.coffee ? 'coffee' : p.grenades.smoke ? 'smoke' : null;
  });
  sock.on('cast', ({ slot, x, y } = {}) => {
    const p = me();
    if (p && room.phase === 'playing' && ['a', 'q', 'e', 'r'].includes(slot)) cast(room, p, slot, +x || 0, +y || 0);
  });
  sock.on('buy', (wid) => {
    const p = me();
    if (!p || !p.alive || !['buy', 'playing'].includes(room.phase)) return;
    let kiosk = false;
    for (const shop of map.shops || []) if (inCircle(p, shop) && shop.items.includes(wid)) kiosk = true;
    const w = kiosk ? KIOSK[wid] || SHOP[wid] : SHOP[wid];
    if (!w || w.noShop || (!kiosk && room.phase !== 'buy' && room.mode !== 'dm') || p.money < w.price) return;
    if (w.grenade && p.grenades[wid]) return;
    p.money -= w.price;
    if (w.grenade) { p.grenades[wid] = true; p.grenade = wid; }
    else p.weapon = { ...normalize(w), id: wid };
  });
  sock.on('buyToken', () => {
    const p = me();
    if (!p || (room.phase !== 'buy' && !(ffa(room) && room.phase === 'playing')) || p.money < ECON.token) return;
    p.money -= ECON.token; p.tokens++;
  });
  sock.on('forge', async (prompt) => {
    const p = me();
    if (!p || p.tokens < 1 || p.forging || !['buy', 'playing'].includes(room.phase)) return;
    p.tokens--; p.forging = true;
    const r = room;
    const w = await forge(prompt);
    p.forging = false;
    if (!r.players.has(p.id)) return;
    p.weapon = { ...w, id: 'forged' + uid++, prompt: String(prompt).slice(0, 80) };
    emitFx(r, { k: 'forged', who: p.name, team: p.team, weapon: p.weapon });
  });
  sock.on('pickup', () => {
    const p = me();
    if (!p || !p.alive || room.phase !== 'playing') return;
    if (p.team === 0 && room.bomb?.state === 'dropped' && near(p, room.bomb, 70)) {
      room.bomb.state = 'carried'; room.bomb.carrier = p.id; room.bomb.x = p.x; room.bomb.y = p.y;
      return;
    }
    const d = room.drops.find((d) => Math.hypot(d.x - p.x, d.y - p.y) < 70);
    if (!d) return;
    room.drops = room.drops.filter((x) => x !== d);
    if (p.weapon.id !== 'pistol') room.drops.push({ id: uid++, x: p.x, y: p.y, weapon: p.weapon });
    p.weapon = d.weapon;
  });
  sock.on('rematch', () => {
    if (!room || room.phase !== 'matchEnd') return;
    room.phase = 'lobby';
    for (const p of room.players.values()) p.ready = p.bot;
  });
  sock.on('disconnect', () => {
    if (!room) return;
    const p = me(); if (p) {
      cancelCode(room, p);
      if (p.turret) { const v = room.turrets.find((v) => v.id === p.turret); if (v) v.by = null; }
    }
    room.players.delete(sock.id);
    const humans = [...room.players.values()].filter((p) => !p.bot);
    if (!humans.length) rooms.delete(room.code);
    else if (room.phase !== 'lobby' && room.mode !== 'zal') room.phase = 'lobby', room.players.forEach((p) => (p.ready = p.bot));
  });
});

if (require.main === module) server.listen(PORT, () => console.log(`brainrot battle: http://localhost:${PORT}`));
module.exports = { SKILLS, step, snapshot, getRoom, addPlayer, cast, codeInput, startCode, map, PR };
