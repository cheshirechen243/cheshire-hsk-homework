
// Pinyin typing helper for answer boxes that need tone marks:
//   type letters + tone number (1-4), ü = v, then press Enter  ->  "nve4" becomes "nüè".
// No on-screen keyboard (it took too much room); a small hint bubble floats above the box while it has focus.
(function () {
  let bubble = null;
  function showHint(input) {
    if (!bubble) {
      bubble = document.createElement('div'); bubble.className = 'pinyin-hint';
      bubble.innerHTML = 'Gõ chữ + số thanh (1-4), ü gõ <b>v</b>, bấm <b>Enter</b> <br>VD: <b>nve4</b> ⏎ → <b>nüè</b> ';
      document.body.appendChild(bubble);
    }
    const r = input.getBoundingClientRect(), bh = bubble.offsetHeight || 54;
    const topLimit = 130;                                   // keep clear of the sticky top bar
    bubble.style.left = Math.max(8, Math.min(r.left, innerWidth - bubble.offsetWidth - 8)) + 'px';
    bubble.style.top = (r.top - bh - 8 < topLimit ? r.bottom + 8 : r.top - bh - 8) + 'px';
    bubble.classList.add('on');
  }
  const hideHint = () => { if (bubble) bubble.classList.remove('on'); };

  function attach(input) {
    input.setAttribute('autocapitalize', 'off'); input.setAttribute('autocorrect', 'off'); input.spellcheck = false;
    const convert = () => {
      const v = HSKGrade.toPinyin(input.value);
      if (v !== input.value) { input.value = v; input.dispatchEvent(new Event('input', { bubbles: true })); }
    };
    input.addEventListener('focus', () => showHint(input));
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); convert(); showHint(input); } });
    input.addEventListener('blur', () => { convert(); hideHint(); });      // also converts when the student just taps elsewhere
  }

  window.HSKPinyin = { attach };
})();
