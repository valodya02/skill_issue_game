(function (root) {
  function drawMap(ctx, map) {
    const W = map.W, H = map.H;
    ctx.save();
    ctx.fillStyle = '#889679';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#777c7a';
    ctx.fillRect(0, 402, W, 126);
    ctx.fillRect(730, 0, 145, H);
    ctx.fillStyle = '#e5e1c8';
    for (let i = 0; i < 7; i++) ctx.fillRect(1360 + i * 29, 398, 13, 135);
    ctx.strokeStyle = '#d1cbb1';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, 400); ctx.lineTo(W, 400);
    ctx.moveTo(0, 530); ctx.lineTo(W, 530); ctx.stroke();

    function rect(o, fill, label) {
      ctx.fillStyle = fill;
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.strokeStyle = 'rgba(25,32,30,.55)';
      ctx.lineWidth = 2;
      ctx.strokeRect(o.x, o.y, o.w, o.h);
      ctx.fillStyle = '#f4f0dc';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (o.w > 55) ctx.fillText(label, o.x + o.w / 2, o.y + o.h / 2, o.w - 8);
    }
    for (const o of map.solid || []) rect(o, o.kind === 'panelka' ? '#676b69' : '#545e5a', o.kind);
    for (const o of map.low || []) rect(o, '#aba98a', o.kind);
    for (const d of map.decor || []) {
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.kind === 'poplar' ? 17 : 6, 0, Math.PI * 2);
      ctx.fillStyle = d.kind === 'poplar' ? '#4f7850' : d.kind === 'lamp' ? '#f2d88f' : '#796b5a';
      ctx.fill();
    }
    for (const [team, list] of Object.entries(map.spawns || {})) {
      for (const [x, y] of list) {
        ctx.fillStyle = team === '0' ? '#5aadd0' : '#d07868';
        ctx.beginPath(); ctx.arc(x, y, 19, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(team, x, y);
      }
    }
    for (const [letter, site] of Object.entries(map.sites || {})) {
      ctx.strokeStyle = letter === 'A' ? '#f4c576' : '#d8a4bd';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(site.x, site.y, site.r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#fff8dc'; ctx.font = 'bold 34px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(letter, site.x, site.y);
    }
    for (const shop of map.shops || []) {
      ctx.fillStyle = '#a33436';
      ctx.beginPath(); ctx.arc(shop.x, shop.y, 18, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('₽', shop.x, shop.y);
    }
    for (const npc of map.npcs || []) {
      ctx.fillStyle = '#e9d9bd';
      ctx.beginPath(); ctx.arc(npc.x, npc.y, 8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  root.MAP2D = { drawMap };
})(this);
