// Общий ростер для сервера (require) и клиента (window.CHARS).
// fx: stun / root / slow / bleed, длительность в мс.
(function (root) {
  const CHARS = {
    startuper: {
      name: 'Стартапер', emoji: '📈', role: 'Саппорт',
      bio: 'Питчит B2B SaaS даже автомату с кофе у метро.',
      hp: 850, speed: 235, shout: 'Срочно нужен дэшборд!',
      shouts: ['Срочно нужен дэшборд!', 'API прикрутим на хакатоне!', 'Вайб-кодинг, и мы в миллионах долларов!', 'У нас B2B SaaS для вашего подъезда!'],
      lang: 'ru-RU', model: { color: 'синий', accent: 'золотой', hat: 'кепка' },
      skills: {
        a: { label: 'Воздушка', type: 'shot', cd: 240, dmg: 35, speed: 950, r: 5, range: 620 },
        q: { label: 'Кофейная граната', type: 'aoe', at: 'cursor', cd: 6500, r: 110, dmg: 90, delay: 450, fx: { slow: 1800 } },
        e: { label: 'Питч инвестору', type: 'buff', cd: 10000, haste: 3000 },
        r: { label: 'РАУНД ИНВЕСТИЦИЙ', type: 'buff', cd: 26000, team: true, r: 500, haste: 6000, ms: 6000 },
      },
    },
    neo: {
      name: 'Нэо с района', emoji: '🕶️', role: 'Дуэлянт',
      bio: 'Уворачивается от счетов за коммуналку в замедленном времени.',
      hp: 780, speed: 265, shout: 'Я вижу код домофона.',
      shouts: ['Я вижу код домофона.', 'Ложки нет, а дошик есть.', 'Твой лифт уже в слоумо.'],
      lang: 'ru-RU', model: { color: 'чёрный', accent: 'зелёный', hat: 'очки' },
      skills: {
        a: { label: 'Цифровой импульс', type: 'shot', cd: 400, dmg: 75, speed: 850, r: 8, range: 580 },
        q: { label: 'Отбить пулю', type: 'deflect', cd: 7000, ms: 1200 },
        e: { label: 'За угол матрицы', type: 'dash', cd: 5500, dist: 230, dmg: 35 },
        r: { label: 'СЛОУМО ДВОРА', type: 'slowmo', cd: 22000, r: 300, ms: 3500 },
      },
    },
    morpheus: {
      name: 'Морфеус у подъезда', emoji: '💊', role: 'Трикстер',
      bio: 'Предлагает выбор цвета таблетки у сломанного лифта.',
      hp: 900, speed: 220, shout: 'Красную или синюю, сосед?',
      shouts: ['Красную или синюю, сосед?', 'Реальность начинается после домофона.', 'Я бы объяснил, но лифт опять не работает.'],
      lang: 'ru-RU', model: { color: 'бордовый', accent: 'синий', hat: 'очки' },
      skills: {
        a: { label: 'Таблетка', type: 'shot', cd: 520, dmg: 90, speed: 700, r: 11, range: 550 },
        q: { label: 'Красная или синяя', type: 'random', cd: 8500, outcomes: [
          { label: 'Синяя: передышка', type: 'heal', r: 180, amount: 220 },
          { label: 'Красная: прозрение', type: 'aoe', at: 'self', r: 190, dmg: 35, delay: 0, fx: { stun: 1100 } },
        ] },
        e: { label: 'Выход из подъезда', type: 'blink', cd: 7500, dmg: 40 },
        r: { label: 'ПРОСНИСЬ, СОСЕД', type: 'aoe', at: 'self', cd: 22000, r: 280, dmg: 110, delay: 0, fx: { stun: 1600 } },
      },
    },
    spider: {
      name: 'Человек-Паук из Шестёрочки', emoji: '🕸️', role: 'Ловкач',
      bio: 'Ловит скидки и злодеев одной паутиной между стеллажами.',
      hp: 760, speed: 275, shout: 'По акции летим!',
      shouts: ['По акции летим!', 'Паутина в отделе овощей!', 'Сосед, держи чек!'],
      lang: 'ru-RU', model: { color: 'красный', accent: 'белый', hat: 'маска' },
      skills: {
        a: { label: 'Паутинный комок', type: 'shot', cd: 380, dmg: 65, speed: 880, r: 8, range: 570 },
        q: { label: 'Липкая полка', type: 'trap', cd: 6500, r: 55, ms: 12000, dmg: 35, fx: { root: 1700 } },
        e: { label: 'Через кассу', type: 'blink', cd: 6500, dmg: 45 },
        r: { label: 'ПАУТИНА НА ВЕСЬ ЗАЛ', type: 'aoe', at: 'self', cd: 22000, r: 275, dmg: 100, delay: 0, fx: { root: 2000 } },
      },
    },
    butcher: {
      name: 'Мясник с крюком', emoji: '🪝', role: 'Танк',
      bio: 'Тащит соседей к мясному прилавку быстрее очереди.',
      hp: 1400, speed: 195, shout: 'Кому талончик на крюк?',
      shouts: ['Кому талончик на крюк?', 'Фарш по акции!', 'Очередь сюда, я сказал.'],
      lang: 'ru-RU', model: { color: 'тёмно-красный', accent: 'серый', hat: 'колпак' },
      skills: {
        a: { label: 'Тесак', type: 'shot', cd: 600, dmg: 120, speed: 850, r: 20, range: 110 },
        q: { label: 'Крюк', type: 'hook', cd: 7000, range: 590, speed: 800, dmg: 85 },
        e: { label: 'Плотный перекус', type: 'heal', cd: 11000, r: 0, amount: 240 },
        r: { label: 'МЯСНОЙ ОТДЕЛ', type: 'aoe', at: 'self', cd: 23000, r: 230, dmg: 150, delay: 0, fx: { slow: 2300 } },
      },
    },
    jedi: {
      name: 'Джедай с Авито', emoji: '🟦', role: 'Ближний бой',
      bio: 'Купил световой меч с самовывозом и спорит о гарантии.',
      hp: 1000, speed: 235, shout: 'Меч почти новый, брат.',
      shouts: ['Меч почти новый, брат.', 'Торг уместен!', 'Сила в самовывозе.'],
      lang: 'ru-RU', model: { color: 'песочный', accent: 'голубой', hat: 'капюшон' },
      skills: {
        a: { label: 'Б/у меч', type: 'shot', cd: 450, dmg: 100, speed: 900, r: 22, range: 120 },
        q: { label: 'Отражение по гарантии', type: 'deflect', cd: 7500, ms: 1300 },
        e: { label: 'Рывок к продавцу', type: 'dash', cd: 5500, dist: 210, dmg: 60 },
        r: { label: 'СИЛА САМОВЫВОЗА', type: 'aoe', at: 'self', cd: 23000, r: 260, dmg: 160, delay: 0, fx: { stun: 1200 } },
      },
    },
    private1943: {
      name: 'Рядовой 1943', emoji: '🎮', role: 'Артиллерия',
      bio: 'Застрял на первом уровне старого шутера и теперь охраняет двор.',
      hp: 900, speed: 215, shout: 'Сохранись перед подъездом!',
      shouts: ['Сохранись перед подъездом!', 'Патроны под лавкой!', 'Это просто уровень, сосед.'],
      lang: 'ru-RU', model: { color: 'оливковый', accent: 'коричневый', hat: 'каска' },
      skills: {
        a: { label: 'Винтовка', type: 'shot', cd: 600, dmg: 130, speed: 1000, r: 8, range: 780 },
        q: { label: 'Прицельный выстрел', type: 'shot', cd: 5200, dmg: 170, speed: 1150, r: 7, range: 850 },
        e: { label: 'В укрытие', type: 'dash', cd: 7000, dist: 175, dmg: 0 },
        r: { label: 'АРТПОДГОТОВКА', type: 'barrage', cd: 26000, count: 9, r: 85, dmg: 95, over: 2300 },
      },
    },
    gosha: {
      name: 'Контртеррорист Гоша', emoji: '🛡️', role: 'Защитник',
      bio: 'Обезвреживает таймер на микроволновке быстрее всей общаги.',
      hp: 1100, speed: 215, defuseMul: 0.7, shout: 'Щиты на вход!',
      shouts: ['Щиты на вход!', 'Таймер мой.', 'Закрываем проход к лифту!'],
      lang: 'ru-RU', model: { color: 'тёмно-синий', accent: 'оранжевый', hat: 'шлем' },
      skills: {
        a: { label: 'Тренировочный маркер', type: 'shot', cd: 410, dmg: 80, speed: 850, r: 9, range: 620 },
        q: { label: 'Щиты', type: 'wall', cd: 7500, len: 260, ms: 5000 },
        e: { label: 'Короткая перебежка', type: 'dash', cd: 6500, dist: 180, dmg: 0 },
        r: { label: 'ЗАКРЫТЫЙ ПРОХОД', type: 'wall', cd: 22000, len: 420, ms: 7000 },
      },
    },
    streamer: {
      name: 'Донатный стример', emoji: '📹', role: 'Поддержка',
      bio: 'Стримит двор так громко, что чат знает соседей поимённо.',
      hp: 780, speed: 245, shout: 'Чат, кто в рейд?',
      shouts: ['Чат, кто в рейд?', 'Донат 5000, читаю имя!', 'Клипайте этот подъезд!'],
      lang: 'ru-RU', model: { color: 'фиолетовый', accent: 'бирюзовый', hat: 'наушники' },
      skills: {
        a: { label: 'Эмодзи', type: 'shot', cd: 450, dmg: 65, speed: 780, r: 10, range: 600 },
        q: { label: 'Рейд чата', type: 'markAll', cd: 10000, r: 70, dmg: 80, delay: 500 },
        e: { label: 'Донат 5000', type: 'buff', cd: 9000, haste: 3000 },
        r: { label: 'ЧАТ, МЫ В ЭФИРЕ', type: 'aoe', at: 'self', cd: 23000, r: 290, dmg: 110, delay: 0, fx: { slow: 1800 } },
      },
    },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = { CHARS };
  else root.CHARS = CHARS;
})(this);
