// HUD как в Валоранте и КС: слева здоровье и деньги, справа слоты оружия и гранат, по центру скиллы,
// над ними подсказка по месту (терминал, турель, ларёк). DOM поверх канваса, обновляется 10 раз в секунду.
(() => {
  const css = `
  #hud { position:fixed; inset:0; z-index:4; pointer-events:none; font:600 14px system-ui, "Segoe UI", sans-serif; color:#f3eefc; }
  #hud .k { display:inline-block; min-width:22px; padding:1px 6px; margin-right:6px; border:1px solid #ffffff55; border-bottom-width:3px; border-radius:5px; background:#0d0b14cc; color:#ffd23f; font:700 12px ui-monospace, monospace; text-align:center; }
  #hud .glass { background:linear-gradient(180deg,#1a1626cc,#0d0b14dd); border:1px solid #ffffff1a; border-radius:10px; backdrop-filter:blur(4px); }
  #hud-hp { position:absolute; left:16px; bottom:16px; padding:10px 14px; min-width:210px; }
  #hud-hp b { font-size:34px; letter-spacing:-1px; }
  #hud-hp .bar { height:6px; border-radius:3px; background:#ffffff1a; margin:6px 0 8px; overflow:hidden; }
  #hud-hp .bar i { display:block; height:100%; background:#5dff9b; transition:width .15s; }
  #hud-hp .money { color:#ffd23f; font-size:16px; }
  #hud-slots { position:absolute; right:16px; bottom:16px; display:flex; flex-direction:column; gap:6px; align-items:flex-end; }
  #hud-slots .s { display:flex; align-items:center; gap:8px; padding:6px 12px; min-width:230px; opacity:.55; transition:opacity .15s, transform .15s; }
  #hud-slots .s.on { opacity:1; border-color:#ffd23f; box-shadow:0 0 0 1px #ffd23f55 inset; }
  #hud-slots .s.off { opacity:.25; }
  #hud-slots .s .e { font-size:24px; width:30px; text-align:center; }
  #hud-slots .s .n { flex:1; }
  #hud-slots .s small { color:#a79cbf; font-weight:500; display:block; font-size:11px; }
  #hud-slots .row2 { display:flex; gap:6px; }
  #hud-slots .row2 .s { min-width:112px; }
  #hud-skills { position:absolute; left:50%; bottom:16px; transform:translateX(-50%); display:flex; gap:8px; }
  #hud-skills .sk { position:relative; width:96px; padding:8px 10px; overflow:hidden; }
  #hud-skills .sk i { position:absolute; left:0; bottom:0; width:100%; background:#000a; }
  #hud-skills .sk span { position:relative; display:block; font-size:11px; color:#d8d0ea; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:4px; }
  #hud-skills .sk em { position:absolute; right:8px; top:8px; font-style:normal; color:#fff; }
  #hud-act { position:absolute; left:50%; bottom:118px; transform:translateX(-50%); padding:8px 16px; font-size:16px; display:none; white-space:nowrap; }
  #hud-help { position:absolute; left:16px; top:56px; padding:12px 14px; width:300px; font-weight:500; line-height:1.7; display:none; }
  #hud-help h3 { margin:0 0 4px; font-size:13px; color:#ffd23f; letter-spacing:1px; text-transform:uppercase; }
  #hud-help .tip { margin-top:8px; color:#a79cbf; font-size:12px; line-height:1.4; }
  @media (max-width:900px) { #hud-skills { bottom:110px; } #hud-help { width:240px; } }`;
  const st = document.createElement('style'); st.textContent = css; document.head.append(st);
  const el = document.createElement('div'); el.id = 'hud'; el.style.display = 'none';
  el.innerHTML = `<div id="hud-help" class="glass"></div><div id="hud-hp" class="glass"></div>
    <div id="hud-act" class="glass"></div><div id="hud-skills"></div><div id="hud-slots"></div>`;
  document.body.append(el);
  const q = (id) => document.getElementById(id);
  const k = (key) => `<span class="k">${key}</span>`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Подсказки раунда: по одной за раунд, учат механикам по ходу, а не простынёй
  const TIPS = [
    'Первая пуля стоя летит точно в прицел. Бежишь и прыгаешь, значит мажешь.',
    'Очередь уводит змейкой: влево, вправо, снова влево. Тяни мышь против или стреляй по 2-3 пули.',
    'Кофе ☕ ускоряет своих и сбивает прицел врагам. Дым 🌫️ закрывает точку на плент.',
    'Бани-хоп: прыжок сразу после приземления держит скорость. BHOP ×3 уже чед.',
    'Турель бьёт только вперёд дугой 60°. Заходи сбоку, пулемётчик тебя не видит.',
    'Плент: стой намертво и вводи стрелки. Шагнул, значит код сбросился.',
    'Деньги не тратятся сами: B открывает магазин, токен куёт пушку через ИИ.',
  ];
  // справка сама показывается на закупке и первые 6 с раунда; H закрепляет открытой или закрытой
  let pinned = null, shownNow = false, helpRound = -1, tip = TIPS[0], phase = '', playStart = 0;
  addEventListener('keydown', (e) => { if (e.code === 'KeyH' && e.target.tagName !== 'INPUT') pinned = !shownNow; });

  const keyOf = { q: 'Q', e: 'E', r: 'R' };
  let last = '';
  function render() {
    if (typeof S === 'undefined' || !S || !meta) { el.style.display = 'none'; return; }
    const me = S.players.find((p) => p.id === meta.you);
    if (!me || !me.char || S.phase === 'lobby' || S.phase === 'matchEnd') { el.style.display = 'none'; return; }
    el.style.display = 'block';
    const c = CHARS[me.char], w = me.weapon || {}, hp = Math.max(0, Math.round(me.hp)), frac = me.hp / c.hp;
    const round = (S.score?.[0] || 0) + (S.score?.[1] || 0);
    if (round !== helpRound) { helpRound = round; tip = TIPS[round % TIPS.length]; }
    if (S.phase !== phase) { phase = S.phase; if (phase === 'playing') playStart = performance.now(); }
    const helpOpen = pinned ?? (phase === 'buy' || (phase === 'playing' && performance.now() - playStart < 6000));
    shownNow = helpOpen;

    // слоты: 1 основное, 4 кофе, 5 дым, бомба у носителя
    const g = me.grenades || {}, carrier = S.bomb && S.bomb.carrier === me.id;
    const nade = (id, key) => {
      const n = SHOP[id], has = !!g[id];
      return `<div class="s glass ${has ? (me.grenade === id ? 'on' : '') : 'off'}">${k(key)}<span class="e">${n.emoji}</span><span class="n">${has ? '×1' : '×0'}</span></div>`;
    };
    const fire = w.rate ? `${Math.round(60000 / w.rate)} в мин · ${w.rate < 200 ? 'зажми ЛКМ' : 'клик ЛКМ'}` : '';
    const slots = `${carrier ? `<div class="s glass on">${k('G')}<span class="e">🩴</span><span class="n">Заминированный тапок<small>неси на точку A или B</small></span></div>` : ''}
      <div class="row2">${nade('coffee', '4')}${nade('smoke', '5')}</div>
      <div class="s glass on">${k('1')}<span class="e">${w.emoji || '🔫'}</span><span class="n">${esc(w.name || '')}<small>${w.dmg ? `урон ${w.dmg}${w.count ? '×' + w.count : ''} · ` : ''}${fire}</small></span></div>`;

    const skills = meta.skills ? ['q', 'e', 'r'].map((s) => {
      const sk = c.skills[s], left = me.cd?.[s] || 0;
      return `<div class="sk glass">${k(keyOf[s])}${left ? `<em>${(left / 1000).toFixed(1)}</em>` : ''}<span>${esc(sk.label)}</span><i style="height:${left ? Math.min(100, 100 * left / sk.cd) : 0}%"></i></div>`;
    }).join('') : '';

    // действие по месту, приоритет как в КС: бомба > турель > ларёк > подбор
    let act = '';
    const near = (o, r) => o && Math.hypot(me.x - o.x, me.y - o.y) <= r;
    if (S.bomb && typeof gameMap !== 'undefined' && gameMap) {
      if (me.team === 0 && carrier && S.bomb.state === 'carried' && Object.values(gameMap.sites || {}).some((site) => near(site, site.r))) act = `${k('G')}запрограммировать тапок, стой на месте`;
      else if (me.team === 1 && S.bomb.state === 'planted' && near(S.bomb, 60)) act = `${k('G')}обезвредить тапок, стрелки по коду`;
      else if (me.team === 0 && S.bomb.state === 'dropped' && near(S.bomb, 70)) act = `${k('F')}подобрать тапок`;
    }
    if (!act && me.turret) act = `${k('E')}слезть с турели · ${k('ЛКМ')}огонь, дуга 60°`;
    if (!act && gameMap && (gameMap.turrets || []).some((v) => near(v, 50) && !S.turrets?.find((s) => s.id === v.id)?.by)) act = `${k('E')}сесть за пулемёт`;
    if (!act && gameMap && (gameMap.shops || []).some((s) => near(s, s.r))) act = `${k('B')}ларёк: купить зажигалку`;
    if (!act && (S.drops || []).some((d) => near(d, 60))) act = `${k('F')}подобрать ${esc((S.drops.find((d) => near(d, 60)) || {}).name || '')}`;
    if (!act && S.phase === 'buy') act = `${k('B')}магазин открыт, ${Math.max(0, S.timer || 0)} с на закупку`;

    const help = `<h3>Управление</h3>
      ${k('WASD')}бег · ${k('Space')}прыжок, бани-хоп<br>
      ${k('ЛКМ')}огонь · ${k('4')}кофе · ${k('5')}дым<br>
      ${meta.skills ? `${k('Q')}${k('E')}${k('R')}скиллы персонажа<br>` : ''}
      ${k('G')}терминал бомбы · ${k('E')}турель · ${k('F')}подобрать<br>
      ${k('B')}магазин · ${k('V')}вид · ${k('H')}скрыть
      <div class="tip">💡 ${tip}</div>`;

    const html = `${hp}|${me.money}|${me.tokens}|${slots}|${skills}|${act}|${helpOpen}|${tip}`;
    if (html === last) return;
    last = html;
    q('hud-hp').innerHTML = `<b style="color:${frac > 0.5 ? '#f3eefc' : frac > 0.25 ? '#ffd23f' : '#ff4f4f'}">${hp}</b> <span class="muted">${esc(c.name)}</span>
      <div class="bar"><i style="width:${Math.max(0, Math.min(100, frac * 100))}%;background:${frac > 0.5 ? '#5dff9b' : frac > 0.25 ? '#ffd23f' : '#ff4f4f'}"></i></div>
      <span class="money">${me.money}$</span> <span style="color:#a79cbf">🪙 ${me.tokens}</span>`;
    q('hud-slots').innerHTML = slots;
    q('hud-skills').innerHTML = skills;
    q('hud-act').innerHTML = act; q('hud-act').style.display = act ? 'block' : 'none';
    q('hud-help').innerHTML = help; q('hud-help').style.display = helpOpen ? 'block' : 'none';
  }
  setInterval(render, 100);
})();
