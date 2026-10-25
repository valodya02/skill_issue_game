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
const CONTROL_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
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

nameInput.value = lastName;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1020);
scene.fog = new THREE.Fog(0x0b1020, 42, 85);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  200,
);
camera.position.set(0, 22, 17);
camera.rotation.order = 'YXZ';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const hemiLight = new THREE.HemisphereLight(0x9db8ff, 0x101828, 1.1);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 2.4);
sunLight.position.set(14, 28, 10);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = -30;
sunLight.shadow.camera.right = 30;
sunLight.shadow.camera.top = 30;
sunLight.shadow.camera.bottom = -30;
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 90;
scene.add(sunLight);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(ARENA_HALF * 2, ARENA_HALF * 2),
  new THREE.MeshStandardMaterial({ color: 0x131d36, roughness: 0.95, metalness: 0.05 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const grid = new THREE.GridHelper(ARENA_HALF * 2, ARENA_HALF * 2, 0x33507f, 0x1b2a4a);
grid.position.y = 0.01;
scene.add(grid);

const wallMaterial = new THREE.MeshStandardMaterial({
  color: 0x2b3b63,
  transparent: true,
  opacity: 0.45,
  roughness: 0.7,
});
const wallDefinitions = [
  [ARENA_HALF * 2, 0.4, 0, ARENA_HALF],
  [ARENA_HALF * 2, 0.4, 0, -ARENA_HALF],
  [0.4, ARENA_HALF * 2, ARENA_HALF, 0],
  [0.4, ARENA_HALF * 2, -ARENA_HALF, 0],
];
for (const [sizeX, sizeZ, x, z] of wallDefinitions) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(sizeX, 1.4, sizeZ), wallMaterial);
  wall.position.set(x, 0.7, z);
  scene.add(wall);
}

const coin = new THREE.Mesh(
  new THREE.TorusGeometry(0.55, 0.18, 12, 28),
  new THREE.MeshStandardMaterial({
    color: 0xffc107,
    emissive: 0xff9800,
    emissiveIntensity: 0.7,
    metalness: 0.65,
    roughness: 0.25,
  }),
);
coin.position.copy(coinTarget);
coin.castShadow = true;
scene.add(coin);

const coinLight = new THREE.PointLight(0xffc107, 12, 10, 2);
coinLight.position.set(0, 1.6, 0);
scene.add(coinLight);

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
  mesh.position.set(data.x, 0.6, data.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  if (data.id === myId) mesh.visible = false;

  return {
    mesh,
    material,
    target: new THREE.Vector3(data.x, 0.6, data.z),
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
    entry.target.set(data.x, 0.6, data.z);

    if (data.id === myId && !lookInitialized) {
      yaw = Math.atan2(data.x, data.z);
      pitch = 0;
      lookInitialized = true;
    }
  }

  for (const id of [...players.keys()]) {
    if (!alive.has(id)) removePlayer(id);
  }

  timerEl.textContent = Math.ceil(state.timeLeft);
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
  ws.send(JSON.stringify({ type: 'input', x: input.x, z: input.z }));
}, 50);

const clock = new THREE.Clock();

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
  } else {
    cameraTarget.set(0, 0, 0);
    desiredCamera.set(0, 22, 17);
    camera.position.lerp(desiredCamera, 1 - Math.exp(-5 * dt));
    camera.lookAt(cameraTarget.x, 0, cameraTarget.z);
  }

  renderer.render(scene, camera);
}

animate();
