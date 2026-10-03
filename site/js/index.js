HSKShell.boot({ need: 'student' }, async (user, main) => {
  const S = HSKStore, $ = HSKShell.$, G = HSKGrade;
  const extra = $('span');
  if (user.role === 'teacher') { const a = $('a', 'btn sm', '老师后台 Trang giáo viên'); a.href = 'teacher.html'; extra.appendChild(a); }
  main.appendChild(HSKShell.topline(user, extra));

  // Students do NOT get a list of every lesson: each assignment is opened from the link the teacher
  // posts for their class in Google Classroom. This page only shows what they have already handed in.
  const card = $('div', 'card');
  card.innerHTML = `<h1>HSK 3 学练手册 · 作业</h1><div class="vi" style="margin-top:-2px">Bài tập sổ tay luyện tập HSK 3</div>
    <div class="howto"><b>📌 怎么做作业 · Cách làm bài</b><br>
    请打开老师在 <b>Google Classroom</b> 里发的作业链接。<br>
    <span class="vi">Hãy mở link bài tập mà cô gửi trong <b>Google Classroom</b>.</span>
    ${user.cls ? `<br><span class="vi">Lớp của em · 你的班级: <b>${user.cls}</b></span>` : ''}</div>`;
  main.appendChild(card);

  const mine = await S.listMine(user.email).catch(() => []);
  const lessons = await S.listLessons().catch(() => []);
  const lm = Object.fromEntries(lessons.map(l => [l.id, l]));
  const hist = $('div', 'card');
  hist.innerHTML = '<h2>我交过的作业 · Bài đã nộp</h2>';
  if (!mine.length) hist.appendChild($('p', 'hint', '还没有提交过作业。<br><span class="vi">Chưa nộp bài nào.</span>'));
  else {
    const grid = $('div', 'lessons'); hist.appendChild(grid);
    mine.sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || '')).forEach(s => {
      const L = lm[s.lessonId] || { no: s.lessonNo, title: s.lessonId };
      const a = $('a', 'lcard'); a.href = s.asg ? 'lesson.html?a=' + encodeURIComponent(s.asg) : '#';
      if (!s.asg) a.classList.add('off');
      const done = s.graded;
      a.innerHTML = `<div class="no">${L.no}</div><div class="t">${L.title}</div><div class="tv">${L.titleVi || ''}</div><div class="s">${new Date(s.submittedAt).toLocaleDateString()}${s.late ? ' · ⏰ 迟交 nộp muộn' : ''}</div>
        <span class="badge ${done ? 'ok' : 'wait'}">${done ? '已批改 · Đã chấm ' + s.finalScore + '/' + s.finalMax + ' · ' + G.pct(s.finalScore, s.finalMax) : '已提交 · Đã nộp'}</span>`;
      grid.appendChild(a);
    });
  }
  main.appendChild(hist);

  // Teacher preview shortcut (never shown to students)
  if (user.role === 'teacher') {
    const t = $('div', 'card'); t.innerHTML = '<h2>老师预览 · Xem thử</h2><p class="hint">学生看不到这个列表。正式布置请到「老师后台 → 布置作业」生成班级链接。</p>';
    const g = $('div', 'lessons'); t.appendChild(g);
    lessons.filter(l => l.open).forEach(L => { const a = $('a', 'lcard'); a.href = 'lesson.html?l=' + L.id; a.innerHTML = `<div class="no">${L.no}</div><div class="t">${L.title}</div><div class="tv">${L.titleVi || ''}</div>`; g.appendChild(a); });
    main.appendChild(t);
  }
});
