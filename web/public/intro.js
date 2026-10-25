// Заставка запуска: AEC, ALex Eval Corp + Mark & Corp, и прыжок в гиперпространство по битам из мода hyperspace:
// звёзды тянутся в лучи от точки схода, вспышка, синий туннель с белым ядром, туннель рвётся, лучи снова звёзды.
// Любая клавиша или клик пропускает. ?nointro выключает (для headless-тестов).
(() => {
  if (/[?&]nointro\b/.test(location.search)) return;
  const LEN = 7200, CHARGE = 1800, FLASH = 2700, EXIT = 5000;
  const cv = document.createElement('canvas');
  cv.style.cssText = 'position:fixed;inset:0;z-index:20;background:#03040a;cursor:pointer';
  const title = document.createElement('div');
  title.style.cssText = 'position:fixed;inset:0;z-index:21;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;color:#fff;text-align:center;font-family:system-ui,"Segoe UI",sans-serif';
  title.innerHTML = `<div id="in-a" style="font:900 clamp(64px,14vw,180px)/1 system-ui;letter-spacing:.18em;padding-left:.18em;opacity:0;text-shadow:0 0 40px #4aa8ff88">AEC</div>
    <div id="in-b" style="margin-top:14px;font:600 clamp(14px,2.2vw,22px)/1.3 system-ui;letter-spacing:.32em;text-transform:uppercase;opacity:0;color:#cfe4ff">ALex Eval Corp <span style="color:#ffd23f">+</span> Mark &amp; Corp</div>
    <div id="in-c" style="margin-top:28px;font:800 clamp(28px,5vw,56px)/1 system-ui;letter-spacing:.06em;opacity:0;color:#ffd23f">${document.title.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</div>
    <div id="in-d" style="position:fixed;bottom:22px;font:500 12px system-ui;letter-spacing:.2em;color:#ffffff55">ЛЮБАЯ КЛАВИША, ЧТОБЫ ПРОПУСТИТЬ</div>`;
  document.body.append(cv, title);
  const ctx = cv.getContext('2d');
  const $ = (id) => document.getElementById(id);
  let W = 0, H = 0, dpr = 1;
  const fit = () => { dpr = Math.min(2, devicePixelRatio || 1); W = cv.width = innerWidth * dpr; H = cv.height = innerHeight * dpr; };
  fit(); addEventListener('resize', fit);

  // звёзды в 3D: x, y в [-1, 1], z глубина; камера летит по +z
  const N = 900, stars = Array.from({ length: N }, () => ({ x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: Math.random() }));
  const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
  const t0 = performance.now();
  let done = false, raf = 0;

  function frame(now) {
    const p = now - t0;
    if (p > LEN) return finish();
    const cx = W / 2, cy = H / 2, f = Math.min(W, H) * 0.9;
    // скорость: полёт, разгон перед прыжком, туннель, сброс на выходе
    const speed = p < CHARGE ? 0.08 : p < FLASH ? 0.08 + 2.4 * ease((p - CHARGE) / (FLASH - CHARGE)) : p < EXIT ? 2.6 : 2.6 * (1 - ease((p - EXIT) / 900)) + 0.06;
    const tunnel = p >= FLASH && p < EXIT ? Math.min(1, (p - FLASH) / 300, (EXIT - p) / 350) : 0;
    ctx.fillStyle = `rgba(3,4,10,${p < FLASH ? 0.55 : 0.35})`;
    ctx.fillRect(0, 0, W, H);

    // туннель: синие кольца-полосы, белое ядро в точке схода
    if (tunnel > 0) {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.7);
      g.addColorStop(0, `rgba(255,255,255,${0.95 * tunnel})`);
      g.addColorStop(0.08, `rgba(150,205,255,${0.75 * tunnel})`);
      g.addColorStop(0.35, `rgba(38,115,255,${0.45 * tunnel})`);
      g.addColorStop(1, 'rgba(3,6,30,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.lineWidth = 2 * dpr;
      for (let i = 0; i < 70; i++) {
        const a = i * 2.399 + p * 0.0007 * (i % 2 ? 1 : -1), r0 = ((i * 97 + p * 0.9) % 900) / 900;
        const r1 = Math.min(1, r0 + 0.12);
        ctx.strokeStyle = `rgba(${120 + (i % 3) * 40},${190 + (i % 2) * 40},255,${0.5 * tunnel * r0})`;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r0 * r0 * W, cy + Math.sin(a) * r0 * r0 * W);
        ctx.lineTo(cx + Math.cos(a) * r1 * r1 * W, cy + Math.sin(a) * r1 * r1 * W);
        ctx.stroke();
      }
    }

    // звёзды и лучи: длина хвоста растёт со скоростью
    ctx.lineCap = 'round';
    for (const s of stars) {
      const z0 = s.z;
      s.z -= speed * 0.016;
      if (s.z <= 0.02) { s.x = Math.random() * 2 - 1; s.y = Math.random() * 2 - 1; s.z = 1; continue; }
      const x = cx + (s.x / s.z) * f * 0.5, y = cy + (s.y / s.z) * f * 0.5;
      const tz = Math.min(1, z0 + speed * 0.05);
      const px = cx + (s.x / tz) * f * 0.5, py = cy + (s.y / tz) * f * 0.5;
      const br = Math.min(1, (1 - s.z) * 1.4) * (1 - tunnel * 0.7);
      ctx.strokeStyle = `rgba(200,230,255,${br})`;
      ctx.lineWidth = Math.max(1, (1 - s.z) * 2.6) * dpr;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x + 0.1, y); ctx.stroke();
    }

    // вспышка в момент прыжка
    if (p >= FLASH - 80 && p < FLASH + 260) {
      const k = 1 - Math.abs(p - FLASH - 60) / 200;
      if (k > 0) { ctx.fillStyle = `rgba(235,245,255,${k})`; ctx.fillRect(0, 0, W, H); }
    }

    // титры: AEC до прыжка, название игры на выходе
    $('in-a').style.opacity = p < FLASH ? ease((p - 200) / 700) : 1 - ease((p - FLASH) / 200);
    $('in-a').style.transform = `scale(${1 + (p > CHARGE ? ease((p - CHARGE) / (FLASH - CHARGE)) * 0.35 : 0)})`;
    $('in-b').style.opacity = p < FLASH ? ease((p - 650) / 700) : 1 - ease((p - FLASH) / 200);
    $('in-c').style.opacity = p > EXIT ? ease((p - EXIT - 200) / 500) : 0;
    raf = requestAnimationFrame(frame);
  }

  function finish() {
    if (done) return;
    done = true; cancelAnimationFrame(raf);
    cv.style.transition = title.style.transition = 'opacity .45s';
    cv.style.opacity = title.style.opacity = '0';
    setTimeout(() => { cv.remove(); title.remove(); }, 480);
    removeEventListener('keydown', skip, true);
    removeEventListener('resize', fit);
  }
  // клавиша пропуска не должна долететь до игры (4 и 5 кидают гранаты, Enter жмёт готов)
  function skip(e) { e.stopImmediatePropagation(); e.preventDefault(); finish(); }
  addEventListener('keydown', skip, true);
  cv.addEventListener('click', finish);
  raf = requestAnimationFrame(frame);
})();
