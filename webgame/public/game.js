import * as THREE from '/vendor/three.module.js';

const introEl = document.getElementById('intro');
const introStatusEl = document.getElementById('intro-status');
const nameInput = document.getElementById('name');
const playButton = document.getElementById('play');
const hudEl = document.getElementById('hud');
const timerEl = document.getElementById('timer');
const scoresEl = document.getElementById('scores');
const bannerEl = document.getElementById('banner');
const bannerTextEl = document.getElementById('banner-text');
const bannerSubEl = document.getElementById('banner-sub');

const ARENA_HALF = 20;
const SCENE_CONFIG = window.SCENE_CONFIG || {};
const ENV = SCENE_CONFIG.environment || {};
const RENDER = SCENE_CONFIG.render || {};
const COIN_STYLE = SCENE_CONFIG.coin || {};

const CONTROL_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'ShiftLeft', 'ShiftRight',
]);

const players = new Map();
const keys = new Set();
const coinTarget = new THREE.Vector3(0, 1, 0);
const cameraTarget = new THREE.Vector3();
const desiredCamera = new THREE.Vector3();

let ws = null;
let myId = null;
let joined = false;
let phase = 'playing';
let lastName = localStorage.getItem('arena-name') || 'Player';
let yaw = 0;
let pitch = 0;
let lookInitialized = false;
let lastScoresSignature = '';
let lastTimerText = '';

nameInput.value = lastName;

const scene = new THREE.Scene();
const backgroundColor = ENV.background ?? 0x0b1020;
scene.background = new THREE.Color(backgroundColor);

if (ENV.fog !== false) {
  const fog = ENV.fog || {};
  scene.fog = new THREE.Fog(
    fog.color ?? backgroundColor,
    fog.near ?? 42,
    fog.far ?? 85,
  );
}

const camera = new THREE.PerspectiveCamera(
  ENV.cameraFov ?? 55,
  window.innerWidth / window.innerHeight,
  0.1,
  200,
);
camera.position.set(0, 22, 17);
camera.rotation.order = 'YXZ';
scene.add(camera);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, RENDER.maxPixelRatio ?? 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = RENDER.shadows !== false;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const lightsConfig = ENV.lights || {};
const hemisphere = lightsConfig.hemisphere || {};
const sun = lightsConfig.sun || {};

const hemiLight = new THREE.HemisphereLight(
  hemisphere.sky ?? 0x9db8ff,
  hemisphere.ground ?? 0x101828,
  hemisphere.intensity ?? 1.1,
);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(
  sun.color ?? 0xffffff,
  sun.intensity ?? 2.4,
);
const sunPosition = sun.position ?? [14, 28, 10];
sunLight.position.set(...sunPosition);
sunLight.castShadow = true;
const shadowMapSize = RENDER.shadowMapSize ?? 2048;
sunLight.shadow.mapSize.set(shadowMapSize, shadowMapSize);
sunLight.shadow.camera.left = -30;
sunLight.shadow.camera.right = 30;
sunLight.shadow.camera.top = 30;
sunLight.shadow.camera.bottom = -30;
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 90;
scene.add(sunLight);

if (ENV.blockyGround) {
  const blockSize = ENV.blockSize ?? 2;
  const cells = Math.max(1, Math.round((ARENA_HALF * 2) / blockSize));
  const palette = (ENV.groundColors ?? [0x5f9f3d, 0x6cab47, 0x548f36])
    .map((color) => new THREE.Color(color));
  const ground = new THREE.InstancedMesh(
    new THREE.BoxGeometry(blockSize, 1, blockSize),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 }),
    cells * cells,
  );
  ground.receiveShadow = true;

  const dummy = new THREE.Object3D();
  let index = 0;
  for (let ix = 0; ix < cells; ix++) {
    for (let iz = 0; iz < cells; iz++) {
      dummy.position.set(
        -ARENA_HALF + blockSize / 2 + ix * blockSize,
        -0.5,
        -ARENA_HALF + blockSize / 2 + iz * blockSize,
      );
      dummy.updateMatrix();
      ground.setMatrixAt(index, dummy.matrix);
      ground.setColorAt(
        index,
        palette[(ix * 7 + iz * 13 + ix * iz) % palette.length],
      );
      index++;
    }
  }
  ground.instanceMatrix.needsUpdate = true;
  if (ground.instanceColor) ground.instanceColor.needsUpdate = true;
  ground.computeBoundingSphere();
  ground.matrixAutoUpdate = false;
  scene.add(ground);
} else {
  const floorConfig = ENV.floor || {};
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA_HALF * 2, ARENA_HALF * 2),
    new THREE.MeshStandardMaterial({
      color: floorConfig.color ?? 0x5f9f3d,
      roughness: floorConfig.roughness ?? 1,
      metalness: floorConfig.metalness ?? 0,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.updateMatrix();
  floor.matrixAutoUpdate = false;
  scene.add(floor);
}

if (ENV.grid !== false) {
  const gridConfig = typeof ENV.grid === 'object' ? ENV.grid : {};
  const grid = new THREE.GridHelper(
    ARENA_HALF * 2,
    gridConfig.divisions ?? ARENA_HALF * 2,
    gridConfig.color ?? 0x33507f,
    gridConfig.color2 ?? 0x1b2a4a,
  );
  grid.position.y = 0.01;
  grid.updateMatrix();
  grid.matrixAutoUpdate = false;
  scene.add(grid);
}

if (ENV.walls !== false) {
  const wallsConfig = typeof ENV.walls === 'object' ? ENV.walls : {};
  const wallHeight = wallsConfig.height ?? 1.4;
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: wallsConfig.color ?? 0x2b3b63,
    transparent: true,
    opacity: wallsConfig.opacity ?? 0.45,
    roughness: 0.7,
  });
  const wallDefinitions = [
    [ARENA_HALF * 2, 0.4, 0, ARENA_HALF],
    [ARENA_HALF * 2, 0.4, 0, -ARENA_HALF],
    [0.4, ARENA_HALF * 2, ARENA_HALF, 0],
    [0.4, ARENA_HALF * 2, -ARENA_HALF, 0],
  ];
  for (const [sizeX, sizeZ, x, z] of wallDefinitions) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(sizeX, wallHeight, sizeZ),
      wallMaterial,
    );
    wall.position.set(x, wallHeight / 2, z);
    wall.updateMatrix();
    wall.matrixAutoUpdate = false;
    scene.add(wall);
  }
}

const decorationGeometries = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.SphereGeometry(0.5, 24, 16),
  cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 24),
  cone: new THREE.ConeGeometry(0.5, 1, 24),
};

for (const item of SCENE_CONFIG.decorations ?? []) {
  const geometry = decorationGeometries[item.type ?? 'box'];
  if (!geometry) continue;

  const opacity = item.opacity ?? 1;
  const decoration = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: item.color ?? 0x4cc9f0,
      roughness: item.roughness ?? 0.6,
      metalness: item.metalness ?? 0.1,
      transparent: opacity < 1,
      opacity,
    }),
  );
  const [x = 0, y = 0, z = 0] = item.position ?? [];
  const [sizeX = 1, sizeY = 1, sizeZ = 1] = item.size ?? [];
  const [rotationX = 0, rotationY = 0, rotationZ = 0] = item.rotation ?? [];
  decoration.position.set(x, y, z);
  decoration.scale.set(sizeX, sizeY, sizeZ);
  decoration.rotation.set(rotationX, rotationY, rotationZ);
  decoration.castShadow = true;
  decoration.receiveShadow = true;
  decoration.updateMatrix();
  decoration.matrixAutoUpdate = false;
  scene.add(decoration);
}


const trunkColor = new THREE.Color(0x6b4a2b);
const leafColors = [0x3f7d2a, 0x4b8f32, 0x357022].map(
  (color) => new THREE.Color(color),
);
const treeBlocks = [];

for (const tree of ENV.trees ?? []) {
  const treeX = Array.isArray(tree) ? tree[0] : tree.position?.[0] ?? 0;
  const treeZ = Array.isArray(tree) ? tree[1] : tree.position?.[1] ?? 0;
  const trunkHeight = (Array.isArray(tree) ? tree[2] : tree.trunkHeight) ?? 4;

  for (let level = 0; level < trunkHeight; level++) {
    treeBlocks.push({ x: treeX, y: level + 0.5, z: treeZ, color: trunkColor });
  }

  for (let layer = 0; layer < 4; layer++) {
    const radius = layer < 2 ? 2 : layer === 2 ? 1 : 0;
    const centerY = trunkHeight + layer + 0.5;
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (radius === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
        treeBlocks.push({
          x: treeX + dx,
          y: centerY,
          z: treeZ + dz,
          color: leafColors[(dx + dz + layer + 9) % leafColors.length],
        });
      }
    }
  }
}

if (treeBlocks.length > 0) {
  const forest = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }),
    treeBlocks.length,
  );
  forest.castShadow = true;
  forest.receiveShadow = true;

  const dummy = new THREE.Object3D();
  treeBlocks.forEach((block, index) => {
    dummy.position.set(block.x, block.y, block.z);
    dummy.updateMatrix();
    forest.setMatrixAt(index, dummy.matrix);
    forest.setColorAt(index, block.color);
  });
  forest.instanceMatrix.needsUpdate = true;
  forest.instanceColor.needsUpdate = true;
  forest.computeBoundingSphere();
  forest.matrixAutoUpdate = false;
  scene.add(forest);
}

const coin = new THREE.Mesh(
  new THREE.TorusGeometry(COIN_STYLE.radius ?? 0.55, COIN_STYLE.tube ?? 0.18, 12, 28),
  new THREE.MeshStandardMaterial({
    color: COIN_STYLE.color ?? 0xffc107,
    emissive: COIN_STYLE.emissive ?? 0xff9800,
    emissiveIntensity: 0.7,
    metalness: 0.65,
    roughness: 0.25,
  }),
);
coin.position.copy(coinTarget);
coin.castShadow = true;
scene.add(coin);

const coinLight = new THREE.PointLight(COIN_STYLE.color ?? 0xffc107, 12, 10, 2);
coinLight.position.set(0, 1.6, 0);
scene.add(coinLight);


const weapon = new THREE.Group();
const weaponBasePosition = new THREE.Vector3(0.34, -0.33, -1.0);
weapon.position.copy(weaponBasePosition);
weapon.rotation.set(0.02, -0.08, -0.03);
weapon.visible = false;

const weaponMaterials = {
  body: new THREE.MeshStandardMaterial({ color: 0x4d5a32, roughness: 0.75, metalness: 0.25 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x2c3322, roughness: 0.85 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x44484a, roughness: 0.5, metalness: 0.6 }),
  skin: new THREE.MeshStandardMaterial({ color: 0xd8a06a, roughness: 0.9 }),
};

function addWeaponPart(geometry, material, x, y, z, rotationX = 0) {
  const part = new THREE.Mesh(geometry, material);
  part.position.set(x, y, z);
  part.rotation.x = rotationX;
  weapon.add(part);
  return part;
}

addWeaponPart(new THREE.CylinderGeometry(0.08, 0.1, 1.25, 10), weaponMaterials.body, 0, 0, -0.35, Math.PI / 2);
addWeaponPart(new THREE.CylinderGeometry(0.13, 0.11, 0.22, 10), weaponMaterials.metal, 0, 0, -1.02, Math.PI / 2);
addWeaponPart(new THREE.BoxGeometry(0.08, 0.3, 0.1), weaponMaterials.dark, 0, -0.27, -0.2);
addWeaponPart(new THREE.BoxGeometry(0.1, 0.1, 0.25), weaponMaterials.dark, 0, -0.18, 0.08);
addWeaponPart(new THREE.BoxGeometry(0.04, 0.16, 0.04), weaponMaterials.metal, 0, 0.14, -0.4);
addWeaponPart(new THREE.BoxGeometry(0.15, 0.14, 0.18), weaponMaterials.skin, 0.01, -0.26, 0.03);
addWeaponPart(new THREE.BoxGeometry(0.15, 0.13, 0.18), weaponMaterials.skin, -0.02, -0.2, -0.62);

camera.add(weapon);

const playerGeometry = new THREE.BoxGeometry(1.2, 1.2, 1.2);

function createPlayerMesh(data) {
  const color = new THREE.Color(data.color);
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: color.clone().multiplyScalar(0.12),
    roughness: 0.45,
    metalness: 0.2,
  });
  const mesh = new THREE.Mesh(playerGeometry, material);
  mesh.position.set(data.x, 0.6 + (data.y ?? 0), data.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  if (data.id === myId) mesh.visible = false;

  return {
    mesh,
    material,
    target: new THREE.Vector3(data.x, 0.6 + (data.y ?? 0), data.z),
    data,
  };
}

function removePlayer(id) {
  const entry = players.get(id);
  if (!entry) return;
  scene.remove(entry.mesh);
  entry.material.dispose();
  players.delete(id);
}

function clearPlayers() {
  for (const id of [...players.keys()]) removePlayer(id);
}

function setStatus(text) {
  introStatusEl.textContent = text;
}

function connect(name) {
  lastName = name;

  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'join', name }));
      setStatus('Подключение…');
    }
    return;
  }

  setStatus('Подключение…');
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${protocol}://${location.host}`);

  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({ type: 'join', name }));
  });

  ws.addEventListener('message', (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (message.type === 'welcome') {
      myId = message.id;
      joined = true;
      lastScoresSignature = '';
      lastTimerText = '';
      localStorage.setItem('arena-name', lastName);
      introEl.classList.add('hidden');
      hudEl.classList.remove('hidden');
      setStatus('');
    } else if (message.type === 'state' && joined) {
      applyState(message);
    }
  });

  ws.addEventListener('close', () => {
    joined = false;
    myId = null;
    phase = 'playing';
    lookInitialized = false;
    lastScoresSignature = '';
    lastTimerText = '';
    clearPlayers();
    hudEl.classList.add('hidden');
    bannerEl.classList.add('hidden');
    introEl.classList.remove('hidden');
    setStatus('Соединение потеряно. Попробуй ещё раз.');
  });

  ws.addEventListener('error', () => {
    setStatus('Ошибка соединения.');
  });
}

function applyState(state) {
  phase = state.phase;

  if (state.coin) coinTarget.set(state.coin.x, 1, state.coin.z);

  const alive = new Set();
  for (const data of state.players) {
    alive.add(data.id);
    let entry = players.get(data.id);
    if (!entry) {
      entry = createPlayerMesh(data);
      players.set(data.id, entry);
    }
    entry.data = data;
    entry.target.set(data.x, 0.6 + (data.y ?? 0), data.z);

    if (data.id === myId && !lookInitialized) {
      yaw = Math.atan2(data.x, data.z);
      pitch = 0;
      lookInitialized = true;
    }
  }

  for (const id of [...players.keys()]) {
    if (!alive.has(id)) removePlayer(id);
  }

  const timerText = String(Math.ceil(state.timeLeft));
  if (timerText !== lastTimerText) {
    lastTimerText = timerText;
    timerEl.textContent = timerText;
  }
  renderScores(state.players);

  if (phase === 'ended') {
    const winner = state.winner;
    bannerTextEl.textContent = winner ? `${winner.name} побеждает!` : 'Ничья!';
    bannerSubEl.textContent = winner
      ? `${winner.score} монет · новый раунд скоро…`
      : 'Новый раунд скоро…';
    bannerEl.classList.remove('hidden');
  } else {
    bannerEl.classList.add('hidden');
  }
}

function renderScores(list) {
  const sorted = [...list].sort((a, b) => b.score - a.score);
  const signature = sorted
    .map((player) => `${player.id}|${player.name}|${player.color}|${player.score}`)
    .join(';');
  if (signature === lastScoresSignature) return;
  lastScoresSignature = signature;

  const rows = sorted.map((player) => {
    const name = escapeHtml(player.name);
    const mine = player.id === myId ? ' me' : '';
    return `<div class="row${mine}">
      <span><span class="dot" style="background:${player.color}"></span>${name}</span>
      <span>${player.score}</span>
    </div>`;
  });
  scoresEl.innerHTML = rows.join('') || '<div class="row">Пока никого…</div>';
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character]));
}

function readInput() {
  let forward = 0;
  let strafe = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) forward += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) forward -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) strafe += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) strafe -= 1;

  let x = Math.cos(yaw) * strafe - Math.sin(yaw) * forward;
  let z = -Math.sin(yaw) * strafe - Math.cos(yaw) * forward;
  const length = Math.hypot(x, z);
  if (length > 0) {
    x /= length;
    z /= length;
  }
  return { x, z };
}

function startGame() {
  const name = nameInput.value.trim() || 'Player';
  nameInput.value = name;
  connect(name);
}

playButton.addEventListener('click', startGame);
nameInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') startGame();
});

const canvas = renderer.domElement;
canvas.addEventListener('click', () => {
  if (joined && document.pointerLockElement !== canvas) {
    canvas.requestPointerLock?.();
  }
});

document.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement !== canvas) return;
  yaw -= event.movementX * 0.0022;
  pitch -= event.movementY * 0.0022;
  pitch = Math.max(-1.2, Math.min(1.2, pitch));
});

window.addEventListener('keydown', (event) => {
  if (event.code === 'Space') {
    event.preventDefault();
    if (!event.repeat && joined && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'jump' }));
    }
    return;
  }
  if (CONTROL_KEYS.has(event.code)) {
    keys.add(event.code);
    event.preventDefault();
  }
});

window.addEventListener('keyup', (event) => {
  keys.delete(event.code);
});

window.addEventListener('blur', () => keys.clear());

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

setInterval(() => {
  if (!joined || !ws || ws.readyState !== WebSocket.OPEN) return;
  const input = readInput();
  const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
  ws.send(JSON.stringify({ type: 'input', x: input.x, z: input.z, sprint }));
}, 50);

const clock = new THREE.Clock();
let weaponBob = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = performance.now() / 1000;

  coin.rotation.y = time * 2.4;
  coin.rotation.x = Math.sin(time * 0.8) * 0.25;
  coin.position.x += (coinTarget.x - coin.position.x) * (1 - Math.exp(-10 * dt));
  coin.position.z += (coinTarget.z - coin.position.z) * (1 - Math.exp(-10 * dt));
  coin.position.y = 1.05 + Math.sin(time * 2.6) * 0.15;
  coinLight.position.set(coin.position.x, 1.8, coin.position.z);

  const smoothing = 1 - Math.exp(-14 * dt);
  for (const entry of players.values()) {
    entry.mesh.position.lerp(entry.target, smoothing);
  }

  const me = myId ? players.get(myId) : null;
  if (me) {
    camera.position.set(
      me.mesh.position.x,
      me.mesh.position.y + 0.5,
      me.mesh.position.z,
    );
    camera.rotation.x = pitch;
    camera.rotation.y = yaw;
    camera.rotation.z = 0;

    const running = keys.has('KeyW') || keys.has('KeyA')
      || keys.has('KeyS') || keys.has('KeyD')
      || keys.has('ArrowUp') || keys.has('ArrowDown')
      || keys.has('ArrowLeft') || keys.has('ArrowRight');
    weaponBob += dt * (running && (me.data?.y ?? 0) < 0.01 ? 11 : 2);
    weapon.position.x = weaponBasePosition.x + Math.cos(weaponBob * 1.7) * 0.009;
    weapon.position.y = weaponBasePosition.y + Math.sin(weaponBob * 3.4) * 0.007;
  } else {
    cameraTarget.set(0, 0, 0);
    desiredCamera.set(0, 22, 17);
    camera.position.lerp(desiredCamera, 1 - Math.exp(-5 * dt));
    camera.lookAt(cameraTarget.x, 0, cameraTarget.z);
  }

  weapon.visible = Boolean(me);

  renderer.render(scene, camera);
}

animate();
