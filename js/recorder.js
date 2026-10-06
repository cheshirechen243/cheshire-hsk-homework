// Voice answers: record in the page (MediaRecorder) or choose an audio file.
// The recorder is a bar docked at the bottom of the screen (not a pop-up), so the student can keep scrolling the
// worksheet and read the text aloud while recording. Returns a data-URL so the draft survives a reload and can be
// uploaded when the student submits. The microphone needs https (or localhost).
(function () {
  const MAX_SEC = 180, MAX_BYTES = 3 * 1024 * 1024;
  const $ = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
  const fmt = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  const pickMime = () => ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
  const toDataURL = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
  const ext = mime => /mp4|aac/.test(mime) ? 'm4a' : /ogg/.test(mime) ? 'ogg' : /mpeg|mp3/.test(mime) ? 'mp3' : /wav/.test(mime) ? 'wav' : 'webm';
  let current = null;                                   // only one dock at a time

  // opts: {label}; cur: existing {data,mime,dur} or null; onDone({data,mime,dur,name}) | onDone(null) to clear
  function open(opts, cur, onDone) {
    if (current) current.close();
    const dock = $('div', 'rec-dock'); document.body.appendChild(dock); document.body.classList.add('rec-open');
    dock.innerHTML = `<div class="rd-in">
      <div class="rd-top"><b class="rd-title">🎤 ${opts.label || '录音 · Ghi âm'}</b><span class="rd-time">0:00</span><div class="rec-bar"><i></i></div><button class="rd-x" type="button" title="关闭 · Đóng">✕</button></div>
      <div class="rd-ctl">
        <button class="btn" type="button" id="rbtn">● 开始录音 · Bắt đầu ghi</button>
        <label class="btn ghost sm rd-file">📁 上传文件 · Tải file<input type="file" accept="audio/*,.m4a,.mp3,.wav,.webm,.ogg" style="display:none" id="rfile"></label>
        <div class="rec-player"></div>
        <button class="btn ghost sm" type="button" id="rclear">删除 · Xoá</button>
        <button class="btn seal" type="button" id="rok" disabled>✔ 使用这段录音 · Dùng bản ghi này</button>
      </div>
      <div class="rec-msg">点「开始录音」后,可以一边滚动页面一边朗读。 · Bấm “Bắt đầu ghi”, vừa cuộn trang vừa đọc.</div></div>`;
    const q = s => dock.querySelector(s); const timeEl = q('.rd-time'), bar = q('.rec-bar i'), msg = q('.rec-msg'), player = q('.rec-player'), rbtn = q('#rbtn'), rok = q('#rok');
    let rec = null, stream = null, chunks = [], t0 = 0, timer = null, result = cur && cur.data ? { ...cur } : null;

    const stopStream = () => { try { stream && stream.getTracks().forEach(t => t.stop()); } catch (e) { } stream = null; };
    const close = () => { try { rec && rec.state === 'recording' && rec.stop(); } catch (e) { } stopStream(); clearInterval(timer); dock.remove(); document.body.classList.remove('rec-open'); if (current && current.dock === dock) current = null; };
    current = { dock, close };
    const showPlayer = () => {
      player.innerHTML = '';
      if (result) { const a = $('audio'); a.controls = true; a.src = result.data; player.appendChild(a); rok.disabled = false; timeEl.textContent = fmt(result.dur || 0); msg.textContent = '✓ 已有录音,可以试听 · Đã có bản ghi, nghe thử được'; }
      else rok.disabled = true;
    };
    q('.rd-x').onclick = close;
    showPlayer();

    async function start() {
      msg.textContent = '';
      if (!navigator.mediaDevices || !window.MediaRecorder) { msg.innerHTML = '⚠️ 这个浏览器不能录音,请改用「上传文件」。 · Trình duyệt này không ghi âm được, hãy dùng “Tải file”.'; return; }
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
      catch (e) { msg.innerHTML = '⚠️ 没有麦克风权限。请在浏览器地址栏允许使用麦克风,或改用「上传文件」。 · Chưa được cấp quyền micro.'; return; }
      chunks = []; const mime = pickMime(); rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
      rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = async () => {
        clearInterval(timer); stopStream(); const dur = Math.round((Date.now() - t0) / 1000);
        const blob = new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' });
        if (blob.size > MAX_BYTES) { msg.textContent = '录音太大,请缩短 · Bản ghi quá lớn'; return; }
        result = { data: await toDataURL(blob), mime: blob.type, dur, name: 'recording.' + ext(blob.type) };
        rbtn.textContent = '● 重新录音 · Ghi lại'; rbtn.classList.remove('seal'); showPlayer();
      };
      rec.start(); t0 = Date.now(); rbtn.textContent = '■ 停止 · Dừng'; rbtn.classList.add('seal'); rok.disabled = true; player.innerHTML = ''; msg.textContent = '● 录音中… 可以滚动页面朗读 · Đang ghi… cuộn trang đọc bình thường';
      timer = setInterval(() => { const s = (Date.now() - t0) / 1000; timeEl.textContent = fmt(s); bar.style.width = Math.min(100, s / MAX_SEC * 100) + '%'; if (s >= MAX_SEC) rec.stop(); }, 200);
    }
    rbtn.onclick = () => { if (rec && rec.state === 'recording') rec.stop(); else start(); };
    q('#rfile').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      if (f.size > MAX_BYTES) { msg.innerHTML = '⚠️ 文件超过 3MB,请直接在这里录音,或换短一点的文件 · File quá 3MB, hãy ghi âm trực tiếp'; return; }
      const data = await toDataURL(f); const a = new Audio(); a.src = data;
      const dur = await new Promise(res => { a.onloadedmetadata = () => res(isFinite(a.duration) ? Math.round(a.duration) : 0); a.onerror = () => res(0); setTimeout(() => res(0), 3000); });
      result = { data, mime: f.type || 'audio/mpeg', dur, name: f.name }; showPlayer();
    };
    q('#rclear').onclick = () => { result = null; showPlayer(); timeEl.textContent = '0:00'; bar.style.width = '0'; msg.textContent = ''; onDone(null); };
    rok.onclick = () => { if (!result) return; onDone(result); close(); };
  }

  window.HSKRecorder = { open, fmt };
})();
