// Visual lesson editor: draw answer boxes on each PDF page, set answers/points, publish.
HSKShell.boot({ need: 'teacher', noBanner: true }, async (user, main) => {
  const S = HSKStore, $ = HSKShell.$;
  const id = new URLSearchParams(location.search).get('l') || 'L01';
  const toast = t => { const d = $('div', 'toast', t); document.body.appendChild(d); setTimeout(() => d.remove(), 2200); };
  let lesson, key;
  try { lesson = await S.loadLesson(id); } catch (e) { main.innerHTML = '<div class="card">找不到这一课</div>'; return; }
  key = await S.loadKey(id).catch(() => ({}));
  const base = S.lessonUrl(id);

  let pg = 1, sel = null /* {fid, oi} */, tool = 'select', dirty = false;
  const TYPES = { select: '选择/移动', choice: '选项题(点选项)', pick: '字母框(A-F)', text: '填空(打字)', hanzi: '写汉字', essay: '造句(老师批)', draw: '手写区', record: '录音题(学生朗读)' };
  const field = fid => lesson.fields.find(f => f.id === fid);

  main.innerHTML = '';
  const top = $('div', 'topline'); top.style.padding = '0 16px';
  top.innerHTML = `<div><a class="btn ghost sm" href="teacher.html">← 后台</a> <b style="font-family:var(--serif);font-size:18px">编辑 ${lname(lesson)} · ${lesson.title}</b></div>`;
  const acts = $('div', 'who'); const bPub = $('button', 'btn sm', '发布到站点'), bDl = $('button', 'btn ghost sm', '下载 JSON');
  const bImp = $('button', 'btn ghost sm', '导入答案 key.json'); const fImp = $('input'); fImp.type = 'file'; fImp.accept = '.json,application/json'; fImp.style.display = 'none';
  acts.append(bImp, fImp, bPub, bDl); top.appendChild(acts); main.appendChild(top);
  // Answers are not part of the published site. They live in Firestore (once published) or in the teacher's private/keys/<id>.json.
  const warn = $('div', 'demo-tag'); warn.style.cssText = 'max-width:1200px;margin:8px auto;'; main.appendChild(warn);
  const refreshWarn = () => { const n = Object.keys(key).length; warn.style.display = n ? 'none' : ''; warn.innerHTML = '⚠️ 这一课的<b>答案还没有载入</b>,学生提交后不能自动判分。点右上角「导入答案 key.json」选择 <code>private/keys/' + id + '.json</code>,再点「发布到站点」。<br><span class="vi">Chưa có đáp án cho bài này nên không chấm điểm tự động được. Hãy nhập file key.json rồi bấm “发布到站点”.</span>'; };
  bImp.onclick = () => fImp.click();
  fImp.onchange = async () => { const f = fImp.files[0]; if (!f) return; try { key = JSON.parse(await f.text()); dirty = true; refreshWarn(); panel(); toast('已导入 ' + Object.keys(key).length + ' 个答案,记得点「发布到站点」'); } catch (e) { alert('这不是有效的 JSON 文件'); } fImp.value = ''; };

  const lay = $('div', 'ed-layout'); lay.style.cssText = 'max-width:1200px;margin:10px auto;padding:0 16px'; main.appendChild(lay);
  const left = $('div'), side = $('div', 'ed-side card'); lay.append(left, side);
  const tools = $('div', 'ed-tools'); left.appendChild(tools);
  const nav = $('div', 'ed-tools'); left.appendChild(nav);
  const stageWrap = $('div'); left.appendChild(stageWrap);
  const stage = $('div', 'ed-page'); stageWrap.appendChild(stage);
  const img = $('img'); stage.appendChild(img);

  Object.entries(TYPES).forEach(([k, v]) => { const b = $('button', k === tool ? 'on' : '', v); b.dataset.k = k; b.onclick = () => { tool = k; [...tools.children].forEach(x => x.classList.toggle('on', x.dataset.k === k)); }; tools.appendChild(b); });
  const addOpt = $('button', null, '＋给选中的选项题加一个选项'); addOpt.dataset.k = 'addopt'; addOpt.onclick = () => { tool = 'addopt'; [...tools.children].forEach(x => x.classList.toggle('on', x.dataset.k === 'addopt')); }; tools.appendChild(addOpt);

  const prev = $('button', null, '◀'), next = $('button', null, '▶'), pl = $('span'); pl.style.cssText = 'font-weight:600;align-self:center';
  prev.onclick = () => go(pg - 1); next.onclick = () => go(pg + 1); nav.append(prev, pl, next);
  const go = n => { pg = Math.max(1, Math.min(lesson.pages.length, n)); sel = null; draw(); };

  const nextId = () => { const nums = lesson.fields.map(f => +f.id.replace(/\D/g, '')).filter(Boolean); const m = nums.length ? Math.max(...nums) + 1 : 1; return 'q' + m; };
  const L = i => 'ABCDEF'[i] || '?';

  // ---------- drawing the page ----------
  function draw() {
    const P = lesson.pages[pg - 1]; img.src = base + P.img; stage.style.aspectRatio = P.w + '/' + P.h;
    pl.textContent = `第 ${pg} / ${lesson.pages.length} 页`;
    stage.querySelectorAll('.ed-box').forEach(e => e.remove());
    lesson.fields.filter(f => f.page === pg).forEach(f => {
      const rs = f.type === 'choice' ? f.options.map((o, i) => ({ r: o.rect, oi: i, t: f.id + '·' + o.v })) : [{ r: f.rect, oi: -1, t: f.id + ' ' + f.type }];
      rs.forEach(x => {
        const b = $('div', 'ed-box' + (sel && sel.fid === f.id && (sel.oi === x.oi || f.type !== 'choice') ? ' sel' : ''), `<span class="lbl">${x.t}</span><span class="rz"></span>`);
        b.style.cssText = `left:${x.r[0] * 100}%;top:${x.r[1] * 100}%;width:${x.r[2] * 100}%;height:${x.r[3] * 100}%`;
        b.dataset.fid = f.id; b.dataset.oi = x.oi; stage.appendChild(b);
      });
    });
    panel();
  }

  // ---------- pointer interaction ----------
  const rel = e => { const r = stage.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
  const clamp = v => Math.max(0, Math.min(1, v));
  stage.addEventListener('pointerdown', e => {
    const box = e.target.closest('.ed-box'); const p0 = rel(e);
    if (box) {
      const f = field(box.dataset.fid), oi = +box.dataset.oi; sel = { fid: f.id, oi };
      const r = oi >= 0 ? f.options[oi].rect : f.rect; const orig = r.slice(); const resize = e.target.classList.contains('rz');
      stage.setPointerCapture(e.pointerId);
      const mv = ev => { const p = rel(ev), dx = p[0] - p0[0], dy = p[1] - p0[1];
        if (resize) { r[2] = Math.max(.01, orig[2] + dx); r[3] = Math.max(.008, orig[3] + dy); } else { r[0] = clamp(orig[0] + dx); r[1] = clamp(orig[1] + dy); }
        box.style.cssText = `left:${r[0] * 100}%;top:${r[1] * 100}%;width:${r[2] * 100}%;height:${r[3] * 100}%`; dirty = true; };
      const up = () => { stage.removeEventListener('pointermove', mv); stage.removeEventListener('pointerup', up); r.forEach((v, i) => r[i] = +v.toFixed(4)); draw(); };
      stage.addEventListener('pointermove', mv); stage.addEventListener('pointerup', up); e.preventDefault(); return;
    }
    if (tool === 'select') { sel = null; draw(); return; }
    stage.setPointerCapture(e.pointerId);
    const ghost = $('div', 'ed-box sel'); stage.appendChild(ghost);
    const mv = ev => { const p = rel(ev); const x = Math.min(p0[0], p[0]), y = Math.min(p0[1], p[1]); ghost.style.cssText = `left:${x * 100}%;top:${y * 100}%;width:${Math.abs(p[0] - p0[0]) * 100}%;height:${Math.abs(p[1] - p0[1]) * 100}%`; };
    const up = ev => {
      stage.removeEventListener('pointermove', mv); stage.removeEventListener('pointerup', up); ghost.remove();
      const p = rel(ev); let rect = [Math.min(p0[0], p[0]), Math.min(p0[1], p[1]), Math.abs(p[0] - p0[0]), Math.abs(p[1] - p0[1])].map(v => +clamp(v).toFixed(4));
      if (rect[2] < .01 || rect[3] < .006) return;
      if (tool === 'addopt') {
        const f = sel && field(sel.fid); if (!f || f.type !== 'choice') { toast('先选中一个选项题'); return; }
        f.options.push({ v: L(f.options.length), rect }); sel.oi = f.options.length - 1;
      } else if (tool === 'choice') {
        const f = { id: nextId(), type: 'choice', page: pg, points: 1, options: [{ v: 'A', rect }] }; lesson.fields.push(f); sel = { fid: f.id, oi: 0 }; tool = 'addopt';
        [...tools.children].forEach(x => x.classList.toggle('on', x.dataset.k === 'addopt')); toast('继续框 B、C 选项;完成后点「选择/移动」');
      } else {
        const f = { id: nextId(), type: tool, page: pg, rect, points: tool === 'essay' || tool === 'record' ? 2 : tool === 'draw' ? 0 : 1 };
        if (tool === 'record') f.label = '朗读录音 · Ghi âm đọc to';
        if (tool === 'pick') f.options = 'ABC'; if (tool === 'text') f.size = 'md';
        lesson.fields.push(f); sel = { fid: f.id, oi: -1 };
      }
      dirty = true; draw();
    };
    stage.addEventListener('pointermove', mv); stage.addEventListener('pointerup', up);
  });
  document.addEventListener('keydown', e => { if ((e.key === 'Delete') && sel && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) delSel(); });

  function delSel() {
    if (!sel) return; const f = field(sel.fid);
    if (f.type === 'choice' && f.options.length > 1 && sel.oi >= 0) { f.options.splice(sel.oi, 1); f.options.forEach((o, i) => o.v = o.v); sel.oi = 0; }
    else { lesson.fields = lesson.fields.filter(x => x.id !== f.id); delete key[f.id]; sel = null; }
    dirty = true; draw();
  }

  // ---------- side panel ----------
  function panel() {
    side.innerHTML = '';
    const f = sel && field(sel.fid);
    const h = $('h2', null, f ? '题目属性' : '说明'); h.style.fontSize = '17px'; side.appendChild(h);
    if (!f) side.appendChild($('p', 'hint', '1. 选一种工具,在页面上拖出方框。<br>2. 点方框可移动,拖红角点缩放,Delete 删除。<br>3. 在这里设置答案和分数。<br>4. 点「发布到站点」保存。'));
    else {
      const row = (lab, node) => { const r = $('div', 'frow'); r.appendChild($('span', null, lab)); r.appendChild(node); side.appendChild(r); return node; };
      const inp = (v, fn, type = 'text') => { const i = $('input'); i.type = type; i.value = v ?? ''; i.oninput = () => { fn(i.value); dirty = true; }; return i; };
      row('题号 ID', inp(f.id, v => { const old = f.id; if (!v || field(v)) return; if (key[old] != null) { key[v] = key[old]; delete key[old]; } f.id = v; sel.fid = v; })).onchange = draw;
      row('类型', $('span', null, TYPES[f.type] || f.type));
      row('分数', inp(f.points, v => f.points = Number(v) || 0, 'number'));
      if (f.type === 'pick') row('可选字母', inp(f.options, v => f.options = v.toUpperCase().replace(/[^A-Z]/g, '')));
      if (f.type === 'text') { const s = $('select'); s.innerHTML = ['sm', 'md'].map(x => `<option ${f.size === x ? 'selected' : ''}>${x}</option>`).join(''); s.onchange = () => { f.size = s.value; dirty = true; }; row('字号', s); }
      if (f.type === 'choice') {
        row('选项字母', inp(f.options.map(o => o.v).join(''), v => { v.toUpperCase().split('').forEach((c, i) => { if (f.options[i]) f.options[i].v = c; }); }));
        const del1 = $('button', 'btn ghost sm', '删除选中的选项'); del1.onclick = delSel; side.appendChild(del1);
      }
      if (f.type === 'text') { const c = $('input'); c.type = 'checkbox'; c.checked = !!f.pinyin; c.onchange = () => { f.pinyin = c.checked; dirty = true; }; const w = $('label', null, ''); w.appendChild(c); w.appendChild(document.createTextNode(' 弹出拼音小键盘(带声调)')); row('键盘', w); }
      if (f.type === 'record') row('提示文字', inp(f.label || '', v => f.label = v));
      if (f.type !== 'essay' && f.type !== 'draw' && f.type !== 'record') {
        const a = Array.isArray(key[f.id]) ? key[f.id].join('/') : (key[f.id] ?? '');
        row('标准答案', inp(a, v => { if (v === '') delete key[f.id]; else key[f.id] = (f.type === 'text' || f.type === 'hanzi') && v.includes('/') ? v.split('/').map(s => s.trim()).filter(Boolean) : (f.type === 'choice' || f.type === 'pick' ? v.toUpperCase() : v); }));
        side.appendChild($('div', 'hint', f.type === 'text' ? '多个可接受答案用 / 分隔,如:男人/女人/年轻人' : '')).style.fontSize = '12px';
      } else side.appendChild($('div', 'hint', '这类题由老师手动批改。'));
      const d = $('button', 'btn ghost sm', '删除这个题'); d.style.marginTop = '8px'; d.onclick = () => { sel.oi = -1; delSel(); }; side.appendChild(d);
    }
    side.appendChild($('hr'));
    const t = $('b', null, `全部题目 (${lesson.fields.length}) · 总分 ${lesson.fields.reduce((s, f) => s + (f.points || 0), 0)}`); side.appendChild(t);
    const lst = $('div', 'flist'); side.appendChild(lst);
    lesson.fields.slice().sort((a, b) => a.page - b.page || (a.rect ? a.rect[1] : a.options[0].rect[1]) - (b.rect ? b.rect[1] : b.options[0].rect[1])).forEach(x => {
      const d = $('div', sel && sel.fid === x.id ? 'sel' : '', `<span>${x.id} · ${x.type}</span><span>p${x.page} · ${x.points}分 · ${key[x.id] != null ? [].concat(key[x.id]).join('/') : '手动'}</span>`);
      d.onclick = () => { pg = x.page; sel = { fid: x.id, oi: x.type === 'choice' ? 0 : -1 }; draw(); }; lst.appendChild(d);
    });
    const bulk = $('details'); bulk.innerHTML = '<summary style="cursor:pointer;margin-top:10px">批量设置答案</summary>'; const ta = $('textarea'); ta.style.cssText = 'width:100%;min-height:80px'; ta.placeholder = 'q1=A\nq2=C\nx1=男人/女人';
    const ap = $('button', 'btn ghost sm', '应用'); ap.onclick = () => { ta.value.split('\n').forEach(l => { const m = l.split('='); if (m.length === 2 && field(m[0].trim())) { const v = m[1].trim(); key[m[0].trim()] = v.includes('/') ? v.split('/') : v; } }); dirty = true; toast('已应用'); panel(); };
    bulk.append(ta, ap); side.appendChild(bulk);
  }

  // ---------- save ----------
  bPub.onclick = async () => {
    if (!Object.keys(key).length && !confirm('还没有载入答案:发布后学生提交的作业不会自动判分。仍要发布吗?')) return;
    try { await S.publishLesson(lesson, key); dirty = false; toast(S.isDemo ? '已保存到本浏览器(演示模式)' : '已发布 ✓'); } catch (e) { alert('发布失败: ' + e.message); } };
  bDl.onclick = () => {
    [['lesson.json', lesson], ['key.json', key]].forEach(([n, o]) => { const a = $('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(o, null, 1)], { type: 'application/json' })); a.download = n; a.click(); });
    toast('已下载 lesson.json 和 key.json');
  };
  addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  refreshWarn();
  draw();
});
