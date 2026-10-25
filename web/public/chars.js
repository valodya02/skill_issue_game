// Ростер: общий для сервера (require) и клиента (window.CHARS).
// Типы скиллов: shot, aoe, dash, heal, buff, zone, trap, wall, blink, barrage, markAll, random.
// fx: stun / root / slow / bleed — длительность в мс.
(function (root) {
  const CHARS = {
    bombardiro: {
      name: 'Бомбардиро Крокодило', emoji: '🐊', role: 'Артиллерия',
      hp: 900, speed: 200, shout: 'Bombardiro Crocodilo!', lang: 'it-IT',
      skills: {
        a: { label: 'Пулемёт', type: 'shot', cd: 450, dmg: 70, speed: 650, r: 9, range: 700 },
        q: { label: 'Ковровая бомбёжка', type: 'aoe', at: 'cursor', cd: 4000, r: 110, dmg: 160, delay: 700 },
        e: { label: 'Пике', type: 'dash', cd: 5000, dist: 260, dmg: 60 },
        r: { label: 'НАЛЁТ', type: 'barrage', cd: 25000, count: 12, r: 90, dmg: 120, over: 2000 },
      },
    },
    tralalero: {
      name: 'Тралалеро Тралала', emoji: '🦈', role: 'Ассасин',
      hp: 800, speed: 260, shout: 'Tralalero Tralala!', lang: 'it-IT',
      skills: {
        a: { label: 'Укус', type: 'shot', cd: 400, dmg: 60, speed: 900, r: 14, range: 280, fx: { bleed: 2000 } },
        q: { label: 'Три ноги в найках', type: 'dash', cd: 2500, dist: 230, dmg: 50 },
        e: { label: 'Найк-буст', type: 'buff', cd: 7000, haste: 2500 },
        r: { label: 'ТРАЛАЛА!', type: 'aoe', at: 'self', cd: 20000, r: 230, dmg: 100, delay: 0, fx: { stun: 1500 } },
      },
    },
    sahur: {
      name: 'Тун Тун Тун Сахур', emoji: '🪵', role: 'Танк',
      hp: 1300, speed: 210, shout: 'Tung tung tung tung Sahur!', lang: 'id-ID',
      skills: {
        a: { label: 'Бита', type: 'shot', cd: 500, dmg: 90, speed: 900, r: 24, range: 110 },
        q: { label: 'Бросок биты', type: 'shot', cd: 5000, dmg: 80, speed: 700, r: 16, range: 450, fx: { stun: 1200 } },
        e: { label: 'Тук-тук-тук', type: 'aoe', at: 'self', cd: 8000, r: 260, dmg: 0, delay: 0, fx: { slow: 2500 } },
        r: { label: 'САХУР ПРИШЁЛ', type: 'blink', cd: 20000, dmg: 200, fx: { stun: 1500 } },
      },
    },
    ballerina: {
      name: 'Балерина Капучина', emoji: '🩰', role: 'Саппорт',
      hp: 850, speed: 240, shout: 'Ballerina Cappuccina!', lang: 'it-IT',
      skills: {
        a: { label: 'Кофейный плевок', type: 'shot', cd: 450, dmg: 55, speed: 750, r: 10, range: 600 },
        q: { label: 'Пируэт', type: 'dash', cd: 4000, dist: 200, dmg: 0, invuln: 500 },
        e: { label: 'Кофе-брейк', type: 'heal', cd: 9000, r: 260, amount: 250 },
        r: { label: 'ПА-ДЕ-ДЕ', type: 'aoe', at: 'self', cd: 22000, r: 280, dmg: 80, delay: 0, fx: { stun: 1800 } },
      },
    },
    patapim: {
      name: 'Брр Брр Патапим', emoji: '🌳', role: 'Контроль',
      hp: 1000, speed: 215, shout: 'Brr brr Patapim!', lang: 'it-IT',
      skills: {
        a: { label: 'Шишка', type: 'shot', cd: 450, dmg: 65, speed: 700, r: 10, range: 600 },
        q: { label: 'Корни', type: 'shot', cd: 5000, dmg: 40, speed: 600, r: 14, range: 550, fx: { root: 1500 } },
        e: { label: 'Лес', type: 'zone', cd: 8000, r: 160, ms: 3000, fx: { slow: 300 } },
        r: { label: 'БРР БРР', type: 'aoe', at: 'cursor', cd: 22000, r: 240, dmg: 150, delay: 600, fx: { root: 2500 } },
      },
    },
    bananini: {
      name: 'Шимпанзини Бананини', emoji: '🐒', role: 'Трикстер',
      hp: 850, speed: 250, shout: 'Chimpanzini Bananini!', lang: 'it-IT',
      skills: {
        a: { label: 'Банан', type: 'shot', cd: 420, dmg: 60, speed: 750, r: 10, range: 600 },
        q: { label: 'Кожура', type: 'trap', cd: 6000, r: 40, ms: 15000, dmg: 60, fx: { stun: 1500 } },
        e: { label: 'Очистка', type: 'buff', cd: 9000, invuln: 1200 },
        r: { label: 'БАНАНОВЫЙ ДОЖДЬ', type: 'shot', cd: 18000, dmg: 90, speed: 700, r: 14, range: 700, count: 9, spread: 0.9 },
      },
    },
    shpioniro: {
      name: 'Шпиониро Голубиро', emoji: '🕊️', role: 'Стелс',
      hp: 750, speed: 255, shout: 'Spioniro Golubiro!', lang: 'it-IT',
      skills: {
        a: { label: 'Перо', type: 'shot', cd: 500, dmg: 70, speed: 900, r: 8, range: 750 },
        q: { label: 'Шпионаж', type: 'buff', cd: 9000, stealth: 3000 },
        e: { label: 'Помёт сверху', type: 'aoe', at: 'cursor', cd: 4500, r: 70, dmg: 170, delay: 500 },
        r: { label: 'ГОЛУБИНАЯ ПОЧТА', type: 'markAll', cd: 22000, r: 80, dmg: 180, delay: 1200 },
      },
    },
    bobr: {
      name: 'Бобр', emoji: '🦫', role: 'Строитель',
      hp: 1150, speed: 205, shout: 'Я БОБР!', lang: 'ru-RU',
      skills: {
        a: { label: 'Щепка', type: 'shot', cd: 480, dmg: 70, speed: 700, r: 10, range: 550 },
        q: { label: 'Плотина', type: 'wall', cd: 7000, len: 240, ms: 4000 },
        e: { label: 'Перекус корой', type: 'heal', cd: 10000, r: 0, amount: 220 },
        r: { label: 'Я БОБР!', type: 'aoe', at: 'self', cd: 22000, r: 300, dmg: 120, delay: 0, fx: { stun: 2000 } },
      },
    },
    skebob: {
      name: 'Скебоб', emoji: '🍢', role: 'Хаос',
      hp: 900, speed: 230, shout: 'Скебоб!', lang: 'ru-RU',
      skills: {
        a: { label: 'Шампур', type: 'shot', cd: 450, dmg: 65, speed: 750, r: 10, range: 600 },
        q: { label: '???', type: 'random', cd: 4000, pool: 'qe' },
        e: { label: '???', type: 'random', cd: 6000, pool: 'qe' },
        r: { label: '?!?!', type: 'random', cd: 20000, pool: 'r' },
      },
    },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = { CHARS };
  else root.CHARS = CHARS;
})(this);
