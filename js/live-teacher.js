// Teacher: "上课" tab — create a class session (course + class), share the code, see who has come in, start the lesson.
window.HSKLiveTeacher = async function (body, X) {
  const { S, $, esc, toast } = X, L = window.HSKLive;
  body.innerHTML = '';
  const card = $('div', 'card'); body.appendChild(card);
  card.innerHTML = '<h2>上课 · Lớp học trực tuyến</h2><p class="hint">选课件和班级 → 生成课堂 → 把链接发给学生。学生用自己的账号进来,头像就会亮起来。<br><span class="vi">Chọn bài giảng và lớp → tạo lớp → gửi link cho học sinh.</span></p>';
  if (S.isDemo) { card.appendChild($('p', 'hint', '⚠ 现在是演示模式(没连 Firebase)。上课功能需要正式站点。')); return; }
  const db = await L.db();
  let courses = [];
  try { const r = await fetch(S.root + 'courses/index.json?v=' + Date.now(), { cache: 'no-store' }); if (r.ok) courses = (await r.json()).courses || []; } catch (e) { /* none yet */ }
  const students = await S.listStudents().catch(() => []);
  const classes = [...new Set(students.map(s => (s.cls || '').trim()).filter(Boolean))].sort();

  // level: HSK1 / HSK2 / HSK3 (一级 / 二级 / 三级)
  const LV = [['HSK1', '一级'], ['HSK2', '二级'], ['HSK3', '三级']];
  const lvOf = c => c.level || ({ I: 'HSK1', II: 'HSK2', III: 'HSK3' }[(/^([IV]+)-/.exec(c.id || '') || [])[1]] || 'HSK3');
  let level = 'HSK3'; try { level = localStorage.getItem('hsk3.liveLevel') || 'HSK3'; } catch (e) { /* ignore */ }
  const lvBar = $('div', 'lvbar', '<span>等级 · Cấp độ</span>'); card.appendChild(lvBar);
  LV.forEach(([k, t]) => { const b = $('button', 'lvbtn' + (k === level ? ' on' : ''), t); b.type = 'button'; b.onclick = () => { level = k; try { localStorage.setItem('hsk3.liveLevel', k); } catch (e) { /* ignore */ } [...lvBar.querySelectorAll('.lvbtn')].forEach(x => x.classList.toggle('on', x === b)); fillCourses(); draw(); }; lvBar.appendChild(b); });
  const ctl = $('div', 'row-ctl'); card.appendChild(ctl);
  const cs = $('select');   const fillCourses = () => { const list = courses.map((c, i) => [c, i]).filter(([c]) => lvOf(c) === level); cs.innerHTML = list.length ? list.map(([c, i]) => `<option value="${i}">${esc(c.no ? c.no + '：' : '')}${esc(c.title)}</option>`).join('') : '<option value="">（这个等级还没有课件，请先从课件工坊发布）</option>'; };
  fillCourses();
  const cl = $('select'); cl.innerHTML = classes.map(c => `<option>${esc(c)}</option>`).join('') || '<option value="">（学生名单里还没有班级）</option>';
  const mk = $('button', 'btn seal', '＋ 生成课堂'); mk.type = 'button';
  ctl.append(cs, cl, mk);
  const list = $('div'); card.appendChild(list);
  const timers = [], unsubs = [];
  const clear = () => { timers.forEach(clearInterval); unsubs.forEach(u => u()); timers.length = 0; unsubs.length = 0; };

  mk.onclick = async () => {
    const c = courses[+cs.value], cls = cl.value;
    if (!c || !cls) { toast('请先选课件和班级'); return; }
    const mem = students.filter(s => String(s.cls || '').trim() === cls);
    if (!mem.length) { toast('这个班级还没有学生'); return; }
    const code = L.newCode();
    const av = L.assign(mem.map(s => s.email), cls);
    const roster = mem.map(s => ({ email: s.email, name: s.name || s.email.split('@')[0], av: av[s.email] }));
    await db.collection('live').doc(code).set({ code, level: lvOf(c), cls, courseId: c.id, coursePath: c.path || c.id, title: c.title, no: c.no || '', roster, open: true, started: false, state: { i: 0, st: null, ts: Date.now() }, createdAt: new Date().toISOString() });
    toast('课堂已生成：' + code);
    draw();
  };

  async function draw() {
    clear(); list.innerHTML = '加载中…';
    const q = await db.collection('live').where('open', '==', true).get();
    const sessions = q.docs.map(d => d.data()).filter(x => (x.level || 'HSK3') === level).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    list.innerHTML = '';
    if (!sessions.length) { list.appendChild($('p', 'hint', '这个等级现在没有进行中的课堂。')); return; }
    sessions.forEach(se => list.appendChild(panel(se)));
  }

  function panel(se) {
    const link = new URL(S.root + 'live.html?c=' + se.code, location.href).href;
    const p = $('div', 'live-panel');
    p.innerHTML = `<div class="lp-head"><b>${esc(se.no ? se.no + '：' : '')}${esc(se.title)}</b> · 班级 ${esc(se.cls)} · 课堂码 <span class="lp-code">${se.code}</span> <span class="lp-n"></span></div><div class="lp-link">${esc(link)}</div>`;
    const grid = $('div', 'live-grid'); p.appendChild(grid);
    const cards = {};
    se.roster.forEach(r => {
      const c = $('div', 'live-stu off', `<img src="${L.pix(r.av)}" alt=""><span>${esc(r.name)}</span>`);
      grid.appendChild(c); cards[r.email] = c;
    });
    let members = {};
    const paint = () => { let n = 0; Object.keys(cards).forEach(e => { const on = L.online(members[e]); cards[e].classList.toggle('off', !on); if (on) n++; }); p.querySelector('.lp-n').textContent = `· 已进入 ${n} / ${se.roster.length}`; };
    unsubs.push(db.collection('live').doc(se.code).collection('members').onSnapshot(s => { members = {}; s.docs.forEach(d => { members[d.id] = d.data(); }); paint(); }));
    timers.push(setInterval(paint, 8000));
    const row = $('div', 'row-ctl'); p.appendChild(row);
    const go = $('button', 'btn seal', se.started ? '▶ 回到讲者视图' : '▶ 开始上课（打开讲者视图）');
    go.onclick = async () => {
      await db.collection('live').doc(se.code).update({ started: true });
      window.open(S.root + 'courses/' + se.coursePath + '/index.html?live=' + se.code + '&role=teacher', '_blank');
      go.textContent = '▶ 回到讲者视图';
    };
    const cp = $('button', 'btn ghost sm', '复制学生链接'); cp.onclick = () => { navigator.clipboard.writeText(link).then(() => toast('已复制')); };
    const end = $('button', 'btn ghost sm', '结束课堂'); end.onclick = async () => {
      if (!confirm('结束这个课堂？学生会被请出。')) return;
      await db.collection('live').doc(se.code).update({ open: false, started: false });
      const ms = await db.collection('live').doc(se.code).collection('members').get(); const b = db.batch(); ms.docs.forEach(d => b.delete(d.ref)); await b.commit();
      draw();
    };
    row.append(go, cp, end);
    return p;
  }
  draw();
};
