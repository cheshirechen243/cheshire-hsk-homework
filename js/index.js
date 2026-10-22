HSKShell.boot({ need: 'student' }, async (user, main) => {
  const S = HSKStore, $ = HSKShell.$, G = HSKGrade;
  const extra = $('span');
  if (user.role === 'teacher') { const a = $('a', 'btn sm', '老师后台 Trang giáo viên'); a.href = 'teacher.html'; extra.appendChild(a); }
  main.appendChild(HSKShell.topline(user, extra));

  // Students open work from the link the teacher posts for their class in Google Classroom; this page lists the class's
  // open assignments (to start them) together with what they have already handed in.
  const card = $('div', 'card');
  card.innerHTML = `<h1>沉鱼汉语 · HSK 练习册 · 作业</h1><div class="vi" style="margin-top:-2px">Sổ tay luyện tập & bài tập HSK · Tiếng Trung Cheshire</div>
    <div class="howto"><b>📌 怎么做作业 · Cách làm bài</b><br>
    请打开老师在 <b>Google Classroom</b> 里发的作业链接,或者在下面「我的作业」里点开始。<br>
    <span class="vi">Hãy mở link bài tập mà cô gửi trong <b>Google Classroom</b>, hoặc bấm vào bài ở mục “Bài tập của em” bên dưới.</span><br>老师额外布置的作业在「📝 作业」里。<br><span class="vi">Bài tập cô giao thêm nằm ở mục “📝 Bài tập”.</span>
    ${user.cls ? `<br><span class="vi">Lớp của em · 你的班级: <b>${user.cls}</b></span>` : ''}</div>`;
  main.appendChild(card);

  // three sections: workbook (the HSK 学练手册 exercises) / extra homework set by the teacher / live class
  const tabs = $('div', 'tabs'); const hwBox = $('div'), exBox = $('div'), liveBox = $('div');
  const T2 = { hw: '📚 练习册 Sổ tay', extra: '📝 作业 Bài tập', live: '🎓 上课 Lớp học' };
  let curTab = 'hw'; try { const v = localStorage.getItem('hsk3.stab'); curTab = (v === 'live' || v === 'extra') ? v : 'hw'; } catch (e) { /* ignore */ }
  const showTab = k => { curTab = k; try { localStorage.setItem('hsk3.stab', k); } catch (e) { /* ignore */ } [...tabs.children].forEach(b => b.classList.toggle('on', b.dataset.k === k)); hwBox.style.display = k === 'hw' ? '' : 'none'; exBox.style.display = k === 'extra' ? '' : 'none'; liveBox.style.display = k === 'live' ? '' : 'none'; };
  Object.entries(T2).forEach(([k, v]) => { const b = $('button', 'tab', v); b.dataset.k = k; b.onclick = () => showTab(k); tabs.appendChild(b); });
  main.appendChild(tabs); main.appendChild(hwBox); main.appendChild(exBox); main.appendChild(liveBox);
  const liveCard = $('div', 'card');
  liveCard.innerHTML = '<h2>上课 · Lớp học trực tuyến</h2><p class="hint">老师开课后，这里会出现你们班的课堂，点“进入”就能看课件；也可以输入老师给的课堂码。<br><span class="vi">Khi cô mở lớp, lớp của em sẽ hiện ở đây. Hoặc nhập mã lớp cô gửi.</span></p>';
  const codeRow = $('div', 'row-ctl'); const codeIn = $('input'); codeIn.type = 'text'; codeIn.placeholder = '课堂码 Mã lớp（6 位）'; codeIn.maxLength = 6; codeIn.style.textTransform = 'uppercase';
  const goBtn = $('button', 'btn seal', '进入 Vào lớp'); goBtn.onclick = () => { const c = codeIn.value.trim().toUpperCase(); if (c.length >= 4) location.href = 'live.html?c=' + encodeURIComponent(c); };
  codeIn.onkeydown = e => { if (e.key === 'Enter') goBtn.click(); };
  codeRow.append(codeIn, goBtn); liveCard.appendChild(codeRow);
  const liveList = $('div'); liveCard.appendChild(liveList); liveBox.appendChild(liveCard);
  (async () => {
    liveList.innerHTML = '<p class="hint">正在查看你们班有没有课堂…</p>';
    try {
      if (S.isDemo || !window.HSKLive) throw new Error('demo');
      const rows = (await HSKLive.listOpenForClass(user.cls || '')).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      liveList.innerHTML = '';
      if (!rows.length) { liveList.innerHTML = '<p class="hint">现在没有正在进行的课堂。<br><span class="vi">Hiện chưa có lớp nào đang mở.</span></p>'; return; }
      rows.forEach(se => { const a = $('a', 'lcard'); a.href = 'live.html?c=' + se.code; a.innerHTML = '<div class="no">' + (se.no || '▶') + '</div><div class="t">' + se.title + '</div><div class="tv">' + (se.started ? '🔴 正在上课 Đang học' : '⏳ 等待老师开始 Chờ cô bắt đầu') + '</div>'; liveList.appendChild(a); });
    } catch (e) { liveList.innerHTML = ''; }
  })();

  const mine = await S.listMine(user.email).catch(() => []);
  const lessons = await S.listLessons().catch(() => []);
  const asgs = await S.listForClass(user.cls || '').catch(() => []);
  const lm = Object.fromEntries(lessons.map(l => [l.id, l]));
  const course = id => (lm[id] && lm[id].course) || 'HSK3';
  const isHw = id => !!(lm[id] && lm[id].hw);               // extra-homework worksheets (the 作业 tab) vs. workbook lessons (the 练习册 tab)

  // one entry per lesson: what the student handed in and/or the open assignment for it
  const items = {};
  mine.forEach(s => { (items[s.lessonId] = items[s.lessonId] || {}).sub = s; });
  asgs.sort((a, b) => (a.created || '').localeCompare(b.created || '')).forEach(a => { (items[a.lessonId] = items[a.lessonId] || {}).asg = a; });   // newest link wins
  const list = Object.entries(items).map(([id, it]) => ({ id, ...it, L: lm[id] || { no: (it.sub && it.sub.lessonNo) || '?', title: id } }));
  const order = x => (x.L.label ? 999 : Number(x.L.no) || 0);

  // a board = level switcher + numbered cards (what the student handed in and/or the open assignment for it)
  function board(box, title, hint, wantHw, lvKey) {
    const hist = $('div', 'card');
    hist.innerHTML = '<h2>' + title + '</h2>' + (hint ? '<p class="hint">' + hint + '</p>' : '');
    const mineList = list.filter(x => isHw(x.id) === wantHw);
    // level switcher: students only look at one level at a time (remembered on this device)
    const levels = [...new Set([...mineList.map(x => course(x.id)), ...lessons.filter(l => l.open && !!l.hw === wantHw).map(l => l.course || 'HSK3')])].sort(lvOrder);
    let lvl = null; try { lvl = localStorage.getItem(lvKey); } catch (e) { }
    if (!levels.includes(lvl)) lvl = levels[levels.length - 1] || 'HSK3';
    const lvBox = $('div'), histBody = $('div');
    const draw = () => {
      histBody.innerHTML = '';
      const shown = mineList.filter(x => levels.length < 2 || course(x.id) === lvl).sort((a, b) => order(a) - order(b));
      if (!shown.length) { histBody.appendChild($('p', 'hint', '现在没有作业。<br><span class="vi">Hiện chưa có bài tập nào.</span>')); return; }
      const grid = $('div', 'lessons'); histBody.appendChild(grid);
      shown.forEach(x => {
        const L = x.L, s = x.sub, asg = s ? (s.asg || (x.asg && x.asg.code)) : (x.asg && x.asg.code);
        const a = $('a', 'lcard'); a.href = asg ? 'lesson.html?a=' + encodeURIComponent(asg) : '#';
        if (!asg) a.classList.add('off');
        let date, badge;
        if (s) {
          date = new Date(s.submittedAt).toLocaleDateString() + (s.late ? ' · ⏰ 迟交 nộp muộn' : '');
          badge = `<span class="badge ${s.graded ? 'ok' : 'wait'}">${s.graded ? '已批改 · Đã chấm ' + s.finalScore + '/' + s.finalMax + ' · ' + G.pct(s.finalScore, s.finalMax) : '已提交 · Đã nộp'}</span>`;
        } else {
          date = x.asg && x.asg.due ? '⏰ 截止 Hạn nộp: ' + x.asg.due : '&nbsp;';
          badge = '<span class="badge todo">未提交 · Chưa nộp · 点击开始</span>';
        }
        a.innerHTML = `<div class="no">${L.label ? '★' : L.no}</div><div class="t">${L.title}</div><div class="tv">${L.titleVi || ''}</div><div class="s">${date}</div>${badge}`;
        grid.appendChild(a);
      });
    };
    if (levels.length > 1) {
      const bar = $('div', 'lvbar', '<span>等级 · Cấp độ</span>'); bar.style.margin = '10px 0';
      levels.forEach(c => { const b = $('button', 'lvbtn' + (c === lvl ? ' on' : ''), c); b.type = 'button'; b.onclick = () => { lvl = c; try { localStorage.setItem(lvKey, c); } catch (e) { } [...bar.querySelectorAll('.lvbtn')].forEach(x => x.classList.toggle('on', x === b)); draw(); }; bar.appendChild(b); });
      lvBox.appendChild(bar);
    }
    hist.append(lvBox, histBody); draw();
    box.appendChild(hist);
  }
  board(hwBox, '我的练习册 · Sổ tay của em', '', false, 'hsk3.slevel');
  board(exBox, '我的作业 · Bài tập của em', '老师额外布置的作业，在线完成：选择题自动给分，填空题老师批改；可以打字，也可以手写。<br><span class="vi">Bài tập cô giao thêm, làm trực tiếp trên web: trắc nghiệm tự chấm điểm, điền chỗ trống cô chấm; em có thể gõ chữ hoặc viết tay.</span>', true, 'hsk3.hlevel');

  // Teacher preview shortcut (never shown to students): one card, a level label + its lessons in course order, with a gap between levels
  if (user.role === 'teacher') {
    const preview = (box, wantHw) => {
      const t = $('div', 'card'); t.innerHTML = '<h2>老师预览 · Xem thử</h2><p class="hint">学生看不到这个列表。正式布置请到「老师后台 → 布置作业」生成班级链接。</p>';
      const mineL = lessons.filter(l => l.open && !!l.hw === wantHw);
      [...new Set(mineL.map(l => l.course || 'HSK3'))].sort(lvOrder).forEach((c, k) => {
        const h = $('div', 'lvhead' + (k ? ' again' : ''), c); t.appendChild(h); const g = $('div', 'lessons'); t.appendChild(g);
        mineL.filter(l => (l.course || 'HSK3') === c).sort((a, b) => (a.label ? 999 : a.no) - (b.label ? 999 : b.no)).forEach(L => { const a = $('a', 'lcard'); a.href = 'lesson.html?l=' + L.id; a.innerHTML = `<div class="no">${L.label ? '★' : L.no}</div><div class="t">${L.title}</div><div class="tv">${L.titleVi || ''}</div>`; g.appendChild(a); });
      });
      if (mineL.length) box.appendChild(t);
    };
    preview(hwBox, false); preview(exBox, true);
  }
  showTab(curTab);
});
