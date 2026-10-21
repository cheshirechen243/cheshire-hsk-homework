// Free-hand layer over a worksheet page (lessons with "ink": true): Vẽ (pen) / Chèn chữ (typed text anywhere) / Tẩy (eraser) / Hoàn tác (undo) + colours.
// One canvas per page; the work is kept as a vector list in answers['~ink<page>'] = { a: [ {k:'p'|'e', c, p:[x,y,x,y…]} | {k:'t', c, x, y, t} ] }
// (coordinates are fractions of the page width / height, so it looks the same at every zoom and on every screen).
(function () {
  const COLORS = [['#2E5AAC', 'Xanh dương'], ['#D6336C', 'Hồng đậm'], ['#2A7A3B', 'Xanh lá'], ['#7A3DA6', 'Tím'], ['#2B2620', 'Đen']];
  const st = { tool: 'type', color: COLORS[0][0], last: null, canvases: [], bar: null };
  const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
  const KEY = p => '~ink' + p;

  function syncTool() {
    st.canvases.forEach(c => { if (c._live) { c.style.pointerEvents = st.tool === 'type' ? 'none' : 'auto'; c.style.cursor = st.tool === 'text' ? 'text' : 'crosshair'; c.style.touchAction = st.tool === 'type' ? 'auto' : 'none'; } });
    if (st.bar) { st.bar.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === st.tool)); st.bar.querySelectorAll('.sw').forEach(b => b.classList.toggle('on', b.dataset.c === st.color)); }
  }
  function undo() {
    const live = st.canvases.filter(x => x._live);
    const c = st.last && st.last._list().length ? st.last : live.reverse().find(x => x._list().length); if (!c) return;
    c._list().pop(); c._paint(); c._save();
  }

  // the tool bar (put it into the lesson's top bar)
  function toolbar() {
    const bar = el('div', 'zoom inkbar'); st.bar = bar;
    bar.appendChild(el('span', 'zl', '✍ 作答方式 · Cách làm'));
    [['type', '⌨ Gõ / Cuộn', '打字或滚动页面 · Gõ chữ vào ô, hoặc cuộn trang'], ['pen', '✏️ Vẽ', '手写 · Viết / vẽ bằng tay'], ['text', '🔤 Chèn chữ', '点页面任意位置打字 · Bấm vào trang để gõ chữ'], ['eraser', '🧽 Tẩy', '橡皮 · Xoá nét vẽ']].forEach(([k, t, tip]) => {
      const b = el('button', null, t); b.type = 'button'; b.dataset.tool = k; b.title = tip; b.onclick = () => { st.tool = k; syncTool(); }; bar.appendChild(b);
    });
    const un = el('button', null, '↩️ Hoàn tác'); un.type = 'button'; un.title = '撤销 · Quay lại bước trước (Ctrl+Z)'; un.onclick = undo; bar.appendChild(un);
    const sw = el('span', 'swatches');
    COLORS.forEach(([c, n]) => { const b = el('button', 'sw'); b.type = 'button'; b.dataset.c = c; b.title = n; b.style.background = c; b.onclick = () => { st.color = c; if (st.tool === 'type' || st.tool === 'eraser') st.tool = 'pen'; syncTool(); }; sw.appendChild(b); });
    bar.appendChild(sw);
    syncTool(); return bar;
  }
  addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && st.bar && !/INPUT|TEXTAREA/.test((document.activeElement || {}).tagName || '')) { e.preventDefault(); undo(); } });

  // one page: canvas over the page picture
  function attach(page, pn, answers, locked, onChange) {
    const cv = el('canvas', 'ink'); page.appendChild(cv); cv._live = !locked;
    const list = () => { const v = answers[KEY(pn)]; return v && Array.isArray(v.a) ? v.a : []; };
    const ensure = () => { const v = answers[KEY(pn)]; if (!v || !Array.isArray(v.a)) answers[KEY(pn)] = { a: [] }; return answers[KEY(pn)].a; };
    cv._list = list;
    const FS = 0.026;                                                    // text size, fraction of the page width
    const paint = live => {
      const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = Math.max(1, Math.round(r.width * dpr)), H = Math.max(1, Math.round(r.height * dpr));
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      const g = cv.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H); g.lineCap = g.lineJoin = 'round';
      const one = a => {
        if (a.k === 't') { g.globalCompositeOperation = 'source-over'; g.fillStyle = a.c; g.font = '700 ' + Math.round(W * FS) + 'px "Noto Sans SC","Be Vietnam Pro",Nunito,sans-serif'; g.textBaseline = 'alphabetic'; g.fillText(a.t, a.x * W, a.y * H); return; }
        g.globalCompositeOperation = a.k === 'e' ? 'destination-out' : 'source-over'; g.strokeStyle = a.c; g.lineWidth = W * (a.k === 'e' ? 0.026 : 0.0036);
        const p = a.p; g.beginPath(); g.moveTo(p[0] * W, p[1] * H);
        if (p.length <= 2) g.lineTo(p[0] * W + .1, p[1] * H); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i] * W, p[i + 1] * H);
        g.stroke();
      };
      list().forEach(one); if (live) one(live); g.globalCompositeOperation = 'source-over';
    };
    cv._paint = paint; cv._save = () => { onChange && onChange(KEY(pn), answers[KEY(pn)]); };
    if (window.ResizeObserver) new ResizeObserver(() => paint()).observe(cv); else addEventListener('resize', () => paint());
    st.canvases.push(cv); requestAnimationFrame(() => paint());
    if (locked) { cv.style.pointerEvents = 'none'; return; }

    const rel = e => { const r = cv.getBoundingClientRect(); return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))]; };
    let cur = null;
    cv.addEventListener('pointerdown', e => {
      if (st.tool === 'type') return; st.last = cv; e.preventDefault();
      if (st.tool === 'text') { openText(e); return; }
      cv.setPointerCapture(e.pointerId); const [x, y] = rel(e);
      cur = { k: st.tool === 'eraser' ? 'e' : 'p', c: st.color, p: [+x.toFixed(4), +y.toFixed(4)] };
    });
    cv.addEventListener('pointermove', e => {
      if (!cur) return; e.preventDefault(); const [x, y] = rel(e), n = cur.p.length;
      const r = cv.getBoundingClientRect(); if (Math.hypot((x - cur.p[n - 2]) * r.width, (y - cur.p[n - 1]) * r.height) < 1.2) return;   // thin out the points
      cur.p.push(+x.toFixed(4), +y.toFixed(4)); paint(cur);
    });
    const end = () => { if (!cur) return; ensure().push(cur); cur = null; paint(); cv._save(); };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);

    function openText(e) {
      const [x, y] = rel(e), r = cv.getBoundingClientRect();
      const inp = el('input', 'ink-text'); inp.type = 'text'; inp.style.cssText = 'position:fixed;z-index:999;left:' + e.clientX + 'px;top:' + (e.clientY - 16) + 'px;color:' + st.color + ';font-size:' + Math.max(14, r.width * FS) + 'px';
      inp.placeholder = '…'; document.body.appendChild(inp); setTimeout(() => inp.focus(), 0);
      let done = false;
      const fin = ok => {
        if (done) return; done = true; const t = inp.value.trim(); inp.remove();
        if (ok && t) { ensure().push({ k: 't', c: st.color, x: +x.toFixed(4), y: +y.toFixed(4), t }); paint(); cv._save(); }
      };
      inp.addEventListener('blur', () => fin(true));
      inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); fin(true); } if (ev.key === 'Escape') fin(false); });
    }
  }

  window.HSKInk = { toolbar, attach, has: (answers, pn) => { const v = answers[KEY(pn)]; return !!(v && v.a && v.a.length); } };
})();
