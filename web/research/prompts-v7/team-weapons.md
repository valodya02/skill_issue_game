# Вадиму, Юле, Лауре: оружие в Claude Design, v7

Приложи файлы: `web/public/weapons.js` (магазин SHOP, поле `model`), `web/research/weapons.json`, `web/public/parts3d.js` (как модель оружия собирается в 3D), `web/research/balance.md`.

Делим: Вадим пушки (pistol, makaroni, baguette, tapok, turret_mg), Юля метательное и гранаты (coffee, smoke, stones, brick, snowball, boomerang, bow), Лаура странное (balalaika, cappuccino, soda, rake, wifi).

---

Задача: дизайн оружия для браузерного шутера «Skill Issue Strike» (московский спальник, пародия на КС, низкополигональный стиль). Оружие видно в руке от первого лица (правый нижний угол экрана) и в руках у других игроков.

**Для каждого оружия из своего списка:**
1. Эскиз в Claude Design: вид сбоку и вид от первого лица (как держится, что попадает в кадр).
2. Рецепт сборки, до 6 частей: `{shape: box|cyl|sphere|cone|torus|disc|slipper, size: [x,y,z], pos: [x,y,z], color: "#rrggbb"}` в юнитах, длина 0.4–0.9, ствол смотрит по `-z`, рукоять в точке `0,0,0`. Это формат `model.parts` из `weapons.js`, вставляется в код как есть.
3. Снаряд и след: `projectile` (ball, arrow, slipper, disc, cone) и `trail` (none, smoke, sparkle). У пушек пуля летит трассером, у гранат дугой.
4. Строка шутки `lore`, если хочется поменять.

**Стиль:** flat-shading, 2–3 цвета на предмет, бытовые вещи как оружие (макароны, багет, тапок), без реальных брендов и логотипов, без длинного тире.

Сдача: страница Claude Design + JSON `{ "<id>": { "parts": [...], "projectile": "...", "trail": "..." } }`. Кидайте в чат команды, Саша вливает.
