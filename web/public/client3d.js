// 3D-слой боевого клиента. Логика и ввод остаются в client.js, отсюда только картинка.
// client.js отдаёт состояние через window.GAME_VIEW, сюда шлёт fx; 2D-холст сверху рисует HUD и подписи.
import * as THREE from '/vendor/three.module.js';
import { buildMap } from './map3d.js';
import { applyLook, toonMaterial, sky, fog, lights } from './look3d.js';
import { createPost } from './post3d.js';

const SCALE = 40;
const wx = (x) => x / SCALE - 20;
const wz = (y) => y / SCALE - 11.25;
const TEAM = ['#36c5ff', '#ff4f7b', '#b7fa6a', '#c59aff'];
const COLORS = {
  'синий': '#3b6fd8', 'золотой': '#e0b23a', 'чёрный': '#26262b', 'зелёный': '#3fae4a', 'бордовый': '#7a1f2e',
  'красный': '#d63a3a', 'белый': '#eeeeee', 'тёмно-красный': '#8e2323', 'серый': '#8a8a8a', 'песочный': '#d8b77a',
  'голубой': '#7cc6ee', 'оливковый': '#6b7a3a', 'коричневый': '#6e4a2c', 'тёмно-синий': '#23345e', 'оранжевый': '#f08a24',
  'фиолетовый': '#7d4ad0', 'бирюзовый': '#2ec4b6',
};
const color = (name, fallback = '#999999') => COLORS[name] || fallback;

const params = new URLSearchParams(location.search);
const gl2 = (() => { try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; } })();
let on = gl2 && params.get('3d') !== '0';

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.info.autoReset = false;
renderer.domElement.id = 'cv3d';
renderer.domElement.style.cssText = 'position:fixed;inset:0;z-index:0';
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.5, 600);
const post = createPost(renderer, scene, camera, { outline: true, preset: 'off' });
sky(scene); fog(scene, 'autumn');
const world = new THREE.Group();
scene.add(world);

// ---------- общие геометрии и материалы, ноль аллокаций в кадре ----------
const G = {
  body: new THREE.CylinderGeometry(0.3, 0.36, 0.9, 7),
  head: new THREE.BoxGeometry(0.42, 0.4, 0.4),
  box: new THREE.BoxGeometry(1, 1, 1),
  cone: new THREE.ConeGeometry(0.5, 1, 7),
  sphere: new THREE.SphereGeometry(0.5, 8, 6),
  ring: new THREE.RingGeometry(0.62, 0.8, 20).rotateX(-Math.PI / 2),
  disc: new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2),
  shadow: new THREE.CircleGeometry(0.45, 14).rotateX(-Math.PI / 2),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
};
const matCache = new Map();
const mat = (hex, extra) => {
  const key = hex + (extra ? JSON.stringify(extra) : '');
  if (!matCache.has(key)) matCache.set(key, toonMaterial(hex, extra));
  return matCache.get(key);
};
const flat = (hex, opacity) => new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity, depthWrite: false });
const MAT = {
  skin: mat('#e8b896'), dark: mat('#2a2a30'), shadow: flat('#000000', 0.35),
  team: TEAM.map((c) => flat(c, 0.9)), me: flat('#ffffff', 0.95),
  zone: { fire: flat('#ff572a', 0.4), zone: flat('#3fbf5a', 0.25), coffee: flat('#8a5a2b', 0.35), trap: flat('#ffd23f', 0.2), smoke: flat('#7d8086', 0.88) },
  pending: flat('#ff3b3b', 0.35), wall: mat('#8b5a2b'), bomb: mat('#3a7bd5'), drop: mat('#ffd23f'),
  granny: mat('#8e4c7a'), scarf: mat('#d9d0b8'), turret: mat('#5f6b73'), turretHot: mat('#ff543c'), turretBusy: mat('#ffd23f'),
};

function mesh(geo, material, sx = 1, sy = 1, sz = 1, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.scale.set(sx, sy, sz); m.position.set(x, y, z);
  m.castShadow = material.isMeshToonMaterial;
  return m;
}

// Персонаж: низкополигональный болванчик в цветах ростера, шапка по model.hat.
function hat(kind, accent) {
  const a = mat(accent), g = new THREE.Group();
  if (kind === 'кепка') { g.add(mesh(G.box, a, 0.46, 0.12, 0.44, 0, 1.36, 0)); g.add(mesh(G.box, a, 0.3, 0.04, 0.22, 0, 1.31, 0.3)); }
  else if (kind === 'очки') g.add(mesh(G.box, MAT.dark, 0.44, 0.09, 0.06, 0, 1.18, 0.21));
  else if (kind === 'маска') g.add(mesh(G.box, a, 0.44, 0.24, 0.06, 0, 1.12, 0.21));
  else if (kind === 'колпак') g.add(mesh(G.cone, a, 0.48, 0.55, 0.48, 0, 1.6, 0));
  else if (kind === 'капюшон') g.add(mesh(G.box, a, 0.5, 0.48, 0.48, 0, 1.2, -0.04));
  else if (kind === 'каска') g.add(mesh(G.sphere, a, 0.52, 0.32, 0.52, 0, 1.36, 0));
  else if (kind === 'шлем') g.add(mesh(G.sphere, a, 0.56, 0.56, 0.56, 0, 1.2, 0));
  else if (kind === 'наушники') { g.add(mesh(G.cyl, a, 0.14, 0.08, 0.14, -0.24, 1.2, 0).rotateZ(Math.PI / 2)); g.add(mesh(G.cyl, a, 0.14, 0.08, 0.14, 0.24, 1.2, 0).rotateZ(Math.PI / 2)); }
  return g;
}

function makePlayer(char) {
  const c = window.CHARS?.[char] || {};
  const body = mat(color(c.model?.color, '#888888')), accent = color(c.model?.accent, '#dddddd');
  const root = new THREE.Group();
  const shadow = mesh(G.shadow, MAT.shadow, 1, 1, 1, 0, 0.02, 0);
  const ring = mesh(G.ring, MAT.team[0], 1, 1, 1, 0, 0.03, 0);
  const rig = new THREE.Group();                    // прыгает и качается
  rig.add(mesh(G.body, body, 1, 1, 1, 0, 0.55, 0));
  rig.add(mesh(G.head, MAT.skin, 1, 1, 1, 0, 1.2, 0));
  rig.add(mesh(G.box, mat(accent), 0.62, 0.14, 0.4, 0, 0.92, 0));   // плечи
  rig.add(hat(c.model?.hat, accent));
  const gun = mesh(G.box, MAT.dark, 0.1, 0.1, 0.6, 0.3, 0.75, 0.3);
  rig.add(gun);
  root.add(shadow, ring, rig);
  world.add(root);
  return { root, ring, rig, shadow, gun, x: 0, z: 0, h: 0, ang: 0, char, seen: 0 };
}

function makeGranny() {
  const root = new THREE.Group();
  root.add(mesh(G.cone, MAT.granny, 0.7, 0.9, 0.7, 0, 0.45, 0));
  root.add(mesh(G.head, MAT.skin, 0.9, 0.9, 0.9, 0, 1.06, 0));
  root.add(mesh(G.sphere, MAT.scarf, 0.48, 0.34, 0.48, 0, 1.2, -0.03));
  world.add(root);
  return { root, x: 0, z: 0, seen: 0 };
}

// Пулы: объект живёт, пока сервер его присылает; пропал из snapshot, значит прячем.
const players = new Map(), grannies = new Map(), turrets = new Map();
let frameNo = 0;
function sweep(pool) { for (const o of pool.values()) o.root.visible = o.seen === frameNo; }

// Снаряды, зоны, круги закладки: по одному InstancedMesh на тип.
function instanced(geo, material, n) {
  const m = new THREE.InstancedMesh(geo, material, n);
  m.count = 0; m.frustumCulled = false;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  world.add(m);
  return m;
}
const shots = instanced(G.sphere, new THREE.MeshBasicMaterial({ color: '#ffffff' }), 256);
shots.setColorAt(0, new THREE.Color());
const zones = Object.fromEntries(Object.entries(MAT.zone).map(([k, m]) => [k, instanced(k === 'smoke' ? G.sphere : G.disc, m, 32)]));
const pendings = instanced(G.disc, MAT.pending, 32);
const walls = instanced(G.cyl, MAT.wall, 32);
const drops = instanced(G.box, MAT.drop, 32);
const bomb = mesh(G.box, MAT.bomb, 0.6, 0.18, 0.32);
world.add(bomb);

const M4 = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S3 = new THREE.Vector3(), C = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
function put(im, i, x, y, z, sx, sy, sz, ry = 0) {
  P.set(x, y, z); Q.setFromAxisAngle(UP, ry); S3.set(sx, sy, sz);
  im.setMatrixAt(i, M4.compose(P, Q, S3));
}
function flush(im, n) { im.count = n; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }

// ---------- карта ----------
let builtFor = null;
async function ensureMap(map) {
  if (!map || builtFor === map) return;
  builtFor = map;
  scene.userData.map = map;
  const built = await buildMap(scene, map);
  lights(scene, 'autumn');
  applyLook(built.group);              // только карта: снаряды и зоны остаются прозрачными MeshBasic
  for (const v of map.turrets || []) {
    const root = new THREE.Group();
    const top = new THREE.Group();
    top.add(mesh(G.box, MAT.turret, 0.8, 0.5, 0.8, 0, 0.55, 0));
    top.add(mesh(G.cyl, MAT.dark, 0.14, 1.1, 0.14, 0, 0.7, 0.6).rotateX(Math.PI / 2));
    root.add(mesh(G.cyl, MAT.dark, 0.3, 0.4, 0.3, 0, 0.2, 0), top);
    root.position.set(wx(v.x), 0, wz(v.y));
    top.rotation.y = Math.PI / 2 - v.ang * Math.PI / 180;
    world.add(root);
    turrets.set(v.id, { root, top, base: top.children[0] });
  }
  fitCamera();
}

// ---------- камера: всё поле в кадре, сверху-сзади, лёгкий наезд на своего ----------
const focus = new THREE.Vector3();
let camDist = 30, shake = 0;
function fitCamera() {
  const aspect = innerWidth / Math.max(1, innerHeight - 70);
  const halfV = THREE.MathUtils.degToRad(camera.fov / 2);
  const needH = Math.max(22.5 * 1.05, 40 * 1.05 / aspect);   // поле 40×22.5 юнитов
  camDist = needH / 2 / Math.tan(halfV) * 0.92;
}
const PITCH = THREE.MathUtils.degToRad(58);
function placeCamera(dt, me) {
  const tx = me ? THREE.MathUtils.clamp(wx(me.x) * 0.15, -3, 3) : 0;
  const tz = me ? THREE.MathUtils.clamp(wz(me.y) * 0.15, -2, 2) : 0;
  const k = 1 - Math.exp(-dt * 3);
  focus.x += (tx - focus.x) * k; focus.z += (tz - focus.z) * k;
  const sx = (Math.random() - 0.5) * shake * 0.04, sz = (Math.random() - 0.5) * shake * 0.04;
  shake *= Math.exp(-dt * 8);
  camera.position.set(focus.x + sx, Math.sin(PITCH) * camDist, focus.z + Math.cos(PITCH) * camDist + sz);
  camera.lookAt(focus.x + sx, 0, focus.z + sz);
}

// ---------- кадр ----------
const stats = document.createElement('div');
stats.style.cssText = 'position:fixed;right:12px;top:40px;z-index:4;padding:8px;background:#000a;color:#cfe;font:12px monospace;white-space:pre;display:none;pointer-events:none';
document.body.append(stats);
let last = performance.now(), fpsT = 0, fpsN = 0, fps = 0;
let prevHp = null, prevAlive = true;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  renderer.domElement.style.display = on ? 'block' : 'none';
  if (!on) return;
  const V = window.GAME_VIEW;
  const S = V?.S, meta = V?.meta;
  ensureMap(V?.map);
  if (!S || !meta || !builtFor) { renderer.setRenderTarget(null); renderer.render(scene, camera); return; }
  frameNo++;
  const k = 1 - Math.exp(-dt * 18);                 // сглаживание между тиками 30 Гц
  const me = S.players.find((p) => p.id === meta.you);

  for (const p of S.players) {
    if (!p.char) continue;
    let o = players.get(p.id);
    if (!o || o.char !== p.char) { if (o) world.remove(o.root); o = makePlayer(p.char); o.x = wx(p.x); o.z = wz(p.y); players.set(p.id, o); }
    const hidden = p.st?.stealth && me && p.team !== me.team;
    o.seen = hidden ? -1 : frameNo;
    o.x += (wx(p.x) - o.x) * k; o.z += (wz(p.y) - o.z) * k;
    o.h += ((p.z || 0) / SCALE - o.h) * k;
    let da = (Math.PI / 2 - p.ang) - o.ang; da = Math.atan2(Math.sin(da), Math.cos(da));
    o.ang += da * k;
    o.root.position.set(o.x, 0, o.z);
    o.rig.position.y = o.h;
    o.rig.rotation.y = o.ang;
    o.rig.rotation.x = p.alive ? 0 : -Math.PI / 2;
    o.rig.position.y = p.alive ? o.h : 0.2;
    o.ring.material = p.id === meta.you ? MAT.me : MAT.team[p.team] || MAT.team[0];
    o.shadow.scale.setScalar(1 - Math.min(0.5, o.h * 0.3));
    o.screen = p;
  }
  sweep(players);

  for (const n of S.npcs || []) {
    let o = grannies.get(n.id);
    if (!o) { o = makeGranny(); o.x = wx(n.x); o.z = wz(n.y); grannies.set(n.id, o); }
    o.seen = n.alive ? frameNo : -1;
    o.x += (wx(n.x) - o.x) * k; o.z += (wz(n.y) - o.z) * k;
    o.root.position.set(o.x, 0, o.z);
  }
  sweep(grannies);

  for (const v of S.turrets || []) {
    const o = turrets.get(v.id);
    if (o) o.base.material = v.heat ? MAT.turretHot : v.by ? MAT.turretBusy : MAT.turret;
  }

  let n = 0;
  for (const s of S.shots) {
    if (n >= 256) break;
    const r = Math.max(0.12, s.r / SCALE);
    put(shots, n, wx(s.x), 0.75, wz(s.y), r * 2, r * 2, r * 2);
    shots.setColorAt(n++, C.set(TEAM[s.team] || '#ffe3a0'));
  }
  flush(shots, n);
  const zc = {}; for (const kk in zones) zc[kk] = 0;
  for (const z of S.zones) {
    const kind = zones[z.kind] ? z.kind : 'zone', r = z.r / SCALE, i = zc[kind]++;
    if (i >= 32) continue;
    if (kind === 'smoke') put(zones.smoke, i, wx(z.x), 0.6, wz(z.y), r * 2, r * 1.1, r * 2, now * 0.0002);
    else put(zones[kind], i, wx(z.x), 0.04 + i * 0.001, wz(z.y), r, 1, r);
  }
  for (const kk in zones) flush(zones[kk], Math.min(32, zc[kk]));
  n = 0; for (const b of S.pending) { if (n < 32) put(pendings, n++, wx(b.x), 0.05, wz(b.y), b.r / SCALE, 1, b.r / SCALE); } flush(pendings, n);
  n = 0; for (const w of S.walls) { if (n < 32) put(walls, n++, wx(w.x), 0.6, wz(w.y), w.r / SCALE * 2, 1.2, w.r / SCALE * 2); } flush(walls, n);
  n = 0; for (const d of S.drops) { if (n < 32) put(drops, n++, wx(d.x), 0.35 + Math.sin(now * 0.004) * 0.1, wz(d.y), 0.35, 0.35, 0.35, now * 0.002); } flush(drops, n);
  const b = S.bomb;
  bomb.visible = !!b && !['defused', 'boom', 'carried'].includes(b.state);
  if (bomb.visible) bomb.position.set(wx(b.x), 0.12, wz(b.y));

  // пост-эффекты от своего состояния
  if (me) {
    if (prevHp !== null && me.hp < prevHp) post.kick('hit', Math.min(1, (prevHp - me.hp) / 60));
    if (prevAlive && !me.alive) post.kick('death', 1);
    if (me.st?.jitter) post.kick('coffee', 0.8);
    if (me.st?.slowmo) post.kick('slowmo', 0.6);
    prevHp = me.hp; prevAlive = me.alive;
  }

  placeCamera(dt, me);
  renderer.info.reset();
  post.render(dt);
  if (stats.style.display !== 'none') {
    fpsN++; fpsT += dt;
    if (fpsT >= 0.5) { fps = fpsN / fpsT; fpsN = 0; fpsT = 0; }
    const i = renderer.info.render;
    stats.textContent = `3D  FPS ${fps.toFixed(0)}\ncalls ${i.calls}\ntris ${i.triangles}\npost ${post.gpuMs != null ? post.gpuMs.toFixed(2) + ' мс' : '—'}\npx ${renderer.getPixelRatio()}`;
  }
}
requestAnimationFrame(frame);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  post.resize(size.x, size.y);
  fitCamera();
});
addEventListener('keydown', (e) => {
  if (e.code === 'F9') { e.preventDefault(); if (gl2) on = !on; }
  if (e.code === 'F3') { e.preventDefault(); stats.style.display = stats.style.display === 'none' ? 'block' : 'none'; }
});

// ---------- API для client.js ----------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.75), hit = new THREE.Vector3();
const proj = new THREE.Vector3();
window.GAME3D = {
  get on() { return on && !!builtFor; },
  // экран → мир сервера (px), прицел на высоте груди
  pick(cx, cy) {
    ndc.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (!ray.ray.intersectPlane(plane, hit)) return { x: 0, y: 0 };
    return { x: (hit.x + 20) * SCALE, y: (hit.z + 11.25) * SCALE };
  },
  // мир сервера (px) + высота в юнитах → экран (css px), для подписей на 2D-холсте
  project(x, y, h = 0) {
    proj.set(wx(x), h, wz(y)).project(camera);
    return { x: (proj.x + 1) / 2 * innerWidth, y: (1 - proj.y) / 2 * innerHeight, front: proj.z < 1 };
  },
  fx(f) {
    if (!on) return;
    if (f.k === 'boom') { post.kick('boom', 1); shake = Math.max(shake, 12); }
    if (f.k === 'kill') shake = Math.max(shake, 8);
    if (f.k === 'ult') shake = Math.max(shake, 14);
    if (f.k === 'smoke') post.kick('smoke', 0.5);
  },
};
