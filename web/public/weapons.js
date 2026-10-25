// Магазин, экономика и нормализация оружия. Общий для сервера и клиента.
(function (root) {
  const ECON = { start: 800, win: 3000, lose: 1900, kill: 300, max: 16000, token: 1000 };

  // rate: мс между выстрелами; count/spread: дробь; fx: статусы при попадании.
  const model = (color, projectile = 'ball', trail = 'none', shape = 'box') => ({
    parts: [{ shape, size: [0.16, 0.16, 0.65], pos: [0, 0, 0], color }], projectile, trail,
  });
  const SHOP = {
    pistol:   { name: 'Пистолетто', emoji: '🔫', price: 0, dmg: 34, rate: 380, speed: 900, range: 650, r: 7, model: model('#555c65'), lore: 'Бесплатный аргумент в дорогом споре.' },
    tapok:    { name: 'Тапок-дробовик', emoji: '🩴', price: 1200, dmg: 22, rate: 850, speed: 800, range: 380, r: 8, count: 6, spread: 0.55, model: model('#ad7950', 'slipper'), lore: 'Мама сказала: не бегай.' },
    makaroni: { name: 'Макаронный автомат', emoji: '🍝', price: 2700, dmg: 26, rate: 110, speed: 1000, range: 750, r: 6, model: model('#d0ad57', 'ball', 'sparkle', 'cyl'), lore: 'Аль денте по бронежилету.' },
    baguette: { name: 'Багет-снайперка', emoji: '🥖', price: 4200, dmg: 115, rate: 1300, speed: 1600, range: 1300, r: 7, model: model('#c8954d', 'arrow'), lore: 'Корочка громче выстрела.' },
    balalaika:{ name: 'Балалайка-гранатомёт', emoji: '🪕', price: 3500, dmg: 70, rate: 1000, speed: 600, range: 700, r: 16, fx: { slow: 1200 }, model: model('#9b653b', 'ball', 'smoke'), lore: 'После концерта все лежат.' },
    cappuccino:{ name: 'Капучино-тазер', emoji: '☕', price: 2200, dmg: 20, rate: 600, speed: 900, range: 500, r: 9, fx: { stun: 450 }, model: model('#e3d5bc', 'ball', 'sparkle'), lore: 'Двойной эспрессо с остановкой сердца.' },
    bow: { name: 'Лук подъездного эльфа', emoji: '🏹', price: 1800, dmg: 105, rate: 850, speed: 1300, range: 1200, r: 6, pierce: 1, model: model('#805a36', 'arrow', 'none', 'torus'), lore: 'Эльф прописан у консьержки.' },
    stones: { name: 'Камни с клумбы', emoji: '🪨', price: 300, dmg: 44, rate: 650, speed: 650, range: 550, r: 11, lob: true, model: model('#777b7c', 'ball', 'smoke', 'sphere'), lore: 'Ландшафтный дизайн наносит ответный удар.' },
    boomerang: { name: 'Тапок-бумеранг', emoji: '🩴', price: 1600, dmg: 75, rate: 750, speed: 850, range: 800, r: 12, bounce: 2, model: model('#a56f45', 'slipper', 'sparkle'), lore: 'Возвращается к владельцу с жалобой.' },
    brick: { name: 'Кирпич справедливости', emoji: '🧱', price: 600, dmg: 90, rate: 1050, speed: 570, range: 450, r: 16, lob: true, model: model('#ad5945', 'ball', 'smoke'), lore: 'Аргумент из ближайшей стройки.' },
    snowball: { name: 'Снежок из морозилки', emoji: '❄️', price: 700, dmg: 55, rate: 600, speed: 820, range: 650, r: 11, fx: { slow: 900 }, model: model('#d4eef4', 'ball', 'ice', 'sphere'), lore: 'Зима пришла без записи.' },
    soda: { name: 'Газировка давления', emoji: '🥤', price: 1100, dmg: 60, rate: 450, speed: 940, range: 620, r: 9, model: model('#be3034', 'ball', 'sparkle', 'cyl'), lore: 'Пузырьки пробили потолок рынка.' },
    rake: { name: 'Грабли судьбы', emoji: '🪏', price: 850, dmg: 85, rate: 700, speed: 760, range: 520, r: 13, model: model('#686d56', 'disc'), lore: 'На них наступают дважды.' },
    wifi: { name: 'Роутер возмездия', emoji: '📶', price: 2400, dmg: 48, rate: 240, speed: 1100, range: 800, r: 8, model: model('#333c49', 'disc', 'sparkle'), lore: 'Пинг низкий, отношения высокотоксичные.' },
  };
  // Ларёк и NPC не входят в обычный SHOP.
  const KIOSK = {
    molotov: { name: 'Зажигалка-молотов', emoji: '🔥', price: 2800, dmg: 20, rate: 1200, speed: 600, range: 650, r: 13, lob: true, ignite: { r: 100, ms: 3000, dps: 40 }, model: model('#e97631', 'ball', 'fire'), lore: 'Ларёк продаёт горячие новости.' },
  };
  const NPC = {
    babka_seeds: { name: 'Семечки бабки', emoji: '🌻', price: 0, dmg: 12, rate: 800, speed: 700, range: 350, r: 5, model: model('#caa65c', 'ball'), lore: 'Не плюй под ноги бабушке.' },
  };

  const LIM = {
    dmg: [5, 120], rate: [80, 1500], speed: [350, 1700], range: [200, 1300],
    r: [4, 24], count: [1, 8], spread: [0, 1.2], stun: [0, 800], slow: [0, 2000], bleed: [0, 2500], root: [0, 1000],
    pierce: [0, 2], bounce: [0, 3], igniteR: [30, 120], igniteMs: [500, 4000], igniteDps: [10, 60],
  };
  const MAX_DPS = 300; // бюджет силы: урон всех дробин в секунду
  const cl = (v, [a, b], d) => { v = Number(v); return Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : d; };
  const SHAPES = new Set(['box', 'cyl', 'sphere', 'cone', 'torus']);
  const PROJECTILES = new Set(['emoji', 'ball', 'arrow', 'disc', 'slipper']);
  const TRAILS = new Set(['none', 'fire', 'ice', 'smoke', 'sparkle']);
  function fallbackModel(emoji) {
    const e = String(emoji || '');
    if (e.includes('🩴') || e.includes('👵')) return model('#a97852', 'slipper');
    if (e.includes('🔥')) return model('#ee7934', 'ball', 'fire');
    if (e.includes('🏹') || e.includes('🥖')) return model('#926441', 'arrow');
    if (e.includes('❄️') || e.includes('🧊')) return model('#bce8f4', 'ball', 'ice');
    return model('#8b8e91');
  }
  function normalizeModel(value, emoji) {
    const fallback = fallbackModel(emoji);
    if (!value || !Array.isArray(value.parts) || !value.parts.length) return fallback;
    const parts = [];
    for (const p of value.parts.slice(0, 6)) {
      if (!p || !SHAPES.has(p.shape) || !Array.isArray(p.size) || p.size.length !== 3 ||
          !Array.isArray(p.pos) || p.pos.length !== 3 || !/^#[0-9a-fA-F]{6}$/.test(p.color || '') ||
          !p.size.every(n => Number.isFinite(Number(n))) || !p.pos.every(n => Number.isFinite(Number(n)))) return fallback;
      parts.push({ shape: p.shape, size: p.size.map(n => cl(n, [0.02, 1.5], 0.1)),
        pos: p.pos.map(n => cl(n, [-2, 2], 0)), color: p.color.toLowerCase() });
    }
    return { parts, projectile: PROJECTILES.has(value.projectile) ? value.projectile : fallback.projectile,
      trail: TRAILS.has(value.trail) ? value.trail : fallback.trail };
  }

  // Любое оружие (из магазина или от нейросети) проходит здесь: имбы не будет.
  function normalize(w) {
    w = w || {};
    const out = {
      name: String(w.name || 'Безымянный вайб').slice(0, 32),
      emoji: Array.from(String(w.emoji || '💥')).slice(0, 2).join(''),
      dmg: cl(w.dmg, LIM.dmg, 30), rate: cl(w.rate, LIM.rate, 400), speed: cl(w.speed, LIM.speed, 900),
      range: cl(w.range, LIM.range, 600), r: cl(w.r, LIM.r, 8),
      count: Math.round(cl(w.count, LIM.count, 1)), spread: cl(w.spread, LIM.spread, 0),
      lore: String(w.lore || '').slice(0, 120),
      model: normalizeModel(w.model, w.emoji),
    };
    if (w.price != null) out.price = Math.max(0, Math.round(cl(w.price, [0, ECON.max], 0)));
    if (w.pierce != null) out.pierce = Math.round(cl(w.pierce, LIM.pierce, 0));
    if (w.bounce != null) out.bounce = Math.round(cl(w.bounce, LIM.bounce, 0));
    if (w.lob === true) out.lob = true;
    if (w.ignite && typeof w.ignite === 'object') out.ignite = {
      r: Math.round(cl(w.ignite.r, LIM.igniteR, 60)),
      ms: Math.round(cl(w.ignite.ms, LIM.igniteMs, 1000)),
      dps: Math.round(cl(w.ignite.dps, LIM.igniteDps, 20)),
    };
    if (out.count > 1 && out.spread < 0.15) out.spread = 0.15 * out.count;
    const fx = {};
    for (const k of ['stun', 'slow', 'bleed', 'root']) {
      const v = cl(w.fx && w.fx[k], LIM[k], 0);
      if (v > 0) fx[k] = Math.round(v);
    }
    if (fx.stun || fx.root) out.rate = Math.max(out.rate, 550); // контроль только на медленных пушках
    if (Object.keys(fx).length) out.fx = fx;
    out.rate = Math.round(out.rate);
    const firePerShot = out.ignite ? out.ignite.dps * out.ignite.ms / 1000 : 0;
    out.rate = Math.min(LIM.rate[1], Math.max(out.rate,
      Math.ceil((firePerShot + 3 * out.count) * 1000 / (MAX_DPS * (out.fx ? 0.75 : 1)))));
    const dps = (out.dmg * out.count + firePerShot) * 1000 / out.rate;
    const budget = MAX_DPS * (out.fx ? 0.75 : 1);
    if (dps > budget) {
      const allowed = (budget * out.rate / 1000 - firePerShot) / out.count;
      out.dmg = Math.max(3, Math.floor((budget * out.rate / 1000 - (out.ignite ? out.ignite.dps * out.ignite.ms / 1000 : 0)) / out.count));
    }
    out.dmg = Math.round(out.dmg);
    return out;
  }

  const api = { ECON, SHOP, KIOSK, NPC, LIM, MAX_DPS, normalize };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WEAPONS = api;
})(this);
