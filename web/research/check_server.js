const assert = require('node:assert/strict');
const { circleRect, moveCircle, shotRect, firstSolidHit, reflect } = require('../lib/physics.js');

const wall = { x: 100, y: 100, w: 20, h: 80 };
const decor = { x: 45, y: 100, w: 20, h: 80 };
const low = { x: 160, y: 100, w: 20, h: 80 };

assert.equal(circleRect(95, 140, 10, wall), true);
assert.equal(moveCircle(70, 140, 25, 0, 10, [wall]).x, 90, 'solid blocks player circle');
assert.equal(moveCircle(70, 140, 150, 0, 10, [wall]).x, 90, 'dash cannot skip a wall');
assert.equal(moveCircle(20, 140, 55, 0, 10, [wall]).x, 75, 'decor does not block player');
assert.equal(moveCircle(130, 140, 35, 0, 10, [wall], [low]).x, 150, 'low blocks player');
assert.ok(shotRect(70, 140, 130, 140, 3, wall), 'solid stops projectile');
assert.equal(shotRect(130, 140, 190, 140, 3, wall), null, 'shot does not hit wall behind it');
assert.ok(shotRect(130, 140, 190, 140, 3, low), 'low has geometry');
assert.ok(firstSolidHit(70, 140, 130, 140, 3, { solid: [wall], low: [low] }), 'bullet stops at solid');
assert.equal(firstSolidHit(130, 140, 190, 140, 3, { solid: [], low: [low] }), null, 'bullet passes low');
const xHit = shotRect(70, 140, 130, 140, 3, wall);
assert.equal(xHit.axis, 'x');
assert.deepEqual(reflect(10, 4, xHit.axis), { vx: -10, vy: 4 }, 'ricochet flips x velocity');
const yHit = shotRect(110, 70, 110, 130, 3, wall);
assert.equal(yHit.axis, 'y');
assert.deepEqual(reflect(10, 4, yHit.axis), { vx: 10, vy: -4 }, 'ricochet flips y velocity');
console.log('check_server: 14 physics checks passed');
