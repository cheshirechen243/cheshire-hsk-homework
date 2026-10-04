HSKShell.boot({ need: 'teacher' }, async (user, main) => {
  const S = HSKStore, $ = HSKShell.$, G = HSKGrade;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const toast = t => { const d = $('div', 'toast', t); document.body.appendChild(d); setTimeout(() => d.remove(), 2200); };

  const extra = $('span'); const a1 = $('a', 'btn ghost sm', '学生页面 Trang học sinh'); a1.href = 'index.html'; extra.appendChild(a1);
  main.appendChild(HSKShell.topline(user, extra));

  const tabs = $('div', 'tabs'); const body = $('div'); main.appendChild(tabs); main.appendChild(body);
  const T = { subs: '作业批改', assign: '布置作业 / 班级链接', students: '学生名单', edit: '题目编辑器' };
  const show = k => { [...tabs.children].forEach(b => b.classList.toggle('on', b.dataset.k === k)); ({ subs: viewSubs, assign: viewAssign, students: viewStudents, edit: viewEdit })[k](); };
  const classesOf = list => [...new Set(list.map(s => (s.cls || '').trim()).filter(Boolean))].sort();
  Object.entries(T).forEach(([k, v]) => { const b = $('button', 'tab', v); b.dataset.k = k; b.onclick = () => show(k); tabs.appendChild(b); });

  const lessons = await S.listLessons().catch(() => []);
  const lessonMap = Object.fromEntries(lessons.map(l => [l.id, l]));
  const cache = {};   // lesson+key cache
  const getLK = async id => cache[id] || (cache[id] = { lesson: await S.loadLesson(id), key: await S.loadKey(id).catch(() => ({})) });

  // =====================================================  submissions list
  async function viewSubs() {
    body.innerHTML = ''; const card = $('div', 'card'); body.appendChild(card);
    card.innerHTML = '<h2>学生提交 · Bài nộp</h2>';
    const ctl = $('div', 'row-ctl'); card.appendChild(ctl);
    const sel = $('select'); sel.innerHTML = '<option value="">全部课 Tất cả</option>' + lessons.filter(l => l.open).map(l => `<option value="${l.id}">第${l.no}课 ${l.title}</option>`).join('');
    const st = $('select'); st.innerHTML = '<option value="">全部状态</option><option value="todo">待批改</option><option value="done">已批改</option>';
    const q = $('input'); q.type = 'text'; q.placeholder = '搜索姓名/邮箱';
    const cl = $('select'); cl.innerHTML = '<option value="">全部班级</option>';
    const csv = $('button', 'btn ghost sm', '导出 CSV'); const rf = $('button', 'btn ghost sm', '刷新');
    ctl.append(sel, cl, st, q, rf, csv);
    const wrap = $('div'); wrap.style.overflowX = 'auto'; card.appendChild(wrap);
    let rows = [];
    const load = async () => {
      wrap.textContent = '加载中…';
      rows = await S.listSubmissions();
      const keepC = cl.value; cl.innerHTML = '<option value="">全部班级</option>' + classesOf(rows).map(c => `<option>${esc(c)}</option>`).join(''); cl.value = keepC;
      for (const id of new Set(rows.map(r => r.lessonId))) await getLK(id).catch(() => { });
      rows.forEach(r => { const lk = cache[r.lessonId]; r._res = lk ? G.gradeAll(lk.lesson, r, lk.key) : null; });
      draw();
    };
    const draw = () => {
      const f = rows.filter(r => (!sel.value || r.lessonId === sel.value) && (!cl.value || (r.cls || '') === cl.value) && (!st.value || (st.value === 'done') === !!r.graded) && (!q.value || (r.name + r.email).toLowerCase().includes(q.value.toLowerCase())))
        .sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));
      if (!f.length) { wrap.innerHTML = '<p class="hint">还没有提交。Chưa có bài nộp.</p>'; return; }
      const t = $('table', 'tbl'); t.innerHTML = '<tr><th>学生</th><th>班级</th><th>课</th><th>提交时间</th><th>自动分</th><th>待批改</th><th>总分</th><th>百分比</th><th>状态</th></tr>';
      f.forEach(r => {
        const x = r._res; const tr = $('tr', 'row');
        const sc = r.graded ? [r.finalScore, r.finalMax] : (x ? [x.total, x.max] : null);
        const total = sc ? `${sc[0]}/${sc[1]}` : '-', pc = sc ? G.pct(sc[0], sc[1]) : '-';
        tr.innerHTML = `<td><b>${esc(r.name)}</b><br><span class="vi">${esc(r.email)}</span></td><td>${esc(r.cls || '-')}</td><td>第${r.lessonNo || ''}课</td><td>${new Date(r.submittedAt).toLocaleString()}${r.late ? ' <span class="badge wait" style="position:static">迟交</span>' : ''}</td><td>${x ? x.auto + '/' + x.autoMax + ' · ' + G.pct(x.auto, x.autoMax) : '-'}</td><td>${x ? x.pending + ' 题' : '-'}</td><td>${total}</td><td><b>${pc}</b></td><td><span class="badge ${r.graded ? 'ok' : 'wait'}" style="position:static">${r.graded ? '已批改' : '待批改'}</span></td>`;
        tr.onclick = () => grade(r); t.appendChild(tr);
      });
      wrap.innerHTML = ''; wrap.appendChild(t);
    };
    [sel, cl, st].forEach(x => x.onchange = draw); q.oninput = draw; rf.onclick = load;
    csv.onclick = () => {
      const lines = [['姓名', '邮箱', '班级', '课', '提交时间', '自动分', '手动分', '总分', '满分', '百分比', '状态', '评语']];
      rows.filter(r => !sel.value || r.lessonId === sel.value).forEach(r => { const x = r._res || {}; const s = r.graded ? r.finalScore : x.total, m = r.graded ? r.finalMax : x.max; lines.push([r.name, r.email, r.cls || '', r.lessonNo, r.submittedAt, x.auto, x.manual, s, m, G.pct(s, m), r.graded ? '已批改' : '待批改', r.comment || '']); });
      const blob = new Blob(['﻿' + lines.map(l => l.map(c => '"' + String(c ?? '').replace(/"/g, '""') + '"').join(',')).join('\n')], { type: 'text/csv' });
      const a = $('a'); a.href = URL.createObjectURL(blob); a.download = 'hsk3-scores.csv'; a.click();
    };
    load();
  }

  // =====================================================  grading view
  async function grade(sub) {
    body.innerHTML = '<div class="card">加载中…</div>';
    const { lesson, key } = await getLK(sub.lessonId);
    const manual = { ...(sub.manual || {}) }, comments = { ...(sub.comments || {}) }; let overall = sub.comment || '';
    body.innerHTML = '';
    const head = $('div', 'card'); body.appendChild(head);
    const back = $('button', 'btn ghost sm', '← 返回列表'); back.onclick = () => show('subs');
    head.innerHTML = `<h2>${esc(sub.name)} · 第${lesson.no}课 ${esc(lesson.title)}</h2><div class="vi">${esc(sub.email)} · 提交于 ${new Date(sub.submittedAt).toLocaleString()}</div>`;
    head.prepend(back); back.style.marginBottom = '8px';
    const lay = $('div', 'grade-layout'); body.appendChild(lay);
    const left = $('div'); const side = $('div', 'grade-side card'); lay.append(left, side);
    const sum = $('div'); side.appendChild(sum);
    const list = $('div'); side.appendChild(list);
    const foot = $('div'); side.appendChild(foot);

    const draw = () => {
      const work = { ...sub, manual };
      const res = G.gradeAll(lesson, work, key);
      HSKRender.renderLesson(left, lesson, {
        base: S.lessonUrl(lesson.id), answers: sub.answers || {}, mode: 'review', results: res.fields, key, showAnswers: true
      });
      sum.innerHTML = `<h2 style="font-size:17px">分数 · Điểm</h2><div>自动分 <b>${res.auto}/${res.autoMax}</b> (${G.pct(res.auto, res.autoMax)}) · 手动分 <b>${res.manual}/${res.manualMax}</b>${res.pending ? ` <span class="badge wait" style="position:static">还有 ${res.pending} 题未批</span>` : ''}</div><div class="bigtotal">${res.total} <i>/ ${res.max}</i> <em>${G.pct(res.total, res.max)}</em></div>`;
      return res;
    };

    // per-field panel: show every manual field + wrong auto fields (+ all fields via toggle)
    let showAll = false;
    const panel = () => {
      list.innerHTML = '';
      const res = G.gradeAll(lesson, { ...sub, manual }, key);
      const tg = $('label', null, `<input type="checkbox" ${showAll ? 'checked' : ''}> 显示所有题目`); tg.style.cssText = 'font-size:13px;display:block;margin:8px 0';
      tg.querySelector('input').onchange = e => { showAll = e.target.checked; panel(); }; list.appendChild(tg);
      lesson.fields.filter(f => f.points > 0).forEach(f => {
        const r = res.fields[f.id], v = (sub.answers || {})[f.id];
        const needs = !r.auto || !r.correct;
        if (!showAll && !needs) return;
        const g = $('div', 'gi ' + (r.auto ? (r.correct ? 'ok' : 'bad') : (r.graded ? 'ok' : 'wait')));
        let ans = v == null ? '<i>(空)</i>' : (typeof v === 'object' && v.img ? '<img class="draw" src="' + v.img + '">' : esc(v));
        const strokes = (sub.answers || {})[f.id + '~s'];
        g.innerHTML = `<div class="h"><span>${esc(f.id.toUpperCase())} <span class="vi">第${f.page}页</span></span><span><input type="number" min="0" max="${f.points}" step="0.5" value="${r.graded || r.overridden ? r.points : ''}" placeholder="–"> / ${f.points}</span></div>
          <div class="stu">${ans}${strokes ? ` <span class="vi">笔顺${strokes.done ? '✓' : '✗'}${strokes.mistakes ? ' 错' + strokes.mistakes : ''}</span>` : ''}</div>` +
          (r.auto ? `<div class="vi">正确答案:${esc([].concat(key[f.id]).join(' / '))}</div>` : '') +
          `<textarea placeholder="评语 Nhận xét (可选)">${esc(comments[f.id] || '')}</textarea>`;
        const num = g.querySelector('input'), ta = g.querySelector('textarea');
        num.onchange = () => { if (num.value === '') delete manual[f.id]; else manual[f.id] = Math.max(0, Math.min(f.points, Number(num.value))); draw(); };
        ta.oninput = () => { comments[f.id] = ta.value; };
        list.appendChild(g);
      });
    };

    draw(); panel();
    const ov = $('textarea'); ov.placeholder = '总评 Nhận xét chung…'; ov.style.cssText = 'width:100%;min-height:70px;margin-top:8px'; ov.value = overall; ov.oninput = () => { overall = ov.value; };
    const row = $('div', 'row-ctl'); row.style.marginTop = '8px';
    const save = $('button', 'btn', '保存并标记已批改'); const mail = $('button', 'btn ghost', '✉ 通知学生'); const re = $('button', 'btn ghost sm', '让学生重做');
    row.append(save, mail, re); foot.append(ov, row);
    save.onclick = async () => {
      const res = G.gradeAll(lesson, { ...sub, manual }, key);
      if (res.pending && !confirm(`还有 ${res.pending} 题没打分,仍然标记为已批改吗?`)) return;
      const g = { manual, comments, comment: overall, graded: true, finalScore: res.total, finalMax: res.max };
      await S.saveGrade(sub.lessonId, sub.email, g); Object.assign(sub, g); toast('已保存 ✓'); draw();
    };
    mail.onclick = async () => {
      if (!sub.graded) { toast('请先保存批改'); return; }
      const pc = G.pct(sub.finalScore, sub.finalMax);
      const subj = `HSK3 第${lesson.no}课作业成绩 / Điểm bài tập bài ${lesson.no}: ${sub.finalScore}/${sub.finalMax} (${pc})`;
      const lines = [`${sub.name} 你好 / Chào ${sub.name},`, '', `第${lesson.no}课《${lesson.title}》作业已批改。`, `Bài tập bài ${lesson.no} đã được chấm.`, '', `分数 Điểm: ${sub.finalScore} / ${sub.finalMax} (${pc})`];
      if (overall) lines.push('', '老师评语 Nhận xét:', overall);
      lines.push('', '登录查看详细批改 / Đăng nhập để xem chi tiết: ' + new URL(sub.asg ? 'lesson.html?a=' + sub.asg : 'index.html', location.href).href, '', '沉鱼汉语');
      const r = await S.notify(sub.email, subj, lines.join('\n')); toast(r === 'sent' ? '邮件已发送 ✓' : '已打开 Gmail 写信窗口,检查后点「发送」(内容也已复制)');
    };
    re.onclick = async () => { if (!confirm('删除这份提交,让学生重新做?此操作不能撤销。')) return; await S.reopen(sub.lessonId, sub.email); toast('已删除'); show('subs'); };
  }

  // =====================================================  assignments: one lesson -> one class -> one link
  async function viewAssign() {
    body.innerHTML = ''; const card = $('div', 'card'); body.appendChild(card);
    card.innerHTML = `<h2>布置作业 · Giao bài tập</h2><p class="hint">每个班的进度不同:为某一课、某个班生成一个<b>专属链接</b>,贴到 Google Classroom 的作业里。学生只能通过这个链接做这一课。<br><span class="vi">Mỗi lớp một tiến độ riêng: tạo link riêng cho từng bài + từng lớp rồi dán vào Google Classroom. Học sinh chỉ làm được bài qua link này.</span></p>`;
    if (location.protocol === 'file:') card.appendChild($('div', 'demo-tag', '⚠️ 现在是本地文件模式,生成的链接只能在这台电脑打开。网站正式发布后再生成给学生的链接。'));
    const students = await S.listStudents().catch(() => []);
    const classes = classesOf(students);
    const form = $('div', 'row-ctl'); form.style.marginTop = '12px'; card.appendChild(form);
    const ls = $('select'); ls.innerHTML = lessons.filter(l => l.open).map(l => `<option value="${l.id}">第${l.no}课 ${esc(l.title)}</option>`).join('');
    const cs = $('select'); cs.innerHTML = '<option value="">全部班级 · tất cả lớp</option>' + classes.map(c => `<option>${esc(c)}</option>`).join('');
    const ci = $('input'); ci.type = 'text'; ci.placeholder = '或直接输入班级名'; ci.style.width = '140px';
    const due = $('input'); due.type = 'date'; due.title = '截止日期(可选)';
    const add = $('button', 'btn', '＋ 生成链接');
    form.append(ls, cs, ci, $('span', 'vi', '截止:'), due, add);
    if (!classes.length) card.appendChild($('p', 'hint', '还没有班级:先去「学生名单」给每个学生填班级(每行:邮箱, 姓名, 班级)。'));
    const wrap = $('div'); wrap.style.cssText = 'margin-top:12px;overflow-x:auto'; card.appendChild(wrap);
    const code = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
    const link = c => new URL('lesson.html?a=' + c, location.href).href;
    const draw = async () => {
      const list = (await S.listAssignments()).sort((a, b) => (b.created || '').localeCompare(a.created || ''));
      const subs = await S.listSubmissions().catch(() => []);
      if (!list.length) { wrap.innerHTML = '<p class="hint">还没有布置过作业。</p>'; return; }
      const t = $('table', 'tbl'); t.innerHTML = '<tr><th>课</th><th>班级</th><th>截止</th><th>已交</th><th>状态</th><th>学生链接(贴到 Classroom)</th><th></th></tr>';
      list.forEach(a => {
        const L = lessonMap[a.lessonId] || { no: '?', title: a.lessonId };
        const n = subs.filter(s => s.asg === a.code).length;
        const tr = $('tr');
        tr.innerHTML = `<td><b>第${L.no}课</b><br><span class="vi">${esc(L.title)}</span></td><td>${esc(a.cls || '全部')}</td><td>${a.due || '-'}</td><td>${n}</td><td></td><td><div class="linkrow"><input type="text" readonly value="${link(a.code)}"><button class="btn sm" type="button">复制</button></div></td><td></td>`;
        const stc = tr.children[4]; const tog = $('button', 'btn sm ' + (a.open === false ? 'ghost' : 'blue'), a.open === false ? '已关闭 · 点击开放' : '开放中 · 点击关闭');
        tog.onclick = async () => { a.open = a.open === false; await S.saveAssignment(a); toast(a.open ? '已开放' : '已关闭'); draw(); }; stc.appendChild(tog);
        const inp = tr.querySelector('input'); inp.onfocus = () => inp.select();
        tr.querySelector('.linkrow .btn').onclick = async () => { try { await navigator.clipboard.writeText(link(a.code)); } catch (e) { inp.select(); document.execCommand('copy'); } toast('链接已复制 ✓'); };
        const del = $('button', 'btn ghost sm', '删除'); del.onclick = async () => { if (!confirm('删除这个链接?已交的作业不会被删除,但学生将无法再用这个链接打开。')) return; await S.deleteAssignment(a.code); draw(); }; tr.lastChild.appendChild(del);
        t.appendChild(tr);
      });
      wrap.innerHTML = ''; wrap.appendChild(t);
    };
    add.onclick = async () => {
      if (!ls.value) return;
      const hasKey = await S.loadKey(ls.value).then(k => Object.keys(k || {}).length > 0).catch(() => false);
      if (!hasKey && !confirm('这一课的答案还没有发布到站点,学生提交后不会自动判分。\n(请先到「题目编辑器」导入答案并发布。)\n仍要生成链接吗?')) return;
      const a = { code: code(), lessonId: ls.value, cls: (ci.value.trim() || cs.value || ''), due: due.value || '', open: true, created: new Date().toISOString() };
      await S.saveAssignment(a); toast('已生成链接 ✓'); ci.value = ''; draw();
    };
    draw();
  }

  // =====================================================  students whitelist
  async function viewStudents() {
    body.innerHTML = ''; const card = $('div', 'card'); body.appendChild(card);
    card.innerHTML = `<h2>学生名单 · Danh sách học sinh</h2><p class="hint">只有这里登记的 Google 邮箱才能登录做作业。每行一个:<code>邮箱, 姓名, 班级</code>。<b>班级</b>用来给不同班布置不同进度的作业(例如 <code>HSK3-A</code>),同一个学生只属于一个班。<br><span class="vi">Chỉ email trong danh sách này mới đăng nhập được. Cột lớp dùng để giao bài theo tiến độ từng lớp.</span></p>`;
    const list = await S.listStudents();
    const ta = $('textarea'); ta.style.cssText = 'width:100%;min-height:260px;font-family:monospace'; ta.value = list.map(s => [s.email, s.name || '', s.cls || ''].join(', ').replace(/(, )+$/, '')).join('\n');
    const b = $('button', 'btn', '保存名单'); b.style.marginTop = '10px';
    b.onclick = async () => {
      const out = [], seen = new Set();
      ta.value.split('\n').forEach(l => { const p = l.split(/[,，\t]/).map(x => x.trim()); const e = (p[0] || '').toLowerCase(); if (/^\S+@\S+\.\S+$/.test(e) && !seen.has(e)) { seen.add(e); out.push({ email: e, name: p[1] || '', cls: p[2] || '' }); } });
      await S.saveStudents(out); toast('已保存 ' + out.length + ' 位学生 ✓');
    };
    card.append(ta, b);
  }

  // =====================================================  editor entry
  function viewEdit() {
    body.innerHTML = ''; const card = $('div', 'card'); body.appendChild(card);
    card.innerHTML = '<h2>题目编辑器 · Soạn đề</h2><p class="hint">在 PDF 页面图上框选答题位置、设置标准答案。选一课打开编辑器。</p>';
    lessons.filter(l => l.open).forEach(l => { const a = $('a', 'btn', `编辑 第${l.no}课`); a.href = 'editor.html?l=' + l.id; a.style.marginRight = '8px'; card.appendChild(a); });
  }

  show('subs');
});
