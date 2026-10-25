// Inspect every vendored GLB without external packages.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../../public/models/vendor');

function filesIn(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? filesIn(full) : full.endsWith('.glb') ? [full] : [];
  });
}

function inspect(file) {
  const bytes = fs.readFileSync(file);
  if (bytes.length < 20 || bytes.toString('ascii', 0, 4) !== 'glTF') throw Error('invalid GLB header');
  if (bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw Error('invalid GLB version or length');
  let offset = 12;
  let doc;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    offset += 8;
    if (offset + length > bytes.length) throw Error('truncated GLB chunk');
    if (type === 0x4e4f534a) doc = JSON.parse(bytes.toString('utf8', offset, offset + length));
    offset += length;
  }
  if (!doc) throw Error('JSON chunk missing');
  let vertices = 0;
  let tris = 0;
  for (const mesh of doc.meshes || []) for (const primitive of mesh.primitives || []) {
    const count = doc.accessors?.[primitive.attributes?.POSITION]?.count || 0;
    vertices += count;
    const indices = primitive.indices === undefined ? count : doc.accessors?.[primitive.indices]?.count || 0;
    const mode = primitive.mode ?? 4;
    tris += mode === 4 ? Math.floor(indices / 3) : (mode === 5 || mode === 6 ? Math.max(0, indices - 2) : 0);
  }
  return { meshes: (doc.meshes || []).length, vertices, tris, skin: (doc.skins || []).length > 0 };
}

let failed = false;
for (const file of filesIn(root).sort()) {
  try {
    const s = inspect(file);
    console.log(`${path.relative(root, file).replaceAll('\\', '/')} meshes=${s.meshes} vertices=${s.vertices} tris=${s.tris} skin=${s.skin}`);
  } catch (error) {
    failed = true;
    console.error(`${file}: ${error.message}`);
  }
}
if (failed) process.exitCode = 1;
