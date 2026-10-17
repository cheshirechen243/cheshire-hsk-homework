// Live class helpers shared by the teacher panel and the student page.
// Firestore:  live/{CODE}            session (class, course, roster, avatars, started, open, state)
//             live/{CODE}/members/{email}   presence (students write their own)
(function () {
  const S = window.HSKStore;
  const CH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const AVN = 14;                                             // img/pixel/p1..p14.png
  const newCode = () => Array.from({ length: 6 }, () => CH[Math.floor(Math.random() * CH.length)]).join('');
  const pix = i => S.root + 'img/pixel/p' + (((i % AVN) + AVN) % AVN + 1) + '.png';
  function seeded(seed) { let h = 2166136261 >>> 0; for (const c of String(seed)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return () => { h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; }; }
  // random but fixed for a class: everybody in the class gets a different picture (up to 6)
  function assign(emails, seed) {
    const r = seeded(seed || 'x'); const idx = Array.from({ length: AVN }, (_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    const out = {}; emails.slice().sort().forEach((e, i) => { out[e] = idx[i % AVN]; }); return out;
  }
  async function db() { if (S.isDemo) throw new Error('演示模式不支持上课,请连接 Firebase 后使用'); await S._load(); return S.db; }
  const ONLINE_MS = 45000;
  const online = m => !!m && !m.left && (Date.now() - (m.lastSeen || 0)) < ONLINE_MS;
  window.HSKLive = { newCode, pix, assign, db, online, AVN, ONLINE_MS };
})();
