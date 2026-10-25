'use strict';
// Проверяет исследовательские JSON по реальному LIM и normalize, не меняя файлы.
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const root = path.resolve(__dirname, '..', '..');
const { LIM, normalize } = require(path.join(root, 'web/public/weapons.js'));
const load = name => JSON.parse(fs.readFileSync(path.join(__dirname, name), 'utf8'));
const memes = load('memes.json');
const weapons = load('weapons.json');
const skills = load('skills.json');
const types = new Set(['shot', 'aoe', 'dash', 'heal', 'buff', 'zone', 'trap', 'wall', 'blink', 'barrage', 'markAll', 'random']);

// Не позволяет потерять кандидатов или незаметно продублировать id.
function uniqueIds(rows, label) {
  assert(Array.isArray(rows), label + ' must be an array');
  assert.equal(new Set(rows.map(r => r.id)).size, rows.length, label + ': duplicate id');
  rows.forEach(r => assert.match(r.id, /^[a-z0-9_]+$/, label + ': invalid id'));
}

// Проверяет параметры именно тех типов, которые читает текущий сервер.
function checkSkill(s, label) {
  assert(types.has(s.type), label + ': unknown type');
  assert.equal(typeof s.label, 'string', label);
  assert(Number.isFinite(s.cd) && s.cd > 0, label + ': cd');
  const required = {
    shot: ['dmg', 'speed', 'r', 'range'],
    aoe: ['r', 'dmg', 'delay'],
    dash: ['dist', 'dmg'],
    heal: ['r', 'amount'],
    zone: ['r', 'ms'],
    trap: ['r', 'ms', 'dmg'],
    wall: ['len', 'ms'],
    blink: ['dmg'],
    barrage: ['count', 'r', 'dmg', 'over'],
    markAll: ['r', 'dmg', 'delay'],
    random: []
  }[s.type] || [];
  required.forEach(k => assert(Number.isFinite(s[k]) && s[k] >= 0, label + ': ' + k));
  if (s.type === 'aoe') assert(['cursor', 'self'].includes(s.at), label + ': at');
  if (s.type === 'buff') assert(['haste', 'invuln', 'stealth'].some(k => s[k] > 0), label + ': empty buff');
  if (s.type === 'random') assert(['qe', 'r'].includes(s.pool), label + ': pool');
  if (s.type === 'shot' && s.count > 1) assert(Number.isFinite(s.spread), label + ': spread');
  if (s.fx) for (const [k, v] of Object.entries(s.fx)) {
    assert(['stun', 'root', 'slow', 'bleed'].includes(k), label + ': unknown status');
    assert(Number.isFinite(v) && v >= 0, label + ': invalid status');
  }
}

uniqueIds(memes, 'memes');
uniqueIds(weapons, 'weapons');
uniqueIds(skills, 'skills');
assert(memes.length >= 25, 'need at least 25 memes');
assert(weapons.length >= 30, 'need at least 30 weapons');
assert.equal(skills.length, 20, 'need 20 skill ideas');
for (const c of memes) {
  for (const k of ['name', 'emoji', 'role', 'shout', 'lang', 'why_funny'])
    assert.equal(typeof c[k], 'string', c.id + ': ' + k);
  assert(c.hp >= 700 && c.hp <= 1400, c.id + ': hp');
  assert(c.speed >= 230 && c.speed <= 330, c.id + ': speed');
  assert(c.source === null || /^https:\/\//.test(c.source), c.id + ': source');
  assert(c.peak === null || /^\d{4}-(0[1-9]|1[0-2])$/.test(c.peak), c.id + ': peak');
  assert.deepEqual(Object.keys(c.skills).sort(), ['a', 'e', 'q', 'r'], c.id + ': slots');
  for (const [slot, s] of Object.entries(c.skills)) {
    checkSkill(s, c.id + '.' + slot);
    assert.notEqual(s.type, 'random', c.id + ': random must not enter the current recursive pool');
  }
}
skills.forEach(s => {
  checkSkill(s, 'skills.' + s.id);
  assert.equal(s.new_type, false);
  if (s.type === 'random') assert(s.integration_note, 'random needs integration guard note');
});

let maxDps = 0;
const table = [];
for (const w of weapons) {
  for (const k of ['dmg', 'rate', 'speed', 'range', 'r', 'count', 'spread']) {
    assert(Number.isFinite(w[k]), w.id + ': ' + k);
    assert(w[k] >= LIM[k][0] && w[k] <= LIM[k][1], w.id + ': LIM.' + k);
  }
  assert(Number.isInteger(w.count), w.id + ': count');
  assert(w.price >= 500 && w.price <= 5000, w.id + ': price');
  assert(w.name.length <= 32, w.id + ': name truncates');
  assert(w.lore.length <= 120, w.id + ': lore truncates');
  assert(w.source === null || /^https:\/\//.test(w.source), w.id + ': source');
  if (w.fx) for (const [k, v] of Object.entries(w.fx)) {
    assert(LIM[k], w.id + ': unknown fx');
    assert(Number.isFinite(v) && v >= LIM[k][0] && v <= LIM[k][1], w.id + ': LIM.fx.' + k);
  }
  if (w.fx && (w.fx.stun || w.fx.root)) assert(w.rate >= 550, w.id + ': control rate');
  const dps = w.dmg * w.count * 1000 / w.rate;
  assert(dps <= 300, w.id + ': DPS > 300');
  if (w.fx) assert(dps <= 225, w.id + ': status weapon budget > 225');
  const normalized = normalize(w);
  for (const k of ['name', 'emoji', 'dmg', 'rate', 'speed', 'range', 'r', 'count', 'spread', 'lore'])
    assert.deepEqual(normalized[k], w[k], w.id + ': normalize changes ' + k);
  assert.deepEqual(normalized.fx || {}, w.fx || {}, w.id + ': normalize changes fx');
  assert(normalized.dmg * normalized.count * 1000 / normalized.rate <= 300, w.id + ': normalized DPS');
  maxDps = Math.max(maxDps, dps);
  table.push(w.id.padEnd(20) + dps.toFixed(2).padStart(8) + '  PASS');
}
console.log('JSON parse: PASS (memes.json, weapons.json, skills.json)');
console.log('Characters: ' + memes.length + ' >= 25, unique ids, HP 700..1400, speed 230..330: PASS');
console.log('Skill ideas: ' + skills.length + ', supported types ' + new Set(skills.map(s => s.type)).size + '/12: PASS');
console.log('Weapons: ' + weapons.length + ' >= 30, games: ' + new Set(weapons.map(w => w.origin_game)).size + ': PASS');
console.log('LIM, price, names, lore, fx, normalize identity: PASS');
console.log('DPS = dmg * count * 1000 / rate; count defaults to 1.');
console.log('ID                       DPS  RESULT');
table.forEach(line => console.log(line));
console.log('Maximum direct DPS: ' + maxDps.toFixed(2) + ' <= 300: PASS');
console.log('Status weapon direct DPS <= 225: PASS');
console.log('Network source checks are recorded in sources.json; this validator does not test URL availability.');
