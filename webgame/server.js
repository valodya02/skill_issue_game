const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const THREE_BUILD_DIR = path.join(__dirname, 'node_modules', 'three', 'build');

const ARENA_HALF = 20;
const PLAYER_SPEED = 9;
const COIN_RADIUS = 1.2;
const ROUND_SECONDS = Number(process.env.ROUND_SECONDS) || 60;
const RESET_DELAY_SECONDS = 5;
const TICK_MS = 50;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const COLORS = [
  '#4cc9f0', '#f72585', '#ffd166', '#06d6a0', '#b388ff',
  '#ff8c42', '#2ec4b6', '#e71d36', '#8ac926', '#ff99c8',
];

const players = new Map();
let nextId = 1;
let round = createRound();
let lastTick = Date.now();

const httpServer = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return send(res, 400, 'Bad request');
  }

  if (pathname.startsWith('/vendor/')) {
    const fileName = pathname.slice('/vendor/'.length);
    const filePath = path.resolve(THREE_BUILD_DIR, fileName);
    if (!filePath.startsWith(THREE_BUILD_DIR + path.sep)) {
      return send(res, 403, 'Forbidden');
    }
    return sendFile(
      res,
      filePath,
      MIME_TYPES[path.extname(filePath)] || 'application/javascript; charset=utf-8',
    );
  }

  if (pathname === '/') pathname = '/index.html';
  const filePath = path.resolve(PUBLIC_DIR, '.' + pathname);
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep)) {
    return send(res, 403, 'Forbidden');
  }
  sendFile(res, filePath, MIME_TYPES[path.extname(filePath)] || 'application/octet-stream');
});

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type });
  res.end(body);
}

function sendFile(res, filePath, type) {
  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, 'Not found');
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function createCoin() {
  const margin = 2;
  return {
    x: roundTo(randomBetween(-ARENA_HALF + margin, ARENA_HALF - margin)),
    z: roundTo(randomBetween(-ARENA_HALF + margin, ARENA_HALF - margin)),
  };
}

function createRound() {
  const now = Date.now();
  return {
    phase: 'playing',
    coin: createCoin(),
    endsAt: now + ROUND_SECONDS * 1000,
    resetAt: 0,
    winner: null,
  };
}

function roundTo(value) {
  return Math.round(value * 1000) / 1000;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sanitizeName(name) {
  const cleaned = String(name ?? '')
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .trim()
    .slice(0, 16);
  return cleaned || 'Player';
}

function spawnPosition() {
  const angle = Math.random() * Math.PI * 2;
  const radius = randomBetween(3, 7);
  return {
    x: roundTo(clamp(Math.cos(angle) * radius, -ARENA_HALF + 1, ARENA_HALF - 1)),
    z: roundTo(clamp(Math.sin(angle) * radius, -ARENA_HALF + 1, ARENA_HALF - 1)),
  };
}

function createPlayer(name) {
  const spawn = spawnPosition();
  const player = {
    id: nextId++,
    name: sanitizeName(name),
    color: COLORS[(nextId - 2) % COLORS.length],
    x: spawn.x,
    z: spawn.z,
    ix: 0,
    iz: 0,
    score: 0,
  };
  return player;
}

function resetRound() {
  round = createRound();
  for (const player of players.values()) {
    const spawn = spawnPosition();
    player.x = spawn.x;
    player.z = spawn.z;
    player.ix = 0;
    player.iz = 0;
    player.score = 0;
  }
}

function finishRound() {
  round.phase = 'ended';
  round.resetAt = Date.now() + RESET_DELAY_SECONDS * 1000;

  let best = -1;
  let winners = [];
  for (const player of players.values()) {
    if (player.score > best) {
      best = player.score;
      winners = [player];
    } else if (player.score === best) {
      winners.push(player);
    }
  }

  round.winner = winners.length === 1
    ? { name: winners[0].name, score: winners[0].score }
    : null;
}

function step(dt) {
  if (round.phase === 'playing') {
    for (const player of players.values()) {
      const length = Math.hypot(player.ix, player.iz);
      const nx = length > 1 ? player.ix / length : player.ix;
      const nz = length > 1 ? player.iz / length : player.iz;

      player.x = clamp(player.x + nx * PLAYER_SPEED * dt, -ARENA_HALF + 0.5, ARENA_HALF - 0.5);
      player.z = clamp(player.z + nz * PLAYER_SPEED * dt, -ARENA_HALF + 0.5, ARENA_HALF - 0.5);

      const dx = player.x - round.coin.x;
      const dz = player.z - round.coin.z;
      if (dx * dx + dz * dz <= COIN_RADIUS * COIN_RADIUS) {
        player.score += 1;
        round.coin = createCoin();
      }
    }

    if (Date.now() >= round.endsAt) finishRound();
  } else if (Date.now() >= round.resetAt) {
    resetRound();
  }
}

function snapshot() {
  return JSON.stringify({
    type: 'state',
    phase: round.phase,
    timeLeft: round.phase === 'playing'
      ? Math.max(0, (round.endsAt - Date.now()) / 1000)
      : 0,
    winner: round.winner,
    coin: round.coin,
    players: [...players.values()].map((player) => ({
      id: player.id,
      name: player.name,
      color: player.color,
      x: roundTo(player.x),
      z: roundTo(player.z),
      score: player.score,
    })),
  });
}

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws) => {
  let player = null;

  ws.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!message || typeof message !== 'object') return;

    if (message.type === 'join' && !player) {
      player = createPlayer(message.name);
      players.set(player.id, player);
      ws.send(JSON.stringify({
        type: 'welcome',
        id: player.id,
        world: {
          halfSize: ARENA_HALF,
          roundSeconds: ROUND_SECONDS,
        },
      }));
      ws.send(snapshot());
      return;
    }

    if (message.type === 'input' && player) {
      const x = Number(message.x);
      const z = Number(message.z);
      if (Number.isFinite(x) && Number.isFinite(z)) {
        player.ix = clamp(x, -1, 1);
        player.iz = clamp(z, -1, 1);
      }
    }
  });

  ws.on('close', () => {
    if (player) players.delete(player.id);
  });

  ws.on('error', () => {});
});

setInterval(() => {
  const now = Date.now();
  const dt = Math.min((now - lastTick) / 1000, 0.15);
  lastTick = now;

  step(dt);

  if (players.size > 0) {
    const state = snapshot();
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) client.send(state);
    }
  }
}, TICK_MS);

httpServer.listen(PORT, () => {
  console.log(`Skill Issue Arena: http://localhost:${PORT}`);
});
