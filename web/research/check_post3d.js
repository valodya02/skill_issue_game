const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../public/post3d.js'), 'utf8');
const shader = source.match(/export const FRAGMENT_SHADER = \/\* glsl \*\/ `([\s\S]*?)`;/)?.[1];
assert.ok(shader && shader.includes('void main()'), 'GLSL source must assemble as a string');
assert.ok(!shader.includes('${'), 'GLSL template must not contain substitutions');
for (const name of ['Hit','Coffee','Smoke','Slowmo','Boom','Death','Lift','Gamma','Gain','Saturation','Contrast','Shadow','Highlight','Toning','Vignette','Grain','Posterize','Scanline','ChannelShift','Outline']) {
  assert.match(shader, new RegExp(`uniform\\s+\\w+\\s+u${name}\\s*;`), `GLSL uniform u${name}`);
}
const fakeVector = class { constructor(x = 0, y = 0) { this.x = x; this.y = y; } set(...values) { [this.x, this.y, this.z] = values; } };
const THREE = {
  WebGLRenderTarget: class { constructor() { this.texture = {}; } setSize() {} dispose() {} },
  DepthTexture: class { dispose() {} }, UnsignedIntType: 1, LinearFilter: 1,
  Vector2: fakeVector, Vector3: fakeVector,
  ShaderMaterial: class { dispose() {} },
  BufferGeometry: class { setAttribute() {} dispose() {} },
  Float32BufferAttribute: class {},
  Scene: class { add() {} }, Mesh: class {}, Camera: class {},
};
const script = source.replace(/^import .*;\s*/m, '').replace(/^export /gm, '') + '\n({ PRESETS, createPost, FRAGMENT_SHADER })';
const { PRESETS, createPost, FRAGMENT_SHADER } = vm.runInNewContext(script, { THREE });
assert.equal(FRAGMENT_SHADER, shader);
const keys = Object.keys(PRESETS.autumn).sort();
for (const name of ['autumn', 'night', 'vhs', 'off']) assert.deepEqual(Object.keys(PRESETS[name]).sort(), keys, `${name} preset keys`);
const renderer = { capabilities: { isWebGL2: false }, getContext: () => ({ getExtension: () => null }), getDrawingBufferSize: () => ({ x: 800, y: 450 }) };
const post = createPost(renderer, {}, {}, { outline: true });
assert.doesNotThrow(() => post.kick('unknown', 1));
for (const kind of ['hit','coffee','smoke','slowmo','boom','death']) assert.doesNotThrow(() => post.kick(kind, 1));
post.dispose();
console.log('post3d: GLSL assembled, uniforms declared, preset keys complete, unknown kick safe');
