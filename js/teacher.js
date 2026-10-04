HSKShell.boot({ need: 'teacher' }, async (user, main) => {
  const S = HSKStore, $ = HSKShell.$, G = HSKGrade;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const toast = t => { const d = $('div', 'toast', t); document.body.appendChild(d); setTimeout(() => d.remove(), 2200); };

  window.addEventListener('unhandledrejection', e => toast('出错了:' + ((e.reason && e.reason.message) || e.reason)));
  const extra = $('span'); const a1 = $('a', 'btn ghost sm', '学生页面 Trang học sinh'); a1.href = 'index.html'; extra.appendChild(a1);
  main.appendChild(HSKShell.topline(user, extra));

  const tabs = $('div', 'tabs'); const body = $('div'); main.appendChild(tabs); main.appendChild(body);
  const T = { subs: '作业批改', assign: '布置作业 / 班级链接', students: '学生名单', edit: '题目编辑器' };
  // one level (HSK1 / HSK3 ...) at a time: pick the level first, then everything below only shows that level
  const courseOf = l => (l && l.course) || 'HSK3';
  let curTab = 'subs', curLevel = '';
  const show = k => { curTab = k; [...tabs.children].forEach(b => b.classList.toggle('on', b.dataset.k === k)); lvBar.style.display = k === 'students' ? 'none' : ''; ({ subs: viewSubs, assign: viewAssign, students: viewStudents, edit: viewEdit })[k](); };
  // a student's voice answer: Drive preview player for uploaded files (the teacher owns them), <audio> for local demo data
  const recPlayer = rc => {
    const dur = rc.dur ? ` <span class="vi">${Math.floor(rc.dur / 60)}:${String(rc.dur % 60).padStart(2, '0')}</span>` : '';
    if (rc.id) return `🎤${dur}<br><iframe src="https://drive.google.com/file/d/${encodeURIComponent(rc.id)}/preview" style="width:100%;height:64px;border:2px solid var(--outline);border-radius:8px;background:#fff" allow="autoplay"></iframe><a href="https://drive.google.com/file/d/${encodeURIComponent(rc.id)}/view" target="_blank" rel="noopener" style="font-size:12px">在 Google Drive 打开 · Mở trong Drive</a>`;
    if (rc.data) return `🎤${dur}<br><audio controls src="${rc.data}" style="width:100%"></audio>`;
    return '<i>(录音丢失)</i>';
  };  // lessons grouped by course (HSK1 / HSK3) for the drop-downs
  const levelLessons = () => lessons.filter(l => l.open && courseOf(l) === curLevel);
  const lessonOpts = () => levelLessons().map(l => `<option value="${l.id}">${lshort(l)} ${esc(l.title)}</option>`).join('');
  const classesOf = list => [...new Set(list.map(s => (s.cls || '').trim()).filter(Boolean))].sort();
  Object.entries(T).forEach(([k, v]) => { const b = $('button', 'tab', v); b.dataset.k = k; b.onclick = () => show(k); tabs.appendChild(b); });

  const lessons = await S.listLessons().catch(() => []);
  const lessonMap = Object.fromEntries(lessons.map(l => [l.id, l]));
  const inLevel = id => courseOf(lessonMap[id]) === curLevel;
  // level switcher bar (built once; remembers the last level)
  const levels = [...new Set(lessons.filter(l => l.open).map(courseOf))].sort();
  curLevel = levels.includes(localStorage.getItem('hsk3.level')) ? localStorage.getItem('hsk3.level') : (levels[0] || 'HSK3');
  const lvBar = $('div', 'lvbar'); lvBar.innerHTML = '<span>等级 · Cấp độ</span>';
  levels.forEach(lv => { const b = $('button', 'lvbtn' + (lv === curLevel ? ' on' : ''), lv); b.type = 'button'; b.onclick = () => { curLevel = lv; try { localStorage.setItem('hsk3.level', lv); } catch (e) { } [...lvBar.querySelectorAll('.lvbtn')].forEach(x => x.classList.toggle('on', x === b)); show(curTab); }; lvBar.appendChild(b); });
  main.insertBefore(lvBar, tabs);
  const cache = {};   // lesson+key cache
  const getLK = async id => cache[id] || (cache[id] = { lesson: await S.loadLesson(id), key: await S.loadKey(id).catch(() => ({})) });

  // =====================================================  submissions list
  async function viewSubs() {
    body.innerHTML = ''; const card = $('div', 'card'); body.appendChild(card);
    card.innerHTML = '<h2>学生提交 · Bài nộp</h2><p class="hint">布置过的作业,<b>全班每个学生一行</b>:还没交的显示「未提交」,交了就能点进去批改。<br><span class="vi">Mỗi học sinh một dòng: chưa nộp hiện “Chưa nộp”, đã nộp bấm vào để chấm.</span></p>';
    const ctl = $('div', 'row-ctl'); card.appendChild(ctl);
    const sel = $('select'); sel.innerHTML = '<option value="">全部课 Tất cả</option>' + lessonOpts();
    const st = $('select'); st.innerHTML = '<option value="">全部状态</option><option value="none">未提交</option><option value="todo">待批改</option><option value="done">已批改</option>';
    const q = $('input'); q.type = 'text'; q.placeholder = '搜索姓名/邮箱';
    const cl = $('select'); cl.innerHTML = '<option value="">全部班级</option>';
    const csv = $('button', 'btn ghost sm', '导出 CSV'); const rf = $('button', 'btn ghost sm', '刷新');
    ctl.append(sel, cl, st, q, rf, csv);
    const sum = $('div', 'hint'); card.appendChild(sum);
    const wrap = $('div'); wrap.style.overflowX = 'auto'; card.appendChild(wrap);
    let rows = [];
    const statusOf = r => r._pending ? 'none' : (r.graded ? 'done' : 'todo');
    const load = async () => {
      wrap.textContent = '加载中…';
      const [subs, students, asgs] = await Promise.all([S.listSubmissions(), S.listStudents().catch(() => []), S.listAssignments().catch(() => [])]);
      rows = subs.filter(r => inLevel(r.lessonId));
      // every student of an assigned class gets a row for that lesson, even before handing in
      const seen = new Set(rows.map(r => r.lessonId + '|' + r.email));
      asgs.filter(a => inLevel(a.lessonId)).forEach(a => students.filter(s => !a.cls || String(s.cls || '').toLowerCase() === String(a.cls).toLowerCase()).forEach(s => {
        const k = a.lessonId + '|' + s.email; if (seen.has(k)) return; seen.add(k);
        rows.push({ _pending: true, lessonId: a.lessonId, lessonNo: (lessonMap[a.lessonId] || {}).no, email: s.email, name: s.name || s.email, cls: s.cls || '', asg: a.code, due: a.due });
      }));
      const keepC = cl.value; cl.innerHTML = '<option value="">全部班级</option>' + classesOf(rows).map(c => `<option>${esc(c)}</option>`).join(''); cl.value = keepC;
      for (const id of new Set(rows.filter(r => !r._pending).map(r => r.lessonId))) await getLK(id).catch(() => { });
      rows.forEach(r => { if (r._pending) return; const lk = cache[r.lessonId]; r._res = lk ? G.gradeAll(lk.lesson, r, lk.key) : null; });
      draw();
    };
    const filtered = () => rows.filter(r => (!sel.value || r.lessonId === sel.value) && (!cl.value || (r.cls || '') === cl.value) && (!st.value || statusOf(r) === st.value) && (!q.value || (r.name + r.email).toLowerCase().includes(q.value.toLowerCase())))
      .sort((a, b) => (!!a._pending - !!b._pending) || (a._pending ? ((a.cls || '').localeCompare(b.cls || '') || String(a.name).localeCompare(String(b.name))) : (b.submittedAt || '').localeCompare(a.submittedAt || '')));
    const draw = () => {
      const f = filtered();
      const cnt = { none: 0, todo: 0, done: 0 }; f.forEach(r => cnt[statusOf(r)]++);
      sum.innerHTML = f.length ? `共 ${f.length} 人 · <b>未提交 ${cnt.none}</b> · 待批改 ${cnt.todo} · 已批改 ${cnt.done}` : '';
      if (!f.length) { wrap.innerHTML = '<p class="hint">还没有内容。先到「学生名单」登记学生,再在「布置作业」生成班级链接。</p>'; return; }
      const t = $('table', 'tbl'); t.innerHTML = '<tr><th>学生</th><th>班级</th><th>课</th><th>提交时间</th><th>自动分</th><th>待批改</th><th>状态</th></tr>';
      f.forEach(r => {
        const tr = $('tr', r._pending ? 'row pend' : 'row');
        const who = `<td><b>${esc(r.name)}</b><br><span class="vi">${esc(r.email)}</span></td><td>${esc(r.cls || '-')}</td><td><b>${lcode(lessonMap[r.lessonId] || { no: r.lessonNo })}</b></td>`;
        if (r._pending) {
          const over = r.due && Date.now() > new Date(r.due + 'T23:59:59').getTime();
          tr.innerHTML = who + `<td>${r.due ? '截止 ' + esc(r.due) : '-'}</td><td>-</td><td>-</td><td><span class="badge todo" style="position:static">未提交</span>${over ? ' <span class="badge" style="position:static;background:#FFE3E3">已过期</span>' : ''}</td>`;
        } else {
          const x = r._res;
          const d = new Date(r.submittedAt), tm = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
          tr.innerHTML = who + `<td>${tm}${r.late ? ' <span class="badge wait" style="position:static">迟交</span>' : ''}</td><td>${x ? x.auto + '/' + x.autoMax + ' · ' + G.pct(x.auto, x.autoMax) : '-'}</td><td>${x ? x.pending + ' 题' : '-'}</td><td><span class="badge ${r.graded ? 'ok' : 'wait'}" style="position:static">${r.graded ? '已批改' : '待批改'}</span></td>`;
          tr.onclick = () => grade(r);
        }
        t.appendChild(tr);
      });
      wrap.innerHTML = ''; wrap.appendChild(t);
    };
    [sel, cl, st].forEach(x => x.onchange = draw); q.oninput = draw; rf.onclick = load;
    csv.onclick = () => {
      const lines = [['姓名', '邮箱', '班级', '课', '提交时间', '自动分', '手动分', '总分', '满分', '百分比', '状态', '评语']];
      filtered().forEach(r => {
        if (r._pending) { lines.push([r.name, r.email, r.cls || '', r.lessonNo, '', '', '', '', '', '', '未提交', '']); return; }
        const x = r._res || {}; const s = r.graded ? r.finalScore : x.total, m = r.graded ? r.finalMax : x.max;
        lines.push([r.name, r.email, r.cls || '', r.lessonNo, r.submittedAt, x.auto, x.manual, s, m, G.pct(s, m), r.graded ? '已批改' : '待批改', r.comment || '']);
      });
      const blob = new Blob(['\ufeff' + lines.map(l => l.map(c => '"' + String(c ?? '').replace(/"/g, '""') + '"').join(',')).join('\n')], { type: 'text/csv' });
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
    head.innerHTML = `<h2>${esc(sub.name)} · ${lname(lesson)} ${esc(lesson.title)}</h2><div class="vi">${esc(sub.email)} · 提交于 ${new Date(sub.submittedAt).toLocaleString()}</div>`;
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
      sum.innerHTML = `<h2 style="font-size:17px">分数 · Điểm</h2><div>自动分 <b>${res.auto}/${res.autoMax}</b> (${G.pct(res.auto, res.autoMax)}) · 手动分 <b>${res.manual}/${res.manualMax}</b></div>${res.pending ? `<div style="margin-top:6px"><span class="badge wait" style="position:static;display:inline-block;white-space:normal">还有 ${res.pending} 题未批 · Còn ${res.pending} câu chưa chấm</span></div>` : ''}<div class="bigtotal">${res.total} <i>/ ${res.max}</i> <em>${G.pct(res.total, res.max)}</em></div>`;
      return res;
    };

    // per-field panel: show every manual field + wrong auto fields (+ all fields via toggle)
    // list in the order the questions appear on the worksheet (page, then top-to-bottom, left-to-right)
    const pos = f => { const r = f.type === 'choice' && f.options && f.options[0] ? f.options[0].rect : f.rect; return [f.page, Math.round(r[1] * 60), r[0]]; };
    const ordered = lesson.fields.filter(f => f.points > 0).sort((a, b) => { const p = pos(a), q = pos(b); return p[0] - q[0] || p[1] - q[1] || p[2] - q[2]; });
    let mode = 'todo';        // all = every question · todo = wrong + still to grade · wait = only the ones still to grade
    const panel = () => {
      list.innerHTML = '';
      const res = G.gradeAll(lesson, { ...sub, manual }, key);
      const bar = $('div', 'fltbar');
      [['wait', '只看未批 · Chưa chấm'], ['todo', '错题+未批 · Sai & chưa chấm'], ['all', '全部 · Tất cả']].forEach(([m, t]) => {
        const b = $('button', mode === m ? 'on' : '', t); b.type = 'button'; b.onclick = () => { mode = m; panel(); }; bar.appendChild(b);
      });
      list.appendChild(bar);
      let shown = 0;
      ordered.forEach(f => {
        const r = res.fields[f.id], v = (sub.answers || {})[f.id];
        const pending = !r.auto && !r.graded;
        if (mode === 'wait' && !pending) return;
        if (mode === 'todo' && r.auto && r.correct) return;
        shown++;
        const g = $('div', 'gi ' + (r.auto ? (r.correct ? 'ok' : 'bad') : (r.graded ? 'ok' : 'wait')));
        g.title = '点击跳到作业页上的这一题 · Bấm để nhảy tới câu này';
        g.onclick = e => {
          if (e.target.closest('input,textarea,audio,iframe,a,button')) return;
          const t = left.querySelector('[data-fid="' + f.id + '"]'); if (!t) return;
          list.querySelectorAll('.gi.cur').forEach(x => x.classList.remove('cur')); g.classList.add('cur');
          window.scrollTo({ top: Math.max(0, window.scrollY + t.getBoundingClientRect().top - window.innerHeight / 2), behavior: 'smooth' }); t.classList.remove('flash'); void t.offsetWidth; t.classList.add('flash');
        };
        let ans = v == null ? '<i>(空)</i>' : (typeof v === 'object' && v.rec ? recPlayer(v.rec) : typeof v === 'object' && v.img ? '<img class="draw" src="' + v.img + '">' : esc(v));
        const strokes = (sub.answers || {})[f.id + '~s'];
        g.innerHTML = `<div class="h"><span>${esc(f.id.toUpperCase())} <span class="vi">第${f.page}页</span></span><span><input type="number" min="0" max="${f.points}" step="0.5" value="${r.graded || r.overridden ? r.points : ''}" placeholder="–"> / ${f.points}</span></div>
          <div class="stu${f.pinyin ? ' pyn' : ''}">${ans}${strokes ? ` <span class="vi">笔顺${strokes.done ? '✓' : '✗'}${strokes.mistakes ? ' 错' + strokes.mistakes : ''}</span>` : ''}</div>` +
          (r.auto ? `<div class="vi">正确答案:${esc([].concat(key[f.id]).join(' / '))}</div>` : '') +
          `<textarea placeholder="评语 Nhận xét (可选)">${esc(comments[f.id] || '')}</textarea>`;
        const num = g.querySelector('input'), ta = g.querySelector('textarea');
        num.onchange = () => { if (num.value === '') delete manual[f.id]; else manual[f.id] = Math.max(0, Math.min(f.points, Number(num.value))); draw(); };
        ta.oninput = () => { comments[f.id] = ta.value; };
        list.appendChild(g);
      });
      if (!shown) list.appendChild($('p', 'hint', mode === 'wait' ? '✅ 没有待批改的题了 · Không còn câu nào chờ chấm' : '这里没有题目 · Không có câu nào'));
    };

    draw(); panel();
    const ov = $('textarea'); ov.placeholder = '总评 Nhận xét chung…'; ov.style.cssText = 'width:100%;min-height:70px;margin-top:8px'; ov.value = overall; ov.oninput = () => { overall = ov.value; };
    const row = $('div', 'row-ctl'); row.style.marginTop = '8px';
    const save = $('button', 'btn', '保存并标记已批改'); const mail = $('button', 'btn ghost', '✉ 通知学生'); const re = $('button', 'btn ghost sm', '让学生重做');
    row.append(save, mail, re); foot.append(ov, row);
    // with the Apps Script mail sender configured, saving the grade also e-mails the student automatically
    let autoBox = null;
    if (S.canAutoMail) { const lb = $('label', null, '<input type="checkbox" checked> 保存后自动邮件通知学生'); lb.style.cssText = 'display:block;margin-top:8px;font-size:13px;font-weight:700'; autoBox = lb.querySelector('input'); foot.appendChild(lb); }
    // the designed grade-report e-mail (HTML + plain-text fallback), built from the saved grade
    const card = () => {
      const res = G.gradeAll(lesson, { ...sub, manual: sub.manual || manual }, key);
      const cm = Object.entries(sub.comments || {}).filter(([, v]) => v).map(([k, v]) => ({ label: G.label(k), text: v }));
      return HSKMailCard.build({
        level: lesson.course || 'HSK3', lessonName: lshort(lesson), title: lesson.title, titleVi: lesson.titleVi, student: sub.name,
        final: sub.finalScore, finalMax: sub.finalMax, auto: res.auto, autoMax: res.autoMax, manual: res.manual, manualMax: res.manualMax,
        comment: sub.comment, comments: cm, link: new URL(sub.asg ? 'lesson.html?a=' + sub.asg : 'index.html', location.href).href,
        contact: `Messenger ${HSK_CONFIG.contact.messenger} · Zalo ${HSK_CONFIG.contact.zalo} · ${HSK_CONFIG.contact.email}`,
      });
    };
    const logoUrl = new URL('img/logo-mail.png', location.href).href;
    // the card builder lives in js/mailcard.js; load it on demand so a missing <script> tag can never make the buttons dead
    const ensureCard = async () => {
      if (window.HSKMailCard) return;
      await new Promise((res, rej) => { const s = document.createElement('script'); s.src = S.root + 'js/mailcard.js?v=' + Date.now(); s.onload = res; s.onerror = () => rej(new Error('找不到 js/mailcard.js —— 请把它上传到网站的 js 文件夹')); document.head.appendChild(s); });
      if (!window.HSKMailCard) throw new Error('js/mailcard.js 加载失败');
    };
    const preview = $('button', 'btn ghost sm', '👁 预览成绩单邮件'); row.appendChild(preview);
    preview.onclick = async () => {
      if (!sub.graded) { toast('请先保存批改'); return; }
      try { await ensureCard(); } catch (e) { alert('无法预览:' + e.message); return; }
      const ov = $('div', 'modal-ov'); const m = $('div', 'modal wide'); m.style.maxWidth = '640px';
      m.innerHTML = '<div class="modal-h"><b>成绩单邮件预览</b><button class="x" type="button">✕</button></div>';
      const fr = $('iframe'); fr.style.cssText = 'width:100%;height:70vh;border:2px solid var(--outline);border-radius:10px;margin-top:8px;background:#fff';
      fr.srcdoc = card().html.replace('{{LOGO}}', logoUrl); m.appendChild(fr); ov.appendChild(m); document.body.appendChild(ov);
      const close = () => ov.remove(); m.querySelector('.x').onclick = close; ov.onclick = e => { if (e.target === ov) close(); };
    };
    const sendMail = async () => {
      try {
        await ensureCard(); const c = card();
        const r = await S.notify(sub.email, c.subject, c.text, c.html, logoUrl);
        toast(r === 'sent' ? '成绩单邮件已发送 ✓' : r === 'sent?' ? '已发出请求(无法确认,请让学生查收)' : '已打开 Gmail 写信窗口(纯文字版),检查后点「发送」');
      } catch (e) { alert('邮件没有发出:' + e.message + '\n\n请检查 config.js 的 mailEndpoint 和 Apps Script 部署(见 SETUP.md 第 4 步)。'); }
    };    save.onclick = async () => {
      const res = G.gradeAll(lesson, { ...sub, manual }, key);
      if (res.pending && !confirm(`还有 ${res.pending} 题没打分,仍然标记为已批改吗?`)) return;
      const g = { manual, comments, comment: overall, graded: true, finalScore: res.total, finalMax: res.max };
      await S.saveGrade(sub.lessonId, sub.email, g); Object.assign(sub, g); toast('已保存 ✓'); draw();
      if (autoBox && autoBox.checked) await sendMail();
    };
    mail.onclick = async () => { if (!sub.graded) { toast('请先保存批改'); return; } await sendMail(); };    re.onclick = async () => { if (!confirm('删除这份提交,让学生重新做?此操作不能撤销。')) return; await S.reopen(sub.lessonId, sub.email); toast('已删除'); show('subs'); };
  }

  // =====================================================  assignments: one lesson -> one class -> one link
  async function viewAssign() {
    body.innerHTML = ''; const card = $('div', 'card'); body.appendChild(card);
    card.innerHTML = `<h2>布置作业 · Giao bài tập</h2><p class="hint">每个班的进度不同:为某一课、某个班生成一个<b>专属链接</b>,贴到 Google Classroom 的作业里。学生只能通过这个链接做这一课。<br><span class="vi">Mỗi lớp một tiến độ riêng: tạo link riêng cho từng bài + từng lớp rồi dán vào Google Classroom. Học sinh chỉ làm được bài qua link này.</span></p>`;
    if (location.protocol === 'file:') card.appendChild($('div', 'demo-tag', '⚠️ 现在是本地文件模式,生成的链接只能在这台电脑打开。网站正式发布后再生成给学生的链接。'));
    const students = await S.listStudents().catch(() => []);
    const classes = classesOf(students);
    const form = $('div', 'row-ctl'); form.style.marginTop = '12px'; card.appendChild(form);
    const ls = $('select'); ls.innerHTML = lessonOpts();
    const cs = $('select'); cs.innerHTML = '<option value="">全部班级 · tất cả lớp</option>' + classes.map(c => `<option>${esc(c)}</option>`).join('');
    const ci = $('input'); ci.type = 'text'; ci.placeholder = '或直接输入班级名'; ci.style.width = '140px';
    const due = $('input'); due.type = 'date'; due.title = '截止日期(可选)';
    const add = $('button', 'btn', '＋ 生成链接');
    form.append(ls, cs, ci, $('span', 'vi', '截止:'), due, add);
    if (!classes.length) card.appendChild($('p', 'hint', '还没有班级:先去「学生名单」给每个学生填班级(每行:邮箱, 姓名, 班级)。'));
    const wrap = $('div'); wrap.style.cssText = 'margin-top:12px;overflow-x:auto'; card.appendChild(wrap);
    const dl = $('datalist'); dl.id = 'clslist'; dl.innerHTML = classes.map(c => `<option value="${esc(c)}">`).join(''); card.appendChild(dl);
    const code = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
    const link = a => new URL('l/' + a.lessonId + '.html?a=' + a.code, location.href).href;   // l/<lesson>.html is a stub with the lesson's own <title> (so Classroom shows "I-4 我有两个孩子") that forwards to lesson.html
    const draw = async () => {
      const list = (await S.listAssignments()).filter(a => inLevel(a.lessonId)).sort((a, b) => (b.created || '').localeCompare(a.created || ''));
      const subs = await S.listSubmissions().catch(() => []);
      if (!list.length) { wrap.innerHTML = '<p class="hint">还没有布置过作业。</p>'; return; }
      const t = $('table', 'tbl'); t.innerHTML = '<tr><th>课</th><th>班级</th><th>截止</th><th>进度(已交/全班)</th><th>状态</th><th>学生链接(贴到 Classroom)</th></tr>';
      list.forEach(a => {
        const L = lessonMap[a.lessonId] || { no: '?', title: a.lessonId };
        // progress against the class roster (students list), matched by lesson so a re-issued link still counts
        const roster = students.filter(s => !a.cls || String(s.cls || '').toLowerCase() === String(a.cls).toLowerCase());
        const submitted = new Set(subs.filter(s => s.lessonId === a.lessonId).map(s => s.email));
        const missing = roster.filter(s => !submitted.has(s.email));
        const n = roster.length ? `<b>${roster.length - missing.length}</b> / ${roster.length}` : `${subs.filter(s => s.asg === a.code).length}`;
        const tr = $('tr');
        tr.innerHTML = `<td class="wrapok"><b>${lcode(L)}</b><br><span class="vi">${esc(L.title)}</span></td><td><input type="text" class="inl cls" list="clslist" placeholder="全部班级" value="${esc(a.cls || '')}" title="班级(留空 = 全部班级)"></td><td><input type="date" class="inl due" value="${esc(a.due || '')}" title="截止日期"></td><td>${n}</td><td></td><td><div class="linkrow"><input type="text" readonly value="${link(a)}"><button class="btn sm" type="button">复制</button></div><div class="linkrow" style="margin-top:6px"><input type="text" class="cru" placeholder="Classroom 作业网址(可选)" value="${esc(a.classroomUrl || '')}"></div></td>`;
        const stc = tr.children[4]; const tog = $('button', 'btn sm ' + (a.open === false ? 'ghost' : 'blue'), a.open === false ? '关闭' : '开放'); tog.title = a.open === false ? '现在已关闭,点击重新开放' : '现在开放中,点击关闭';
        tog.onclick = async () => { a.open = a.open === false; await S.saveAssignment(a); toast(a.open ? '已开放' : '已关闭'); draw(); }; stc.append(tog, ' ');
        const inp = tr.querySelector('.linkrow input'); inp.onfocus = () => inp.select();
        const saveField = async (k, v, msg) => { a[k] = v; await S.saveAssignment(a); toast(msg); draw(); };
        tr.querySelector('.cls').onchange = e => saveField('cls', e.target.value.trim(), '班级已保存 ✓');
        tr.querySelector('.due').onchange = e => saveField('due', e.target.value, e.target.value ? '截止日期已保存 ✓' : '已清除截止日期');
        // optional: the Classroom post's address. Students then get a "back to Classroom" button after they submit.
        const cru = tr.querySelector('.cru');
        cru.onchange = async () => { a.classroomUrl = cru.value.trim(); await S.saveAssignment(a); toast(a.classroomUrl ? 'Classroom 网址已保存 ✓' : '已清除'); };
        if (missing.length) {
          const mb = $('button', 'btn ghost sm', `未交名单 (${missing.length})`); mb.style.marginTop = '6px'; mb.style.display = 'block'; tr.children[3].appendChild(mb);
          mb.onclick = () => {
            const ov = $('div', 'modal-ov'); const m = $('div', 'modal'); m.style.maxWidth = '520px';
            const nm = s => (window.HSKMailCard ? HSKMailCard.splitName(s.name || s.email) : { zh: s.name || s.email, vi: s.name || s.email });
            const viNames = missing.map(s => nm(s).vi).join(', '), zhNames = missing.map(s => nm(s).zh).join(', ');
            const crs = L.course || 'HSK3', mock = !!L.label, N = missing.length;
            const msg = `Hi cả lớp 👋 Btvn ${mock ? 'bài thi thử' : 'bài ' + L.no} (${crs}) có ${N} bạn chưa nộp: ${viNames}${a.due ? ` (hạn chót: ${a.due})` : ''}\nLink: ${link(a)}\n\n嗨! ${crs}${mock ? '模拟测试' : '第' + L.no + '课'}作业有${N}位还没交的同学: ${zhNames}${a.due ? `(截止 ${a.due})` : ''}\n链接: ${link(a)}`;
            m.innerHTML = `<div class="modal-h"><b>未交名单 · ${lcode(L)} · ${esc(a.cls || '全部')}</b><button class="x" type="button">✕</button></div>`;
            const ul = $('div'); ul.style.cssText = 'margin:8px 0;max-height:200px;overflow:auto;border:2px solid var(--outline);border-radius:8px;background:#fff;padding:6px 10px';
            ul.innerHTML = missing.map(s => `<div>${esc(s.name || '')} <span class="vi">${esc(s.email)}</span></div>`).join('');
            const ta = $('textarea'); ta.value = msg; ta.style.cssText = 'width:100%;min-height:130px';
            const cp = $('button', 'btn', '复制催交消息'); cp.style.marginTop = '8px';
            cp.onclick = async () => { try { await navigator.clipboard.writeText(ta.value); } catch (e) { ta.select(); document.execCommand('copy'); } toast('已复制,可贴到 Classroom / Messenger / Zalo ✓'); };
            m.append(ul, ta, cp); ov.appendChild(m); document.body.appendChild(ov);
            const close = () => ov.remove(); m.querySelector('.x').onclick = close; ov.onclick = e => { if (e.target === ov) close(); };
          };
        }
        tr.querySelector('.linkrow .btn').onclick = async () => { try { await navigator.clipboard.writeText(link(a)); } catch (e) { inp.select(); document.execCommand('copy'); } toast('链接已复制 ✓'); };
        const del = $('button', 'btn ghost sm', '删除'); del.onclick = async () => { if (!confirm('删除这个链接?已交的作业不会被删除,但学生将无法再用这个链接打开。')) return; await S.deleteAssignment(a.code); draw(); }; stc.appendChild(del);
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
    card.innerHTML = `<h2>学生名单 · Danh sách học sinh</h2><p class="hint">只有这里登记的 Google 邮箱才能登录做作业。每行一个:<code>邮箱, 姓名, 班级</code>。<b>班级</b>用来给不同班布置不同进度的作业(例如 <code>HSK3-A</code>),同一个学生只属于一个班。<br><b>姓名</b>可以同时写越南本名和中文名,例如 <code>Trần Ngọc Hà Trang 陈玉荷庄</code>:成绩单邮件的中文行会称呼中文名,越南语行称呼本名。<br><span class="vi">Chỉ email trong danh sách này mới đăng nhập được. Cột lớp dùng để giao bài theo tiến độ từng lớp.</span></p>`;
    const list = await S.listStudents();
    const ta = $('textarea'); ta.style.cssText = 'width:100%;min-height:260px;font-family:var(--sans);font-size:15px;line-height:1.8'; ta.value = list.map(s => [s.email, s.name || '', s.cls || ''].join(', ').replace(/(, )+$/, '')).join('\n');
    const b = $('button', 'btn', '保存名单'); b.style.marginTop = '10px';
    b.onclick = async () => {
      const out = [], seen = new Set();
      ta.value.split('\n').forEach(l => { const p = l.split(/[,，\t]/).map(x => x.trim()); const e = (p[0] || '').toLowerCase(); if (/^\S+@\S+\.\S+$/.test(e) && !seen.has(e)) { seen.add(e); out.push({ email: e, name: p[1] || '', cls: p[2] || '' }); } });
      await S.saveStudents(out); toast('已保存 ' + out.length + ' 位学生 ✓');
    };
    card.append(ta, b);

    // e-mail check: send a sample grade report to the teacher herself, and say exactly what went wrong if it fails
    const mc = $('div', 'card'); body.appendChild(mc);
    mc.innerHTML = `<h2>📧 邮件设置检查</h2><p class="hint">状态:${S.canAutoMail ? '✅ config.js 里已经填了发信地址(mailEndpoint)' : '⚠️ 还没有填发信地址,「通知学生」只会打开 Gmail 写信窗口'}<br>点下面的按钮,会发一封<b>示例成绩单</b>到你自己的邮箱 <b>${esc(user.email)}</b>,用来确认自动发信是否正常。</p>`;
    const tb = $('button', 'btn', '发一封测试成绩单给我'); const ts = $('div', 'hint'); mc.append(tb, ts);
    tb.onclick = async () => {
      tb.disabled = true; ts.textContent = '发送中…';
      try {
        if (!window.HSKMailCard) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = S.root + 'js/mailcard.js?v=' + Date.now(); s.onload = res; s.onerror = () => rej(new Error('找不到 js/mailcard.js,请上传到 js 文件夹')); document.head.appendChild(s); });
        const c = HSKMailCard.build({ level: 'HSK3', lessonName: '第1课', title: '我们去机场接你们', titleVi: 'Chúng tôi sẽ ra sân bay đón các bạn', student: '测试 Test', final: 35, finalMax: 38, auto: 30, autoMax: 32, manual: 5, manualMax: 6, comment: '这是一封测试邮件 / Đây là thư thử.', comments: [{ label: 'Câu 28', text: 'Đặt câu đầy đủ' }], link: new URL('index.html', location.href).href, contact: `Messenger ${HSK_CONFIG.contact.messenger} · Zalo ${HSK_CONFIG.contact.zalo} · ${HSK_CONFIG.contact.email}` });
        const r = await S.notify(user.email, '[测试] ' + c.subject, c.text, c.html, new URL('img/logo-mail.png', location.href).href);
        ts.innerHTML = r === 'sent' ? '✅ 发送成功,请到 <b>' + esc(user.email) + '</b> 查收(也看看「垃圾邮件」)。' : '已打开 Gmail 写信窗口(未配置自动发信)。';
      } catch (e) { ts.innerHTML = '❌ ' + esc(e.message); }
      tb.disabled = false;
    };
  }

  // =====================================================  editor entry

  function viewEdit() {
    body.innerHTML = ''; const card = $('div', 'card'); body.appendChild(card);
    card.innerHTML = '<h2>题目编辑器 · Soạn đề</h2><p class="hint">在 PDF 页面图上框选答题位置、设置标准答案。选一课打开编辑器。</p>';
    const wrap = $('div', 'row-ctl'); wrap.style.marginTop = '8px'; card.appendChild(wrap);
    const es = $('select'); es.innerHTML = lessonOpts();
    const eb = $('a', 'btn', '编辑 · Soạn'); const setHref = () => { eb.href = 'editor.html?l=' + encodeURIComponent(es.value); }; es.onchange = setHref; setHref();
    wrap.append(es, eb);

    // publish every lesson's answers in one go: pick all files of private/keys/ (L01.json … MOCK.json)
    const bulk = $('div', 'howto'); bulk.style.marginTop = '16px';
    bulk.innerHTML = '<b>📤 批量发布答案</b><br>把<b>本机</b> <code>private/keys</code> 文件夹里的全部答案文件(L01.json … MOCK.json)一次选中,题目和答案会一起发布到站点。<br><span class="vi">答案只存进你的 Firestore,不会出现在公开的网站文件里。</span><br>';
    const fi = $('input'); fi.type = 'file'; fi.multiple = true; fi.accept = '.json,application/json'; fi.style.display = 'none';
    const go = $('button', 'btn', '选择答案文件并发布'); go.style.marginTop = '8px'; const st = $('div', 'hint');
    go.onclick = () => fi.click();
    fi.onchange = async () => {
      const files = [...fi.files]; if (!files.length) return; let ok = 0; const fail = [];
      for (const f of files) {
        const id = f.name.replace(/\.json$/i, '');
        try {
          st.textContent = `发布中 ${ok + fail.length + 1}/${files.length}: ${id} …`;
          const key = JSON.parse(await f.text()); const lesson = await S.loadLessonFile(id);      // the lesson.json on the site, not the older copy in Firestore
          await S.publishLesson(lesson, key); ok++;
        } catch (e) { fail.push(id + '(' + e.message + ')'); }
      }
      st.innerHTML = `✅ 已发布 ${ok} 课` + (fail.length ? `<br>❌ 失败:${fail.join('、')}` : ''); fi.value = '';
    };
    bulk.append(go, fi, st); card.appendChild(bulk);
  }

  show('subs');
});
