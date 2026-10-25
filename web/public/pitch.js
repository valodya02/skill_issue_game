// экраны питча: листаются стрелками, пробелом и кликом; последний экран ведёт в лобби игры
const stage = document.getElementById('stage');
const scr = [...document.querySelectorAll('.scr')];
const $ = (id) => document.getElementById(id);
let cur = 0;

function fit() {
  const k = Math.min(innerWidth / 1920, innerHeight / 1080);
  stage.style.transform = `translate(${(innerWidth - 1920 * k) / 2}px, ${(innerHeight - 1080 * k) / 2}px) scale(${k})`;
}

function show(i) {
  cur = Math.max(0, Math.min(scr.length - 1, i));
  scr.forEach((s, j) => s.classList.toggle('on', j === cur));
  $('slot').textContent = `${cur + 1}/${scr.length} · ${scr[cur].dataset.name}`;
  // кейноут: строки появляются по одной
  scr[cur].querySelectorAll('.reveal').forEach((el, j) => {
    el.style.opacity = 0; el.style.transition = 'opacity .5s';
    setTimeout(() => { el.style.opacity = 1; }, 600 + j * 900);
  });
  $('menu').classList.remove('on');
  try { history.replaceState(null, '', '#' + (cur + 1)); } catch {}
}

addEventListener('keydown', (e) => {
  if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); show(cur + 1); }
  else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); show(cur - 1); }
  else if (e.key === 'Home') show(0);
  else if (e.key === 'End') show(scr.length - 1);
  else if (e.key.toLowerCase() === 'f' || e.key.toLowerCase() === 'а') document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
});

document.querySelectorAll('.next').forEach((b) => b.addEventListener('click', () => show(cur + 1)));
document.querySelectorAll('.bingo .cell').forEach((c) => c.addEventListener('click', () => c.classList.toggle('x')));

// «Отмена» убегает от курсора
const run = $('runaway');
run.style.position = 'relative';
run.addEventListener('mouseenter', () => {
  run.style.left = (Math.random() * 600 - 500) + 'px';
  run.style.top = (Math.random() * 160 - 120) + 'px';
});
run.addEventListener('click', () => show(cur + 1));

// пуск-меню = оглавление
$('menuList').innerHTML = scr.map((s, i) => `<a data-i="${i}">${i + 1}. ${s.dataset.name}</a>`).join('');
$('menuList').addEventListener('click', (e) => { const i = e.target.dataset.i; if (i != null) show(+i); });
$('start').addEventListener('click', (e) => { e.stopPropagation(); $('menu').classList.toggle('on'); });
$('shut').addEventListener('click', () => show(scr.length - 1));
$('toStart').addEventListener('click', () => show(0));
document.addEventListener('click', (e) => { if (!$('menu').contains(e.target) && e.target !== $('start')) $('menu').classList.remove('on'); });

function tick() { const d = new Date(); $('clock').textContent = d.toTimeString().slice(0, 5); }
setInterval(tick, 10000); tick();

addEventListener('resize', fit); fit();
show((parseInt(location.hash.slice(1), 10) || 1) - 1);
