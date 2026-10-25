'use strict';

const { SHOP, KIOSK, NPC, MAX_DPS, normalize } = require('../public/weapons.js');
const weapons = { ...SHOP, ...KIOSK, ...NPC };
let failed = false;

console.log('id                    DPS    TTK 1400   TTK 700');
for (const [id, raw] of Object.entries(weapons)) {
  const w = normalize(raw);
  const fire = w.ignite ? w.ignite.dps * w.ignite.ms / 1000 : 0;
  const damagePerShot = w.dmg * w.count + fire;
  const dps = damagePerShot * 1000 / w.rate;
  const ttk = hp => Math.ceil(hp / damagePerShot) * w.rate / 1000;
  const tank = ttk(1400);
  const light = ttk(700);
  console.log(`${id.padEnd(21)} ${dps.toFixed(1).padStart(5)}  ${tank.toFixed(2).padStart(8)}s  ${light.toFixed(2).padStart(7)}s`);
  if (dps > MAX_DPS + 1e-9 || tank < 4.5 || (id === 'pistol' && Math.abs(tank - 15) > 2)) failed = true;
  if (!w.model || !w.model.parts.length) failed = true;
}

const malformed = normalize({ model: { parts: new Array(20).fill({ shape: 'lol' }) } });
if (!malformed.model.parts.length || malformed.model.parts.some(p => p.shape === 'lol')) failed = true;
console.log(failed ? 'FAIL: баланс или модель' : 'PASS: DPS <= 300, TTK танка >= 4.5s, пистолет около 15s, fallback модели');
if (failed) process.exitCode = 1;
