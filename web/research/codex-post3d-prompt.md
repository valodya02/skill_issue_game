# Задача для Codex: картинка v6, пост-обработка и тун-стиль для 3D

Пишешь только: `web/public/post3d.js`, `web/public/look3d.js`, `web/public/demo3d.html`, `web/research/check_post3d.js`, `web/research/POST3D.md` и одну строку в `web/server.js` (раздача `/vendor` из `node_modules/three/build`, рядом с `express.static`; если такая строка уже есть, server.js не трогай). Остальное не трогай: параллельно другая модель пишет 3D-клиент (`game3d.js` и др.), твои модули он подключит сам.

Прочитай `web/public/map3d.js` (экспорт `buildMap(scene, map)`), `web/public/parts3d.js`, `web/public/chars.js` (поле `model {color, accent, hat}`), `web/research/refs/REFS.md`.

## Стиль

Низкополигональный flat shading, московская осень, мемный шутер для жюри хакатона. Цель: картинка с одного скрина отличается от «дефолтного Three.js». Ориентиры: тун-контур как в Borderlands и TABS, тёплый свет фонарей против холодных теней, лёгкая плёнка. Бюджет: весь пост не дороже 1,5 мс на кадр на Radeon Vega 8 (Ryzen 5700U) в 1080p при pixelRatio 1, значит максимум 1 полноэкранный проход плюс опционально 1 проход контура на половинном разрешении.

## Что сделать

1. `post3d.js`: `export function createPost(renderer, scene, camera, opts)` → `{ render(dt), setPreset(name), kick(kind, amount), resize(w,h), dispose() }`. Без EffectComposer и addons, свой `WebGLRenderTarget` + полноэкранный треугольник + один `ShaderMaterial`. В одном шейдере:
   - цветокоррекция: lift / gamma / gain, сатурация, split-toning (тени в сине-бирюзовый, света в янтарный), контраст по S-кривой
   - виньетка, лёгкое зерно (анимированное, амплитуда 0,03), опциональная постеризация на N уровней
   - эффекты по событиям через `kick`: `hit` (красная виньетка и хроматическая аберрация 150 мс), `coffee` (wobble UV и тёплый сдвиг 3 с, сила по amount), `smoke` (десатурация к краям), `slowmo` (зелёный тинт и радиальное смазывание лёгкое), `boom` (вспышка экспозиции 80 мс), `death` (ч/б 1 с)
   - пресеты: `autumn` (по умолчанию), `night` (фонари, холод, сильнее виньетка), `vhs` (сканлайны, сдвиг каналов, как кассета из 90-х), `off`. Клавиша P в demo3d циклит пресеты.
2. Контур: в шейдере поста по глубине и нормалям (Sobel по depth-текстуре, `depthTexture` в render target), толщина 1–2 px, тёмно-фиолетовый, не чёрный. Флаг `outline: true|false`. Если глубина недоступна, контур выключается сам, игра не падает.
3. `look3d.js`: `export function toonMaterial(color, opts)` (MeshToonMaterial с gradientMap на 3 ступени, генерится DataTexture 3×1), `export function applyLook(scene)` (пробегает меши и меняет материалы на тун с теми же цветами, InstancedMesh не ломает), `export function sky(scene)` (градиентное небо шейдером: снизу грязно-оранжевый смог, сверху серо-синий), `export function fog(scene, preset)`, `export function lights(scene, preset)` (одна направленная тень 1024, полусферический свет, тёплые точечные у фонарей из `decor` с `kind` фонаря, не больше 4 точечных).
4. `demo3d.html`: грузит `rayon.json`, `buildMap`, `applyLook`, `sky`, `lights`, `createPost`, вращает камеру вокруг карты, кнопки на каждый `kick` и каждый пресет, F3 показывает FPS, мс поста (через `EXT_disjoint_timer_query_webgl2`, если есть, иначе «нет таймера»), `renderer.info.render.calls`.
5. `POST3D.md`: как подключить в `game3d.js` три строки, таблица «событие сервера → kick», какие пресеты для какой фазы (лобби `vhs`, бой `autumn`, конец матча `night`).

## Готово, когда

- `node --check` для `post3d.js`, `look3d.js` (как ESM: `node --input-type=module --check < file` или аналог)
- `node web/research/check_post3d.js`: импортирует модули с заглушкой THREE не нужно; достаточно проверить, что исходник шейдера собирается в строку, все uniform из списка `kick` и пресетов объявлены в GLSL, у каждого пресета все ключи заданы, `kick` неизвестного имени не падает
- `curl` к `/vendor/three.module.js` на локальном сервере отдаёт 200 (Клод проверит сам, если сети в песочнице нет)
- отчёт: число проходов, цена в мс по твоей оценке, что не проверил без браузера
