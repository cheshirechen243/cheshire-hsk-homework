HSKShell.boot({ need: 'student', noBanner: true }, async (user, main) => {
  const S = HSKStore, $ = HSKShell.$, G = HSKGrade;
  const qs = new URLSearchParams(location.search);
  main.innerHTML = '<div class="card">加载中… Đang tải…</div>';
  const block = (zh, vi) => { main.innerHTML = `<div class="card login"><h2>${zh}</h2><p class="vi">${vi}</p></div>`; const a = $('a', 'btn', '返回 Quay lại'); a.href = 'index.html'; main.firstChild.appendChild(a); };

  // Students can only open a lesson through the link their teacher assigned to their class (?a=CODE).
  // The teacher may preview any lesson with ?l=L01.
  let asg = null, id;
  if (qs.get('a')) {
    asg = await S.getAssignment(qs.get('a')).catch(() => null);
    if (!asg) return block('作业链接无效', 'Link bài tập không hợp lệ. Hãy dùng link cô gửi trong Google Classroom.');
    id = asg.lessonId;
    if (user.role === 'student' && asg.cls && String(asg.cls).toLowerCase() !== String(user.cls || '').toLowerCase())
      return block('这份作业不是给你们班的', `Bài tập này không dành cho lớp của em (${user.cls || 'chưa có lớp'}). Hãy nhắn cô nếu em nghĩ có nhầm lẫn.`);
  } else if (user.role === 'teacher' && qs.get('l')) id = qs.get('l');
  else return block('请用老师发的作业链接进入', 'Hãy mở bài tập bằng link cô gửi trong Google Classroom.');
  let lesson;
  try { lesson = await S.loadLesson(id); } catch (e) { main.innerHTML = '<div class="card">找不到这一课 · Không tìm thấy bài này</div>'; return; }
  document.title = '第' + lesson.no + '课 · HSK3';
  const base = S.lessonUrl(id);
  const draftKey = 'hsk3.draft.' + user.email + '.' + id;
  const loadDraft = () => { try { return JSON.parse(localStorage.getItem(draftKey)) || {}; } catch (e) { return {}; } };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let sub = await S.getSubmission(id, user.email).catch(() => null);
  if (!sub && asg && asg.open === false && user.role === 'student') return block('这份作业已关闭', 'Bài tập này đã đóng, không nộp được nữa. Hãy nhắn cho cô.');
  let key = null;
  const locked = !!sub;
  const answers = locked ? (sub.answers || {}) : loadDraft();
  if (locked) key = await S.loadKey(id).catch(() => null);

  // ---------- layout: top bar / scrolling work area / bottom bar ----------
  document.body.classList.add('lesson-body');
  const shellEl = document.getElementById('app'); shellEl.className = 'lesson-root'; shellEl.style.cssText = '';
  main.innerHTML = '';
  const foot = shellEl.querySelector('.footer'); if (foot) foot.remove();
  const demo = shellEl.querySelector('.demo-tag'); if (demo) demo.remove();

  const bar = $('div', 'lesson-bar'); const inn = $('div', 'in'); bar.appendChild(inn);
  const back = $('a', 'btn ghost sm', '← 课程 Bài học'); back.href = 'index.html'; inn.appendChild(back);
  inn.appendChild($('div', 'ttl', `<span class="no">${lesson.no}</span><span>${lesson.title}<small>${lesson.titleVi || ''}</small></span>`));
  const prog = $('span', 'prog'); inn.appendChild(prog);
  // submit lives in the top bar so no screen space is taken from the worksheet
  const submitTop = $('button', 'btn seal sm', '✔ 提交 · Nộp bài'); submitTop.type = 'button'; if (!locked) inn.appendChild(submitTop);
  const out = $('button', 'btn ghost sm', '退出 Thoát'); out.onclick = () => S.signOut(); inn.appendChild(out);

  const row2 = $('div', 'in tools'); bar.appendChild(row2);
  if (lesson.audio && lesson.audio.length) {
    const ab = $('div', 'audiobox', '<span>🎧 听力 Nghe</span>');
    const au = $('audio'); au.controls = true; au.preload = 'none'; au.src = base + lesson.audio[0].src; ab.appendChild(au);
    const sp = $('div', 'seg'); [['0.8×', .8], ['1×', 1]].forEach(([t, v]) => { const b = $('button', v === 1 ? 'on' : '', t); b.type = 'button'; b.title = '语速 Tốc độ'; b.onclick = () => { au.playbackRate = v; [...sp.children].forEach(x => x.classList.remove('on')); b.classList.add('on'); }; sp.appendChild(b); });
    ab.appendChild(sp); row2.appendChild(ab);
  }
  const zoomBox = $('div', 'zoom', '<span class="zl">🔍 缩放 Thu phóng</span>');
  const zOut = $('button', null, '−'), zPct = $('button', 'pctbtn', '100%'), zIn = $('button', null, '＋'), zFit = $('button', null, '适合 Vừa');
  zOut.title = '缩小 Thu nhỏ'; zIn.title = '放大 Phóng to'; zPct.title = '恢复 100% · Về 100%'; zFit.title = '适合宽度 · Vừa chiều rộng';
  [zOut, zPct, zIn, zFit].forEach(b => { b.type = 'button'; zoomBox.appendChild(b); });
  row2.appendChild(zoomBox);
  const tipBtn = $('button', 'btn sm blue', '💡 答案提示 Gợi ý đáp án ✓'); tipBtn.type = 'button'; tipBtn.style.display = locked ? '' : 'none';
  tipBtn.onclick = () => { const h = scrollerHideToggle(); tipBtn.textContent = h ? '💡 答案提示 Gợi ý đáp án ✗' : '💡 答案提示 Gợi ý đáp án ✓'; };
  row2.appendChild(tipBtn);
  zoomBox.title = '放大后可按住鼠标拖动 · Phóng to rồi giữ chuột kéo để di chuyển';

  const scroller = $('div', 'scroller');
  const scrollerHideToggle = () => scroller.classList.toggle('hide-tags');
  const pagesWrap = $('div', 'pages');
  const info = $('div', 'card info');
  const due = asg && asg.due ? new Date(asg.due + 'T23:59:59') : null;
  const isLate = !!due && Date.now() > due.getTime();
  info.innerHTML = `<h2>第${lesson.no}课 · ${lesson.title}</h2><div class="vi">${lesson.titleVi || ''}${lesson.subtitle ? ' · ' + lesson.subtitle : ''}</div>` +
    (asg ? `<div class="asgline">👥 ${asg.cls ? esc(asg.cls) : '全部班级 Tất cả'}${asg.due ? ` · ⏰ 截止 Hạn nộp: <b${isLate && !locked ? ' style="color:var(--bad)"' : ''}>${asg.due}</b>${isLate && !locked ? ' (已过期 · quá hạn,vẫn nộp được nhưng sẽ ghi là nộp muộn)' : ''}` : ''}</div>` : '') +
    (locked ? '' : '<p class="hint">在每一页的答题框里直接作答。✍ 按钮可以练习笔顺。作业会自动保存在这台设备上,做完后点右上角「提交」。<br><span class="vi">Làm bài trực tiếp trong các ô trả lời trên từng trang. Nút ✍ để luyện thứ tự nét. Bài được tự lưu trên thiết bị này; làm xong bấm “Nộp bài” ở góc trên bên phải.</span></p>');
  const inner = $('div', 'scroll-inner'); inner.appendChild(info); inner.appendChild(pagesWrap); scroller.appendChild(inner);
  shellEl.appendChild(bar); shellEl.appendChild(scroller);

  // ---------- zoom (percent of fitted width) + drag-to-pan ----------
  let z = 1; const ZS = [.5, .6, .75, .9, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
  const baseW = () => Math.min(980, scroller.clientWidth - 24);
  function setZoom(nz, cx, cy) {
    nz = Math.max(.5, Math.min(3, nz));
    const r = scroller.getBoundingClientRect();
    cx = cx == null ? r.width / 2 : cx; cy = cy == null ? r.height / 2 : cy;
    const rx = (scroller.scrollLeft + cx) / inner.offsetWidth, ry = (scroller.scrollTop + cy) / inner.scrollHeight;
    z = nz; inner.style.width = Math.round(baseW() * z + 24) + 'px';
    scroller.scrollLeft = rx * inner.offsetWidth - cx; scroller.scrollTop = ry * inner.scrollHeight - cy;
    zPct.textContent = Math.round(z * 100) + '%'; scroller.classList.toggle('zoomed', z > 1);
  }
  const step = d => { const i = ZS.findIndex(v => v >= z - .001); setZoom(ZS[Math.max(0, Math.min(ZS.length - 1, (i < 0 ? ZS.length - 1 : i) + d))]); };
  zIn.onclick = () => step(1); zOut.onclick = () => step(-1); zPct.onclick = () => setZoom(1); zFit.onclick = () => { setZoom(1); scroller.scrollLeft = 0; };
  scroller.addEventListener('wheel', e => { if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); const r = scroller.getBoundingClientRect(); setZoom(z * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  addEventListener('resize', () => setZoom(z));
  let pan = null;
  scroller.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || z <= 1) return;
    if (e.target.closest('.field, button, a, audio, input, textarea, canvas')) return;
    pan = { x: e.clientX, y: e.clientY, sl: scroller.scrollLeft, st: scroller.scrollTop }; scroller.classList.add('panning'); scroller.setPointerCapture(e.pointerId);
  });
  scroller.addEventListener('pointermove', e => { if (!pan) return; scroller.scrollLeft = pan.sl - (e.clientX - pan.x); scroller.scrollTop = pan.st - (e.clientY - pan.y); });
  const endPan = () => { pan = null; scroller.classList.remove('panning'); };
  scroller.addEventListener('pointerup', endPan); scroller.addEventListener('pointercancel', endPan);

  const totalAnswerable = lesson.fields.filter(f => f.points > 0).length;
  const updateProg = () => {
    const n = lesson.fields.filter(f => f.points > 0 && G.filled(f, answers[f.id])).length;
    prog.innerHTML = `✏️ <b>${n}/${totalAnswerable}</b><small>Đã làm</small>`;
  };
  updateProg();

  let saveT;
  const onChange = () => { updateProg(); if (locked) return; clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(draftKey, JSON.stringify(answers)); } catch (e) { alert('存储空间已满 / Bộ nhớ đầy'); } }, 300); };

  function drawResult() {
    const results = key ? G.gradeAll(lesson, sub, key) : null;
    HSKRender.renderLesson(pagesWrap, lesson, { base, answers, mode: 'review', results: results ? results.fields : {}, key, showAnswers: !!key, onChange });
    return results;
  }

  function summary(res) {
    info.querySelectorAll('.sumbox').forEach(e => e.remove());
    const d = $('div', 'sumbox');
    const when = new Date(sub.submittedAt).toLocaleString();
    let h = `<div class="ok">✅ 已提交 · Đã nộp <small>${when}</small></div>`;
    if (res) {
      h += `<div class="scores"><div class="sc"><b>${res.auto}<i>/${res.autoMax}</i></b><span class="pc">${G.pct(res.auto, res.autoMax)}</span><small>自动评分 · Điểm tự động</small></div>`;
      if (sub.graded) h += `<div class="sc final"><b>${sub.finalScore}<i>/${sub.finalMax}</i></b><span class="pc">${G.pct(sub.finalScore, sub.finalMax)}</span><small>老师最终分数 · Điểm cuối cùng</small></div>`;
      else if (res.pending) h += `<div class="sc wait"><b>${res.pending}</b><span class="pc">⏳</span><small>等老师批改 (${res.manualMax} 分) · Chờ cô chấm</small></div>`;
      h += '</div>';
    }
    if (sub.comment) h += `<div class="cm"><b>老师评语 Nhận xét:</b> ${esc(sub.comment)}</div>`;
    const cs = sub.comments ? Object.entries(sub.comments).filter(([, v]) => v) : [];
    if (cs.length) h += '<div class="cm">' + cs.map(([k, v]) => `<div>· <b>${k.toUpperCase()}</b> ${esc(v)}</div>`).join('') + '</div>';
    d.innerHTML = h; info.appendChild(d);
  }

  if (!locked) HSKRender.renderLesson(pagesWrap, lesson, { base, answers, mode: 'fill', onChange });
  else { const res = drawResult(); summary(res); }
  setZoom(1);

  // ---------- submit ----------
  if (!locked) {
    const btn = submitTop;
    // Two-step safety check before the final, irreversible submit.
    function confirmSubmit(go) {
      const empty = lesson.fields.filter(f => f.points > 0 && !G.filled(f, answers[f.id]));
      const ov = $('div', 'modal-ov'); const m = $('div', 'modal');
      m.innerHTML = `<div class="modal-h"><b>⚠️ 提交前请再检查一遍 · Hãy kiểm tra lại trước khi nộp</b><button class="x" type="button">✕</button></div>
        <div class="warnbox"><b>提交后不能再修改!</b><br><span class="vi">Sau khi nộp sẽ <b>không thể sửa</b> được nữa!</span></div>
        ${empty.length ? `<p class="unans">还有 <b>${empty.length}</b> 题没做 · Còn <b>${empty.length}</b> câu chưa làm:<br><span>${empty.map(f => f.id.toUpperCase()).join(' · ')}</span></p>` : '<p class="allok">✅ 所有题目都已作答 · Đã làm hết các câu</p>'}
        <label class="chk"><input type="checkbox" id="sure"> 我已经检查过答案了<br><span class="vi">Em đã kiểm tra lại đáp án rồi</span></label>
        <div class="modal-f"><button class="btn ghost" type="button" id="back">${empty.length ? '返回去做 · Quay lại làm' : '返回检查 · Quay lại kiểm tra'}</button><button class="btn seal" type="button" id="go" disabled>确认提交 · Xác nhận nộp</button></div>`;
      ov.appendChild(m); document.body.appendChild(ov);
      const close = () => ov.remove(), sure = m.querySelector('#sure'), goBtn = m.querySelector('#go');
      sure.onchange = () => { goBtn.disabled = !sure.checked; };
      m.querySelector('.x').onclick = close;
      m.querySelector('#back').onclick = () => { close(); if (empty.length) { const el = document.querySelector('[data-fid="' + empty[0].id + '"]'); el && el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } };
      goBtn.onclick = () => { close(); go(); };
    }
    btn.onclick = () => confirmSubmit(async () => {
      btn.disabled = true; btn.textContent = '提交中… Đang nộp…';
      try {
        const clean = {}; Object.entries(answers).forEach(([k, v]) => { if (v !== '' && v != null) clean[k] = v; });
        sub = await S.submit({ lessonId: id, email: user.email, name: user.name, cls: user.cls || '', asg: asg ? asg.code : '', late: !!isLate, answers: clean, lessonNo: lesson.no });
        try { localStorage.removeItem(draftKey); } catch (e) { }
        key = await S.loadKey(id).catch(() => null);
        btn.remove(); Object.keys(answers).forEach(k => { if (!(k in clean)) delete answers[k]; });
        info.querySelector('.hint') && info.querySelector('.hint').remove();
        const res = drawResult(); summary(res); tipBtn.style.display = '';
        if (res) showResult(res); else alert('已提交 Đã nộp');
        scroller.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (e) { alert('提交失败,请重试 · Lỗi, thử lại: ' + e.message); btn.disabled = false; btn.textContent = '✔ 提交 · Nộp bài'; }
    });
  }

  function showResult(res) {
    const ov = $('div', 'modal-ov'); const m = $('div', 'modal');
    m.innerHTML = `<div class="modal-h"><b>已提交 · Đã nộp bài 🎉</b><button class="x" type="button">✕</button></div>
      <div class="bigscore"><b>${res.auto}</b><span> / ${res.autoMax}</span><em>${G.pct(res.auto, res.autoMax)}</em></div>
      <div class="pbar"><i style="width:${G.pct(res.auto, res.autoMax)}"></i></div>
      <p style="text-align:center;margin:6px 0" class="hint">自动评分的题目得分<br><span class="vi">Điểm các câu chấm tự động</span></p>
      ${res.pending ? `<p style="text-align:center">还有 <b>${res.pending}</b> 题等老师批改<br><span class="vi">Còn ${res.pending} câu chờ cô chấm</span></p>` : ''}
      <p class="hint" style="text-align:center">页面上 ✅ = 对,❌ = 错,并显示正确答案。<br><span class="vi">✅ = đúng, ❌ = sai, có hiện đáp án đúng.</span></p>
      <div class="modal-f"><button class="btn" type="button">查看答案 · Xem đáp án</button></div>`;
    ov.appendChild(m); document.body.appendChild(ov);
    const close = () => ov.remove(); m.querySelector('.x').onclick = close; m.querySelector('.btn').onclick = close;
  }
});
