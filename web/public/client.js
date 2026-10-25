// Клиент: рисует снапшоты сервера, шлёт ввод. Вся логика боя на сервере.
const { ECON, SHOP, KIOSK = {} } = WEAPONS;
const $ = (id) => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d');
const sock = io({ transports: ['websocket'] });  // сразу websocket, без polling-рукопожатия

let meta = null, S = null;           // S — последний снапшот
let gameMap = null;
const view = new Map();              // сглаженные позиции игроков
const fxs = [];                      // визуальные эффекты
let shake = 0, banner = null, mouse = { x: 0, y: 0, down: false };
let terminal = null;
const sound = (name, x, y, weapon) => { if (window.SFX?.play) window.SFX.play(name, { x, y, weapon }); };
const keys = {};
let scale = 1, ox = 0, oy = 0;
// 3D-слой (client3d.js) читает состояние отсюда; без WebGL2 или с ?3d=0 работает 2D, F9 переключает
window.GAME_VIEW = { get S() { return S; }, get meta() { return meta; }, get map() { return gameMap; } };
const in3d = () => !!window.GAME3D?.on;

// ---------- вход ----------
const params = new URLSearchParams(location.search);
$('rc').value = params.get('room') || Math.random().toString(36).slice(2, 6);
$('nm').value = localStorageGet('nick') || '';
if (params.get('mode')) $('md').value = params.get('mode');
$('go').onclick = () => {
  const name = $('nm').value.trim() || 'Сигма' + Math.floor(Math.random() * 99);
  localStorageSet('nick', name);
  sock.emit('join', { code: $('rc').value, name, mode: $('md').value });
};
function localStorageGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function localStorageSet(k, v) { try { localStorage.setItem(k, v); } catch {} }

sock.on('nope', (m) => toast(m));
sock.on('meta', (m) => {
  meta = m;
  gameMap = null;
  fetch(`/maps/${encodeURIComponent(m.map)}.json`).then((r) => { if (!r.ok) throw new Error('map'); return r.json(); })
    .then((data) => { if (meta === m) gameMap = data; }).catch(() => toast('Карта не загрузилась'));
  $('join').classList.add('hidden');
  $('lcode').textContent = m.code;
  $('lmode').value = m.mode;
  history.replaceState(null, '', `?room=${m.code}&mode=${m.mode}`);
});

// ---------- лобби ----------
const grid = $('chars');
for (const [id, c] of Object.entries(CHARS)) {
  const b = document.createElement('button');
  b.className = 'ch'; b.dataset.id = id;
  b.innerHTML = `<b>${c.emoji}</b>${c.name}<br><small>${c.role} · ${c.hp} хп</small>`;
  b.onclick = () => sock.emit('pick', id);
  grid.appendChild(b);
}
$('swap').onclick = () => sock.emit('team');
$('lmode').onchange = () => sock.emit('mode', $('lmode').value);
$('bot').onclick = () => sock.emit('addBot');
$('rdy').onclick = () => sock.emit('ready');
$('again').onclick = () => sock.emit('rematch');
$('share').onclick = () => { navigator.clipboard?.writeText(location.href); toast('Ссылка скопирована'); };

function renderLobby() {
  const me = S.players.find((p) => p.id === meta.you);
  $('lmode').value = S.mode;
  $('swap').classList.toggle('hidden', S.mode === 'dm');
  [0, 1].forEach((t) => {
    $('tm' + t).innerHTML = `<b style="color:var(--t${t})">${S.mode === 'dm' ? 'Игроки' : 'Команда ' + (t + 1)}</b><br>` + S.players.filter((p, i) => S.mode === 'dm' ? i % 2 === t : p.team === t)
      .map((p) => `${p.char ? CHARS[p.char].emoji : '❔'} ${esc(p.name)}${p.id === meta.you ? ' (ты)' : ''} ${p.ready ? '✅' : '⏳'}`).join('<br>');
  });
  grid.querySelectorAll('.ch').forEach((b) => b.classList.toggle('sel', me && me.char === b.dataset.id));
  $('rdy').textContent = me && me.ready ? 'Не готов' : 'Готов';
}

// ---------- магазин ----------
$('tprice').textContent = ECON.token;
const wg = $('wpns');
for (const [id, w] of Object.entries({ ...SHOP, ...KIOSK })) {
  if (w.noShop) continue;
  const b = document.createElement('button');
  b.className = 'wpn'; b.dataset.id = id;
  b.innerHTML = `<b>${w.emoji}</b> ${w.name}<br><small class="muted">${w.price}$ · ${w.grenade ? 'граната, слот 4' : `урон ${w.dmg}${w.count ? '×' + w.count : ''} · ${Math.round(60000 / w.rate)} выстр/мин`}</small>`;
  b.onclick = () => sock.emit('buy', id);
  wg.appendChild(b);
}
$('btok').onclick = () => sock.emit('buyToken');
$('fgo').onclick = doForge;
$('fprompt').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') doForge(); });
function doForge() {
  const t = $('fprompt').value.trim();
  if (!t) return;
  sock.emit('forge', t);
  $('fprompt').value = '';
  toast('Кузница думает... 🔨');
}
function toggleShop(force) {
  const open = force !== undefined ? force : $('shop').classList.contains('hidden');
  $('shop').classList.toggle('hidden', !open);
}
function renderShop(me) {
  $('smoney').textContent = me.money + '$';
  $('stokens').textContent = `токенов: ${me.tokens}${me.forging ? ' · куётся...' : ''}`;
  $('scur').innerHTML = `В руках: ${me.weapon.emoji} <b>${esc(me.weapon.name)}</b> · урон ${me.weapon.dmg}` +
    `${me.weapon.count > 1 ? '×' + me.weapon.count : ''} · ${Math.round(60000 / me.weapon.rate)} выстр/мин` +
    (me.weapon.lore ? `<br><i>${esc(me.weapon.lore)}</i>` : '') + `<br>Слот 4: ${me.grenade ? SHOP[me.grenade].emoji + ' ' + SHOP[me.grenade].name : 'пусто'}`;
  const buy = S.phase === 'buy' || S.mode === 'dm' && S.phase === 'playing';
  wg.querySelectorAll('.wpn').forEach((b) => {
    const kiosk = Object.hasOwn(KIOSK, b.dataset.id) && (gameMap?.shops || []).some((shop) => shop.items.includes(b.dataset.id) && Math.hypot(me.x - shop.x, me.y - shop.y) <= shop.r);
    const w = KIOSK[b.dataset.id] || SHOP[b.dataset.id];
    b.disabled = !(kiosk || buy && SHOP[b.dataset.id]) || me.money < w.price || (w.grenade && me.grenades?.[b.dataset.id]);
  });
  $('btok').disabled = !buy || me.money < ECON.token;
  $('fgo').disabled = me.tokens < 1 || me.forging;
}

// ---------- сеть ----------
let prevPhase = null;
let prevWeaponId = null;
const weaponOf = new Map();  // сервер шлёт оружие только при смене
sock.on('state', (s) => {
  for (const p of s.players) {
    if (p.weapon) weaponOf.set(p.id, p.weapon); else p.weapon = weaponOf.get(p.id);
  }
  S = s;
  if (meta && meta.mode !== s.mode) {
    meta.mode = s.mode;
    history.replaceState(null, '', `?room=${meta.code}&mode=${s.mode}`);
  }
  const me = s.players.find((p) => p.id === meta?.you);
  if (me) {
    window.SFX?.setListener?.(me.x, me.y);
    if (prevWeaponId && prevWeaponId !== me.weapon?.id && SHOP[me.weapon?.id]?.sfx) {
      sound('reload', me.x, me.y, me.weapon.id);
    }
    prevWeaponId = me.weapon?.id;
  }
  $('lobby').classList.toggle('hidden', s.phase !== 'lobby');
  $('end').classList.toggle('hidden', s.phase !== 'matchEnd');
  if (s.phase === 'lobby') renderLobby();
  if (s.phase === 'buy' && prevPhase !== 'buy') toggleShop(true);
  if (s.phase === 'playing' && prevPhase === 'buy') toggleShop(false);
  if (s.phase === 'matchEnd') {
    $('endt').textContent = s.mode === 'dm' ? `${s.players.find((p) => p.team === s.winner)?.name || 'Игрок'} затащил` : `Команда ${s.winner + 1} затащила`;
    $('ends').textContent = (s.mode === 'dm' ? '' : `${s.score[0]} : ${s.score[1]} · `) + s.players.map((p) => `${p.name} ${p.kills}☠`).join(' · ');
  }
  if (me && !$('shop').classList.contains('hidden')) renderShop(me);
  prevPhase = s.phase;
});

sock.on('fx', (f) => {
  const t = performance.now();
  window.GAME3D?.fx(f);
  if (['shot', 'turret'].includes(f.k)) {
    const shooter = S?.players.reduce((best, p) => {
      const d = Math.hypot(p.x - f.x, p.y - f.y);
      return d < best.d ? { p, d } : best;
    }, { p: null, d: Infinity });
    const weapon = shooter?.d < 60 ? (f.k === 'turret' && shooter.p.turret ? 'turret_mg' : shooter.p.weapon?.id) : null;
    sound(f.k === 'turret' ? 'shot' : f.k, f.x, f.y, weapon);
  } else if (['boom', 'jump', 'land', 'hop', 'coffee', 'smoke', 'plant', 'defuse', 'kill', 'round'].includes(f.k)) sound(f.k, f.x, f.y);
  if (f.k === 'feed') toast(esc(f.text));
  if (f.k === 'banner') banner = { text: f.text, until: t + 1800 };
  if (f.k === 'dmg') fxs.push({ k: 'txt', x: f.x, y: f.y - 30, text: '-' + f.v, color: '#ff6b6b', t, life: 700 });
  if (f.k === 'heal') fxs.push({ k: 'txt', x: f.x, y: f.y - 30, text: '+' + f.v, color: '#5dff9b', t, life: 900 });
  if (f.k === 'boom') { fxs.push({ k: 'boom', x: f.x, y: f.y, r: f.r, t, life: 400 }); shake = Math.max(shake, 6); }
  if (f.k === 'dash') fxs.push({ k: 'line', ...f, t, life: 300 });
  if (f.k === 'kill') { fxs.push({ k: 'txt', x: f.x, y: f.y - 50, text: '💀 ' + f.who, color: '#fff', t, life: 1500 }); shake = 10; }
  if (f.k === 'random') fxs.push({ k: 'txt', x: f.x, y: f.y - 60, text: f.emoji + ' ' + f.label, color: '#ffd23f', t, life: 1200 });
  if (f.k === 'ult') {
    const c = CHARS[f.char];
    banner = { text: c.emoji + ' ' + f.label, until: t + 1500 };
    shake = 16;
    say(c.shout, c.lang);
  }
  if (f.k === 'forged') {
    const w = f.weapon;
    toast(`${esc(f.who)} выковал ${w.emoji} <b>${esc(w.name)}</b><br><i>${esc(w.lore || '')}</i>`, 4500);
    say(w.name, 'ru-RU');
  }
});
sock.on('terminal', (data) => {
  terminal = data.code ? data : null;
  if (data.result === 'ok') sound('code_ok');
  if (data.result === 'fail') sound('code_fail');
});

function say(text, lang) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang; u.rate = 1.05; u.pitch = 1.1;
    const v = speechSynthesis.getVoices().find((v) => v.lang.startsWith(lang.slice(0, 2)));
    if (v) u.voice = v;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  } catch {}
}

let toastTimer = 0;
function toast(html, ms = 2200) {
  $('toast').innerHTML = html; $('toast').classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.add('hidden'), ms);
}
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }

// Процедурный бит у Лады: бочка, хэт и бас. Источник звука появляется после действия игрока.
let audioCtx = null, hatNoise = null, beat = 0;
function unlockAudio() {
  if (audioCtx || !window.AudioContext && !window.webkitAudioContext) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  hatNoise = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * 0.06), audioCtx.sampleRate);
  const data = hatNoise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
}
addEventListener('pointerdown', unlockAudio, { once: true });
addEventListener('keydown', unlockAudio, { once: true });
function tone(freq, endFreq, duration, gain) {
  const t = audioCtx.currentTime, osc = audioCtx.createOscillator(), vol = audioCtx.createGain();
  osc.type = 'sine'; osc.frequency.setValueAtTime(freq, t); osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration);
  vol.gain.setValueAtTime(gain, t); vol.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(vol).connect(audioCtx.destination); osc.start(t); osc.stop(t + duration);
}
function hat(gain) {
  const t = audioCtx.currentTime, src = audioCtx.createBufferSource(), filter = audioCtx.createBiquadFilter(), vol = audioCtx.createGain();
  src.buffer = hatNoise; filter.type = 'highpass'; filter.frequency.value = 6000;
  vol.gain.setValueAtTime(gain, t); vol.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  src.connect(filter).connect(vol).connect(audioCtx.destination); src.start(t); src.stop(t + 0.055);
}
setInterval(() => {
  if (!audioCtx || audioCtx.state !== 'running' || !S || !meta || S.phase !== 'playing' || !gameMap) return;
  const me = S.players.find((p) => p.id === meta.you);
  if (!me || !me.alive) return;
  let volume = 0;
  for (const zone of gameMap.audio || []) {
    if (zone.track !== 'lada') continue;
    const d = Math.hypot(me.x - zone.x, me.y - zone.y);
    volume = Math.max(volume, Math.max(0, 1 - d / zone.r));
  }
  if (volume < 0.01) return;
  const v = volume * volume;
  if (beat % 4 === 0) tone(140, 48, 0.18, v * 0.3);
  if (beat % 2 === 0) tone(65, 55, 0.22, v * 0.075);
  hat(v * 0.065);
  beat++;
}, 125);

// ---------- ввод ----------
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  keys[e.code] = 1;
  if (terminal && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
    e.preventDefault();
    if (!e.repeat) sock.emit('code', { key: { ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R' }[e.code] });
    return;
  }
  if (!S || !meta) return;
  if (e.code === 'KeyB' && ['buy', 'playing'].includes(S.phase)) toggleShop();
  if (S.phase !== 'playing') return;
  const w = toWorld(mouse.x, mouse.y);
  if (e.code === 'KeyQ' && meta.skills) sock.emit('cast', { slot: 'q', ...w });
  if (e.code === 'KeyE' && !e.repeat) {
    const me = S.players.find((p) => p.id === meta.you);
    if (me?.turret || (gameMap?.turrets || []).some((v) => !S.turrets?.find((s) => s.id === v.id)?.by && Math.hypot(me.x - v.x, me.y - v.y) <= 50)) sock.emit('turret');
    else if (meta.skills) sock.emit('cast', { slot: 'e', ...w });
  }
  if (e.code === 'KeyR' && meta.skills) sock.emit('cast', { slot: 'r', ...w });
  if (e.code === 'KeyF') sock.emit('pickup');
  if (e.code === 'KeyG' && !e.repeat) sock.emit('terminal');
  if (e.code === 'Digit4' && !e.repeat) sock.emit('grenade', { ...w, kind: 'coffee' });
  if (e.code === 'Digit5' && !e.repeat) sock.emit('grenade', { ...w, kind: 'smoke' });
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.code] = 0; });
cv.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
cv.addEventListener('mousedown', () => (mouse.down = true));
addEventListener('mouseup', () => (mouse.down = false));
cv.addEventListener('contextmenu', (e) => e.preventDefault());
const toWorld = (x, y) => (in3d() ? window.GAME3D.pick(x, y) : { x: (x - ox) / scale, y: (y - oy) / scale });

setInterval(() => {
  if (!meta || !S) return;
  const w = toWorld(mouse.x, mouse.y);
  sock.emit('input', { u: keys.KeyW, d: keys.KeyS, l: keys.KeyA, r: keys.KeyD, j: keys.Space, g: keys.KeyG, ax: w.x, ay: w.y, ...window.GAME3D?.move?.(keys) });
  if (mouse.down && S.phase === 'playing' && $('shop').classList.contains('hidden')) sock.emit('cast', { slot: 'a', ...w });
}, 1000 / 30);

// ---------- рендер ----------
function resize() {
  cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio;
  cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px';
}
addEventListener('resize', resize); resize();

const TEAM = ['#36c5ff', '#ff4f7b', '#b7fa6a', '#c59aff'];
function frame() {
  requestAnimationFrame(frame);
  const t = performance.now(), dpr = devicePixelRatio;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const G3 = in3d();
  if (G3) ctx.clearRect(0, 0, cv.width, cv.height);
  else { ctx.fillStyle = '#0d0b14'; ctx.fillRect(0, 0, cv.width, cv.height); }
  if (!S || !meta) return;
  const W = meta.W, H = meta.H;
  scale = Math.min(innerWidth / W, (innerHeight - 70) / H);
  ox = (innerWidth - W * scale) / 2; oy = (innerHeight - 70 - H * scale) / 2 + 40;
  const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake;
  shake *= 0.88;
  const me = S.players.find((p) => p.id === meta.you);
  world: {
  if (G3) { labels3d(me, t); break world; }
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, (ox + sx) * dpr, (oy + sy) * dpr);

  // Карта загружается отдельно от snapshot.
  if (gameMap && window.MAP2D?.drawMap) window.MAP2D.drawMap(ctx, gameMap);
  else {
    ctx.fillStyle = '#292a2b'; ctx.fillRect(0, 0, W, H);
    for (const [kind, color] of [['solid', '#686b70'], ['low', '#999a91']]) {
      ctx.fillStyle = color;
      for (const r of gameMap?.[kind] || []) ctx.fillRect(r.x, r.y, r.w, r.h);
    }
  }
  if (gameMap) {
    for (const [label, site] of Object.entries(gameMap.sites || {})) {
      ctx.strokeStyle = label === 'A' ? '#ffd23f' : '#ff8aab'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(site.x, site.y, site.r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 24px system-ui'; ctx.fillText(label, site.x, site.y);
    }
  }

  if (me?.st.jitter) shake = Math.max(shake, 3);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

  for (const v of gameMap?.turrets || []) {
    const state = S.turrets?.find((item) => item.id === v.id);
    ctx.save(); ctx.translate(v.x, v.y); ctx.rotate(v.ang * Math.PI / 180);
    ctx.fillStyle = state?.heat ? '#ff543c' : state?.by ? '#ffd23f' : '#8e9ca6';
    ctx.fillRect(-18, -18, 36, 36); ctx.fillRect(0, -6, 34, 12);
    ctx.restore();
    if (state?.heat) { ctx.fillStyle = '#ff543c'; ctx.font = 'bold 12px system-ui'; ctx.fillText('ПЕРЕГРЕВ', v.x, v.y - 35); }
  }

  for (const z of S.zones) {
    ctx.fillStyle = z.kind === 'fire' ? '#ff572a66' : z.kind === 'zone' ? '#3fbf5a30' : '#ffd23f22';
    ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, 7); ctx.fill();
    if (z.kind === 'trap' && me && z.team === me.team) { ctx.font = '26px serif'; ctx.fillText('🍌', z.x, z.y); }
  }
  for (const b of S.pending) {
    ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = 3; ctx.setLineDash([10, 8]);
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#ff3b3b22'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * Math.max(0, 1 - b.left / 1200), 0, 7); ctx.fill();
  }
  for (const w of S.walls) { ctx.fillStyle = '#8b5a2b'; ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, 7); ctx.fill(); }
  for (const d of S.drops) {
    ctx.font = '30px serif'; ctx.fillText(d.emoji, d.x, d.y);
    ctx.font = '12px system-ui'; ctx.fillStyle = '#ffd23f'; ctx.fillText(d.name + ' [F]', d.x, d.y + 26);
  }
  for (const s of S.shots) {
    ctx.fillStyle = TEAM[s.team] || '#ffe3a0';
    if (s.r >= 12) { ctx.font = `${s.r * 2}px serif`; ctx.fillText(s.emoji, s.x, s.y); }
    else { ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 0.7, 0, 7); ctx.fill(); }
  }

  for (const n of S.npcs || []) {
    if (!n.alive) continue;
    ctx.font = '38px serif'; ctx.fillText('👵', n.x, n.y);
    ctx.fillStyle = '#2b1720'; ctx.fillRect(n.x - 24, n.y - 32, 48, 6);
    ctx.fillStyle = '#f78386'; ctx.fillRect(n.x - 24, n.y - 32, 48 * n.hp / n.maxHp, 6);
  }
  if (S.bomb && !['defused', 'boom'].includes(S.bomb.state)) {
    const b = S.bomb;
    ctx.font = '34px serif'; ctx.fillText('🩴', b.x, b.y);
    if (b.state === 'planted') { ctx.font = 'bold 18px system-ui'; ctx.fillStyle = '#fff'; ctx.fillText(`${b.left}с`, b.x, b.y - 32); }
    if (b.progress) { ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(b.x, b.y, 43, -Math.PI / 2, -Math.PI / 2 + b.progress * Math.PI * 2); ctx.stroke(); }
  }

  for (const p of S.players) {
    if (!p.char) continue;
    let v = view.get(p.id);
    if (!v) view.set(p.id, (v = { x: p.x, y: p.y }));
    v.x += (p.x - v.x) * 0.45; v.y += (p.y - v.y) * 0.45;
    if (!p.alive) { ctx.globalAlpha = 0.35; ctx.font = '34px serif'; ctx.fillText('💀', v.x, v.y); ctx.globalAlpha = 1; continue; }
    const stealth = p.st.stealth;
    if (stealth && me && p.team !== me.team) continue;
    ctx.globalAlpha = stealth ? 0.4 : 1;
    const c = CHARS[p.char];
    if (p.z) { ctx.fillStyle = '#0008'; ctx.beginPath(); ctx.ellipse(v.x, v.y, 26, 12, 0, 0, 7); ctx.fill(); }
    const spriteY = v.y - (p.z || 0);
    ctx.fillStyle = (TEAM[p.team] || TEAM[0]) + '33'; ctx.strokeStyle = TEAM[p.team] || TEAM[0]; ctx.lineWidth = p.id === meta.you ? 5 : 3;
    ctx.beginPath(); ctx.arc(v.x, spriteY, 30, 0, 7); ctx.fill(); ctx.stroke();
    if (p.st.invuln) { ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(v.x, spriteY, 36, 0, 7); ctx.stroke(); }
    ctx.font = '36px serif'; ctx.fillText(c.emoji, v.x, spriteY + 2);
    ctx.font = '22px serif'; ctx.fillText(p.weapon.emoji, v.x + Math.cos(p.ang) * 42, spriteY + Math.sin(p.ang) * 42);
    // хп и ник
    const hpw = 64, frac = p.hp / c.hp;
    ctx.fillStyle = '#000a'; ctx.fillRect(v.x - hpw / 2, spriteY - 52, hpw, 7);
    ctx.fillStyle = frac > 0.5 ? '#5dff9b' : frac > 0.25 ? '#ffd23f' : '#ff4f4f'; ctx.fillRect(v.x - hpw / 2, spriteY - 52, hpw * frac, 7);
    ctx.font = 'bold 13px system-ui'; ctx.fillStyle = '#fff'; ctx.fillText(p.name, v.x, spriteY - 64);
    const icons = (p.st.stun ? '💫' : '') + (p.st.root ? '🌿' : '') + (p.st.slow ? '🐌' : '') + (p.st.bleed ? '🩸' : '') + (p.st.haste ? '👟' : '');
    if (icons) { ctx.font = '16px serif'; ctx.fillText(icons, v.x, v.y + 46); }
    ctx.globalAlpha = 1;
  }

  for (const z of S.zones) if (z.kind === 'smoke') {
    ctx.fillStyle = '#6e7178ee'; ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, 7); ctx.fill();
    ctx.strokeStyle = '#c6c8ca'; ctx.lineWidth = 3; ctx.stroke();
  }

  for (let i = fxs.length - 1; i >= 0; i--) {
    const f = fxs[i], k = (t - f.t) / f.life;
    if (k >= 1) { fxs.splice(i, 1); continue; }
    ctx.globalAlpha = 1 - k;
    if (f.k === 'txt') { ctx.font = 'bold 20px system-ui'; ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y - k * 40); }
    if (f.k === 'boom') { ctx.fillStyle = '#ff9f1c'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.6 + k * 0.5), 0, 7); ctx.fill(); }
    if (f.k === 'line') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 10 * (1 - k); ctx.beginPath(); ctx.moveTo(f.x0, f.y0); ctx.lineTo(f.x1, f.y1); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }

  }

  // HUD в экранных координатах
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.textAlign = 'center'; ctx.font = 'bold 26px system-ui';
  if (S.mode === 'dm') {
    ctx.fillStyle = '#fff'; ctx.font = 'bold 16px system-ui';
    ctx.fillText(S.players.map((p) => `${p.name} ${p.kills}`).join('  ·  '), innerWidth / 2, 24);
  } else {
    ctx.fillStyle = TEAM[0]; ctx.fillText(S.score[0], innerWidth / 2 - 60, 24);
    ctx.fillStyle = TEAM[1]; ctx.fillText(S.score[1], innerWidth / 2 + 60, 24);
  }
  ctx.fillStyle = '#fff'; ctx.font = 'bold 18px system-ui';
  const phaseLabel = { buy: 'ЗАКУПКА', playing: '', roundEnd: '', countdown: '' }[S.phase] || '';
  ctx.fillText(`${phaseLabel} ${S.timer ? Math.floor(S.timer / 60) + ':' + String(S.timer % 60).padStart(2, '0') : ''}`, innerWidth / 2, S.mode === 'dm' ? 50 : 24);

  if (me && me.char && S.phase !== 'lobby') {
    if (me.hop >= 2) { ctx.textAlign = 'center'; ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 28px system-ui'; ctx.fillText(`BHOP ×${me.hop}`, innerWidth / 2, 70); }
    // слоты, деньги, скиллы и подсказки живут в hud.js (DOM поверх канваса)
  }
  if (terminal) {
    ctx.textAlign = 'center'; ctx.fillStyle = '#111b'; ctx.fillRect(innerWidth / 2 - 270, innerHeight / 2 - 75, 540, 150);
    ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 20px system-ui'; ctx.fillText(terminal.action === 'defuse' ? 'ОБЕЗВРЕДИТЬ ТАПОК' : 'ЗАПРОГРАММИРОВАТЬ ТАПОК', innerWidth / 2, innerHeight / 2 - 36);
    ctx.font = 'bold 48px system-ui';
    const arrows = { U: '↑', D: '↓', L: '←', R: '→' };
    ctx.fillText([...terminal.code].map((k, i) => i < terminal.index ? '✓' : arrows[k]).join(' '), innerWidth / 2, innerHeight / 2 + 22);
  }
  if (banner && t < banner.until) {
    ctx.textAlign = 'center'; ctx.font = `900 ${Math.min(72, innerWidth / 12)}px system-ui`;
    ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#000'; ctx.lineWidth = 6;
    ctx.strokeText(banner.text, innerWidth / 2, innerHeight / 2 - 80); ctx.fillText(banner.text, innerWidth / 2, innerHeight / 2 - 80);
  }
}
frame();

// В 3D мир рисует client3d.js, а здесь поверх только ники, хп и всплывающие цифры.
function labels3d(me, t) {
  const dpr = devicePixelRatio, G = window.GAME3D;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const smoke = S.zones.filter((z) => z.kind === 'smoke');
  for (const p of S.players) {
    if (!p.char || !p.alive) continue;
    if (G.fps && p.id === meta.you) continue;
    if (me && p.team !== me.team && (p.st.stealth || smoke.some((z) => Math.hypot(p.x - z.x, p.y - z.y) < z.r))) continue;
    const c = CHARS[p.char], h = 2.6 + (p.z || 0) / 40, s = G.project(p.x, p.y, h);
    if (!s.front || !G.sees(p.x, p.y, h - 0.6)) continue;
    const hpw = 54, frac = p.hp / c.hp;
    ctx.fillStyle = '#000a'; ctx.fillRect(s.x - hpw / 2, s.y, hpw, 6);
    ctx.fillStyle = frac > 0.5 ? '#5dff9b' : frac > 0.25 ? '#ffd23f' : '#ff4f4f'; ctx.fillRect(s.x - hpw / 2, s.y, hpw * frac, 6);
    ctx.font = 'bold 12px system-ui'; ctx.fillStyle = p.id === meta.you ? '#ffd23f' : '#fff'; ctx.fillText(p.name, s.x, s.y - 10);
    const icons = (p.st.stun ? '💫' : '') + (p.st.root ? '🌿' : '') + (p.st.slow ? '🐌' : '') + (p.st.bleed ? '🩸' : '') + (p.st.haste ? '👟' : '') + (p.st.jitter ? '☕' : '');
    if (icons) { ctx.font = '14px serif'; ctx.fillText(icons, s.x, s.y - 26); }
  }
  for (const d of S.drops) {
    const s = G.project(d.x, d.y, 0.8);
    ctx.font = '12px system-ui'; ctx.fillStyle = '#ffd23f'; ctx.fillText(d.emoji + ' ' + d.name + ' [F]', s.x, s.y);
  }
  if (S.bomb?.state === 'planted') {
    const s = G.project(S.bomb.x, S.bomb.y, 0.8);
    ctx.font = 'bold 18px system-ui'; ctx.fillStyle = '#fff'; ctx.fillText(`🩴 ${S.bomb.left}с`, s.x, s.y);
  }
  for (const v of gameMap?.turrets || []) {
    if (!S.turrets?.find((item) => item.id === v.id)?.heat) continue;
    const s = G.project(v.x, v.y, 1.6);
    ctx.fillStyle = '#ff543c'; ctx.font = 'bold 12px system-ui'; ctx.fillText('ПЕРЕГРЕВ', s.x, s.y);
  }
  for (let i = fxs.length - 1; i >= 0; i--) {
    const f = fxs[i], k = (t - f.t) / f.life;
    if (k >= 1) { fxs.splice(i, 1); continue; }
    if (f.k !== 'txt') continue;
    const s = G.project(f.x, f.y + 30, 2.2);
    ctx.globalAlpha = 1 - k; ctx.font = 'bold 20px system-ui'; ctx.fillStyle = f.color; ctx.fillText(f.text, s.x, s.y - k * 40);
    ctx.globalAlpha = 1;
  }
}
