/* 课件工坊 · 讲者视图 + 课堂工具（激光笔 / 笔 / 荧光笔 / 橡皮 / 放大 / 黑白板）+ 回答顺序 + 学生端显示 + 课堂中改字
   老师页 (role=teacher / presenter=1) 把画面同步给学生（Firestore）和“学生同款窗口”（BroadcastChannel）。 */
(function () {
    'use strict';
    const P = window.CWP;
    if (!P || !P.project) return;
    if (P.params && P.params.get('embed') === '1') return;                      // the editor preview needs none of this
    const { h, $, $$, esc, STUDENT, MIRROR, PRES, LIVE, slides, project, lc, live } = P;
    const CW = window.CW;
    const W = 1920, H = 1080;
    let board = '', zoom = { s: 1, x: W / 2, y: H / 2 };
    let tool = 'cursor', color = '#E53935', pw = 6;
    const ink = {};                                   // key -> [{t:'pen'|'hl', c, w, p:[x,y,...]}]
    const slideId = () => slides[P.S].id;
    const inkKey = () => (board ? 'board_' + board : 's_' + slideId());
    const lcPost = m => { if (lc) { try { lc.postMessage(m); } catch (e) { /* ignore */ } } };
    const myEmail = () => ((live.user && live.user.email) || '').toLowerCase();
    const toast = t => { const d = h('div', { class: 'ctoast' }, t); ($('#app') || document.body).append(d); setTimeout(() => d.remove(), 2200); };
    const safe = (fn, name) => { try { fn(); } catch (e) { console.warn(name || 'presenter', e); } };

    // ------------------------------------------------------------------ layers (inside the scaled stage)
    function setupLayers() {
        const view = $('#view'); if (!view || $('#zl')) return;
        const zl = h('div', { id: 'zl' });
        view.parentNode.insertBefore(zl, view); zl.append(view);
        zl.append(h('div', { id: 'board' }), h('canvas', { id: 'ink', width: 2880, height: 1620 }), h('div', { id: 'laser' }));
    }
    const cv = () => $('#ink');
    function drawStroke(c, s, k) {
        const p = s.p; if (!p || p.length < 2) return;
        c.save(); c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = s.c; c.lineWidth = s.w * k; c.globalAlpha = s.t === 'hl' ? 0.42 : 1;
        c.beginPath(); c.moveTo(p[0] * k, p[1] * k);
        if (p.length === 2) c.lineTo(p[0] * k + 0.1, p[1] * k);
        for (let i = 2; i < p.length; i += 2) c.lineTo(p[i] * k, p[i + 1] * k);
        c.stroke(); c.restore();
    }
    function redraw() {
        const el = cv(); if (!el) return;
        const c = el.getContext('2d'); c.clearRect(0, 0, el.width, el.height);
        const k = el.width / W;
        (ink[inkKey()] || []).forEach(s => drawStroke(c, s, k));
    }
    function applyBoard() { const b = $('#board'); if (b) b.className = board ? 'on ' + board : ''; }
    function applyZoom(z) {
        zoom = Object.assign({ s: 1, x: W / 2, y: H / 2 }, z || {});
        const zl = $('#zl'); if (!zl) return;
        zl.style.transformOrigin = zoom.x + 'px ' + zoom.y + 'px';
        zl.style.transform = zoom.s > 1 ? 'scale(' + zoom.s + ')' : 'none';
        setTimeout(renderMarks, 400);
    }
    let laserT = 0;
    function showLaser(l) {
        const d = $('#laser'); if (!d) return;
        if (!l || !l.on) { d.style.display = 'none'; return; }
        d.style.display = 'block'; d.style.left = l.x + 'px'; d.style.top = l.y + 'px';
        clearTimeout(laserT); laserT = setTimeout(() => { d.style.display = 'none'; }, 2500);
    }

    // ------------------------------------------------------------------ sending (teacher)
    let inkT = 0, lastUi = 0;
    function pushInk(key) {
        lcPost({ t: 'ink', key, strokes: ink[key] || [] });
        clearTimeout(inkT);
        inkT = setTimeout(() => { if (live.ref) live.ref.collection('ink').doc(key).set({ s: JSON.stringify(ink[key] || []) }).catch(() => { }); }, 250);
    }
    function sendUi(patch, throttle) {
        lcPost({ t: 'ui', patch });
        if (PRES && (patch.q !== undefined || patch.qa !== undefined || patch.ord !== undefined)) applyUi({ q: patch.q, qa: patch.qa, ord: patch.ord });
        if (!live.ref) return;
        if (throttle) { const n = Date.now(); if (n - lastUi < 220) return; lastUi = n; }
        live.ref.collection('ui').doc('cur').set(patch, { merge: true }).catch(() => { });
    }

    // ------------------------------------------------------------------ receiving (students + mirror)
    let subKey = '', unsub = null, laserTs = 0;
    function subInk() {
        if (!STUDENT) return;
        const key = inkKey(); redraw();
        if (MIRROR || !live.ref || key === subKey) return;
        if (unsub) { unsub(); unsub = null; }
        subKey = key;
        unsub = live.ref.collection('ink').doc(key).onSnapshot(d => { ink[key] = d.exists ? JSON.parse(d.data().s || '[]') : []; if (inkKey() === key) redraw(); }, () => { });
    }
    let qState = { q: null, list: [] }, ordView = null, turnView = null;
    function applyUi(u) {
        if (!u) return;
        if (u.board !== undefined && (u.board || '') !== board) { board = u.board || ''; applyBoard(); subKey = ''; subInk(); }
        if (u.zoom) applyZoom(u.zoom);
        if (u.laser && u.laser.ts !== laserTs) { laserTs = u.laser.ts; showLaser(u.laser); }
        if (u.q !== undefined) { qState.q = u.q; renderQ(); }
        if (u.qa !== undefined) { qState.list = u.qa || []; renderQ(); }
        if (u.ord !== undefined) { ordView = u.ord; renderOrd(); renderMarks(); }
    }

    // ------------------------------------------------------------------ live editing: text fixes made during the lesson reach everybody, and are kept for next time
    const courseId = (() => { const seg = decodeURIComponent(location.pathname).split('/').filter(Boolean); const last = seg[seg.length - 1] || ''; return /\.html?$/.test(last) ? (seg[seg.length - 2] || 'dev') : (last || 'dev'); })();
    const patches = {};
    const PKEY = 'cwpatch:' + courseId + ':' + ((project.meta && project.meta.build) || 0);
    function applyPatchLocal(sid, oid, val) {
        const sl = slides.find(s => s.id === sid); if (!sl) return;
        if (oid === 'notes') { sl.notes = val; return; }
        const r = CW.findObj(sl.objects || [], oid); if (!r) return;
        r.obj.html = val;
        if (slides[P.S] && slides[P.S].id === sid) {
            const el = $('.o[data-id="' + oid + '"] > .tx');
            if (el && !el.isContentEditable) el.innerHTML = r.obj.cloze ? CW.blankify(val) : val;
        }
    }
    function savePatch(sid, oid, val) {
        patches['p_' + sid + '_' + oid] = val;
        try { localStorage.setItem(PKEY, JSON.stringify(patches)); } catch (e) { /* ignore */ }
        lcPost({ t: 'patch', sid, oid, val });
        if (live.db) live.db.collection('coursePatch').doc(courseId).set({ ['p_' + sid + '_' + oid]: val }, { merge: true }).catch(e => console.warn('patch', e));
    }
    let patchSub = false;
    function subPatches() {
        if (patchSub || !live.db) return; patchSub = true;
        live.db.collection('coursePatch').doc(courseId).onSnapshot(d => {
            const x = d.data() || {};
            Object.keys(x).forEach(k => { const m = /^p_([^_]+)_([^_]+)$/.exec(k); if (m) { patches[k] = x[k]; applyPatchLocal(m[1], m[2], x[k]); } });
        }, () => { });
    }
    function downloadPatches() {
        const blob = new Blob([JSON.stringify({ course: courseId, title: project.meta.title, at: new Date().toISOString(), patches }, null, 1)], { type: 'application/json' });
        const a = h('a', { href: URL.createObjectURL(blob), download: 'patches-' + courseId + '.json' }); document.body.append(a); a.click(); a.remove();
    }
    function bindEditing() {
        const view = $('#view'); if (!view) return;
        view.addEventListener('click', e => {
            if (tool !== 'edit') return;
            const tx = e.target.closest && e.target.closest('.o-box > .tx');
            if (!tx || tx.isContentEditable) { if (tx) e.stopPropagation(); return; }
            e.stopPropagation(); e.preventDefault();
            const oid = tx.parentElement.dataset.id, sid = slideId();
            const r = CW.findObj(slides[P.S].objects || [], oid); if (!r) return;
            tx.innerHTML = r.obj.html || '';                         // raw text (no blanks) while editing
            tx.contentEditable = 'true'; tx.focus(); tx.classList.add('editing');
            const done = () => {
                tx.removeEventListener('blur', done); tx.contentEditable = 'false'; tx.classList.remove('editing');
                const html = tx.innerHTML.replace(/<div>/g, '<p>').replace(/<\/div>/g, '</p>');
                if (html !== r.obj.html) { applyPatchLocal(sid, oid, html); savePatch(sid, oid, html); toast('已修改，学生和下次上课都会看到'); }
                tx.innerHTML = r.obj.cloze ? CW.blankify(r.obj.html) : r.obj.html;
            };
            tx.addEventListener('blur', done);
            tx.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Escape') tx.blur(); });
        }, true);
    }

    // ------------------------------------------------------------------ question popup (everybody sees it; answers appear with the pixel avatars)
    function renderQ() {
        const q = qState.q; let box = $('#qpop');
        if (!q) { if (box) box.remove(); return; }
        const me = myEmail(), real = STUDENT && !MIRROR;
        const canAnswer = real && !q.closed && (q.mode === 'one' ? q.who === me : true);
        const sig = q.id + ':' + (q.closed ? 1 : 0) + ':' + canAnswer;
        if (!box || box.dataset.id !== sig) {
            const keep = box && $('textarea', box) ? $('textarea', box).value : '';
            if (box) box.remove();
            box = h('div', { id: 'qpop', 'data-id': sig },
                PRES ? h('button', { class: 'qx', title: '收回问题', onclick: () => recallQ() }, '✕') : null,
                h('div', { class: 'qhead' }, q.mode === 'one' && q.whoName ? '👉 ' + q.whoName + ' 回答' : '👥 全班回答'),
                h('div', { class: 'qt' }, q.text), h('div', { class: 'qa' }));
            if (canAnswer) {
                const ta = h('textarea', { placeholder: '请输入你的回答 · Gõ câu trả lời của em', rows: 2 }); ta.value = keep;
                const st = h('span', { class: 'qs' });
                box.append(h('div', { class: 'qin' }, ta, h('button', { onclick: () => { const v = ta.value.trim(); if (!v) return; if (live.sendResp) live.sendResp(q.slide, 'n:' + q.idx, v, 'note'); st.textContent = '✓ 已提交 Đã gửi'; } }, '提交 Gửi'), st));
            } else if (real && !q.closed) box.append(h('div', { class: 'qwait' }, q.mode === 'one' ? '请听 ' + (q.whoName || '同学') + ' 回答…' : ''));
            if (q.mode !== 'one' && !q.closed && !canAnswer && !real) box.append(h('div', { class: 'qwait' }, '等待学生回答…（答完或老师截止后公布）'));
            $('#app').append(box);
        }
        const qa = $('.qa', box); qa.innerHTML = '';
        (qState.list || []).forEach(x => qa.append(h('div', { class: 'qc' }, h('img', { src: P.avatarUrl(x.av), alt: '' }), h('div', null, h('b', null, x.name), h('span', null, x.val)))));
    }
    function recallQ() { activeQ = null; sendUi({ q: null, qa: [] }); renderSide(); }
    P.on('ui', applyUi);
    P.on('msg', m => {
        if (m.t === 'ui') applyUi(m.patch);
        else if (m.t === 'ink') { ink[m.key] = m.strokes || []; if (inkKey() === m.key) redraw(); }
        else if (m.t === 'patch') applyPatchLocal(m.sid, m.oid, m.val);
        else if (m.t === 'end' && MIRROR) { try { window.close(); } catch (e) { /* ignore */ } document.body.innerHTML = '<p style="color:#fff;font:24px sans-serif;padding:2rem">课堂已结束，可以关闭这个窗口。</p>'; }
    });
    P.on('render', () => { redraw(); subInk(); setTimeout(renderMarks, 60); });
    P.on('live', () => { if (STUDENT || PRES) subPatches(); });

    // ------------------------------------------------------------------ teacher: drawing
    function pt(e) { const r = cv().getBoundingClientRect(); return { x: +((e.clientX - r.left) / r.width * W).toFixed(1), y: +((e.clientY - r.top) / r.height * H).toFixed(1) }; }
    function setTool(t) {
        tool = t;
        const c = cv(); if (c) c.style.pointerEvents = (t === 'cursor' || t === 'edit') ? 'none' : 'auto';
        if (c) c.style.cursor = { laser: 'none', pen: 'crosshair', hl: 'crosshair', eraser: 'cell', zoom: 'zoom-in' }[t] || 'default';
        if (t !== 'laser') sendUi({ laser: { on: false, ts: Date.now() } });
        showLaser(null);
        document.body.classList.toggle('editing', t === 'edit');
        $$('#ptool [data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
        const pal = $('#ppal'); if (pal) pal.style.display = (t === 'pen' || t === 'hl') ? 'flex' : 'none';
    }
    function bindDrawing() {
        const el = cv(); let curS = null, erasing = false;
        el.addEventListener('pointerdown', e => {
            const p = pt(e);
            if (tool === 'pen' || tool === 'hl') {
                el.setPointerCapture(e.pointerId);
                curS = { t: tool, c: tool === 'hl' ? '#FFE600' : color, w: tool === 'hl' ? 34 : pw, p: [p.x, p.y] };
                (ink[inkKey()] = ink[inkKey()] || []).push(curS); redraw();
            } else if (tool === 'eraser') { el.setPointerCapture(e.pointerId); erasing = true; eraseAt(p); }
            else if (tool === 'zoom') { if (zoom.s > 1) applyZoom({ s: 1 }); else applyZoom({ s: 2.2, x: p.x, y: p.y }); sendUi({ zoom: Object.assign({}, zoom) }); }
        });
        el.addEventListener('pointermove', e => {
            const p = pt(e);
            if (curS) { const n = curS.p.length; if (Math.hypot(p.x - curS.p[n - 2], p.y - curS.p[n - 1]) > 2) { curS.p.push(p.x, p.y); redraw(); } }
            else if (erasing) eraseAt(p);
            else if (tool === 'laser') { const l = { x: p.x, y: p.y, on: true, ts: Date.now() }; showLaser(l); sendUi({ laser: l }, true); }
        });
        const end = () => { if (curS) { curS = null; pushInk(inkKey()); } if (erasing) { erasing = false; pushInk(inkKey()); } };
        el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
        el.addEventListener('pointerleave', () => { if (tool === 'laser') { showLaser(null); sendUi({ laser: { on: false, ts: Date.now() } }); } });
    }
    function eraseAt(p) {
        const key = inkKey(), list = ink[key] || []; const r = 28 / Math.max(1, zoom.s);
        const keep = list.filter(s => !s.p.some((v, i) => i % 2 === 0 && Math.hypot(v - p.x, s.p[i + 1] - p.y) < r + s.w / 2));
        if (keep.length !== list.length) { ink[key] = keep; redraw(); }
    }
    function clearPage() { ink[inkKey()] = []; redraw(); pushInk(inkKey()); }
    function setBoard(b) { board = board === b ? '' : b; applyBoard(); redraw(); sendUi({ board }); }

    // ------------------------------------------------------------------ roster, answers
    const SIMS = [{ email: 'sim1@preview', name: '小明', av: 2 }, { email: 'sim2@preview', name: '小红', av: 10 }, { email: 'sim3@preview', name: '小华', av: 7 }];
    let simOn = false; const simResp = [];
    const cnName = n => { const m = String(n || '').match(/[\u3400-\u9fff\u00b7]+/g); return m ? m.join('') : String(n || ''); };
    const rosterOf = () => ((live.session && live.session.roster) || []).map(r => Object.assign({}, r, { name: cnName(r.name) })).concat(simOn ? SIMS : []);
    const avOf = email => { const r = rosterOf().find(x => x.email === email); return r ? r.av : 0; };
    const onlineEmails = () => rosterOf().filter(r => { if (r.email.endsWith('@preview')) return true; const m = live.members[r.email]; return m && !m.left && (Date.now() - (m.lastSeen || 0)) < 45000; }).map(r => r.email);
    const allResp = () => Object.values(live.resp || {}).concat(simResp);
    const respFor = (slide, key) => allResp().filter(r => r.slide === slide && r.key === key);
    const nameOf = email => { const r = rosterOf().find(x => x.email === email); return r ? r.name : email; };
    const qsOf = slide => { const out = {}; CW.walkObjs(slide.objects || [], o => { if (o.quiz && o.quiz.q) (out[o.quiz.q] = out[o.quiz.q] || []).push(o); }); return out; };
    P.htmlQuizData = (slide, info) => {
        const out = {};
        (info || []).forEach((q, qi) => {
            const key = String(qi + 1), right = q.ans >= 0 ? String.fromCharCode(65 + q.ans) : '';
            const rows = respFor(slide.id, 'q:' + key), opts = {}; let ok = 0;
            rows.forEach(r => { (opts[r.val] = opts[r.val] || []).push(P.avatarUrl(avOf(r.email))); if (r.val === right) ok++; });
            out[key] = { opts, right, ok, n: rows.length };
        });
        return out;
    };
    P.quizData = slide => {
        const out = {}, qs = qsOf(slide);
        Object.keys(qs).forEach(q => {
            const right = (qs[q].find(o => o.quiz.correct) || { quiz: {} }).quiz.opt;
            const rows = respFor(slide.id, 'q:' + q); const opts = {}; let ok = 0;
            rows.forEach(r => { (opts[r.val] = opts[r.val] || []).push(avOf(r.email)); if (r.val === right) ok++; });
            out[q] = { opts, right, ok, n: rows.length };
        });
        return out;
    };

    // ------------------------------------------------------------------ answer order (回答顺序): endless loop, not reset by changing page
    let ord = { list: [], i: 0, on: true, made: false, used: false }; let ordOpen = null, ordPos = null;
    const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    function publishOrd() {
        const on = new Set(onlineEmails()); let nx = -1;
        for (let k = 1; k <= ord.list.length; k++) { const j = (ord.i + k) % ord.list.length; if (on.has(ord.list[j].e) && j !== ord.i) { nx = j; break; } }
        sendUi({ ord: { list: ord.list.map(x => ({ e: x.e, name: x.name, av: x.av, on: on.has(x.e) })), i: ord.i, nx, show: ord.on, pos: ordPos, open: !!ordOpen } });
    }
    function buildOrd(reshuffle) {
        const ro = rosterOf(), on = onlineEmails();
        const info = e => { const r = ro.find(x => x.email === e); return { e, name: r ? r.name : e, av: r ? r.av : 0 }; };
        if (reshuffle || (!ord.made && on.length >= 2)) {
            if (!reshuffle && on.length < 2) return;
            ord.list = shuffle(on.map(info)); ord.i = 0; ord.made = true; ord.used = false;
        } else if (ord.made) {
            const have = new Set(ord.list.map(x => x.e));
            on.forEach(e => { if (!have.has(e)) ord.list.push(info(e)); });              // late comers join at the end
            if (!simOn) ord.list = ord.list.filter(x => !x.e.endsWith('@preview'));
            if (ord.i >= ord.list.length) ord.i = 0;
        }
        publishOrd();
    }
    let ordRestored = false;
    function restoreOrd() {
        if (ordRestored || !live.ref) return; ordRestored = true;
        live.ref.collection('ui').doc('cur').get().then(d => {
            const o = (d.data() || {}).ord;
            if (o && o.list && o.list.length && !ord.made) { ord.list = o.list.map(x => ({ e: x.e, name: cnName(x.name), av: x.av })); ord.i = o.i || 0; ord.made = true; ord.used = true; buildOrd(false); }
        }).catch(() => { });
    }
    function advanceOrd(force) {
        if (!ord.list.length || (!ord.on && !force)) return;
        const on = new Set(onlineEmails());
        for (let k = 1; k <= ord.list.length; k++) { const j = (ord.i + k) % ord.list.length; if (on.has(ord.list[j].e)) { ord.i = j; break; } }
        ord.used = true;
        publishOrd(); renderSide(); renderMarks();
    }
    // the side tab (hidden at the right edge; open it to see the whole order, drag it anywhere)
    function renderOrd() {
        const o = ordView; let tab = $('#ordtab'), panel = $('#ordpanel');
        if (!o || !o.list || !o.list.length || o.show === false) { if (tab) tab.remove(); if (panel) panel.remove(); renderMe(); return; }
        if (ordOpen === null) { try { ordOpen = localStorage.getItem('cw_ord_open') === '1'; } catch (e) { ordOpen = false; } }
        const follow = MIRROR && o.open !== undefined;                        // only the shared (Meet) window copies what the teacher does with it
        const pinned = false;                                                  // real students keep their own window: they may hide or drag it; only the shared (Meet) window follows the teacher
        const open = pinned ? true : follow ? !!o.open : ordOpen;
        const flip = v => { if (follow || pinned) return; ordOpen = v; try { localStorage.setItem('cw_ord_open', v ? '1' : '0'); } catch (e) { /* ignore */ } renderOrd(); if (PRES) publishOrd(); };
        if (pinned) { if (tab) tab.remove(); tab = null; }
        else if (!tab) { tab = h('button', { id: 'ordtab', title: '回答顺序' }, '👥'); $('#app').append(tab); }
        if (tab) tab.onclick = () => flip(!ordOpen);
        if (panel) panel.remove();
        renderMe();
        if (!open) return;
        const pos = pinned ? { x: 1700, y: 160 } : (follow && o.pos ? { x: o.pos.x, y: o.pos.y } : null) || (() => { try { return JSON.parse(localStorage.getItem('cw_ord_pos') || 'null'); } catch (e) { return null; } })() || { x: 1700, y: 160 };
        if (PRES) ordPos = { x: pos.x, y: pos.y };
        panel = h('div', { id: 'ordpanel', style: { left: pos.x + 'px', top: pos.y + 'px' } });
        const head = h('div', { class: 'ohead' }, '回答顺序', pinned ? null : h('button', { onclick: () => flip(false) }, '✕'));
        panel.append(head);
        o.list.forEach((x, k) => panel.append(h('div', { class: 'oi2' + (k === o.i ? ' cur' : '') + (k === o.nx ? ' nxt' : '') + (x.on ? '' : ' off') }, h('img', { src: P.avatarUrl(x.av), alt: '' }), h('span', null, x.name))));
        $('#app').append(panel);
        head.addEventListener('pointerdown', e => {
            if (e.target.tagName === 'BUTTON' || follow || pinned) return;
            const ar = $('#app').getBoundingClientRect(), sc = ar.width / W; const sx = e.clientX, sy = e.clientY, ox = pos.x, oy = pos.y;
            const mv = ev => { pos.x = Math.max(0, Math.min(W - 160, ox + (ev.clientX - sx) / sc)); pos.y = Math.max(0, Math.min(H - 200, oy + (ev.clientY - sy) / sc)); panel.style.left = pos.x + 'px'; panel.style.top = pos.y + 'px'; };
            const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); try { localStorage.setItem('cw_ord_pos', JSON.stringify(pos)); } catch (er) { /* ignore */ } if (PRES) { ordPos = { x: pos.x, y: pos.y }; publishOrd(); } };
            document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up); e.preventDefault();
        });
    }
    function renderMe() {
        let me = $('#ordme'); const o = ordView;
        const mine = o && o.list && o.list[o.i] && o.list[o.i].e === myEmail() && STUDENT && !MIRROR && o.show !== false;
        if (!mine) { if (me) me.remove(); return; }
        if (!me) $('#app').append(h('div', { id: 'ordme' }, '✋ 轮到你回答啦！ Đến lượt em!'));
    }
    // avatar in front of the sentence / question being answered, or above the word of a flashcard
    function exampleP() {
        const sl = slides[P.S]; const ps = [];
        (sl.anim || []).forEach(a => { if (a.para) { const tx = $('.o[data-id="' + a.obj + '"] > .tx'); if (tx) { const kids = Array.from(tx.children).filter(c => c.tagName === 'P'); for (let i = a.para[0]; i <= a.para[1]; i++) if (kids[i]) ps.push(kids[i]); } } });
        const vis = ps.filter(p => getComputedStyle(p).visibility !== 'hidden');
        return vis[vis.length - 1] || null;
    }
    const ROWMARK = !(project.meta && project.meta.ordSide);
    function placeMark(el, who, below) {
        const zl = $('#zl'); if (!zl || !el) return;
        const zr = zl.getBoundingClientRect(), ratio = zr.width / W, r = el.getBoundingClientRect();
        const m = h('div', { class: 'ordmark' + (below ? ' nxt' : '') }, h('img', { src: P.avatarUrl(who.av), alt: '' }), h('span', null, who.name));
        if (below) { m.style.left = Math.max(4, (r.left - zr.left) / ratio - 10) + 'px'; m.style.top = ((r.bottom - zr.top) / ratio + 2) + 'px'; }
        else { m.style.left = Math.max(4, (r.left - zr.left) / ratio - 96) + 'px'; m.style.top = ((r.top - zr.top) / ratio - 4) + 'px'; }
        zl.append(m);
    }
    P.on('htmlready', () => renderMarks());
    function renderMarks() {
        if (P.htmlSend && !/^html:s?flash/.test(((slides[P.S] || {}).tag) || '')) P.htmlSend({ k: 'ord', list: null });
        $$('.ordmark').forEach(e => e.remove()); $$('.ordtag').forEach(e => e.remove()); $$('.clmark').forEach(e => e.remove());
        const o = ordView || { list: [], i: 0 }; if (o.show === false) return;
        const cu = o.list[o.i];
        const sl = slides[P.S], tn = STUDENT ? turnView : P.turn;
        if (!cu) { /* no order yet */ } else if (tn && tn.slide === sl.id && tn.mode === 'order') {
            const k0 = (tn.keys || [])[0] || '';
            let el = null;
            if (/^c:/.test(k0)) { const [, oid, idx] = k0.split(':'); const sp = $('.o[data-id="' + oid + '"] .cz[data-i="' + idx + '"]'); el = sp ? (sp.closest('p') || sp) : null; }
            else if (/^q:/.test(k0)) el = $('.qz[data-q="' + k0.slice(2) + '"]');
            placeMark(el, { name: tn.name, av: tn.av });
        } else if (/^html:s?flash/.test(sl.tag || '')) {
            const nx = o.list[o.nx];
            if (P.htmlSend) P.htmlSend({ k: 'ord', list: [{ name: cu.name, img: P.avatarUrl(cu.av) }], nx: nx && nx !== cu ? { name: nx.name, img: P.avatarUrl(nx.av) } : null });
        } else if (sl.type === 'flash') {
            const wrap = $('#view .fwrap'); const nx = o.list[o.nx];
            if (wrap) wrap.append(h('div', { class: 'ordtag row' }, h('div', null, h('img', { src: P.avatarUrl(cu.av), alt: '' }), h('span', null, cu.name)), nx && nx !== cu ? h('div', { class: 'nxt' }, h('img', { src: P.avatarUrl(nx.av), alt: '' }), h('span', null, nx.name)) : null));
        } else if (ROWMARK && (sl.anim || []).some(a => a.para)) { const ep = exampleP(); placeMark(ep, cu); const nx = o.list[o.nx]; if (nx && nx !== cu) placeMark(ep, nx, true); }   // level 3: a person on every example row
    }
    P.on('advance', () => {
        if (!PRES) return;
        const sl = slides[P.S], tag = sl.tag || '';
        if (sl.type === 'flash' || /^html:s?flash/.test(tag) || (ROWMARK && /vocab|grammar/.test(tag) && (sl.anim || []).some(a => a.para))) { if (ord.used) advanceOrd(false); ord.used = true; }          // levels 1/2 (meta.ordSide): only flash cards change the person by themselves
        renderMarks();
    });

    // ------------------------------------------------------------------ turn by turn on question pages (cloze / choice)
    const pageMode = {}, closedPages = {}, shownEmail = {}; let lastTurn = '', turnPrev = null; const simAsked = new Set(); let clView = null;
    function unitsOfPage() {
        const stage = $('#view .cw-stage'); if (!stage) return [];
        const out = [];
        $$('.o.cloze', stage).forEach(box => { const oid = box.dataset.id; $$('.tx > p', box).forEach((p, pi) => { const sp = $$('.cz', p); if (sp.length) out.push({ kind: 'c', key: 'u:' + oid + ':' + pi, keys: sp.map(s => 'c:' + oid + ':' + s.dataset.i) }); }); });
        if (!out.length) { const seen = {}; $$('.qz', stage).forEach(e => { const q = e.dataset.q; if (!seen[q]) { seen[q] = 1; out.push({ kind: 'q', key: 'q:' + q, keys: ['q:' + q] }); } }); }
        return out;
    }
    function updateTurn() {
        if (!PRES) return;
        const sl = slides[P.S], us = unitsOfPage(); let tn = null, fl = null, cl = null;
        if (us.length) {
            const mode = pageMode[sl.id] || 'class';
            if (mode === 'order' && ord.list.length) {
                const isDone = u => u.keys.some(k => respFor(sl.id, k).length);
                if (turnPrev && turnPrev.slide === sl.id) { const pu = us.find(u => u.key === turnPrev.ukey); if (pu && isDone(pu)) { advanceOrd(true); turnPrev = null; } }
                fl = {}; let cu = null;
                us.forEach(u => { if (isDone(u)) u.keys.forEach(k => { const r = respFor(sl.id, k)[0]; if (r) fl[k] = r.val; }); else if (!cu) cu = u; });
                const who = ord.list[ord.i];
                if (cu && who) {
                    tn = { slide: sl.id, mode: 'order', ukey: cu.key, key: cu.key, keys: cu.keys, who: who.e, name: who.name, av: who.av };
                    turnPrev = tn;
                    if (simOn && who.e.endsWith('@preview') && !simAsked.has(sl.id + cu.key)) {
                        simAsked.add(sl.id + cu.key);
                        setTimeout(() => {
                            cu.keys.forEach(k => { if (respFor(sl.id, k).length) return; const val = /^q:/.test(k) ? (qsOf(sl)[k.slice(2)] || [{ quiz: { opt: 'A' } }])[0].quiz.opt : '（模拟回答）'; simResp.push({ slide: sl.id, key: k, val, email: who.e, name: who.name, ts: Date.now(), type: /^q:/.test(k) ? 'quiz' : 'cloze' }); });
                            renderSide(); updateTurn();
                        }, 2200);
                    }
                } else turnPrev = null;
            } else turnPrev = null;
        } else turnPrev = null;
        const sig = JSON.stringify([tn, fl, cl]);
        if (sig !== lastTurn) { lastTurn = sig; P.turn = tn; P.fills = fl; P.cls = cl; P.post(); renderMarks(); }
    }
    let appliedFills = {};
    function applyFills(fl) {
        Object.keys(appliedFills).forEach(k => { if (!fl || fl[k] === undefined) { const m = /^c:([^:]+):(\d+)$/.exec(k); const sp = m && $('.o[data-id="' + m[1] + '"] .cz[data-i="' + m[2] + '"]'); if (sp && sp._raw) { sp.textContent = sp._raw; sp.classList.remove('sel'); } } });
        appliedFills = fl ? Object.assign({}, fl) : {};
        if (!fl) return;
        Object.keys(fl).forEach(k => {
            const m = /^c:([^:]+):(\d+)$/.exec(k); if (!m) return;
            const sp = $('.o[data-id="' + m[1] + '"] .cz[data-i="' + m[2] + '"]'); if (!sp) return;
            if (!sp._raw) sp._raw = sp.textContent;
            if (sp.querySelector('input')) return;
            sp.textContent = fl[k]; sp.classList.remove('ok', 'bad'); sp.classList.add('sel'); sp.dataset.locked = '1';
        });
    }
    P.canAnswer = (kind, key) => {
        if (!STUDENT || MIRROR) return true;
        const sl = slides[P.S], tn = turnView;
        if (kind === 'c' && clView && clView.slide === sl.id && clView.closed) { toast('已截止 · Đã hết giờ'); return false; }
        if (!tn || tn.slide !== sl.id || tn.mode !== 'order') return true;
        if (tn.who !== myEmail()) { toast('现在轮到 ' + tn.name + ' 回答'); return false; }
        if (kind === 'c') return (tn.keys || []).includes('c:' + key);
        if (kind === 'q') return tn.key === 'q:' + key;
        return true;
    };
    P.on('applied', st => { turnView = st ? st.tn || null : null; clView = st ? st.cl || null : null; applyFills(st && st.fl); if (clView && clView.slide === slides[P.S].id && clView.closed) $$('.cz').forEach(s => { s.dataset.locked = '1'; }); renderMarks(); renderMe(); });

    // ------------------------------------------------------------------ teacher: answers, auto reveal, simulated students
    let lastQA = '';
    function syncQA() {
        if (!PRES || !activeQ) return;
        const ans = respFor(activeQ.slide, 'n:' + activeQ.idx).sort((x, y) => (x.ts || 0) - (y.ts || 0));
        const on = onlineEmails();
        if (activeQ.mode === 'class' && !activeQ.closed && on.length && on.every(em => ans.some(r => r.email === em))) activeQ.closed = true;
        const visible = activeQ.mode === 'one' ? ans.filter(r => r.email === activeQ.who) : (activeQ.closed ? ans : []);
        const list = visible.map(r => ({ name: nameOf(r.email), av: avOf(r.email), val: r.val }));
        const sig = JSON.stringify([list, activeQ.closed]);
        if (sig !== lastQA) { lastQA = sig; sendUi({ q: activeQ, qa: list }); }
    }
    function sendQ(q, mode) {
        const cu = ord.list[ord.i];
        activeQ = Object.assign({}, q, { mode, closed: false, who: mode === 'one' && cu ? cu.e : null, whoName: mode === 'one' && cu ? cu.name : '' });
        lastQA = ''; sendUi({ q: activeQ, qa: [] }); simRespondQ(); renderSide();
    }
    let autoOn = true;
    function checkAuto() {
        if (PRES && autoOn && /^html:quiz/.test((slides[P.S] || {}).tag || '') && P.htmlQuizInfo && P.htmlQuizInfo() && !P.htmlQuizDone()) {
            const sl = slides[P.S], info = P.htmlQuizInfo(), on = onlineEmails();
            if (info.length && on.length && on.every(em => info.every((q, qi) => respFor(sl.id, 'q:' + (qi + 1)).some(r => r.email === em)))) P.htmlQuizReveal();
            return;
        }
        if (!PRES || !autoOn || !P.cur || !P.cur.hasQuiz) return;
        const st = P.cur.state(); if (st && st.rv) return;
        const sl = slides[P.S]; if ((pageMode[sl.id] || 'class') === 'order') return;
        const qs = Object.keys(qsOf(sl)); const on = onlineEmails();
        if (!qs.length || !on.length) return;
        if (on.every(em => qs.every(q => respFor(sl.id, 'q:' + q).some(r => r.email === em)))) P.cur.quizReveal();
    }
    function simRespondQ() {
        if (!simOn || !activeQ) return;
        const q = activeQ, texts = ['我觉得是这样。', 'Em nghĩ là vậy ạ.', '我不太确定……', '我喜欢！'];
        SIMS.forEach((s, k) => {
            if (q.mode === 'one' && q.who !== s.email) return;
            setTimeout(() => { if (!activeQ || activeQ.id !== q.id) return; simResp.push({ slide: q.slide, key: 'n:' + q.idx, val: texts[(k + (q.idx || 0)) % texts.length], email: s.email, name: s.name, ts: Date.now(), type: 'note' }); syncQA(); renderSide(); }, 1500 + k * 1800);
        });
    }
    function simRespondQuiz() {
        if (!simOn || !P.cur || !P.cur.hasQuiz) return;
        const sl = slides[P.S], qs = qsOf(sl); if ((pageMode[sl.id] || 'class') === 'order') return;
        SIMS.forEach((s, k) => setTimeout(() => {
            if (slides[P.S] !== sl) return;
            Object.keys(qs).forEach(q => {
                if (simResp.some(r => r.email === s.email && r.slide === sl.id && r.key === 'q:' + q)) return;
                const opts = Array.from(new Set(qs[q].map(o => o.quiz.opt))).sort();
                simResp.push({ slide: sl.id, key: 'q:' + q, val: opts[Math.floor(Math.random() * opts.length)], email: s.email, name: s.name, ts: Date.now(), type: 'quiz' });
            });
            renderSide(); checkAuto();
        }, 2000 + k * 1500));
    }

    // ------------------------------------------------------------------ teacher: presenter console
    function buildPresenter() {
        const mkTool = (k, ic, title) => h('button', { 'data-tool': k, title, class: 'pt', onclick: () => setTool(k) }, ic);
        const act = (ic, title, fn, id) => h('button', { class: 'pt', title, id, onclick: fn }, ic);
        const colors = ['#E53935', '#1E88E5', '#222222', '#2E9B57', '#FB8C00'];
        const pal = h('div', { id: 'ppal' }, colors.map(c => h('button', { class: 'dot', style: { background: c }, onclick: e => { color = c; $$('#ppal .dot').forEach(d => d.classList.toggle('on', d === e.currentTarget)); } })),
            h('button', { class: 'wd', title: '细', onclick: () => { pw = 4; } }, '·'), h('button', { class: 'wd', title: '粗', onclick: () => { pw = 10; } }, '●'));
        const tools = h('div', { id: 'ptool' },
            mkTool('cursor', '🖱', '光标（Esc）'), mkTool('laser', '🔴', '激光笔（L）'), mkTool('pen', '✏️', '笔（P）'), mkTool('hl', '🖍', '荧光笔（H）'), mkTool('eraser', '🧽', '橡皮（E）'),
            act('🗑', '清除本页的笔迹', clearPage), mkTool('zoom', '🔍', '放大（Z）：点一下放大，再点还原'),
            act('⬛', '黑板（B）', () => setBoard('black')), act('⬜', '白板（W）', () => setBoard('white')),
            h('span', { class: 'sep' }), mkTool('edit', '✎', '修改文字：点文字框直接改（学生和下次上课都会看到）'),
            h('span', { class: 'sep' }), act('▦', '所有页面（G）', openGrid), act('🪟', '打开“学生同款窗口”（Meet 共享 / 录制用）', openMirror), act('⛶', '全屏', () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); }),
            pal, h('span', { class: 'grow' }), LIVE ? h('button', { class: 'btn end', title: '下课：结束课堂并关闭这个窗口', onclick: endClass }, '结束课堂') : null);
        const foot = h('div', { id: 'pfoot' }, act('◀', '上一步（←）', () => P.prev()), h('span', { id: 'ppos' }), act('▶', '下一步（→ / 空格）', () => P.next()),
            h('span', { id: 'pstep' }), h('span', { class: 'grow' }), h('label', { id: 'pauto', title: '全部在线学生答完选择题就自动显示答案' }, h('input', { type: 'checkbox', checked: true, onchange: e => { autoOn = e.target.checked; checkAuto(); } }), ' 答完自动显示答案'),
            h('button', { class: 'btn', id: 'prev-rv', onclick: () => P.cur && P.cur.quizReveal && P.cur.quizReveal() }, '显示答案 ✅'));
        const side = h('aside', { id: 'pside' },
            h('section', null, h('h4', null, '下一步'), h('div', { id: 'pnext' }), h('div', { id: 'pnextl' })),
            h('section', null, h('h4', null, '备注（点一下可以改）'), h('div', { id: 'pnotes' })),
            h('section', { id: 'pqsec' }, h('h4', null, '提问（点“发给全班”让学生打字回答）'), h('div', { id: 'pq' })),
            h('section', { id: 'pmsec' }, h('h4', null, '本页回答方式'), h('div', { id: 'pmode' })),
            h('section', null, h('h4', { id: 'pstuh' }, '学生'), h('div', { id: 'pstu' }), h('div', { id: 'pord' })),
            h('section', { id: 'pasec' }, h('h4', null, '本页学生作答（按完成先后）'), h('div', { id: 'pans2' })),
            h('section', null, h('button', { class: 'btn sm', onclick: downloadPatches, title: '把上课时改过的文字存成文件，回课件工坊“导入课堂中的修改”' }, '⬇ 下载课堂中的修改'), ' ', h('button', { class: 'btn sm', title: '已经合并进课件并重新导出后，清掉网站上保存的修改', onclick: () => { if (!confirm('清除网站上保存的所有课堂修改？（请先下载并合并回课件）')) return; Object.keys(patches).forEach(k => delete patches[k]); try { localStorage.removeItem(PKEY); } catch (e) { /* ignore */ } if (live.db) live.db.collection('coursePatch').doc(courseId).delete().catch(() => { }); toast('已清除'); } }, '清除')));
        const stage = h('div', { id: 'pstage' });
        const root = h('div', { id: 'pres' }, tools, stage, foot, side);
        document.body.prepend(root);
        stage.append($('#appbox'));
        P.applyScale(); addEventListener('resize', P.applyScale);
        new ResizeObserver(() => P.applyScale()).observe(stage);
        setTool('cursor');
    }
    async function endClass() {
        if (!confirm('下课：结束这个课堂并关闭窗口？（学生会被请出）')) return;
        try {
            if (live.ref) {
                await live.ref.update({ open: false, started: false });
                const ms = await live.ref.collection('members').get(); const b = live.db.batch(); ms.docs.forEach(d => b.delete(d.ref)); await b.commit();
            }
        } catch (e) { console.warn('end', e); }
        lcPost({ t: 'end' });
        try { window.close(); } catch (e) { /* ignore */ }
        document.body.innerHTML = '<p style="color:#fff;background:#2b231d;font:22px sans-serif;padding:2rem;height:100vh">课堂已结束，可以关闭这个窗口。</p>';
    }
    function openMirror() {
        const u = new URL(location.href); u.searchParams.delete('presenter'); u.searchParams.set('role', 'mirror'); u.searchParams.set('fit', '1'); u.searchParams.set('live', P.CODE);
        window.open(u.href, 'cw_mirror', 'width=1280,height=720');
    }
    // all pages: like PowerPoint's slide sorter (sections on the left, thumbnails on the right)
    function openGrid() {
        const root = $('#modal-root'); root.innerHTML = '';
        const close = () => { root.innerHTML = ''; document.removeEventListener('keydown', onKey, true); };
        const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
        document.addEventListener('keydown', onKey, true);
        const secs = []; let last = null;
        slides.forEach((s, i) => { const name = s.section || '（未分节）'; if (!last || last.name !== name) { last = { name, items: [] }; secs.push(last); } last.items.push(i); });
        const nav = h('nav', { class: 'so-nav' }, h('h3', null, '分节'), secs.map((sc, k) => h('button', { 'data-k': k, onclick: () => { $$('.so-nav button', root).forEach(b => b.classList.toggle('on', +b.dataset.k === k)); const t = $('#so-sec-' + k, root); if (t) t.scrollIntoView({ block: 'start', behavior: 'smooth' }); } }, sc.name)));
        const main = h('div', { class: 'so-main' });
        const W0 = project.meta.W, sc0 = 300 / W0, pending = [];
        secs.forEach((sc, k) => {
            const grid = h('div', { class: 'so-grid' });
            sc.items.forEach(i => {
                const th = h('div', { class: 'so-th' + (i === P.S ? ' cur' : '') }, h('div', { class: 'so-img' }), h('div', { class: 'so-num' }, String(i + 1)));
                th.onclick = () => { close(); P.goTo(i); };
                grid.append(th); pending.push(() => { try { const st = CW.makeStage(project, slides[i], { mode: 'thumb', resolve: P.resolve }); st.style.transform = 'scale(' + sc0 + ')'; st.style.transformOrigin = '0 0'; $('.so-img', th).append(st); } catch (e) { /* ignore */ } });
            });
            main.append(h('h4', { id: 'so-sec-' + k }, sc.name), grid);
        });
        const ov = h('div', { class: 'sorter' }, nav, main, h('button', { class: 'so-x', onclick: close, title: '关闭 Esc' }, '✕'));
        root.append(ov);
        const cur = $('.so-th.cur', ov); if (cur) cur.scrollIntoView({ block: 'center' });
        (function step() { for (let n = 0; n < 6 && pending.length; n++) pending.shift()(); if (pending.length) setTimeout(step, 10); })();
    }

    // the "next step" picture
    function renderNext() {
        const box = $('#pnext'); if (!box) return;
        const W0 = project.meta.W, H0 = project.meta.H;
        const i = P.S, cur = P.cur, st = cur && cur.state ? cur.state() : null;
        let sl = null, k = 0, label = '';
        if (cur && cur.runner && st && st.k < st.total) { sl = slides[i]; k = st.k + 1; label = '同一页的下一步（' + k + ' / ' + st.total + '）'; }
        else if (i + 1 < slides.length) { sl = slides[i + 1]; label = '下一页：' + P.slideLabel(sl, i + 1); }
        else label = '已经是最后一页';
        $('#pnextl').textContent = label;
        box.innerHTML = '';
        if (!sl) return;
        const w = box.clientWidth || 328, sc = w / W0;
        box.style.height = (H0 * sc) + 'px';
        try {
            const stg = CW.makeStage(project, sl, { mode: 'thumb', resolve: P.resolve });
            stg.style.transform = 'scale(' + sc + ')'; stg.style.transformOrigin = '0 0'; box.append(stg);
            safe(() => { if (sl.type === 'free' && (sl.anim || []).length) { const r = new CW.AnimRunner(stg, sl, W0, H0); r.reset(k, false); } }, 'next-anim');
            if (sl.type === 'flash') box.append(h('div', { class: 'pcomp' }, '🃏 闪卡 ' + (((sl.flash || {}).words || []).length || '')));
            if (sl.type === 'dialog') box.append(h('div', { class: 'pcomp' }, '💬 ' + ((sl.dialog || {}).title || '课文')));
        } catch (e) { console.warn('next', e); }
    }
    let activeQ = null;
    function questionsOf(sl) {
        const out = [];
        String(sl.notes || '').split('\n').forEach((ln, idx) => { const t = ln.trim(); if (/[？?]$/.test(t) && t.length > 3) out.push({ idx, text: t, slide: sl.id }); });
        return out;
    }
    const keyLabel = k => /^q:/.test(k) ? '第 ' + k.slice(2) + ' 题' : /^c:/.test(k) ? '填空 ' + (+k.split(':')[2] + 1) : /^w:/.test(k) ? '笔顺 ' + k.slice(2) : /^n:/.test(k) ? '提问' : k;
    function renderSide() {
        if (!PRES || !$('#pside')) return;
        const sl = slides[P.S], st = P.cur && P.cur.state ? P.cur.state() : {};
        safe(() => {
            $('#ppos').textContent = (P.S + 1) + ' / ' + slides.length + '  ' + P.slideLabel(sl, P.S);
            $('#pstep').textContent = st && st.k != null && st.total ? '步骤 ' + st.k + ' / ' + st.total : (st && st.pos ? '闪卡 ' + st.pos + ' / ' + st.total : '');
            const nt = $('#pnotes');
            if (!nt.querySelector('textarea')) {
                nt.innerHTML = esc(sl.notes || '（这一页没有备注，点这里可以写）').replace(/\n/g, '<br>');
                nt.onclick = () => {
                    if (nt.querySelector('textarea')) return;
                    const ta = h('textarea', { rows: 8, style: { width: '100%' } }); ta.value = sl.notes || ''; nt.innerHTML = ''; nt.append(ta); ta.focus();
                    ta.onblur = () => { const v = ta.value; if (v !== (sl.notes || '')) { applyPatchLocal(sl.id, 'notes', v); savePatch(sl.id, 'notes', v); } nt.innerHTML = ''; renderSide(); };
                };
            }
        }, 'notes');
        safe(() => {
            const qs = questionsOf(sl), pq = $('#pq'); pq.innerHTML = '';
            $('#pqsec').style.display = qs.length ? '' : 'none';
            qs.forEach(q => {
                const sent = activeQ && activeQ.slide === q.slide && activeQ.idx === q.idx, cu = ord.list[ord.i];
                const btns = sent
                    ? [activeQ.mode === 'class' && !activeQ.closed ? h('button', { class: 'btn sm', onclick: () => { activeQ.closed = true; lastQA = ''; syncQA(); sendUi({ q: activeQ }); renderSide(); } }, '截止并公布') : null, h('button', { class: 'btn sm', onclick: recallQ }, '收回')]
                    : [h('button', { class: 'btn sm', onclick: () => sendQ(q, 'class') }, '发给全班'), cu ? h('button', { class: 'btn sm', title: '只让当前轮到的同学回答，答完全班都能看到', onclick: () => sendQ(q, 'one') }, '发给 ' + cu.name) : null];
                pq.append(h('div', { class: 'pqi' + (sent ? ' sent' : '') }, h('div', { class: 'pqt' }, q.text), h('div', { class: 'pqb' }, btns)));
                if (sent) {
                    const ans = respFor(q.slide, 'n:' + q.idx).sort((a, b) => (a.ts || 0) - (b.ts || 0));
                    pq.append(h('div', { class: 'pans' }, ans.length ? ans.map(r => h('div', null, h('b', null, nameOf(r.email) + '：'), r.val)) : h('i', null, '等待学生回答…')));
                }
            });
        }, 'questions');
        safe(() => {
            const us = unitsOfPage(), pm = $('#pmode'); pm.innerHTML = '';
            $('#pmsec').style.display = us.length ? '' : 'none';
            if (us.length) {
                const mode = pageMode[sl.id] || 'class';
                const opt = (v, t) => h('label', { class: 'pchk' }, h('input', { type: 'radio', name: 'pmode', checked: mode === v, onchange: () => { pageMode[sl.id] = v; lastTurn = ''; updateTurn(); renderSide(); } }), ' ' + t);
                pm.append(opt('order', '按回答顺序：一人一题（像素形象出现在题前，轮到的同学才能答）'), opt('class', '全班一起答'));
            }
        }, 'mode');
        safe(() => {
            const ro = rosterOf(), on = new Set(onlineEmails()), stu = $('#pstu'); stu.innerHTML = '';
            const qk = Object.keys(qsOf(sl));
            $('#pstuh').textContent = ro.length ? '学生（' + on.size + ' / ' + ro.length + ' 在线）' : '学生';
            ro.forEach(r => {
                let mark = '';
                if (qk.length && on.has(r.email)) mark = qk.every(q => respFor(sl.id, 'q:' + q).some(x => x.email === r.email)) ? '✓' : '…';
                stu.append(h('div', { class: 'ps' + (on.has(r.email) ? '' : ' off') }, h('img', { src: P.avatarUrl(r.av), alt: '' }), h('span', null, r.name), mark ? h('i', null, mark) : null));
            });
            const os = $('#pord'); os.innerHTML = '';
            os.append(h('label', { class: 'pchk' }, h('input', { type: 'checkbox', checked: ord.on, onchange: e => { ord.on = e.target.checked; publishOrd(); } }), ' 回答顺序自动换人（例句、闪卡、题目答完就换）'),
                h('div', { class: 'pob' }, h('button', { class: 'btn sm', title: '当前同学答不上来或断线时，手动换下一位', onclick: () => advanceOrd(true) }, '⏭ 换人（N）'), h('button', { class: 'btn sm', onclick: () => { buildOrd(true); } }, '🔀 重新随机'),
                    h('label', { class: 'pchk' }, h('input', { type: 'checkbox', checked: simOn, onchange: e => { simOn = e.target.checked; if (!simOn) simResp.length = 0; buildOrd(false); renderSide(); } }), ' 模拟学生（预览用）')));
            const cu = ord.list[ord.i]; if (cu) os.append(h('div', { class: 'pcur' }, '现在轮到：', h('img', { src: P.avatarUrl(cu.av) }), h('b', null, cu.name)));
        }, 'students');
        safe(() => {
            const rows = allResp().filter(r => r.slide === sl.id && r.type !== 'note').sort((a, b) => (a.ts || 0) - (b.ts || 0)), box = $('#pans2'); box.innerHTML = '';
            $('#pasec').style.display = rows.length ? '' : 'none';
            rows.forEach(r => box.append(h('div', { class: 'par' }, h('img', { src: P.avatarUrl(avOf(r.email)), alt: '' }), h('b', null, nameOf(r.email)), h('span', { class: 'pk' }, keyLabel(r.key)), h('span', { class: 'pv' }, r.val))));
        }, 'answers');
        const rv = $('#prev-rv'); if (rv) rv.style.display = P.cur && P.cur.hasQuiz ? '' : 'none';
        const au = $('#pauto'); if (au) au.style.display = P.cur && P.cur.hasQuiz && live.ref ? '' : 'none';
    }
    // hello from a freshly opened student-like window
    P.on('msg', m => {
        if (!PRES || m.t !== 'hello') return;
        P.post(); publishOrd(); lcPost({ t: 'ui', patch: { board, zoom: Object.assign({}, zoom), laser: { on: false, ts: Date.now() } } });
        lcPost({ t: 'ink', key: inkKey(), strokes: ink[inkKey()] || [] });
        Object.keys(patches).forEach(k => { const m2 = /^p_([^_]+)_([^_]+)$/.exec(k); if (m2) lcPost({ t: 'patch', sid: m2[1], oid: m2[2], val: patches[k] }); });
    });

    // ------------------------------------------------------------------ boot
    let nx = 0;
    function init() {
        setupLayers();
        if (PRES && cv() && !cv()._bound) { cv()._bound = true; bindDrawing(); }
        try { Object.assign(patches, JSON.parse(localStorage.getItem(PKEY) || '{}')); Object.keys(patches).forEach(k => { const m = /^p_([^_]+)_([^_]+)$/.exec(k); if (m) applyPatchLocal(m[1], m[2], patches[k]); }); } catch (e) { /* ignore */ }
        if (PRES) {
            buildPresenter(); bindEditing();
            P.on('render', () => {
                safe(() => { const sl = slides[P.S], st = P.cur && P.cur.state ? P.cur.state() : null; if (sl.type === 'flash' || /^html:s?flash/.test(sl.tag || '') || (ROWMARK && /vocab|grammar/.test(sl.tag || '') && st && st.k >= 1 && (sl.anim || []).some(a => a.para))) { if (ord.used) advanceOrd(false); ord.used = true; } }, 'rot');
                renderNext(); safe(renderSide, 'side'); pushBoardInk(); simRespondQuiz(); setTimeout(updateTurn, 150);
            });
            P.on('state', () => { clearTimeout(nx); nx = setTimeout(renderNext, 80); safe(renderSide, 'side'); renderMarks(); });
            P.on('live', () => { restoreOrd(); buildOrd(false); safe(renderSide, 'side'); });
            P.on('resp', () => { safe(renderSide, 'side'); checkAuto(); syncQA(); updateTurn(); });
            document.addEventListener('keydown', e => {
                if (e.target && e.target.closest && e.target.closest('input,textarea,select,[contenteditable=true]')) return;
                if ($('#modal-root').firstElementChild) return;
                const k = e.key.toLowerCase(), m = { l: 'laser', p: 'pen', h: 'hl', e: 'eraser', z: 'zoom' }[k];
                if (m) { setTool(m); e.preventDefault(); }
                else if (k === 'escape') setTool('cursor');
                else if (k === 'n') advanceOrd(true); else if (k === 'b') setBoard('black'); else if (k === 'w') setBoard('white'); else if (k === 'g') openGrid();
            });
            renderSide(); renderNext();
        }
        redraw(); applyBoard();
    }
    function pushBoardInk() { lcPost({ t: 'ink', key: inkKey(), strokes: ink[inkKey()] || [] }); }
    if (P.cur) init(); else P.on('boot', init);
})();
