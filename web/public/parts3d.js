import * as THREE from '/vendor/three.module.js';

const geometryCache = new Map();
const materialCache = new Map();
const projectileCache = new Map();
const trails = new WeakMap();
const MAX_POINTS = 500;

function geometry(shape) {
  if (!geometryCache.has(shape)) {
    const geo = {
      box: () => new THREE.BoxGeometry(1, 1, 1),
      cyl: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
      sphere: () => new THREE.SphereGeometry(0.5, 10, 6),
      cone: () => new THREE.ConeGeometry(0.5, 1, 8),
      torus: () => new THREE.TorusGeometry(0.35, 0.12, 6, 12),
      arrow: () => new THREE.ConeGeometry(0.35, 1, 6),
      disc: () => new THREE.CylinderGeometry(0.5, 0.5, 0.12, 12),
      slipper: () => new THREE.BoxGeometry(1, 0.2, 0.5),
    }[shape] || (() => new THREE.SphereGeometry(0.5, 10, 6));
    geometryCache.set(shape, geo());
  }
  return geometryCache.get(shape);
}

function material(color) {
  const key = /^#[0-9a-fA-F]{6}$/.test(color || '') ? color.toLowerCase() : '#888888';
  if (!materialCache.has(key)) materialCache.set(key, new THREE.MeshStandardMaterial({ color: key }));
  return materialCache.get(key);
}

export function buildWeapon(model) {
  const group = new THREE.Group();
  for (const part of (model?.parts || []).slice(0, 6)) {
    const mesh = new THREE.Mesh(geometry(part.shape), material(part.color));
    mesh.scale.set(...part.size);
    mesh.position.set(...part.pos);
    group.add(mesh);
  }
  return group;
}

// One shared InstancedMesh per recipe. Caller sets matrices and count for active shots.
export function buildProjectile(model) {
  const kind = model?.projectile || 'ball';
  const color = model?.parts?.[0]?.color || '#888888';
  const key = JSON.stringify([kind, color]);
  if (!projectileCache.has(key)) {
    const shape = kind === 'emoji' || kind === 'ball' ? 'sphere' : kind;
    const mesh = new THREE.InstancedMesh(geometry(shape), material(color), 128);
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    projectileCache.set(key, mesh);
  }
  return projectileCache.get(key);
}

// One Points buffer per scene and kind; emit/update never allocate particle meshes.
export function trailFx(scene, kind = 'none') {
  if (kind === 'none') return { emit() {}, update() {} };
  let byKind = trails.get(scene);
  if (!byKind) { byKind = new Map(); trails.set(scene, byKind); }
  if (byKind.has(kind)) return byKind.get(kind);

  const positions = new Float32Array(MAX_POINTS * 3);
  for (let i = 0; i < MAX_POINTS; i++) positions[i * 3 + 1] = -10000;
  const life = new Float32Array(MAX_POINTS);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setDrawRange(0, MAX_POINTS);
  const colors = { fire: '#ff6b24', ice: '#a6e9ff', smoke: '#858585', sparkle: '#ffe87a' };
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    color: colors[kind] || '#ffffff', size: 0.09, transparent: true, opacity: 0.8, depthWrite: false,
  }));
  scene.add(points);
  let cursor = 0;
  const api = {
    points,
    emit(x, y, z) {
      const i = cursor++ % MAX_POINTS;
      positions.set([x, y, z], i * 3);
      life[i] = 1;
      geo.attributes.position.needsUpdate = true;
    },
    update(dt) {
      const decay = Math.max(0, Number(dt) || 0) / 1000;
      for (let i = 0; i < MAX_POINTS; i++) {
        if (life[i] <= 0) continue;
        life[i] -= decay;
        if (life[i] <= 0) positions[i * 3 + 1] = -10000;
        else positions[i * 3 + 1] += decay * 0.35;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
  byKind.set(kind, api);
  return api;
}
