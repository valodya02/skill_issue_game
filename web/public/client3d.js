// 3D-слой боевого клиента. Логика и ввод остаются в client.js, отсюда только картинка.
// client.js отдаёт состояние через window.GAME_VIEW, сюда шлёт fx; 2D-холст сверху рисует HUD и подписи.
import * as THREE from '/vendor/three.module.js';
import { buildMap } from './map3d.js';
import { applyLook, toonMaterial, sky, fog, lights } from './look3d.js';
import { createPost } from './post3d.js';
import { buildWeapon } from './parts3d.js';

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
const GROUND = 0.12;                                 // верх плиты земли в map3d.js
const BODY = 1.5;                                   // рост болванчика ~2.1 юнита при радиусе сервера 28 px
const EYE = 1.75;
const world = new THREE.Group();
world.position.y = GROUND;                          // всё динамическое стоит на земле, а не в ней
scene.add(world);
scene.add(camera);

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
  rig.scale.setScalar(BODY);
  root.add(shadow, ring, rig);
  world.add(root);
  return { root, ring, rig, shadow, gun, x: 0, z: 0, h: 0, ang: 0, char, seen: 0 };
}

function makeGranny() {
  const root = new THREE.Group();
  root.scale.setScalar(BODY);
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
// Пули огнестрела: тонкий светящийся трассер вдоль полёта, а не шарик
const tracers = instanced(G.box, new THREE.MeshBasicMaterial({ color: '#ffe9a8', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }), 256);
const TRACER = 2.2;
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
let builtFor = null, mapGroup = null;
async function ensureMap(map) {
  if (!map || builtFor === map) return;
  builtFor = map;
  scene.userData.map = map;
  const built = await buildMap(scene, map);
  mapGroup = built.group;
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
const PITCH = THREE.MathUtils.degToRad(72);       // круче, чтобы панельки не закрывали игроков

// ---------- вид от первого лица: V переключает, клик захватывает мышь ----------
let fpView = params.get('view') !== 'top';
let yaw = 0, pitch = 0, yawSet = false;
// Прицел как в КС: четыре черты расходятся по разбросу сервера (бег, прыжок, отдача)
const cross = document.createElement('div');
cross.style.cssText = 'position:fixed;left:50%;top:50%;width:0;height:0;z-index:3;pointer-events:none;display:none';
const ticks = [[0, -1], [0, 1], [-1, 0], [1, 0]].map(([dx, dy]) => {
  const t = document.createElement('div');
  t.style.cssText = `position:absolute;background:#7dff8a;box-shadow:0 0 0 1px #000a;${dx ? 'width:8px;height:2px;top:-1px' : 'width:2px;height:8px;left:-1px'}`;
  t.dx = dx; t.dy = dy; cross.append(t);
  return t;
});
const dot = document.createElement('div');
dot.style.cssText = 'position:absolute;left:-1px;top:-1px;width:2px;height:2px;background:#7dff8a;box-shadow:0 0 0 1px #000a';
cross.append(dot);
document.body.append(cross);
let gap = 4;
function setGap(px) {
  gap += (px - gap) * 0.35;
  for (const t of ticks) {
    if (t.dx) t.style.left = (t.dx < 0 ? -gap - 8 : gap) + 'px';
    else t.style.top = (t.dy < 0 ? -gap - 8 : gap) + 'px';
  }
}
const hint = document.createElement('div');
hint.textContent = 'клик: захват мыши · V: вид сверху / от первого лица · Esc: отпустить';
hint.style.cssText = 'position:fixed;left:50%;top:58%;transform:translateX(-50%);z-index:3;pointer-events:none;color:#fff;font:600 14px system-ui;text-shadow:0 1px 3px #000;display:none';
document.body.append(hint);
const viewGun = new THREE.Group();                  // пушка в руке по model.parts текущего оружия, висит на камере
viewGun.scale.setScalar(0.3);
viewGun.position.set(0.2, -0.17, -0.42);
viewGun.visible = false;
camera.add(viewGun);
const hand = mesh(G.box, MAT.skin, 0.12, 0.14, 0.18, 0, -0.14, 0.22);  // кисть под рукоятью
let gunFor = null;
function setViewGun(w) {
  const key = w ? w.name + (w.model?.parts?.length || 0) : '';
  if (key === gunFor) return;
  gunFor = key;
  viewGun.clear();
  const parts = w?.model?.parts?.length ? buildWeapon(w.model) : null;
  if (parts) viewGun.add(parts);
  else { viewGun.add(mesh(G.box, MAT.dark, 0.09, 0.11, 0.55, 0, 0, 0)); viewGun.add(mesh(G.box, MAT.dark, 0.07, 0.16, 0.08, 0, -0.1, 0.12)); }
  viewGun.add(hand);
}
// граната в левой руке: видна, пока она есть; на 4 улетает вперёд
const viewNade = new THREE.Group();
const nadeBall = mesh(G.sphere, MAT.dark, 0.09, 0.11, 0.09, 0, 0, 0);
viewNade.add(nadeBall, mesh(G.box, MAT.skin, 0.08, 0.06, 0.1, 0, -0.07, 0.02), mesh(G.cyl, MAT.dark, 0.02, 0.03, 0.02, 0, 0.065, 0));
viewNade.position.set(-0.24, -0.2, -0.45);
viewNade.visible = false;
camera.add(viewNade);
let nadeFor = null, nadeThrow = 0;
addEventListener('keydown', (e) => { if (e.code === 'Digit4' && !e.repeat && locked()) nadeThrow = 1; });
const cv2d = document.getElementById('cv');
const locked = () => document.pointerLockElement === cv2d;
const shopOpen = () => { const el = document.getElementById('shop'); return el && !el.classList.contains('hidden'); };
cv2d?.addEventListener('click', () => { if (on && fpView && !locked() && !shopOpen()) cv2d.requestPointerLock?.(); });
addEventListener('mousemove', (e) => {
  if (!locked()) return;
  yaw += e.movementX * 0.0025;
  pitch = THREE.MathUtils.clamp(pitch - e.movementY * 0.0025, -1.1, 1.1);
});
let gunKick = 0;
addEventListener('mousedown', () => { if (locked()) gunKick = 1; });

function placeFps(dt, me, o) {
  if (!yawSet) { yaw = me.ang; yawSet = true; }  // первый кадр смотрит туда же, куда персонаж
  const h = o ? o.h : 0;
  // камера едет за сглаженной позицией, а не прыгает по снапшотам 30 Гц
  camera.position.set(o ? o.x : wx(me.x), GROUND + EYE + h + (me.alive ? 0 : -1.4), o ? o.z : wz(me.y));
  const cp = Math.cos(pitch);
  camera.lookAt(camera.position.x + Math.cos(yaw) * cp, camera.position.y + Math.sin(pitch), camera.position.z + Math.sin(yaw) * cp);
  if (shake > 0.01) { camera.rotation.z += (Math.random() - 0.5) * shake * 0.003; shake *= Math.exp(-dt * 8); }
  gunKick *= Math.exp(-dt * 14);
  const bob = Math.hypot(me.x - (placeFps.px ?? me.x), me.y - (placeFps.py ?? me.y)) > 0.5 && !h ? performance.now() * 0.012 : 0;
  placeFps.px = me.x; placeFps.py = me.y;
  viewGun.position.set(0.17 + Math.sin(bob) * 0.006, -0.16 + Math.abs(Math.cos(bob)) * 0.006 - h * 0.01, -0.42 + gunKick * 0.05);
  viewGun.rotation.x = gunKick * 0.25;
  nadeThrow = Math.max(0, nadeThrow - dt * 2.5);
  viewNade.position.set(-0.24 + nadeThrow * 0.1, -0.2 + Math.sin(nadeThrow * Math.PI) * 0.15, -0.45 - nadeThrow * 0.5);
}

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

  const firstPerson = fpView && me;
  if (firstPerson && camera.fov !== 75) { camera.fov = 75; camera.near = 0.05; camera.updateProjectionMatrix(); }
  if (!firstPerson && camera.fov !== 42) { camera.fov = 42; camera.near = 0.5; camera.updateProjectionMatrix(); fitCamera(); }
  if (locked() && (shopOpen() || S.phase !== 'playing' && S.phase !== 'buy')) document.exitPointerLock();
  cross.style.display = firstPerson ? 'block' : 'none';
  hint.style.display = firstPerson && !locked() && S.phase === 'playing' ? 'block' : 'none';
  viewGun.visible = !!(firstPerson && me.alive);
  if (viewGun.visible) setViewGun(me.turret ? null : me.weapon);
  viewNade.visible = !!(firstPerson && me.alive && me.grenade) || nadeThrow > 0.05;
  if (me?.grenade && me.grenade !== nadeFor) {
    nadeFor = me.grenade;
    nadeBall.material = mat(window.WEAPONS?.SHOP?.[me.grenade]?.model?.parts?.[0]?.color || '#556b2f');
  }
  if (firstPerson) setGap(4 + (me.spr || 0) * 260 + gunKick * 6);
  for (const p of S.players) {
    if (!p.char) continue;
    let o = players.get(p.id);
    if (!o || o.char !== p.char) { if (o) world.remove(o.root); o = makePlayer(p.char); o.x = wx(p.x); o.z = wz(p.y); players.set(p.id, o); }
    const hidden = p.st?.stealth && me && p.team !== me.team;
    o.seen = hidden ? -1 : frameNo;
    const kp = p.id === meta.you ? 1 - Math.exp(-dt * 30) : k;  // свой персонаж ближе к серверу
    o.x += (wx(p.x) - o.x) * kp; o.z += (wz(p.y) - o.z) * kp;
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
    if (o.wid !== (p.weapon?.id || '')) {               // оружие в руках из того же рецепта, что и вид от первого лица
      o.wid = p.weapon?.id || '';
      o.rig.remove(o.gun);
      o.gun = p.weapon?.model?.parts ? buildWeapon(p.weapon.model) : mesh(G.box, MAT.dark, 0.1, 0.1, 0.6, 0, 0, 0);
      o.gun.position.set(0.3, 0.75, 0.3); o.gun.rotation.y = Math.PI;  // ствол рецепта смотрит по -z, персонаж по +z
      o.rig.add(o.gun);
    }
    o.screen = p;
    if (p.id === meta.you) o.root.visible = !firstPerson;
  }
  sweep(players);
  if (firstPerson) { const mine = players.get(me.id); if (mine) mine.root.visible = false; }

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

  let n = 0, nt = 0;
  for (const s of S.shots) {
    if (s.f && nt < 256) {
      const ca = Math.cos(s.a || 0), sa = Math.sin(s.a || 0);
      put(tracers, nt++, wx(s.x) - ca * TRACER / 2, 1.6, wz(s.y) - sa * TRACER / 2, TRACER, 0.05, 0.05, -(s.a || 0));
      continue;
    }
    if (n >= 256) continue;
    const r = Math.max(0.12, s.r / SCALE);
    put(shots, n, wx(s.x), 1.1, wz(s.y), r * 2, r * 2, r * 2);
    shots.setColorAt(n++, C.set(TEAM[s.team] || '#ffe3a0'));
  }
  flush(shots, n); flush(tracers, nt);
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

  if (firstPerson) placeFps(dt, me, players.get(me.id)); else placeCamera(dt, me);
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
  if (e.code === 'KeyV' && e.target.tagName !== 'INPUT') { fpView = !fpView; if (!fpView && locked()) document.exitPointerLock(); }
  if (e.code === 'F3') { e.preventDefault(); stats.style.display = stats.style.display === 'none' ? 'block' : 'none'; }
});

// ---------- API для client.js ----------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(0.75 + GROUND)), hit = new THREE.Vector3();
const DIR = new THREE.Vector3(), TO = new THREE.Vector3();
const myPos = () => { const V = window.GAME_VIEW; return V?.S?.players.find((p) => p.id === V.meta?.you); };
const proj = new THREE.Vector3();
window.GAME3D = {
  get on() { return on && !!builtFor; },
  get fps() { return on && !!builtFor && fpView; },
  // WASD относительно взгляда → мировой вектор mx/my для сервера; вне FPS undefined, работают u/d/l/r
  move(keys) {
    if (!this.fps) return undefined;
    const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), r = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    return { mx: Math.cos(yaw) * f - Math.sin(yaw) * r, my: Math.sin(yaw) * f + Math.cos(yaw) * r };
  },
  // виден ли с камеры кусок мира (для подписей в FPS, иначе ники светят сквозь дома)
  sees(x, y, h) {
    if (!this.fps || !mapGroup) return true;
    TO.set(wx(x), GROUND + h, wz(y));
    DIR.subVectors(TO, camera.position); const d = DIR.length(); DIR.normalize();
    ray.set(camera.position, DIR); ray.far = d - 0.3;
    return ray.intersectObject(mapGroup, true).length === 0;
  },
  // экран → мир сервера (px), прицел на высоте груди
  pick(cx, cy) {
    if (this.fps) { const me = myPos(); if (me) return { x: me.x + Math.cos(yaw) * 600, y: me.y + Math.sin(yaw) * 600 }; }
    ray.far = Infinity;
    ndc.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (!ray.ray.intersectPlane(plane, hit)) return { x: 0, y: 0 };
    return { x: (hit.x + 20) * SCALE, y: (hit.z + 11.25) * SCALE };
  },
  // мир сервера (px) + высота в юнитах → экран (css px), для подписей на 2D-холсте
  project(x, y, h = 0) {
    proj.set(wx(x), h + GROUND, wz(y)).project(camera);
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
