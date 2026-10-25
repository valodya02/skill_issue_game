import * as THREE from '/vendor/three.module.js';

const SCALE = 40;
const wx = x => x / SCALE - 20;
const wz = y => y / SCALE - 11.25;

export async function buildMap(scene, map) {
  const group = new THREE.Group();
  group.name = `map-${map.id}`;
  scene.add(group);
  const owned = new Set();
  const batches = new Map();
  const materials = new Map();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(0.5, 0.5, 1, 7);
  const cone = new THREE.ConeGeometry(0.5, 1, 7);
  owned.add(box); owned.add(cylinder); owned.add(cone);

  function material(color) {
    if (!materials.has(color)) {
      const m = new THREE.MeshLambertMaterial({ color, flatShading: true });
      materials.set(color, m);
      owned.add(m);
    }
    return materials.get(color);
  }
  function instance(shape, color, x, y, z, sx, sy, sz, solid = false, ry = 0) {
    const key = `${shape}:${color}:${solid}`;
    if (!batches.has(key)) batches.set(key, { shape, color, solid, transforms: [] });
    batches.get(key).transforms.push({ x, y, z, sx, sy, sz, ry });
  }
  function block(color, x, y, w, h, height, solid = false, base = 0) {
    instance('box', color, wx(x + w / 2), base + height / 2, wz(y + h / 2), w / SCALE, height, h / SCALE, solid);
  }
  // radius в пикселях карты, высота в юнитах
  function pole(color, x, y, radius, height, solid = false) {
    instance('cylinder', color, wx(x), height / 2, wz(y), radius * 2 / SCALE, height, radius * 2 / SCALE, solid);
  }
  function crown(color, x, y, radius, height, base) {
    instance('cone', color, wx(x), base + height / 2, wz(y), radius * 4 / SCALE, height, radius * 4 / SCALE);   // тополь чуть пышнее хитбокса
  }
  function canvasTexture(draw, w = 512, h = 256) {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    draw(canvas.getContext('2d'), w, h);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    owned.add(texture);
    return texture;
  }
  const windows = canvasTexture((ctx, w, h) => {
    ctx.fillStyle = '#aaa99d'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#898c88';
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 12; col++) {
        const x = 16 + col * 42, y = 22 + row * 45;
        ctx.fillStyle = (row * 13 + col * 7) % 9 < 2 ? '#eac982' : '#455967';
        ctx.fillRect(x, y, 24, 25);
        ctx.fillStyle = '#d8d5c7'; ctx.fillRect(x + 11, y, 2, 25);
        if ((row + col) % 4 === 0) {
          ctx.fillStyle = '#706f6a'; ctx.fillRect(x - 3, y + 26, 31, 4);
          ctx.fillStyle = '#686d6b'; ctx.fillRect(x + 28, y + 7, 8, 10);
        }
      }
    }
    ctx.fillStyle = '#727e80';
    for (let col = 1; col < 12; col += 4) ctx.fillRect(col * 42 + 9, 15, 2, 224);
  });
  const facadeMaterial = new THREE.MeshLambertMaterial({ map: windows, side: THREE.DoubleSide });
  owned.add(facadeMaterial);
  function facade(o) {
    const geometry = new THREE.PlaneGeometry(o.w / SCALE, o.height * 0.86);
    owned.add(geometry);
    const mesh = new THREE.Mesh(geometry, facadeMaterial);
    mesh.position.set(wx(o.x + o.w / 2), o.height * 0.54, wz(o.y + o.h) + 0.012);
    group.add(mesh);
  }
  function sign(label, x, y, width, height, color) {
    const texture = canvasTexture((ctx, w, h) => {
      ctx.fillStyle = color; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fff4d7'; ctx.font = 'bold 39px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, w / 2, h / 2, w - 20);
    });
    const geometry = new THREE.PlaneGeometry(width, height);
    const signMaterial = new THREE.MeshLambertMaterial({ map: texture, side: THREE.DoubleSide });
    owned.add(geometry); owned.add(signMaterial);
    const mesh = new THREE.Mesh(geometry, signMaterial);
    mesh.position.set(wx(x), height + 1.6, wz(y));
    group.add(mesh);
  }

  block('#809078', 0, 0, map.W, map.H, 0.12);
  block('#6f7475', 0, 402, map.W, 126, 0.015, false, 0.07);
  block('#757a76', 730, 0, 145, map.H, 0.012, false, 0.075);
  block('#a4a89b', 0, 375, map.W, 24, 0.025, false, 0.07);
  block('#a4a89b', 0, 532, map.W, 24, 0.025, false, 0.07);
  for (let i = 0; i < 7; i++) block('#e7e4cc', 1360 + i * 29, 393, 13, 145, 0.015, false, 0.09);
  for (const o of map.solid || []) {
    const colors = { panelka: '#a9a79d', garage: '#798780', shop: '#c5a881', kiosk: '#9d4840', priora: '#35424a', fence: '#777b73', wall: '#9b998f' };
    block(colors[o.kind] || '#8b8c82', o.x, o.y, o.w, o.h, o.height, true);
    if (o.kind === 'panelka') facade(o);
    if (o.kind === 'garage') block('#a05e49', o.x + 9, o.y + o.h - 1, o.w - 18, 2, o.height * 0.72);
    if (o.kind === 'priora') {
      block('#222e35', o.x + 27, o.y + 9, o.w - 54, o.h - 18, 0.25, false, o.height);
      for (const dx of [18, o.w - 18]) for (const dy of [8, o.h - 8]) pole('#25262a', o.x + dx, o.y + dy, 6, 0.28);
    }
  }
  for (const o of map.low || []) {
    if (o.kind === 'lada') {
      block('#b5b39d', o.x, o.y, o.w, o.h, o.height);
      block('#d2d1b7', o.x + 19, o.y + 6, o.w - 38, o.h - 12, 0.35, false, o.height);
      for (const dx of [15, o.w - 15]) for (const dy of [7, o.h - 7]) pole('#5a4d44', o.x + dx, o.y + dy, 5, 0.55);
    } else if (o.kind === 'sandbox') {
      block('#d3b37f', o.x, o.y, o.w, o.h, o.height);
      block('#e1c58f', o.x + 5, o.y + 5, o.w - 10, o.h - 10, 0.04, false, o.height);
    } else if (o.kind === 'slide') {
      block('#ca6c53', o.x, o.y, o.w, o.h, 0.16, false, 0.75);
      pole('#777c7b', o.x + 10, o.y + 10, 2, 1.7);
      pole('#777c7b', o.x + o.w - 10, o.y + o.h - 10, 2, 1.7);
    } else if (o.kind === 'swing') {
      for (const dx of [5, o.w - 5]) pole('#9c644c', o.x + dx, o.y + 5, 2, o.height);
      block('#a95d4c', o.x + 4, o.y + 3, o.w - 8, 3, 0.09, false, o.height);
      block('#b99a61', o.x + 22, o.y + 17, 26, 9, 0.08, false, 0.65);
    } else if (o.kind === 'bench') {
      block('#96694d', o.x, o.y, o.w, o.h, 0.13, false, 0.45);
      block('#96694d', o.x, o.y, o.w, 3, 0.5, false, 0.55);
    } else if (o.kind === 'bush') {
      block('#587d49', o.x, o.y, o.w, o.h, o.height);
    } else block('#aa9980', o.x, o.y, o.w, o.h, o.height);
  }
  for (const o of map.decor || []) {
    if (o.kind === 'poplar') {
      pole('#74664f', o.x, o.y, 4, 3.5);
      crown('#578657', o.x, o.y, 16, 4, 2.4);
    } else if (o.kind === 'lamp') {
      pole('#565c5a', o.x, o.y, 2, 4.2);
      instance('box', '#f2daa2', wx(o.x), 4.25, wz(o.y), 0.36, 0.17, 0.36);
    } else if (o.kind === 'trash') {
      pole('#58616a', o.x, o.y, 5, 0.65);
    } else if (o.kind === 'graffiti') {
      block('#b16262', o.x, o.y, 28, 2, 0.22, false, 0.8);
    } else if (o.kind === 'wall') {
      pole('#925c48', o.x - 18, o.y, 2, 2);
      pole('#925c48', o.x + 18, o.y, 2, 2);
      block('#925c48', o.x - 18, o.y - 2, 36, 4, 0.09, false, 2);
    }
  }
  sign('Шестёрочка', 145, 346, 5.2, 0.7, '#b44742');
  sign('Красное и Бухое', 657, 641, 3.6, 0.57, '#893b37');
  for (const b of batches.values()) {
    const geometry = b.shape === 'cylinder' ? cylinder : b.shape === 'cone' ? cone : box;
    const mesh = new THREE.InstancedMesh(geometry, material(b.color), b.transforms.length);
    mesh.castShadow = b.solid;
    mesh.receiveShadow = b.solid;
    mesh.frustumCulled = false;
    const dummy = new THREE.Object3D();
    b.transforms.forEach((t, i) => {
      dummy.position.set(t.x, t.y, t.z);
      dummy.rotation.set(0, t.ry, 0);
      dummy.scale.set(t.sx, t.sy, t.sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }
  let disposed = false;
  return { group, dispose() {
    if (disposed) return;
    disposed = true;
    scene.remove(group);
    for (const item of owned) item.dispose();
    group.clear();
  } };
}
