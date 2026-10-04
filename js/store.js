// Data layer. Two interchangeable backends:
//   - Firebase (Google sign-in + Firestore)   when HSK_CONFIG.firebase is filled in
//   - Demo (localStorage, same browser only)  otherwise, so the site can be previewed with no setup
(function () {
  const C = window.HSK_CONFIG;
  const isTeacherEmail = e => C.teacherEmails.map(x => x.toLowerCase()).includes(String(e).toLowerCase());
  const SITE_ROOT = new URL('../', document.currentScript.src).href;   // .../site/
  // Static lesson data: prefer the bundled lessons/data.js (works from file://), fall back to fetching JSON.
  const D = () => window.HSK_DATA || null;
  const j = async (url) => {
    const m = url.match(/lessons\/([\w-]+)\/lesson\.json$/), d = D();
    if (m && d && d.lessons[m[1]]) return d.lessons[m[1]].lesson;
    if (/lessons\/index\.json$/.test(url) && d) return { lessons: d.index };
    const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error(url + ' ' + r.status); return r.json();
  };
  const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const lsSet = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const now = () => new Date().toISOString();

  // ---------- shared (static file) lookups ----------
  const common = {
    isDemo: !C.firebase,
    root: SITE_ROOT,
    lessonUrl: id => SITE_ROOT + 'lessons/' + id + '/',
    listLessons: () => j(SITE_ROOT + 'lessons/index.json').then(x => x.lessons),
  };

  // ---------- DEMO backend ----------
  const demoUser = () => {
    const u = lsGet('hsk3.demo.user', null); if (!u) return null;
    const st = lsGet('hsk3.demo.students', []).find(s => s.email === u.email);   // class comes from the student list
    return { ...u, name: (st && st.name) || u.name, cls: (st && st.cls) || '' };
  };
  const demo = {
    ...common,
    onAuth(cb) { this._cb = cb; cb(demoUser()); },
    async signIn(name, email) {
      email = String(email || '').trim().toLowerCase();
      if (!email) return;
      const role = isTeacherEmail(email) ? 'teacher' : 'student';
      lsSet('hsk3.demo.user', { email, name: name || email.split('@')[0], role }); this._cb(demoUser());
    },
    // assignments = a lesson handed to one class; students only get in through its link (?a=CODE)
    async getAssignment(code) { return lsGet('hsk3.demo.asg', {})[code] || null; },
    async listAssignments() { return Object.values(lsGet('hsk3.demo.asg', {})); },
    async listForClass(cls) { return Object.values(lsGet('hsk3.demo.asg', {})).filter(a => a.open !== false && (!a.cls || String(a.cls).toLowerCase() === String(cls || '').toLowerCase())); },
    async saveAssignment(a) { const all = lsGet('hsk3.demo.asg', {}); all[a.code] = a; lsSet('hsk3.demo.asg', all); },
    async deleteAssignment(code) { const all = lsGet('hsk3.demo.asg', {}); delete all[code]; lsSet('hsk3.demo.asg', all); },
    async listMine(email) { return Object.values(lsGet('hsk3.demo.subs', {})).filter(s => s.email === email); },
    async signOut() { localStorage.removeItem('hsk3.demo.user'); this._cb(null); },
    async loadLesson(id) {
      const o = lsGet('hsk3.demo.lesson.' + id, null);
      return o ? o.lesson : j(SITE_ROOT + 'lessons/' + id + '/lesson.json');
    },
    async loadKey(id) {
      const o = lsGet('hsk3.demo.lesson.' + id, null);
      if (o && o.key) return o.key;
      // answers are never part of the published site; locally they come from private/keys.js (testing only)
      const k = (window.HSK_KEYS || {})[id]; if (k) return k;
      throw new Error('no key');
    },
    async publishLesson(lesson, key) { lsSet('hsk3.demo.lesson.' + lesson.id, { lesson, key }); },
    async getSubmission(lessonId, email) { return lsGet('hsk3.demo.subs', {})[lessonId + '__' + email] || null; },
    async submit(sub) {
      const all = lsGet('hsk3.demo.subs', {}); const k = sub.lessonId + '__' + sub.email;
      if (all[k]) throw new Error('already submitted');
      all[k] = { ...sub, submittedAt: now() }; lsSet('hsk3.demo.subs', all); return all[k];
    },
    async listSubmissions() { return Object.values(lsGet('hsk3.demo.subs', {})); },
    async saveGrade(lessonId, email, g) {
      const all = lsGet('hsk3.demo.subs', {}); const k = lessonId + '__' + email;
      all[k] = { ...all[k], ...g, gradedAt: now() }; lsSet('hsk3.demo.subs', all);
    },
    async reopen(lessonId, email) { const all = lsGet('hsk3.demo.subs', {}); delete all[lessonId + '__' + email]; lsSet('hsk3.demo.subs', all); },
    async listStudents() { return lsGet('hsk3.demo.students', []); },
    async saveStudents(list) { lsSet('hsk3.demo.students', list); },
  };

  // ---------- FIREBASE backend ----------
  const fb = {
    ...common,
    _ready: null,
    _load() {
      if (this._ready) return this._ready;
      const v = '10.12.2', base = 'https://www.gstatic.com/firebasejs/' + v + '/';
      const load = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = base + src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
      this._ready = (async () => {
        await load('firebase-app-compat.js'); await Promise.all([load('firebase-auth-compat.js'), load('firebase-firestore-compat.js')]);
        firebase.initializeApp(C.firebase); this.auth = firebase.auth(); this.db = firebase.firestore();
      })();
      return this._ready;
    },
    async onAuth(cb) {
      await this._load();
      this.auth.onAuthStateChanged(async u => {
        if (!u) return cb(null);
        const email = u.email.toLowerCase();
        let role = 'denied', rec = {};
        if (isTeacherEmail(email)) role = 'teacher';
        else {
          try { const s = await this.db.collection('students').doc(email).get(); if (s.exists) { role = 'student'; rec = s.data(); } } catch (e) { }
        }
        cb({ email, name: rec.name || u.displayName || email, role, cls: rec.cls || '' });
      });
    },
    async signIn() { await this._load(); await this.auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()); },
    async signOut() { await this._load(); await this.auth.signOut(); },
    async loadLesson(id) {
      await this._load();
      try {
        const d = await this.db.collection('lessons').doc(id).get();
        if (d.exists) {
          const lesson = JSON.parse(d.data().json);
          // the audio list (file names and track labels) always comes from the site's own lesson.json, so uploading the site is enough to change it
          try { const r = await fetch(SITE_ROOT + 'lessons/' + id + '/lesson.json?v=' + Math.floor(Date.now() / 60000), { cache: 'no-cache' }); if (r.ok) { const f = await r.json(); if (f.audio) lesson.audio = f.audio; } } catch (e) { }
          return lesson;
        }
      } catch (e) { }
      return j(SITE_ROOT + 'lessons/' + id + '/lesson.json');
    },
    async loadKey(id) {
      await this._load();
      const d = await this.db.collection('keys').doc(id).get();
      if (d.exists) return JSON.parse(d.data().json);
      throw new Error('no key');
    },
    async publishLesson(lesson, key) {
      await this._load();
      await this.db.collection('lessons').doc(lesson.id).set({ json: JSON.stringify(lesson), updatedAt: now() });
      await this.db.collection('keys').doc(lesson.id).set({ json: JSON.stringify(key), updatedAt: now() });
    },
    async getSubmission(lessonId, email) {
      await this._load(); const d = await this.db.collection('submissions').doc(lessonId + '__' + email).get(); return d.exists ? d.data() : null;
    },
    async submit(sub) {
      await this._load(); const ref = this.db.collection('submissions').doc(sub.lessonId + '__' + sub.email);
      const data = { ...sub, submittedAt: now() }; await ref.set(data); return data;
    },
    async listSubmissions() { await this._load(); const q = await this.db.collection('submissions').get(); return q.docs.map(d => d.data()); },
    async listMine(email) { await this._load(); const q = await this.db.collection('submissions').where('email', '==', email).get(); return q.docs.map(d => d.data()); },
    async getAssignment(code) { await this._load(); const d = await this.db.collection('assignments').doc(code).get(); return d.exists ? d.data() : null; },
    async listAssignments() { await this._load(); const q = await this.db.collection('assignments').get(); return q.docs.map(d => d.data()); },
    // what a student can start: the open assignments of their own class (+ those for every class); two equality queries so the security rules can verify them
    async listForClass(cls) {
      await this._load(); const col = this.db.collection('assignments'); const out = {};
      for (const c of new Set([cls || '', ''])) { try { (await col.where('cls', '==', c).get()).docs.forEach(d => { const a = d.data(); if (a.open !== false) out[a.code] = a; }); } catch (e) { } }
      return Object.values(out);
    },
    async saveAssignment(a) { await this._load(); await this.db.collection('assignments').doc(a.code).set(a); },
    async deleteAssignment(code) { await this._load(); await this.db.collection('assignments').doc(code).delete(); },
    async saveGrade(lessonId, email, g) {
      await this._load(); await this.db.collection('submissions').doc(lessonId + '__' + email).update({ ...g, gradedAt: now() });
    },
    async reopen(lessonId, email) { await this._load(); await this.db.collection('submissions').doc(lessonId + '__' + email).delete(); },
    async listStudents() { await this._load(); const q = await this.db.collection('students').get(); return q.docs.map(d => ({ email: d.id, ...d.data() })); },
    async saveStudents(list) {
      await this._load();
      const cur = await this.db.collection('students').get(); const keep = new Set(list.map(s => s.email));
      const b = this.db.batch();
      cur.docs.forEach(d => { if (!keep.has(d.id)) b.delete(d.ref); });
      list.forEach(s => b.set(this.db.collection('students').doc(s.email), { name: s.name || '', cls: s.cls || '' }));
      await b.commit();
    },
  };

  // Mail notification: Apps Script endpoint if configured, otherwise open a mailto: draft.
  async function notify(to, subject, body, html, logoUrl) {
    if (C.mailEndpoint) {
      // the teacher's Firebase login token goes along, so the Apps Script can check who is asking
      let idToken = ''; try { idToken = await firebase.auth().currentUser.getIdToken(); } catch (e) { }
      const payload = JSON.stringify({ idToken, to, subject, body, html: html || '', logoUrl: logoUrl || '' });
      let res;
      try { res = await fetch(C.mailEndpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: payload }); }
      catch (e) { throw new Error('连不上发信脚本。最常见原因:Apps Script 部署时「谁可以访问」没有选「任何人」,或改过脚本后没有「新版本」重新部署。'); }
      const txt = (await res.text()).trim();
      if (txt === 'ok') return 'sent';
      if (txt === 'forbidden') throw new Error('发信脚本拒绝了这次请求:要么脚本还是旧版本(请粘贴最新的 mail-appscript.gs 并「新版本」重新部署),要么现在登录的不是老师邮箱。');
      if (/<html|<!doctype/i.test(txt)) throw new Error('发信脚本返回了网页而不是结果:通常是部署权限不对(应选「任何人」),或脚本报错。');
      throw new Error(txt || '发信脚本没有返回结果');
    }
    // No sender configured: open a Gmail compose window with everything filled in (a bare mailto: link just
    // opens a blank tab on computers without a mail app), and keep a copy of the text on the clipboard.
    try { navigator.clipboard && navigator.clipboard.writeText(body).catch(() => { }); } catch (e) { }
    window.open('https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(to) + '&su=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body), '_blank');
    return 'gmail';
  }

  // Voice answers: the Apps Script saves the file into the teacher's Google Drive (after checking the student's login) and returns its id.
  async function uploadRecording(lessonId, fieldId, rec) {
    if (!C.firebase) return { demo: true };                       // demo mode: the recording simply stays inside the submission
    if (!C.mailEndpoint) throw new Error('录音上传服务还没配置(config.js 的 mailEndpoint,见 SETUP.md)。请联系老师。');
    let idToken = ''; try { idToken = await firebase.auth().currentUser.getIdToken(); } catch (e) { }
    const payload = JSON.stringify({ action: 'upload', idToken, lessonId, fieldId, mime: rec.mime, name: rec.name, data: String(rec.data).split(',')[1] || '' });
    let res;
    try { res = await fetch(C.mailEndpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: payload }); }
    catch (e) { throw new Error('连不上录音上传服务,请检查网络后重试。'); }
    const txt = (await res.text()).trim();
    if (txt.startsWith('ok:')) return { id: txt.slice(3) };
    if (txt === 'forbidden') throw new Error('录音上传被拒绝(登录失效或不在学生名单里),请重新登录再提交。');
    if (/<html|<!doctype/i.test(txt)) throw new Error('录音上传服务没有部署好,请联系老师。');
    throw new Error(txt || '录音上传失败');
  }
  window.HSKStore = Object.assign(C.firebase ? fb : demo, { loadLessonFile: async id => {      // the lesson.json file itself (fresh from the server), not the bundled data.js copy; data.js only as a fallback (file://)
      try { const r = await fetch(SITE_ROOT + 'lessons/' + id + '/lesson.json?v=' + Date.now(), { cache: 'no-store' }); if (r.ok) return await r.json(); } catch (e) { }
      return j(SITE_ROOT + 'lessons/' + id + '/lesson.json');
    }, notify, uploadRecording, isTeacherEmail, canAutoMail: !!C.mailEndpoint });
})();
