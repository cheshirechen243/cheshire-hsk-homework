// Grading helpers shared by the student page and the teacher dashboard.
(function () {
  const norm = s => String(s == null ? '' : s).normalize('NFKC').replace(/[\s。,,.!?!?、;;:"“”‘’'()()\[\]]/g, '').toLowerCase();

  // A field is auto-graded when the key has an answer for it; otherwise the teacher scores it.
  function isAuto(field, key) { return key && key[field.id] != null && field.type !== 'essay' && field.type !== 'draw'; }

  // returns {auto:boolean, correct:boolean|null, points:number}
  function gradeField(field, value, key) {
    const max = field.points || 0;
    if (!isAuto(field, key)) return { auto: false, correct: null, points: 0, max };
    const ans = key[field.id];
    let ok = false;
    const v = value && typeof value === 'object' ? value.v : value;
    if (field.type === 'choice' || field.type === 'pick') ok = norm(v) === norm(ans);
    else {
      const list = Array.isArray(ans) ? ans : [ans];
      ok = norm(v) !== '' && list.some(a => norm(a) === norm(v));
    }
    return { auto: true, correct: ok, points: ok ? max : 0, max };
  }

  // sub = {answers, manual:{fid:score}}   -> totals
  function gradeAll(lesson, sub, key) {
    const out = { fields: {}, auto: 0, autoMax: 0, manual: 0, manualMax: 0, pending: 0, total: 0, max: 0 };
    for (const f of lesson.fields) {
      const max = f.points || 0;
      if (!max) continue;
      const g = gradeField(f, (sub.answers || {})[f.id], key);
      const ov = sub.manual && sub.manual[f.id] != null && sub.manual[f.id] !== '' ? Number(sub.manual[f.id]) : null;
      let pts = g.points, graded = true;
      if (ov != null) pts = ov;               // teacher override wins
      else if (!g.auto) graded = false;       // waiting for the teacher
      out.fields[f.id] = { ...g, points: pts, graded, overridden: ov != null };
      out.max += max;
      if (g.auto) { out.autoMax += max; out.auto += pts; }
      else { out.manualMax += max; if (graded) out.manual += pts; else out.pending++; }
      out.total += pts;
    }
    return out;
  }

  function filled(field, value) {
    if (value == null) return false;
    if (typeof value === 'object') return !!(value.v || value.img);
    return String(value).trim() !== '';
  }

  // "81%" (integer, 0 when max is 0)
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0) + '%';

  window.HSKGrade = { norm, isAuto, gradeField, gradeAll, filled, pct };
})();
