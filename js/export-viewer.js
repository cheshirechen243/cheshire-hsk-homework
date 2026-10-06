// The viewer that is built INTO an exported homework file (see exporter.js): a single .html with the student's work, the teacher's grades,
// comments and the voice recordings, which opens offline like the grade e-mail.  Uses HSKGrade + HSKRender (inlined next to this script).
(function () {
  const D = JSON.parse(document.getElementById('data').textContent);
  const G = window.HSKGrade, R = window.HSKRender;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const ROMAN = { HSK1: 'I', HSK2: 'II', HSK3: 'III' };
  const code = L => (ROMAN[L.course || 'HSK3'] || 'III') + '-' + (L.label ? '模拟' : L.no);
  const fmtDate = s => { try { const d = new Date(s); return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate(); } catch (e) { return ''; } };
  const app = document.getElementById('app');
  document.title = D.title;

  function result(it) { return G.gradeAll(it.lesson, { ...it.sub }, it.key || {}); }
  function score(it) { const r = result(it); return it.sub.graded ? [it.sub.finalScore, it.sub.finalMax] : [r.total, r.max]; }

  function shell(inner, back) {
    app.innerHTML = '';
    const wrap = el('div', 'exp-wrap');
    const head = el('div', 'exp-head', `<img src="${D.logo}" alt="" class="exp-logo"><div><b>沉鱼汉语 · Tiếng Trung HSK</b><br><span class="vi">${esc(D.subtitle)}</span></div>`);
    if (back) { const b = el('button', 'btn ghost sm', '← 返回 · Quay lại'); b.type = 'button'; b.onclick = () => { location.hash = back; }; head.appendChild(b); }
    wrap.appendChild(head); wrap.appendChild(inner); app.appendChild(wrap); window.scrollTo(0, 0);
  }

  function home() {
    const box = el('div');
    if (D.students.length === 1) return studentView(0);
    box.appendChild(el('h2', null, '学生 · Học sinh'));
    const grid = el('div', 'lessons');
    D.students.forEach((s, i) => {
      const a = el('a', 'lcard'); a.href = '#s' + i;
      const done = s.items.filter(x => x.sub.graded).length;
      a.innerHTML = `<div class="t">${esc(s.name)}</div><div class="tv">${esc(s.cls || '')}</div><div class="s">${s.items.length} 份作业 · bài</div><span class="badge ok">已批改 ${done}/${s.items.length}</span>`;
      grid.appendChild(a);
    });
    box.appendChild(grid); shell(box);
  }

  function studentView(si) {
    const s = D.students[si]; const box = el('div');
    box.appendChild(el('h2', null, `${esc(s.name)} <span class="vi">${esc(s.cls || '')}</span>`));
    box.appendChild(el('p', 'hint', '点一份作业,看批改详情。<br><span class="vi">Bấm vào từng bài để xem chi tiết.</span>'));
    const grid = el('div', 'lessons');
    s.items.forEach((it, ii) => {
      const [a, b] = score(it); const L = it.lesson;
      const c = el('a', 'lcard'); c.href = '#s' + si + '-' + ii;
      c.innerHTML = `<div class="no">${code(L)}</div><div class="t">${esc(L.title)}</div><div class="tv">${esc(L.titleVi || '')}</div><div class="s">${fmtDate(it.sub.submittedAt)}${it.sub.late ? ' · ⏰' : ''}</div>
        <span class="badge ${it.sub.graded ? 'ok' : 'wait'}">${it.sub.graded ? '已批改 · Đã chấm ' + a + '/' + b + ' · ' + G.pct(a, b) : '待批改 · Chờ chấm'}</span>`;
      grid.appendChild(c);
    });
    if (!s.items.length) grid.appendChild(el('p', 'hint', '没有作业 · Chưa có bài'));
    box.appendChild(grid); shell(box, D.students.length > 1 ? '' : null);
  }

  function lessonView(si, ii) {
    const s = D.students[si], it = s.items[ii]; const L = it.lesson, sub = it.sub;
    const answers = JSON.parse(JSON.stringify(sub.answers || {}));
    Object.entries(it.recs || {}).forEach(([fid, url]) => { if (answers[fid] && answers[fid].rec) answers[fid].rec.data = url; });
    const res = result(it); const [sc, mx] = score(it); const manual = sub.manual || {}, comments = sub.comments || {};
    const box = el('div');
    box.appendChild(el('h2', null, `${code(L)} · ${esc(L.title)}`));
    box.appendChild(el('div', 'vi', `${esc(s.name)} · ${fmtDate(sub.submittedAt)}${sub.late ? ' · ⏰ nộp muộn' : ''}`));
    const sum = el('div', 'card exp-sum');
    sum.innerHTML = `<div class="bigscore"><b>${sc}</b><span> / ${mx}</span><em>${G.pct(sc, mx)}</em></div><div class="pbar"><i style="width:${G.pct(sc, mx)}"></i></div>
      <p class="hint" style="text-align:center">自动分 ${res.auto}/${res.autoMax} (${G.pct(res.auto, res.autoMax)}) · 手动分 ${res.manual}/${res.manualMax}${sub.graded ? '' : ' · <b>还没批改完 · chưa chấm xong</b>'}</p>
      ${sub.comment ? `<div class="howto"><b>老师总评 · Nhận xét của cô</b><br>${esc(sub.comment).replace(/\n/g, '<br>')}</div>` : ''}`;
    box.appendChild(sum);

    // the questions, in the order they appear on the worksheet
    const pos = f => { const r = f.type === 'choice' && f.options && f.options[0] ? f.options[0].rect : f.rect; return [f.page, Math.round(r[1] * 60), r[0]]; };
    const fields = L.fields.filter(f => f.points > 0).sort((a, b) => { const p = pos(a), q = pos(b); return p[0] - q[0] || p[1] - q[1] || p[2] - q[2]; });
    const tog = el('label', 'exp-tog', '<input type="checkbox" checked> 显示 ✅❌ 和答案 · Hiện ✅❌ và đáp án'); box.appendChild(tog);
    const pages = el('div', 'exp-pages scroller'); box.appendChild(pages);
    tog.querySelector('input').onchange = e => pages.classList.toggle('hide-tags', !e.target.checked);
    R.renderLesson(pages, L, { base: it.base, answers, mode: 'review', results: res.fields, key: it.key || {}, showAnswers: true, comments });

    const list = el('div', 'exp-list'); list.appendChild(el('h3', null, '每题详情 · Chi tiết từng câu'));
    fields.forEach(f => {
      const r = res.fields[f.id], v = answers[f.id];
      const g = el('div', 'gi ' + (r.auto ? (r.correct ? 'ok' : 'bad') : (r.graded ? 'ok' : 'wait')));
      let ans;
      if (v == null || v === '') ans = '<i>(空)</i>';
      else if (typeof v === 'object' && v.rec) ans = v.rec.data ? `🎤 <audio controls src="${v.rec.data}" style="width:100%"></audio>` : '<i>🎤 录音没有保存下来 · không còn bản ghi</i>';
      else if (typeof v === 'object' && v.img) ans = `<img class="draw" src="${v.img}">`;
      else ans = esc(typeof v === 'object' ? v.v : v);
      const pts = r.graded || r.overridden || r.auto ? r.points : '–';
      g.innerHTML = `<div class="h"><span>${esc(G.label(f.id))} <span class="vi">第${f.page}页</span></span><span><b>${pts}</b> / ${f.points}</span></div><div class="stu">${ans}</div>`
        + (r.auto && !r.correct && it.key && it.key[f.id] != null ? `<div class="vi">正确答案 · Đáp án: ${esc([].concat(it.key[f.id]).join(' / '))}</div>` : '')
        + (comments[f.id] ? `<div class="exp-cmt">💬 ${esc(comments[f.id])}</div>` : '');
      g.onclick = e => { if (e.target.closest('audio,a,img')) return; const t = pages.querySelector('[data-fid="' + f.id + '"]'); if (t) { t.scrollIntoView({ behavior: 'smooth', block: 'center' }); t.classList.remove('flash'); void t.offsetWidth; t.classList.add('flash'); } };
      list.appendChild(g);
    });
    box.appendChild(list);
    shell(box, D.students.length > 1 ? '#s' + si : '#s' + si);
  }

  function route() {
    const h = location.hash.replace('#', '');
    let m;
    if ((m = h.match(/^s(\d+)-(\d+)$/)) && D.students[+m[1]] && D.students[+m[1]].items[+m[2]]) return lessonView(+m[1], +m[2]);
    if ((m = h.match(/^s(\d+)$/)) && D.students[+m[1]]) return studentView(+m[1]);
    home();
  }
  window.addEventListener('hashchange', route);
  route();
})();
