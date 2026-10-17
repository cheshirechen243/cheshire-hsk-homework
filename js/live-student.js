// Student: enter a class with the code / link, show who is in, and (once the teacher starts) the lesson, follow-only.
HSKShell.boot({ wide: true }, async (user, main) => {
  const S = HSKStore, $ = HSKShell.$, L = HSKLive;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const code = (new URLSearchParams(location.search).get('c') || '').trim().toUpperCase();
  const msg = (t, vi) => { main.innerHTML = ''; main.appendChild($('div', 'card login', `<h2>${t}</h2>${vi ? `<p class="hint"><span class="vi">${vi}</span></p>` : ''}`)); };
  if (S.isDemo) return msg('上课功能需要正式站点', 'Cần kết nối Firebase.');
  if (!code) return msg('缺少课堂码', 'Thiếu mã lớp.');
  const db = await L.db();
  const ref = db.collection('live').doc(code);
  let se = (await ref.get().catch(() => null));
  if (!se || !se.exists || se.data().open === false) return msg('这个课堂不存在或已结束', 'Lớp học không tồn tại hoặc đã kết thúc.');
  se = se.data();
  const isTeacher = user.role === 'teacher';
  if (!isTeacher && String(user.cls || '').trim().toLowerCase() !== String(se.cls || '').trim().toLowerCase()) return msg('这个课堂不是你的班级', 'Đây không phải lớp của em.');

  // ---- presence
  const mref = ref.collection('members').doc(user.email);
  const beat = (left) => isTeacher ? Promise.resolve() : mref.set({ name: user.name, lastSeen: Date.now(), left: !!left }, { merge: true }).catch(() => { });
  beat(false); const hb = setInterval(() => beat(false), 15000);
  addEventListener('pagehide', () => beat(true));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) beat(false); });

  // ---- lobby
  main.innerHTML = '';
  const card = $('div', 'card'); main.appendChild(card);
  card.innerHTML = `<h2>${esc(se.no ? se.no + '：' : '')}${esc(se.title)}</h2><p class="hint">班级 ${esc(se.cls)} · 你好，<b>${esc(user.name)}</b>！<span class="wait"></span></p>`;
  const grid = $('div', 'live-grid big'); card.appendChild(grid);
  const cards = {};
  se.roster.forEach(r => { const c = $('div', 'live-stu off' + (r.email === user.email ? ' me' : ''), `<img src="${L.pix(r.av)}" alt=""><span>${esc(r.name)}</span>`); grid.appendChild(c); cards[r.email] = c; });
  let members = {};
  const paint = () => Object.keys(cards).forEach(e => cards[e].classList.toggle('off', !(e === user.email || L.online(members[e]))));
  ref.collection('members').onSnapshot(s => { members = {}; s.docs.forEach(d => { members[d.id] = d.data(); }); paint(); }, () => { });
  setInterval(paint, 8000); paint();

  // ---- the lesson (full screen, follow only)
  let frame = null;
  const open = () => {
    if (frame) return;
    frame = $('div', 'live-stage');
    const src = S.root + 'courses/' + se.coursePath + '/index.html?live=' + code + '&role=' + (isTeacher ? 'teacher' : 'student') + '&fit=1';
    frame.innerHTML = `<iframe src="${esc(src)}" allow="autoplay; fullscreen"></iframe><button class="live-x" title="回到等待页">✕</button>`;
    frame.querySelector('.live-x').onclick = () => { frame.remove(); frame = null; };
    document.body.appendChild(frame);
  };
  const waitEl = card.querySelector('.wait');
  ref.onSnapshot(d => {
    const x = d.data();
    if (!x || x.open === false) { clearInterval(hb); if (frame) frame.remove(); msg('课堂已结束 · Lớp học đã kết thúc'); return; }
    waitEl.textContent = x.started ? '' : ' 　老师还没开始，请稍等…';
    if (x.started) open();
  });
});
