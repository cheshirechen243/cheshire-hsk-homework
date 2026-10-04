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
      try { const d = await this.db.collection('lessons').doc(id).get(); if (d.exists) return JSON.parse(d.data().json); } catch (e) { }
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
      catch (e) { await fetch(C.mailEndpoint, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: payload }); return 'sent?'; }
      const txt = (await res.text()).trim();
      if (txt !== 'ok') throw new Error(txt || 'mail script error');
      return 'sent';
    }
    // No sender configured: open a Gmail compose window with everything filled in (a bare mailto: link just
    // opens a blank tab on computers without a mail app), and keep a copy of the text on the clipboard.
    try { navigator.clipboard && navigator.clipboard.writeText(body).catch(() => { }); } catch (e) { }
    window.open('https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(to) + '&su=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body), '_blank');
    return 'gmail';
  }

  window.HSKStore = Object.assign(C.firebase ? fb : demo, { notify, isTeacherEmail, canAutoMail: !!C.mailEndpoint });
})();
