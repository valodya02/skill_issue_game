// Пишет живые snapshot и fx в JSONL: сырьё для Аргона вместо описаний.
// node research/record_snapshots.js [url] [секунды] [out]
let io;
try { io = require('socket.io-client'); }
catch (_) { io = require(require('node:path').join(__dirname, '..', 'node_modules', 'socket.io', 'client-dist', 'socket.io.js')); }
const fs = require('fs');
const url = process.argv[2] || 'http://localhost:3000';
const secs = Number(process.argv[3] || 25);
const out = fs.createWriteStream(process.argv[4] || 'research/argon/snapshots.jsonl');
const code = 'REC' + Date.now().toString(36).slice(-4).toUpperCase();
const t0 = Date.now();
const mk = (name, chr, rec) => {
  const s = io(url, { transports: ['websocket'] });
  s.on('connect', () => s.emit('join', { code, name, mode: '2v2' }));
  if (rec) {
    s.on('state', (st) => out.write(JSON.stringify({ ms: Date.now() - t0, ev: 'state', d: st }) + '\n'));
    s.on('fx', (fx) => out.write(JSON.stringify({ ms: Date.now() - t0, ev: 'fx', d: fx }) + '\n'));
  }
  s.on('state', (st) => { s.last = st; });
  setTimeout(() => { s.emit('pick', chr); s.emit('ready'); }, 600);
  return s;
};
const a = mk('rec_a', 'startuper', true), b = mk('rec_b', 'butcher', false);
setTimeout(() => { a.emit('addBot'); a.emit('addBot'); }, 400);
let k = 0;
const iv = setInterval(() => {
  k++;
  for (const [s, dir] of [[a, 1], [b, -1]]) {
    const ps = s.last?.players || [], me = ps.find((p) => p.id === s.id);
    const foe = ps.find((p) => me && p.team !== me.team && p.alive);
    const ph = Math.floor(k / 20) % 4;
    s.emit('input', { u: ph === 0 ? 1 : 0, d: ph === 2 ? 1 : 0, l: ph === 3 ? 1 : 0, r: ph === 1 ? 1 : 0,
      j: k % 9 === 0 ? 1 : 0, ax: foe?.x ?? 800, ay: foe?.y ?? 450 });
    if (foe) s.emit('cast', { slot: k % 60 === 0 ? 'q' : 'a', x: foe.x, y: foe.y });
  }
}, 33);
setTimeout(() => { clearInterval(iv); a.close(); b.close(); out.end(() => process.exit(0)); }, secs * 1000);
