# Codex: 3D-клиент настоящей игры (сейчас на проде только 2D)

Почему задача: прод (`index.html` + `client.js`) рисует 2D canvas. 3D у нас есть только как статичная витрина `demo3d.html` (карта + пост-обработка, без сокета). `../webgame/` у Володи это отдельный прототип на `ws` со своим сервером, наш socket.io он не знает. Склейки snapshot → 3D нет нигде.

Пишешь: `web/public/client3d.js`, `web/public/actors3d.js`, `web/research/check_client3d.js`, `web/research/CLIENT3D.md`; в `web/public/index.html` и `web/public/client.js` только минимальные врезки (см. ниже). `server.js`, `lib/`, `map3d.js`, `post3d.js`, `look3d.js`, `parts3d.js` не правишь, только импортируешь.

Сначала прочитай `client.js` целиком, `index.html`, `map3d.js`, `parts3d.js`, `post3d.js`, `look3d.js`, `demo3d.html`, `research/CONTRACT.md`, функцию `snapshot()` в `server.js`, `research/refs/REFS.md`.

## Как встроить
3D это слой рендера, а не второй клиент. Лобби, магазин, HUD, ввод, звук и сокет остаются в `client.js`. Врезка в `client.js`: после каждого `state` и `fx` вызвать `window.GAME3D?.state(s)` / `window.GAME3D?.fx(f)`, после `meta` `window.GAME3D?.meta(m)`; мышь в мировые координаты брать из `GAME3D.pick(clientX, clientY)` (луч на плоскость y=0 → `x = (X+20)*40`, `y = (Z+11.25)*40`), если 3D включён. 2D canvas прячется, HUD поверх. Включение: `?3d=1` или клавиша F9, по умолчанию 3D, если WebGL2 есть, иначе 2D.

## Что рисует
- карта `buildMap` по `maps/rayon.json`, `applyLook`, `createPost` (пресет autumn), F3 оверлей: FPS, мс кадра, draw calls, треугольники
- игроки: `models/vendor/poly-pizza-rigged-character` (GLB со скином) с цветом и шапкой по `chars.js`, анимация бег/стойка по скорости между snapshot, подъём на `z/40`, тень-диск; имя и hp над головой; мёртвый ложится
- снаряды через `buildProjectile`/`trailFx` из `parts3d.js`, пул без аллокаций в кадре; зоны кофе и дыма, бомба, турели
- fx: выстрел, урон (`post.kick('hit')`), взрыв (`boom`), кофе
- камера сверху-сзади за своим игроком, плавная, без укачивания
- интерполяция чужих по буферу 100 мс; свой игрок тоже из snapshot (предсказание не делаем)

## Производительность (цель: интегрированная Radeon у жюри ≥ 45 FPS, RTX 3050 ≥ 90)
pixelRatio ≤ 1,5, одна тень 1024, статику карты слить в несколько мешей или InstancedMesh, материалы общие, ноль `new` в кадре в горячем пути. `check_client3d.js` без браузера: строит сцену карты в Node через three (без рендерера) и печатает число мешей, материалов, треугольников; FAIL, если мешей статики > 150 или треугольников > 150 000. Плюс проверка, что pick ↔ мировые координаты взаимно обратны.

## Готово, когда
`node --check` на всех файлах, `node research/check_client3d.js` зелёный, `node research/check_server.js` зелёный, 2D-режим работает как раньше (`?3d=0`). В `CLIENT3D.md`: что включено, цифры сцены, что проверить руками в браузере за 3 минуты.
