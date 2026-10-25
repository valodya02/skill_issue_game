# Задача для Codex: v6, сэмплы пушек поверх синтеза

Пишешь только `web/public/sfx.js`, `web/public/client.js` (только вызовы звука), `web/public/weapons.js` (только поле `sfx`), `web/research/sfx-demo.html`, `web/research/check_sfx.js`. `server.js` и `lib/*` не трогай: их параллельно правят другие.

## Что есть
- `web/public/sfx/*.mp3` (10 файлов, 504 КБ, F8 Studios, `LICENSE.txt` рядом): shot_22, shot_556, shot_762, shot_54r, shot_double, reload_ar, reload_ak, reload_pump, bolt_mosin, rack_pistol.
- `sfx.js` синтезирует 15 звуков на WebAudio, API `play(name,{x,y})`, `music`, `setListener`, `volume`.
- `client.js:13` `sound(name,x,y)` зовёт `SFX.play(name,{x,y})`, id пушки не передаёт.

## Что сделать
1. В `sfx.js` слой сэмплов: при первом клике (AudioContext) `fetch` + `decodeAudioData` всех файлов из `sfx/`, кэш буферов. `play(name, opts)`: если есть `opts.weapon` и у пушки `sfx`, играть сэмпл (панорама и громкость от дистанции как сейчас, питч ±6% случайно, чтобы очередь не звучала пулемётом из одного файла); если буфер не загрузился, синтез как сейчас. Пул голосов 24 общий.
2. В `weapons.js` поле `sfx: {shot, reload}` огнестрельным: pistol → shot_22 / rack_pistol, makaroni → shot_556 / reload_ar, baguette → shot_54r / bolt_mosin, tapok → shot_double / reload_pump, turret_mg → shot_762 / reload_ak. Метательное (bow, stones, тапок-бумеранг, кирпич, снежок) остаётся синтезом.
3. `client.js`: при выстреле передавать id пушки стрелка (`SFX.play('shot',{x,y,weapon})`), при покупке огнестрела и при смене слота играть `reload` этой пушки.
4. Кредит «Gun sounds by F8 Studios» в подвал лобби в `index.html`, если подвала нет, мелким текстом внизу экрана лобби (можно трогать `index.html` только ради этой строки).
5. `sfx-demo.html`: кнопка на каждый сэмпл и на каждую пушку.

## Готово, когда
- `node --check` для `sfx.js`, `client.js`, `weapons.js`
- `node -e "global.window={};require('./web/public/sfx.js')"` не падает без WebAudio и без fetch
- `node web/research/check_sfx.js`: каждый `sfx` в weapons.js указывает на существующий файл в `web/public/sfx/`, все файлы sfx/ ≤ 600 КБ суммарно
- отчёт: какие события звучат сэмплом, что осталось синтезом
