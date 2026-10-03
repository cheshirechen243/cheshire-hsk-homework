// Stroke-order practice modal (Hanzi Writer, loaded on first use).
(function () {
  let loading = null;
  function loadLib() {
    if (window.HanziWriter) return Promise.resolve();
    return loading || (loading = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/hanzi-writer@3.5/dist/hanzi-writer.min.js';
      s.onload = res; s.onerror = () => rej(new Error('load fail')); document.head.appendChild(s);
    }));
  }

  function open(ch, onDone) {
    const ov = document.createElement('div'); ov.className = 'modal-ov';
    ov.innerHTML = `<div class="modal stroke-modal">
      <div class="modal-h"><b>笔顺练习 · Luyện thứ tự nét</b><button class="x" type="button">✕</button></div>
      <p class="hint">按笔顺在方框里一笔一笔写「<b>${ch}</b>」。写错会有提示。<br><span class="vi">Viết từng nét theo đúng thứ tự. Sai sẽ có gợi ý.</span></p>
      <div class="stroke-box"><div id="hw"></div></div>
      <div class="stroke-msg" id="hwmsg">加载中… Đang tải…</div>
      <div class="modal-f"><button class="btn ghost" type="button" id="hwanim">看示范 Xem mẫu</button><button class="btn ghost" type="button" id="hwretry">重写 Viết lại</button><button class="btn" type="button" id="hwok">完成 Xong</button></div>
    </div>`;
    document.body.appendChild(ov);
    const close = () => ov.remove(); ov.querySelector('.x').onclick = close;
    const msg = ov.querySelector('#hwmsg'); let mistakes = 0, done = false, w;
    const start = () => {
      mistakes = 0; done = false; msg.textContent = '';
      ov.querySelector('#hw').innerHTML = '';
      w = HanziWriter.create('hw', ch, { width: 280, height: 280, padding: 12, showOutline: true, showCharacter: false, strokeColor: '#1f3a5f', outlineColor: '#d5dbe6', drawingColor: '#1f3a5f', highlightColor: '#c0392b', drawingWidth: 14 });
      w.quiz({
        onMistake: () => { mistakes++; msg.textContent = '再试一次 · Thử lại (' + mistakes + ')'; },
        onComplete: d => { done = true; mistakes = d.totalMistakes; msg.innerHTML = '✓ 完成!错误 ' + mistakes + ' 次 · Hoàn thành, sai ' + mistakes + ' lần'; },
      });
    };
    loadLib().then(start).catch(() => { msg.textContent = '字库加载失败(检查网络)· Không tải được dữ liệu chữ'; });
    ov.querySelector('#hwanim').onclick = () => w && w.animateCharacter();
    ov.querySelector('#hwretry').onclick = () => w && start();
    ov.querySelector('#hwok').onclick = () => { onDone && onDone({ done, mistakes }); close(); };
  }
  window.HSKStroke = { open };
})();
