// Renders a lesson's PDF pages with interactive answer fields laid over them.
// Field rects are stored as fractions (0-1) of the page image, so they scale with any screen.
(function () {
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const pct = r => `left:${r[0] * 100}%;top:${r[1] * 100}%;width:${r[2] * 100}%;height:${r[3] * 100}%`;
  let pop = null;

  function closePop() { if (pop) { pop.remove(); pop = null; } }
  document.addEventListener('pointerdown', e => { if (pop && !pop.contains(e.target) && !e.target.closest('.f-pick')) closePop(); });

  function openPick(anchor, field, current, onPick) {
    closePop();
    pop = el('div', 'pick-pop');
    [...field.options].forEach(L => {
      const b = el('button', 'pick-letter' + (L === current ? ' on' : ''), L); b.type = 'button';
      b.onclick = () => { onPick(L); closePop(); };
      pop.appendChild(b);
    });
    const clr = el('button', 'pick-letter clr', '✕'); clr.type = 'button'; clr.title = '清除 / Xoá'; clr.onclick = () => { onPick(''); closePop(); };
    pop.appendChild(clr);
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
    let x = r.left + r.width / 2 - pw / 2, y = r.bottom + 6;
    if (y + ph > innerHeight - 8) y = r.top - ph - 6;
    x = Math.max(8, Math.min(x, innerWidth - pw - 8));
    pop.style.left = x + 'px'; pop.style.top = y + 'px';
  }

  // opts: {base, answers, mode:'fill'|'locked'|'review'|'edit', results, key, onChange, onField}
  function renderLesson(root, lesson, opts) {
    root.innerHTML = '';
    const answers = opts.answers || {}; _answers = answers;
    const locked = opts.mode !== 'fill';
    const R = opts.results || {};            // per field result from HSKGrade.gradeAll
    const refs = {};

    lesson.pages.forEach((pg, pi) => {
      const wrap = el('section', 'page-card'); wrap.dataset.page = pi + 1;
      const page = el('div', 'page'); page.style.aspectRatio = pg.w + '/' + pg.h;
      const img = el('img'); img.src = opts.base + pg.img; img.alt = 'page ' + (pi + 1); img.draggable = false;
      page.appendChild(img);
      const lab = el('div', 'page-no', (pi + 1) + ' / ' + lesson.pages.length);
      wrap.appendChild(page); wrap.appendChild(lab); root.appendChild(wrap);

      lesson.fields.filter(f => f.page === pi + 1).forEach(f => {
        const res = R[f.id];
        const state = res ? (res.auto ? (res.correct || (res.overridden && res.points >= f.points) ? 'ok' : (res.overridden && res.points > 0 ? 'part' : 'bad')) : (res.graded ? (res.points >= f.points ? 'ok' : res.points > 0 ? 'part' : 'bad') : 'wait')) : '';
        const val = answers[f.id];
        const set = v => { answers[f.id] = v; opts.onChange && opts.onChange(f.id, v); };
        const mk = (rect, cls) => { const d = el('div', 'field ' + cls + (state ? ' is-' + state : '')); d.style.cssText = pct(rect); d.dataset.fid = f.id; page.appendChild(d); return d; };

        if (f.type === 'choice') {
          const group = [];
          f.options.forEach(o => {
            const d = mk(o.rect, 'f-opt' + (val === o.v ? ' on' : ''));
            const key = opts.key && opts.key[f.id];
            if (locked && key === o.v && opts.showAnswers) d.classList.add('is-key');
            d.title = o.v; group.push({ v: o.v, d });
            if (!locked) d.onclick = () => {
              const nv = answers[f.id] === o.v ? '' : o.v; set(nv);
              group.forEach(x => x.d.classList.toggle('on', x.v === nv));
              opts.rerender && opts.rerender();
            };
            refs[f.id] = d;
          });
        } else if (f.type === 'pick') {
          const d = mk(f.rect, 'f-pick'); const t = el('span', 'f-val', val || ''); d.appendChild(t);
          if (!val) d.classList.add('empty');
          if (!locked) d.onclick = () => openPick(d, f, val, v => { set(v); t.textContent = v; d.classList.toggle('empty', !v); opts.rerender && opts.rerender(); });
          refs[f.id] = d;
        } else if (f.type === 'text' || f.type === 'hanzi') {
          const d = mk(f.rect, 'f-text ' + (f.type === 'hanzi' ? 'hanzi' : (f.size || 'md')));
          const i = el('input'); i.type = 'text'; i.value = val || ''; i.disabled = locked; i.autocomplete = 'off'; i.setAttribute('autocapitalize', 'off'); i.spellcheck = false;
          if (f.type === 'hanzi') i.maxLength = 2;
          i.oninput = () => { set(i.value); opts.rerender && opts.rerender(); };
          d.appendChild(i);
          if (f.type === 'hanzi' && !locked && window.HSKStroke) {
            const b = el('button', 'stroke-btn', '✍'); b.type = 'button'; b.title = '练习笔顺 / Luyện nét';
            b.onclick = e => { e.stopPropagation(); const ch = (i.value || '').trim().charAt(0); if (!ch) { i.focus(); return; } HSKStroke.open(ch, r => { answers[f.id + '~s'] = r; opts.onChange && opts.onChange(f.id + '~s', r); }); };
            d.appendChild(b);
          }
          if (locked && answers[f.id + '~s']) { const s = answers[f.id + '~s']; d.appendChild(el('span', 'stroke-tag', s.done ? '笔顺✓' + (s.mistakes ? ' ' + s.mistakes + '错' : '') : '')); }
          refs[f.id] = i;
        } else if (f.type === 'essay') {
          const d = mk(f.rect, 'f-essay'); const t = el('textarea'); t.value = val || ''; t.disabled = locked; t.rows = 2; t.spellcheck = false;
          t.oninput = () => { set(t.value); opts.rerender && opts.rerender(); }; d.appendChild(t); refs[f.id] = t;
        } else if (f.type === 'draw') {
          const d = mk(f.rect, 'f-draw'); const c = el('canvas'); d.appendChild(c);
          requestAnimationFrame(() => setupCanvas(c, val && val.img, locked, v => set(v ? { img: v } : ''), f));
          if (!locked) { const b = el('button', 'draw-clear', '↺'); b.type = 'button'; b.title = '清除 / Xoá'; b.onclick = e => { e.stopPropagation(); c._clear(); }; d.appendChild(b); }
        }
        if (res && opts.mode === 'review') addMarks(page, f, res, opts.key, pg);
        if (opts.onField) opts.onField(f, page);
      });
    });
    return refs;
  }

  // ✅ / ❌ badge on the field's top-right corner; wrong fill-ins also get the right answer above the box.
  function addMarks(page, f, res, key, pg) {
    const put = (cls, html, left, top) => { const d = el('div', cls, html); d.style.left = left * 100 + '%'; d.style.top = top * 100 + '%'; page.appendChild(d); return d; };
    if (res.auto) {
      const right = res.correct || (res.overridden && res.points >= f.points);
      if (f.type === 'choice') {
        const sel = (opts_answer(page, f.id) || {});
        f.options.forEach(o => {
          const isKey = key && key[f.id] === o.v;
          if (sel.v === o.v) put('mark', right ? '✅' : '❌', o.rect[0] + o.rect[2], o.rect[1]);
          else if (isKey && !right) put('mark', '✅', o.rect[0] + o.rect[2], o.rect[1]);
        });
      } else {
        put('mark', right ? '✅' : '❌', f.rect[0] + f.rect[2], f.rect[1]);
        if (!right && key && key[f.id] != null) {
          const txt = 'Đáp án · ' + [].concat(key[f.id])[0];
          // letter boxes have free space on their left; fill-ins sit inside sentences, so their hint goes above
          if (f.type === 'pick' && f.tag !== 'above') put('fix-tag left', txt, f.rect[0] - .006, f.rect[1] + f.rect[3] / 2);
          else put('fix-tag', txt, f.rect[0], f.rect[1]);
        }
      }
    } else if (f.rect) {
      if (res.graded) put('fix-tag score', res.points + '/' + f.points, f.rect[0], f.rect[1]);
      else put('fix-tag wait', '待批改 Chờ chấm', f.rect[0], f.rect[1]);
    }
  }
  // the chosen letter of a choice field is stored on the answers object passed to renderLesson
  let _answers = {};
  function opts_answer(page, fid) { return { v: _answers[fid] }; }

  function setupCanvas(c, img, locked, onSave, f) {
    const box = c.parentElement; const dpr = Math.min(2, devicePixelRatio || 1);
    c.width = Math.max(50, box.clientWidth * dpr); c.height = Math.max(30, box.clientHeight * dpr);
    const g = c.getContext('2d'); g.lineWidth = 3 * dpr; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#1f3a5f';
    if (img) { const im = new Image(); im.onload = () => g.drawImage(im, 0, 0, c.width, c.height); im.src = img; }
    c._clear = () => { g.clearRect(0, 0, c.width, c.height); onSave(''); };
    if (locked) return;
    let down = false, last = null;
    const pos = e => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height]; };
    c.style.touchAction = 'none';
    c.onpointerdown = e => { down = true; last = pos(e); c.setPointerCapture(e.pointerId); };
    c.onpointermove = e => { if (!down) return; const p = pos(e); g.beginPath(); g.moveTo(last[0], last[1]); g.lineTo(p[0], p[1]); g.stroke(); last = p; };
    const end = () => { if (!down) return; down = false; onSave(c.toDataURL('image/png')); };
    c.onpointerup = end; c.onpointercancel = end;
  }

  window.HSKRender = { renderLesson, closePop, el };
})();
