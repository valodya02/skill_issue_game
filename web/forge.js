// ИИ-кузница: промпт игрока → оружие. Любой OpenAI-совместимый API через env,
// без ключа или при ошибке — локальный генератор, чтобы демо не падало.
const { normalize } = require('./public/weapons.js');

const BASE = process.env.LLM_BASE_URL;          // напр. https://api.groq.com/openai/v1
const KEY = process.env.LLM_API_KEY;
const MODEL = process.env.LLM_MODEL || 'openai/gpt-oss-120b';
const TIMEOUT = +process.env.LLM_TIMEOUT_MS || 7000;

const SYSTEM = `Оружейник мем-шутера. Верни только компактный JSON, до 300 токенов.
Поля: name (смешное), emoji (1), lore (коротко), dmg 5..120, rate 80..1500 мс, speed 350..1700, range 200..1300, r 4..24.
По смыслу добавь count 1..8, spread 0..1.2, fx {stun,slow,bleed,root} в мс, pierce 0..2, bounce 0..3, lob true, ignite {r:30..120,ms:500..4000,dps:10..60}.
Обязательно model:{parts:[{shape:"box|cyl|sphere|cone|torus",size:[x,y,z],pos:[x,y,z],color:"#rrggbb"}],projectile:"emoji|ball|arrow|disc|slipper",trail:"none|fire|ice|smoke|sparkle"}. Частей 1..3, размеры 0.02..1.5. Статы и модель следуют из описания.`;

async function viaLLM(prompt) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        model: MODEL, temperature: 1,
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) throw new Error('LLM HTTP ' + res.status);
    const data = await res.json();
    const text = data.choices[0].message.content;
    return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  } finally {
    clearTimeout(timer);
  }
}

const EMOJI = [
  [/огон|пламя|fire|жар/, '🔥'], [/рыб|акул|shark/, '🦈'], [/тап|шлёп|шлеп/, '🩴'], [/банан/, '🍌'],
  [/кот|кош/, '🐈'], [/молни|гром|ток/, '⚡'], [/лёд|лед|снег|мороз/, '🧊'], [/кофе|капуч/, '☕'],
  [/шаурм|кебаб|еда|пицц/, '🌯'], [/бобр/, '🦫'], [/крокод|самол/, '🐊'], [/ракет|косм/, '🚀'],
  [/гитар|музык|балалай/, '🎸'], [/мама|бабушк|тапок/, '👵'], [/камень|кирпич/, '🧱'], [/слиз|сопл|яд/, '🧪'],
];
const SUFFIX = ['ини', 'ино', 'ссимо', 'ото', 'елло'];

function hash(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.codePointAt(0), 16777619); return h >>> 0; }

function local(prompt) {
  const p = prompt.toLowerCase();
  let seed = hash(p);
  const rnd = () => ((seed = Math.imul(seed ^ (seed >>> 15), 2246822507) >>> 0) % 1000) / 1000;
  const big = /огромн|гигант|тяжел|тяжёл|мега|ядерн|бомб/.test(p);
  const fast = /быстр|пулем|пулём|автомат|скоростр|мини/.test(p);
  const word = (p.match(/[a-zа-яё]{3,}/g) || ['вайб']).sort((a, b) => b.length - a.length)[0];
  const name = word[0].toUpperCase() + word.slice(1, 7) + SUFFIX[Math.floor(rnd() * SUFFIX.length)] + ' ' +
    ['Судьбини', 'Кринжино', 'Сигмаччо', 'Бомбардо', 'Огайо'][Math.floor(rnd() * 5)];
  const emoji = (EMOJI.find(([re]) => re.test(p)) || [null, '💥'])[1];
  const fire = /огн|огон|пламя|fire|молотов|зажиг/.test(p);
  const ice = /лёд|лед|снег|мороз|ice/.test(p);
  const slipper = /тап|шлёп|шлеп/.test(p);
  const arrow = /лук|стрел|arrow/.test(p);
  const stone = /камень|кирпич|stone/.test(p);
  const ricochet = /бумеранг|рикошет|bounce/.test(p);
  const model = {
    parts: [{ shape: stone ? 'sphere' : 'box', size: [0.16, 0.16, 0.65], pos: [0, 0, 0],
      color: fire ? '#e97832' : ice ? '#bce8f4' : stone ? '#777b7c' : slipper ? '#a97852' : '#8b8e91' }],
    projectile: slipper ? 'slipper' : arrow ? 'arrow' : 'ball',
    trail: fire ? 'fire' : ice ? 'ice' : stone ? 'smoke' : 'none',
  };
  return {
    name, emoji, lore: 'Кузница не дозвонилась до нейросети и сковала это на вайбе.',
    dmg: big ? 90 + rnd() * 30 : fast ? 12 + rnd() * 15 : 25 + rnd() * 50,
    rate: big ? 1000 + rnd() * 400 : fast ? 90 + rnd() * 80 : 250 + rnd() * 500,
    speed: 500 + rnd() * 1000, range: 400 + rnd() * 700, r: big ? 18 : 5 + rnd() * 8,
    count: rnd() < 0.25 ? 3 + Math.floor(rnd() * 4) : 1, spread: rnd() * 0.6,
    fx: rnd() < 0.4 ? { [['stun', 'slow', 'bleed', 'root'][Math.floor(rnd() * 4)]]: 400 + rnd() * 1000 } : {},
    pierce: arrow ? 1 : 0, bounce: ricochet ? 2 : 0,
    lob: stone || fire, ...(fire ? { ignite: { r: 100, ms: 3000, dps: 40 } } : {}), model,
  };
}

async function forge(prompt) {
  prompt = String(prompt || '').slice(0, 200);
  if (BASE && KEY) {
    try { return { ...normalize(await viaLLM(prompt)), by: 'llm' }; }
    catch (e) { console.warn('forge fallback:', e.message); }
  }
  return { ...normalize(local(prompt)), by: 'local' };
}

module.exports = { forge };
