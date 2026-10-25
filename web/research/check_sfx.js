const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { SHOP } = require('../public/weapons.js');

const directory = path.join(__dirname, '../public/sfx');
const files = fs.readdirSync(directory);
const total = files.reduce((size, file) => size + fs.statSync(path.join(directory, file)).size, 0);
assert.ok(total <= 600 * 1024, `sfx/ size ${total} exceeds 600 KiB`);

let checked = 0;
for (const [id, weapon] of Object.entries(SHOP)) {
  if (!weapon.sfx) continue;
  for (const kind of ['shot', 'reload']) {
    const name = weapon.sfx[kind];
    assert.match(name, /^[a-z0-9_]+$/, `${id}.${kind} has invalid sample name`);
    const file = name + '.mp3';
    assert.ok(files.includes(file), `${id}.${kind} refers to missing ${file}`);
    checked++;
  }
}
assert.equal(checked, 10, 'expected shot and reload for five firearms');
console.log(`SFX OK: ${checked} mappings, ${files.length} files, ${total} bytes (limit 614400)`);
