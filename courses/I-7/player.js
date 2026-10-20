/* 课件工坊 · 播放器（导出的课件网页和编辑器预览共用） */
(function () {
    'use strict';
    const CW = window.CW;
    const params = new URLSearchParams(location.search);
    const embed = params.get('embed') === '1';
    const MIRROR = params.get('role') === 'mirror';                 // clean window for Meet: follows the presenter through BroadcastChannel
    const STUDENT = params.get('role') === 'student' || MIRROR;     // view-only (+ answering for real students)
    const LIVE = params.get('live') || '', FIT = params.get('fit') === '1' || STUDENT;
    const ROLE = params.get('role') || (params.get('presenter') === '1' ? 'teacher' : '');
    const PRES = ROLE === 'teacher' && !embed;                      // presenter console (the teacher's own screen)
    const CODE = LIVE || 'local';
    const avatarBase = /\/studio\//.test(location.pathname) ? 'data/pixel/' : '../../img/pixel/';
    const avatarUrl = i => avatarBase + 'p' + (((i % 14) + 14) % 14 + 1) + '.png';
    const CWP = (window.CWP = { on(ev, fn) { (this._h[ev] = this._h[ev] || []).push(fn); }, emit(ev, a) { (this._h[ev] || []).forEach(fn => { try { fn(a); } catch (e) { console.warn(ev, e); } }); }, _h: {}, rvd: null });
    let lc = null;
    try { lc = new BroadcastChannel('cwlive-' + CODE); } catch (e) { lc = null; }
    const embed0 = embed;
    const opener = (() => { try { if (window.opener && window.opener.CW_PROJECT) return window.opener; if (embed && window.parent !== window && window.parent.CW_PROJECT) return window.parent; return null; } catch (e) { return null; } })();
    const project = window.LESSON_PROJECT || (opener && opener.CW_PROJECT);
    if (!project) { document.body.innerHTML = '<p style="padding:2rem;font:16px sans-serif">没有找到课件数据。</p>'; return; }
    const BUILD = (project.meta && project.meta.build) || 0;
    const resolve = window.CW_RESOLVE || (opener && opener.CW_RESOLVE) || (s => (BUILD && s && !/^(data:|https?:|blob:)/.test(s) ? s + '?v=' + BUILD : s));
    const KEY = 'cwp:' + (project.meta.title || 'x');
    const W = project.meta.W, H = project.meta.H;
    const APP_W = 1920, APP_H = 1080;
    const SC = APP_W / W;

    const $ = (s, r) => (r || document).querySelector(s);
    const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
    const esc = CW.esc;
    function h(tag, props, ...kids) {
        const el = document.createElement(tag);
        if (props) for (const k in props) {
            const v = props[k];
            if (v === false || v == null) continue;
            if (k === 'class') el.className = v; else if (k === 'html') el.innerHTML = v; else if (k === 'text') el.textContent = v;
            else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
            else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
            else el.setAttribute(k, v === true ? '' : v);
        }
        kids.flat(9).forEach(c => { if (c == null || c === false) return; el.append(c.nodeType ? c : document.createTextNode(c)); });
        return el;
    }
    const store = {
        get(k, d) { try { const v = localStorage.getItem(KEY + ':' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
        set(k, v) { try { localStorage.setItem(KEY + ':' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
    };

    // ------------------------------------------------------------ speech
    let zhVoice = null;
    function pickVoice() {
        if (!('speechSynthesis' in window)) return;
        const vs = speechSynthesis.getVoices();
        zhVoice = vs.find(v => /zh[-_]CN/i.test(v.lang) && /Xiaoxiao|Yunxi|Huihui|Yaoyao|Kangkang|Xiaoyi|Google/i.test(v.name)) || vs.find(v => /^zh/i.test(v.lang)) || null;
    }
    if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
    function speak(text, rate) {
        if (!('speechSynthesis' in window) || !text) return;
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'zh-CN'; if (zhVoice) u.voice = zhVoice; u.rate = rate || 0.85;
        speechSynthesis.speak(u);
    }
    const spkBtn = (text, cls) => STUDENT ? null : h('button', { class: 'spk ' + (cls || ''), title: '朗读', onclick: e => { e.stopPropagation(); speak(text); } }, '🔊');

    // ------------------------------------------------------------ Hanzi Writer data
    const hzCache = {};
    function hanziGet(ch) {
        if (window.HZ_DATA && window.HZ_DATA[ch]) return Promise.resolve(window.HZ_DATA[ch]);
        if (!hzCache[ch]) hzCache[ch] = fetch('https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/' + encodeURIComponent(ch) + '.json').then(r => { if (!r.ok) throw new Error('no data'); return r.json(); });
        return hzCache[ch];
    }

    // ------------------------------------------------------------ modals (viewport sized, outside the scaled app)
    let modalKeys = null;
    let modalSync = null, audioSync = null, videoSync = null, strokeCtl = null;      // what the teacher shows (stroke window, audio bar) -> sent to the students
    function closeModal() { const r = $('#modal-root'); const v = r.firstElementChild; if (v && v._close) v._close(); r.innerHTML = ''; modalKeys = null; strokeCtl = null; if (modalSync) { modalSync = null; post(); } }
    function openModal(content) {
        const root = $('#modal-root');
        root.innerHTML = '';
        const ov = h('div', { class: 'ov', onclick: e => { if (e.target === ov && !STUDENT) closeModal(); } });
        ov.append(h('div', { class: 'mdl' }, h('button', { class: 'mx', onclick: closeModal, title: '关闭 Esc' }, '×'), content));
        root.append(ov);
        return ov;
    }
    // 六书 + 部件 (makemeahanzi data), loaded on demand
    function ensureHzInfo(cb) {
        if (window.CW_HZINFO) return cb();
        const srcs = ['hzinfo.js', 'data/hzinfo.js'];
        const tryNext = () => { const s = srcs.shift(); if (!s) return cb(); const el = document.createElement('script'); el.src = s; el.onload = cb; el.onerror = () => { el.remove(); tryNext(); }; document.head.append(el); };
        tryNext();
    }
    const LIUSHU = { '象形': 'Tượng hình', '指事': 'Chỉ sự', '会意': 'Hội ý', '形声': 'Hình thanh', '转注': 'Chuyển chú', '假借': 'Giả tá' };
    // the teacher's own notes win: a line with the character, then a line "形声亻，象" / "象形" / "会意【爲】爪（手），象"
    function hzFromNotes(c) {
        for (const s of project.slides) {
            const lines = String(s.notes || '').split('\n').map(x => x.trim());
            if (s.vocab && s.vocab.han === c) lines.unshift(c);
            for (let i = 0; i < lines.length - 1; i++) {
                if (lines[i] !== c) continue;
                const m = /^(象形|指事|会意|形声|转注|假借)\s*(.*)$/.exec(lines[i + 1]);
                if (!m) continue;
                const head = m[2].split(/\t|本义/)[0];
                const trad = (head.match(/【[^】]*】/) || [''])[0];
                const rest = head.replace(/【[^】]*】/g, '').trim();
                return { t: m[1], rest, trad };
            }
        }
        return null;
    }
    function hzInfoText(c) {
        const n = hzFromNotes(c);
        if (n) {
            const type = LIUSHU[n.t];
            const part = (!n.rest && (n.t === '象形' || n.t === '指事')) ? 'Chữ độc thể' : (n.rest ? 'Bộ thủ: ' + CW.esc(n.rest) : '');
            return '<span>Lục thư: ' + type + '</span>' + ((n.trad || part) ? '<span class="bt">' + CW.esc(n.trad) + (n.trad && part ? ' ' : '') + part + '</span>' : '');
        }
        const r = (window.CW_HZINFO || {})[c]; if (!r) return '';
        const type = { x: 'Hình thanh', i: 'Hội ý', p: 'Tượng hình' }[r.t];
        if (r.t === 'p' || (!r.t && !r.d)) return (type ? '<span>Lục thư: ' + type + '</span>' : '') + '<span class="bt">Chữ độc thể</span>';
        let parts = r.t === 'x' ? [r.s, r.p] : r.t === 'i' ? Array.from(r.d || '') : [r.r];
        parts = parts.filter(Boolean);
        return (type ? '<span>Lục thư: ' + type + '</span>' : '') + (parts.length ? '<span class="bt">Bộ thủ: ' + CW.esc(parts.join('，')) + '</span>' : '');
    }
    function openStroke(word, startChar, remote) {
        if (!window.HanziWriter) { if (!remote) alert('笔顺组件未加载'); return; }
        const chars = Array.from(word.han || '').filter(CW.isCJK);
        if (!chars.length) return;
        let idx = Math.max(0, chars.indexOf(startChar)), writer = null, outline = true, shown = true, evn = 0, lastN = -1;
        const emit = (ev, extra) => { if (remote) return; evn++; modalSync = Object.assign({ w: { han: word.han, py: word.py, hv: word.hv, vi: word.vi }, c: chars[idx], ev, n: evn }, extra || {}); post(); };
        const S = 540;                                  // the window is part of the 1920x1080 slide: it scales with it
        const host = h('div', { class: 'swrap', style: { width: S + 'px', height: S + 'px' } });
        const msg = h('div', { class: 'smsg' });
        const tabs = h('div', { class: 'schars' });
        const mk = (label, fn, cls) => h('button', { class: 'btn ' + (cls || ''), onclick: fn }, label);
        const setMsg = t => { msg.innerHTML = t || ''; };
        const strokes = {};
        function load(i) {
            idx = i; host.innerHTML = ''; host.style.pointerEvents = ''; outline = true; shown = true;
            $$('button', tabs).forEach((b, k) => b.classList.toggle('on', k === i));
            setMsg('加载笔顺数据…');
            writer = HanziWriter.create(host, chars[i], {
                width: S - 6, height: S - 6, padding: Math.round(S * 0.05),
                showOutline: true, showCharacter: true, strokeColor: '#5F2C16', outlineColor: '#e6d8c8', highlightColor: '#C00000', drawingColor: '#432B20',
                drawingWidth: Math.max(14, S / 16), strokeAnimationSpeed: 1, delayBetweenStrokes: 320, showHintAfterMisses: 3,
                charDataLoader: (c, ok, bad) => hanziGet(c).then(d => { strokes[c] = d; setMsg(hzInfoText(c) || ('共 ' + d.strokes.length + ' 画')); ok(d); }).catch(e => { setMsg('没有这个字的笔顺数据（需要联网下载一次）'); if (bad) bad(e); }),
            });
        }
        chars.forEach((c, i) => tabs.append(h('button', { onclick: () => { load(i); emit('load'); } }, c)));
        const total = () => (strokes[chars[idx]] ? strokes[chars[idx]].strokes.length : '');
        // read-only board that repeats what the teacher does: outline + finished strokes + the live pen trail
        const NS = 'http://www.w3.org/2000/svg'; let watch = null;
        const watchStart = () => {
            const d = strokes[chars[idx]]; if (!d) return;
            if (writer) { try { writer.cancelQuiz(); } catch (er) { /* ignore */ } }
            const old = host.querySelector('svg'); if (old) old.style.visibility = 'hidden';
            const prev = host.querySelector('.watch'); if (prev) prev.remove();
            const wb = document.createElement('div'); wb.className = 'watch'; wb.style.cssText = 'position:absolute;inset:0;z-index:3;pointer-events:none';
            const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '-70 -70 1164 1164'); svg.style.cssText = 'width:100%;height:100%;display:block';
            const mk = (fill, op) => { const g = document.createElementNS(NS, 'g'); g.setAttribute('transform', 'scale(1,-1) translate(0,-900)'); svg.appendChild(g); return g; };
            const base = mk(); d.strokes.forEach(p => { const e = document.createElementNS(NS, 'path'); e.setAttribute('d', p); e.setAttribute('fill', '#e6d8c8'); base.appendChild(e); });
            const done = mk(), trail = document.createElementNS(NS, 'polyline');
            trail.setAttribute('fill', 'none'); trail.setAttribute('stroke', '#432B20'); trail.setAttribute('stroke-width', '34'); trail.setAttribute('stroke-linecap', 'round'); trail.setAttribute('stroke-linejoin', 'round'); svg.appendChild(trail);
            wb.appendChild(svg); host.appendChild(wb); host.style.pointerEvents = 'none'; watch = { d, done, trail, k: 0 }; setMsg('老师在写 · Cô đang viết…');
        };
        const watchTrail = tr => { if (!watch) watchStart(); if (!watch) return; watch.trail.setAttribute('points', (tr || []).map(p => ((p[0] * 1164) - 70).toFixed(0) + ',' + ((p[1] * 1164) - 70).toFixed(0)).join(' ')); };
        const watchStroke = k => { if (!watch) watchStart(); if (!watch) return; watch.trail.setAttribute('points', ''); while (watch.k < k && watch.k < watch.d.strokes.length) { const e = document.createElementNS(NS, 'path'); e.setAttribute('d', watch.d.strokes[watch.k]); e.setAttribute('fill', '#5F2C16'); watch.done.appendChild(e); watch.k++; } setMsg('✓ 第 ' + k + ' 笔'); };
        const watchMiss = () => { if (watch) watch.trail.setAttribute('points', ''); setMsg('再试一次 · Thử lại'); };
        const watchEnd = m => { if (watch) watch.trail.setAttribute('points', ''); setMsg('🎉 完成！共错 ' + (m || 0) + ' 次'); };
        const demo = () => { emit('demo'); writer.cancelQuiz(); setMsg('观看笔顺…'); writer.animateCharacter({ onComplete: () => setMsg(hzInfoText(chars[idx]) || ('共 ' + total() + ' 画')) }); };
        const loop = () => { emit('loop'); writer.cancelQuiz(); setMsg('循环示范（点“重置”停止）'); writer.loopCharacterAnimation(); };
        const practice = () => {
            emit('practice'); host.style.pointerEvents = '';
            if (!remote && !host._trailOn) {                       // teacher: send the pen trail (normalised 0..1) about every 120 ms
                host._trailOn = true; let tr = [], last = 0;
                const nrm = ev => { const r = host.getBoundingClientRect(); return [+((ev.clientX - r.left) / r.width).toFixed(3), +((ev.clientY - r.top) / r.height).toFixed(3)]; };
                host.addEventListener('pointerdown', ev => { tr = [nrm(ev)]; });
                host.addEventListener('pointermove', ev => { if (!tr.length || !(ev.buttons & 1)) return; tr.push(nrm(ev)); const n = Date.now(); if (n - last > 120) { last = n; emit('trail', { tr: tr.slice() }); } });
                const endTr = () => { if (tr.length) { tr = []; } };
                host.addEventListener('pointerup', endTr); host.addEventListener('pointercancel', endTr);
            }
            let miss = 0; setMsg('请按笔顺一笔一笔写（写错会有提示）');
            writer.quiz({ onMistake: () => { miss++; setMsg('再试一次 · Thử lại（' + miss + '）'); emit('miss', { k: miss }); }, onCorrectStroke: d => { setMsg('✓ 第 ' + (d.strokeNum + 1) + ' 笔'); emit('stroke', { k: d.strokeNum + 1 }); }, onComplete: d => { emit('done', { m: d.totalMistakes }); host.style.pointerEvents = 'none'; try { host.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); host.dispatchEvent(new TouchEvent('touchend', { bubbles: true })); } catch (e) { /* ignore */ } setMsg('🎉 完成！共错 ' + d.totalMistakes + ' 次'); if (idx + 1 < chars.length) setTimeout(() => { load(idx + 1); if (!remote) emit('load'); practice(); }, 900); if (STUDENT && !MIRROR && live.sendResp) live.sendResp(slides[S.i].id, 'w:' + chars[idx], d.totalMistakes, 'write'); } });
        };
        const body = h('div', { class: 'stroke' }, chars.length > 1 ? tabs : null, host, msg,
            h('div', { class: 'sbtns' }, mk('▶ 示范', demo, 'primary'), mk('🔁 循环', loop), mk('✍ 我来写', practice),
                mk('👁 字形', () => { emit('shape'); shown = !shown; shown ? writer.showCharacter() : writer.hideCharacter(); }),
                mk('▦ 轮廓', () => { emit('outline'); outline = !outline; outline ? writer.showOutline() : writer.hideOutline(); }),
                mk('↺ 重置', () => { load(idx); emit('load'); }),
                chars.length > 1 ? mk('下一个字 ▶', () => { load((idx + 1) % chars.length); emit('load'); }) : null));
        const head = h('div', { class: 'mhead' }, h('span', { class: 'hz' }, word.han), h('span', { class: 'mp' }, word.py || ''), h('span', { class: 'mv' }, [word.hv, word.vi].filter(Boolean).join(' · ')), spkBtn(word.han));
        const ov = openModal(h('div', null, head, body));
        modalKeys = e => {
            if (e.key === 'ArrowRight' && chars.length > 1) { load((idx + 1) % chars.length); emit('load'); return true; }
            if (e.key === 'ArrowLeft' && chars.length > 1) { load((idx + chars.length - 1) % chars.length); emit('load'); return true; }
            if (e.key === ' ' || e.key.toLowerCase() === 'd') { demo(); return true; }
            if (e.key.toLowerCase() === 'w') { practice(); return true; }
            if (e.key.toLowerCase() === 'r') { load(idx); return true; }
            return false;
        };
        strokeCtl = {
            han: word.han,
            apply(m) {
                const ci = chars.indexOf(m.c);
                if (m.n === lastN) return; lastN = m.n;
                if (m.ev === 'load') { if (ci >= 0) load(ci); }
                else { if (ci >= 0 && ci !== idx) load(ci); if (!writer) return; if (m.ev === 'demo') demo(); else if (m.ev === 'loop') loop(); else if (m.ev === 'practice') { if (MIRROR) { watch = null; watchStart(); } else practice(); } else if (MIRROR && m.ev === 'trail') watchTrail(m.tr); else if (MIRROR && m.ev === 'stroke') watchStroke(m.k); else if (MIRROR && m.ev === 'miss') watchMiss(); else if (MIRROR && m.ev === 'done') watchEnd(m.m); else if (m.ev === 'shape') { shown = !shown; shown ? writer.showCharacter() : writer.hideCharacter(); } else if (m.ev === 'outline') { outline = !outline; outline ? writer.showOutline() : writer.hideOutline(); } }
            },
        };
        ensureHzInfo(() => { load(Math.max(0, chars.indexOf(startChar))); emit('load'); });
    }
    function applyModal(m) {
        if (!m) { if (strokeCtl) closeModal(); return; }
        if (!strokeCtl || strokeCtl.han !== m.w.han) { openStroke(m.w, m.c, true); }
        setTimeout(() => { if (strokeCtl) strokeCtl.apply(m); }, 250);
    }
    CW.openStroke = openStroke; CW.strokeCtl = () => strokeCtl;

    // ------------------------------------------------------------ slides
    const slides = project.slides;
    function slideLabel(s, i) {
        if (s.name) return s.name;
        for (const o of s.objects || []) if (o.kind === 'box' && o.html) { const t = o.html.replace(/<[^>]+>/g, '').replace(/&#8203;|&nbsp;|​/g, '').trim(); if (t) return t.slice(0, 24); }
        return { flash: '闪卡', dialog: '课文' }[s.type] || '第 ' + (i + 1) + ' 页';
    }
    let S = { i: Math.min(+(params.get('s') || store.get('pos', 0)) || 0, slides.length - 1) };
    let cur = null;

    let popOff = null;          // the click-away listener of the open pop-up: it must go when the pop-up closes, or it closes the NEXT pop-up at once (second blank could not be filled)
    function closePop() { $$('.czpop').forEach(p => p.remove()); if (popOff) { popOff(); popOff = null; } }

    // ---- free slide
    function freeView(slide, opts) {
        const stage = CW.makeStage(project, slide, Object.assign({ mode: 'player', resolve }, opts || {}));
        stage.style.transform = `scale(${SC})`; stage.style.transformOrigin = '0 0';
        const holder = h('div', { class: 'slideview' + (opts && opts.overlay ? ' overlay' : '') }, stage);
        const runner = new CW.AnimRunner(stage, slide, W, H);
        let audio = null;
        const interactive = slide.objects.some(o => o.quiz || o.cloze);
        if (STUDENT && !MIRROR && interactive && stage._scwin) stage._scwin.classList.add('free');
        // video: the teacher's play / pause / seek goes to the students
        const vids = $$('video', stage);
        if (STUDENT) vids.forEach(v => { v.controls = false; v.preload = 'metadata'; });
        else if (ROLE === 'teacher') vids.forEach(v => {
            const id = v.closest('.o').dataset.id; let last = 0;
            const send = f => { const n = Date.now(); if (!f && n - last < 2000) return; last = n; videoSync = { id, p: !v.paused, t: +v.currentTime.toFixed(2), r: v.playbackRate, ts: n }; post(); };
            ['play', 'pause', 'seeked', 'ratechange', 'ended'].forEach(ev => v.addEventListener(ev, () => send(true)));
            v.addEventListener('timeupdate', () => { if (!v.paused) send(false); });
        });
        stage.addEventListener('click', e => {
            const t = e.target;
            if (STUDENT) { if (MIRROR) return; const q0 = t.closest('.qz'), c0 = t.closest('.cz'); if (q0) quizClick(q0); else if (c0) clozeClick(c0, e); return; }
            const tile = t.closest('.o-stroke');
            if (tile) { e.stopPropagation(); const o = CW.findObj(slide.objects, tile.dataset.id); if (o) openStroke(o.obj.word || { han: o.obj.char }, o.obj.char); return; }
            const qz = t.closest('.qz');
            if (qz) { e.stopPropagation(); quizClick(qz); return; }
            const cz = t.closest('.cz');
            if (cz) { e.stopPropagation(); clozeClick(cz, e); return; }
            const au = t.closest('.o-audio');
            if (au) { e.stopPropagation(); const ao = (CW.findObj(slide.objects, au.dataset.id) || {}).obj; toggleAudio($('audio', au), '', au.dataset.id); return; }
            if (t.closest('.o-video video') && t.closest('video').controls) { e.stopPropagation(); return; }
            const go = t.closest('[data-go]');
            if (go) { e.stopPropagation(); const k = slides.findIndex(s => s.id === go.dataset.go); if (k >= 0) goTo(k); return; }
            const u = t.closest('[data-url]');
            if (u) { e.stopPropagation(); window.open(u.dataset.url, '_blank'); return; }
        });
        // ---- choice questions: objects with quiz{q,opt,correct,m}
        function quizOptEls(q, opt) { return $$('.qz[data-q="' + q + '"][data-opt="' + opt + '"]', stage); }
        function quizFrame(q, opt, cls, badge) {
            const els = quizOptEls(q, opt); if (!els.length) return null;
            let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
            els.forEach(x => { x1 = Math.min(x1, x.offsetLeft); y1 = Math.min(y1, x.offsetTop); x2 = Math.max(x2, x.offsetLeft + x.offsetWidth); y2 = Math.max(y2, x.offsetTop + x.offsetHeight); });
            const fr = h('div', { class: 'qframe ' + cls, 'data-q': q, 'data-opt': opt }, badge ? h('span', { class: 'qbadge' }, badge) : null);
            Object.assign(fr.style, { left: (x1 - 8) + 'px', top: (y1 - 6) + 'px', width: (x2 - x1 + 16) + 'px', height: (y2 - y1 + 12) + 'px' });
            els[0].parentElement.append(fr);
            return fr;
        }
        // click = choose (blue frame only); the answer is shown later by quizReveal()
        function quizClick(el) {
            const q = el.dataset.q, opt = el.dataset.opt;
            if (stage.dataset.revealed || MIRROR) return;
            if (STUDENT && CWP.canAnswer && !CWP.canAnswer('q', q)) return;
            $$('.qframe[data-q="' + q + '"]', stage).forEach(x => x.remove());
            quizFrame(q, opt, 'sel');
            if (STUDENT && live.sendResp) live.sendResp(slide.id, 'q:' + q, opt, 'quiz');
        }
        function revealNow(data) {
            const qsOf = {}; CW.walkObjs(slide.objects, o => { if (o.quiz && o.quiz.q) (qsOf[o.quiz.q] = qsOf[o.quiz.q] || []).push(o); });
            Object.keys(qsOf).forEach(q => {
                const right = (qsOf[q].find(o => o.quiz.correct) || { quiz: {} }).quiz.opt;
                const chosen = ($('.qframe.sel[data-q="' + q + '"]', stage) || {}).dataset;
                $$('.qframe[data-q="' + q + '"]', stage).forEach(x => x.remove());
                if (!right) return;
                Array.from(new Set(qsOf[q].map(o => o.quiz.opt))).sort().forEach(opt => { if (opt === right) quizFrame(q, opt, 'ok', '✅'); else quizFrame(q, opt, 'bad', '❌'); });
            });
            stage.dataset.revealed = '1';
            if (data) Object.keys(data).forEach(q => {
                const d = data[q];
                Object.keys(d.opts || {}).forEach(opt => {
                    const fr = $('.qframe[data-q="' + q + '"][data-opt="' + opt + '"]', stage); if (!fr) return;
                    const avs = d.opts[opt] || [];
                    if (avs.length) fr.append(h('div', { class: 'qav' }, avs.map(i => h('img', { src: avatarUrl(i), alt: '' }))));
                    if (opt === d.right && d.n) fr.append(h('span', { class: 'qpct' }, Math.round(d.ok / d.n * 100) + '%'));
                });
            });
            post();
        }
        // ---- fill-in-the-blank: box with cloze{bank:[{k,t}],ans:[...]}
        function clozeClick(sp, ev0) {
            const host = sp.closest('.o'); const o = (CW.findObj(slide.objects, host.dataset.id) || {}).obj; if (!o) return;
            const cfg = o.cloze || {}, bank = cfg.bank || [], ans = cfg.ans || [], i = +sp.dataset.i;
            if (!sp._raw) sp._raw = sp.textContent;
            if (sp.classList.contains('ok') || sp.dataset.locked) return;
            if (STUDENT && CWP.canAnswer && !CWP.canAnswer('c', host.dataset.id + ':' + i)) return;
            const fill = (txt, cls) => { sp.textContent = txt; sp.classList.remove('ok', 'bad', 'sel'); if (cls) sp.classList.add(cls); if (STUDENT && live.sendResp && txt && txt !== sp._raw) live.sendResp(slide.id, 'c:' + host.dataset.id + ':' + i, txt, 'cloze'); };
            const key = ans[i];
            if (!bank.length) {
                if (ev0 && ev0.shiftKey && key) { fill(key, 'sel'); return; }
                if (sp.querySelector('input')) return;
                const inp = h('input', { class: 'czin', type: 'text', style: { width: Math.max(4, sp._raw.length) + 'ch' } });
                sp.textContent = ''; sp.append(inp); inp.focus();
                const done = () => { const v = inp.value.trim(); if (!v) { fill(sp._raw, ''); return; } if (!key) { fill(v, 'sel'); return; } if (v.toLowerCase() === String(key).toLowerCase()) fill(v, 'ok'); else { fill(v, 'bad'); setTimeout(() => { if (sp.classList.contains('bad')) fill(sp._raw, ''); }, 1200); } };
                inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') done(); if (e.key === 'Escape') fill(sp._raw, ''); });
                inp.addEventListener('blur', done); inp.addEventListener('click', e => e.stopPropagation());
                return;
            }
            closePop();
            const r = sp.getBoundingClientRect();
            const pop = h('div', { class: 'czpop' }, bank.map(b => h('button', {
                onclick: ev => {
                    ev.stopPropagation(); closePop();
                    if (!key) { fill(b.t, 'sel'); return; }
                    if (String(b.k).toLowerCase() === String(key).toLowerCase() || b.t === key) fill(b.t, 'ok');
                    else { fill(b.t, 'bad'); setTimeout(() => { if (sp.classList.contains('bad')) fill(sp._raw, ''); }, 900); }
                },
            }, h('b', null, b.k), ' ' + b.t)));
            document.body.append(pop);
            const pw = pop.offsetWidth;
            pop.style.left = Math.max(8, Math.min(innerWidth - pw - 8, r.left + r.width / 2 - pw / 2)) + 'px';
            const below = r.bottom + 8 + pop.offsetHeight < innerHeight;
            pop.style.top = (below ? r.bottom + 8 : r.top - pop.offsetHeight - 8) + 'px';
            setTimeout(() => { if (!pop.isConnected) return; document.addEventListener('click', closePop, { once: true }); popOff = () => document.removeEventListener('click', closePop); }, 0);
        }
        if (ROLE === 'teacher' && stage._scwin) { let st = 0; stage._scwin.addEventListener('scroll', () => { clearTimeout(st); st = setTimeout(post, 120); }); }
        return {
            el: holder, runner,
            sync(st) {
                if (!st || st.k == null) return;
                if (st.k > runner.k) { let n = 0; while (runner.k < st.k && n++ < 50) runner.next(); }
                else if (st.k < runner.k) runner.reset(st.k, false);
                if (st.rv && !stage.dataset.revealed) revealNow(st.rvd || null);
                else if (!st.rv && stage.dataset.revealed) this.reset();
                const w = stage._scwin;
                if (w && st.sc != null && !w.classList.contains('free')) w.scrollTo({ top: st.sc * Math.max(0, w.scrollHeight - w.clientHeight), behavior: 'smooth' });
            },
            relayout() { CW.relayoutScroll(stage, slide, false); if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => CW.relayoutScroll(stage, slide, false)); },
            scrollBy(dir) { const w = stage._scwin; if (!w || w.scrollHeight <= w.clientHeight + 2) return false; w.scrollBy({ top: dir * 160, behavior: 'smooth' }); return true; },
            quizReveal(data) { if (data === undefined && CWP.quizData) { data = CWP.quizData(slide); CWP.rvd = data; } revealNow(data); }, hasQuiz: slide.objects.some(o => o.quiz), slide,
            reset() { const had = stage.dataset.revealed; delete stage.dataset.revealed; CWP.rvd = null; $$('.qframe', stage).forEach(x => x.remove()); $$('.cz', stage).forEach(x => { if (x._raw) x.textContent = x._raw; x.classList.remove('ok', 'bad', 'sel'); }); if (had && ROLE === 'teacher') post(); },
            destroy() { closePop(); $$('audio,video', holder).forEach(m => m.pause()); hideBar(); videoSync = null; },
            next() { return runner.next(); }, prev() { return runner.prev(); },
            finish() { runner.finish(); },
            state: () => { const w = stage._scwin; return { k: runner.k, total: runner.total, rv: !!stage.dataset.revealed, sc: w && w.scrollHeight > w.clientHeight ? +(w.scrollTop / (w.scrollHeight - w.clientHeight)).toFixed(4) : null }; },
        };
    }

    // ---- audio bar (slides up from the bottom, can be collapsed)
    let barAudio = null, barEl = null;
    function toggleAudio(a, icon, id) {
        if (!a) return;
        showBar(a, icon, id);
        if (a.paused) a.play(); else a.pause();
    }
    function ensureBar() {
        if (barEl) return barEl;
        const play = h('button', { class: 'play' }, '▶');
        const range = h('input', { type: 'range', min: 0, max: 1000, value: 0 });
        const t1 = h('span', null, '0:00'), t2 = h('span', null, '0:00');
        const speed = h('select', null, [0.75, 0.9, 1, 1.15].map(v => h('option', { value: v, selected: v === 1 }, v + '×')));
        barEl = h('div', { class: 'pbar' }, play, h('div', { class: 'bar' }, range, h('div', { class: 'tm' }, t1, t2)), speed,
            h('button', { class: 'btn sm', onclick: () => { if (barAudio) { barAudio.currentTime = 0; barAudio.play(); } } }, '↺'),
            h('button', { class: 'btn sm', title: '收起播放条', onclick: () => barEl.classList.remove('show') }, '⌄'));
        barEl._ = { play, range, t1, t2, speed };
        play.onclick = () => { if (barAudio) { barAudio.paused ? barAudio.play() : barAudio.pause(); } };
        range.oninput = () => { if (barAudio && barAudio.duration) barAudio.currentTime = barAudio.duration * range.value / 1000; };
        speed.onchange = () => { if (barAudio) { barAudio.playbackRate = +speed.value; audioPost(true); } };
        $('#app').append(barEl);
        return barEl;
    }
    const fmt = s => { s = Math.floor(s || 0); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
    let barAudioId = '', lastAuPost = 0;
    function audioPost(force) {
        if (!barAudio) return;
        const now = Date.now(); if (!force && now - lastAuPost < 2000) return; lastAuPost = now;
        audioSync = { id: barAudioId, p: !barAudio.paused, t: +barAudio.currentTime.toFixed(2), r: barAudio.playbackRate, ts: now }; post();
    }
    function showBar(a, icon, id) {
        const b = ensureBar();
        barAudioId = id || barAudioId;
        b._.play.style.backgroundImage = icon ? 'url("' + icon + '")' : '';
        b._.play.classList.toggle('ico', !!icon);
        if (barAudio !== a) {
            if (barAudio) barAudio.pause();
            barAudio = a;
            a.ontimeupdate = () => { b._.range.value = a.duration ? a.currentTime / a.duration * 1000 : 0; b._.t1.textContent = fmt(a.currentTime); b._.t2.textContent = fmt(a.duration); if (!a.paused) audioPost(false); };
            a.onseeked = () => audioPost(true);
            a.onplay = () => { b._.play.textContent = '⏸'; b._.play.classList.add('playing'); audioPost(true); };
            a.onpause = () => { b._.play.textContent = '▶'; b._.play.classList.remove('playing'); audioPost(true); };
            a.onloadedmetadata = () => { b._.t2.textContent = fmt(a.duration); };
        }
        requestAnimationFrame(() => b.classList.add('show'));
    }
    function hideBar() { if (barEl) barEl.classList.remove('show'); if (barAudio) { barAudio.onpause = null; barAudio.pause(); barAudio = null; } audioSync = null; }
    function applyVideo(vd) {
        if (!vd) return;
        const v = $('.o[data-id="' + vd.id + '"] video'); if (!v) return;
        const go = () => {
            const want = vd.p ? vd.t + Math.max(0, Math.min(5, (Date.now() - vd.ts) / 1000)) * (vd.r || 1) : vd.t;
            if (Math.abs(v.currentTime - want) > 1.2) { try { v.currentTime = want; } catch (e) { /* ignore */ } }
            v.playbackRate = vd.r || 1;
            if (vd.p && v.paused) v.play().catch(() => { v.muted = true; v.play().catch(() => { }); });
            else if (!vd.p && !v.paused) v.pause();
        };
        if (v.readyState < 1) { v.addEventListener('loadedmetadata', go, { once: true }); v.load(); } else go();
    }
    function applyAudio(au) {
        if (!au) { if (barAudio) hideBar(); return; }
        const a = $('.o[data-id="' + au.id + '"] audio'); if (!a) return;
        showBar(a, '', au.id);
        const go = () => {
            const want = au.p ? au.t + Math.max(0, Math.min(5, (Date.now() - au.ts) / 1000)) * (au.r || 1) : au.t;
            if (Math.abs(a.currentTime - want) > 1.2) { try { a.currentTime = want; } catch (e) { /* ignore */ } }
            a.playbackRate = au.r || 1;
            if (au.p && a.paused) a.play().catch(() => { });
            else if (!au.p && !a.paused) a.pause();
        };
        if (a.readyState < 1) { a.preload = 'metadata'; a.addEventListener('loadedmetadata', go, { once: true }); a.load(); } else go();
    }

    // ---- flashcards
    function flashView(slide) {
        const words = (slide.flash && slide.flash.words) || [];
        const cfg = Object.assign({ shuffle: false, front: 'han', auto: false, showHv: true, size: 1 }, store.get('flashCfg', {}));
        if (STUDENT) { cfg.shuffle = false; cfg.front = 'han'; cfg.size = 1; }
        let order = [], pos = 0, flipped = false;
        const root = h('div', { class: 'panel flash' + (slide.flash && slide.flash.sent ? ' sent' : '') });
        const fcfg = (slide.flash && slide.flash.frame) || null;
        if (fcfg && fcfg.color) root.style.background = fcfg.color;
        if (fcfg && fcfg.radius != null) root.style.borderRadius = (fcfg.radius * 0.6) + 'rem';
        const SENT = !!(slide.flash && slide.flash.sent);
        const lineOf = t => String(t).split(/[|｜\s]+/).filter(Boolean);
        const maxLine = Math.max(6, ...words.map(w => Math.max(0, ...lineOf(w.han).map(l => Array.from(l).length))));
        function rebuild() {
            order = words.map((_, i) => i);
            if (cfg.shuffle) for (let a = order.length - 1; a > 0; a--) { const b = Math.floor(Math.random() * (a + 1)); [order[a], order[b]] = [order[b], order[a]]; }
            pos = 0; flipped = false;
        }
        rebuild();
        const saveCfg = () => { if (!STUDENT) store.set('flashCfg', cfg); };
        let showSet = false;
        function faceHtml(w, side) {
            const big = t => `<div class="big ${Array.from(t).length > 5 ? 'xl' : ''}">${esc(t)}</div>`;
            if (side === 'front') {
                if (cfg.front === 'han') return big(w.han);
                if (cfg.front === 'py') return `<div class="py" style="font-size:4.4rem">${esc(w.py)}</div>`;
                return `<div class="vi" style="font-size:3.4rem">${esc(w.vi || '（暂无词义）')}</div>`;
            }
            const parts = [];
            if (cfg.front !== 'han') parts.push(`<div class="fhan">${esc(w.han)}</div>`);
            if (cfg.front !== 'py') parts.push(`<div class="py">${esc(w.py)}</div>`);
            if (cfg.showHv && w.hv) parts.push(`<div class="hv">${esc(w.hv)}</div>`);
            if (cfg.front !== 'vi') parts.push(`<div class="vi">${esc(w.vi || '（暂无词义）')}</div>`);
            return parts.join('');
        }
        function settingsBox() {
            const sel = h('select', { onchange: e => { cfg.front = e.target.value; saveCfg(); draw(); } }, [['han', '汉字'], ['py', '拼音'], ['vi', '词义']].map(([v, t]) => h('option', { value: v, selected: cfg.front === v }, t)));
            return h('div', { class: 'fsettings' }, h('label', null, '先看：', sel),
                h('label', null, h('input', { type: 'checkbox', checked: cfg.showHv, onchange: e => { cfg.showHv = e.target.checked; saveCfg(); draw(); } }), '背面显示汉越音'),
                h('label', null, h('input', { type: 'checkbox', checked: cfg.auto, onchange: e => { cfg.auto = e.target.checked; saveCfg(); } }), '翻页自动朗读'));
        }
        // change the size in place: the card keeps its word and its flip state, nothing is redrawn
        function sizeTo(d) { cfg.size = Math.max(.5, Math.min(1.8, +(cfg.size + d).toFixed(2))); saveCfg(); root.style.setProperty('--fz', cfg.size); post(); }
        function flip() { flipped = !flipped; const c = $('.fcard', root); if (c) c.classList.toggle('flip', flipped); post(); }
        function nextCard() { if (view.next()) return; goTo(S.i + 1); }
        function prevCard() { if (view.prev()) return; goTo(S.i - 1, true); }
        function draw() {
            root.innerHTML = '';
            if (!words.length) { root.append(h('div', { class: 'fempty' }, '这一页的闪卡还没有词语。')); return; }
            const w = words[order[pos]];
            const seg = h('div', { class: 'seg' },
                h('button', { class: cfg.shuffle ? '' : 'on', onclick: () => { cfg.shuffle = false; saveCfg(); rebuild(); draw(); } }, '▶ 顺序'),
                h('button', { class: cfg.shuffle ? 'on' : '', onclick: () => { cfg.shuffle = true; saveCfg(); rebuild(); draw(); } }, '🔀 随机'));
            const tools = h('div', { class: 'ftools' }, seg,
                h('button', { class: 'btn sm', onclick: () => { rebuild(); draw(); } }, '↺ 重来'),
                h('button', { class: 'btn sm' + (showSet ? ' on' : ''), onclick: () => { showSet = !showSet; draw(); } }, '⚙ 设置'),
                h('button', { class: 'btn sm', title: '字小一点', onclick: () => sizeTo(-.1) }, 'A−'), h('button', { class: 'btn sm', title: '字大一点', onclick: () => sizeTo(.1) }, 'A+'),
                h('span', { class: 'fcount' }, (pos + 1) + ' / ' + order.length));
            if (SENT) {
                const sz = Math.min(5.6, 46 / maxLine) * (slide.flash.fz || 1);
                const lines = lineOf(w.han).map(l => '<div class="sl">' + esc(l) + '</div>').join('');
                const sc = h('div', { class: 'fcard sent' + (flipped ? ' flip' : ''), onclick: flip }, h('div', { class: 'sbody', style: { '--sz': sz + 'rem' } }, h('div', { class: 'shan', html: lines }), h('div', { class: 'sre', html: '<div class="py">' + esc(w.py || '') + '</div><div class="vi">' + esc(w.vi || '') + '</div>' })));
                root.style.setProperty('--fz', cfg.size);
                const scorner = h('div', { class: 'corner' }, spkBtn(String(w.han).replace(/[|｜]/g, '')));
                root.append(tools, h('div', { class: 'fstage' }, h('button', { class: 'fnav', onclick: prevCard, title: '上一张 ←' }, '‹'), h('div', { class: 'fwrap' }, sc, scorner), h('button', { class: 'fnav', onclick: nextCard, title: '下一张 →' }, '›')));
                return;
            }
            const front = h('div', { class: 'fface front', html: faceHtml(w, 'front') });
            const back = h('div', { class: 'fface back', html: faceHtml(w, 'back') });
            const corner = h('div', { class: 'corner' }, spkBtn(w.han), h('button', { title: '笔顺', onclick: e => { e.stopPropagation(); openStroke(w); } }, '✍'));
            root.style.setProperty('--fz', cfg.size);
            const card = h('div', { class: 'fcard' + (flipped ? ' flip' : ''), onclick: flip }, h('div', { class: 'in' }, front, back));
            if (showSet) root.append(h('div', { class: 'fsetwrap' }, settingsBox()));
            root.append(tools, h('div', { class: 'fstage' }, h('button', { class: 'fnav', onclick: prevCard, title: '上一张 ←' }, '‹'), h('div', { class: 'fwrap' }, card, corner), h('button', { class: 'fnav', onclick: nextCard, title: '下一张 →' }, '›')));
        }
        draw();
        const view = {
            el: root, comp: true, sectionNav: true,
            next() { if (pos < order.length - 1) { pos++; flipped = false; draw(); if (cfg.auto) speak(words[order[pos]].han); return true; } return false; },
            prev() { if (pos > 0) { pos--; flipped = false; draw(); return true; } return false; },
            key(e) {
                const k = e.key.toLowerCase();
                if (k === ' ' || k === 'enter' || k === 'arrowup' || k === 'arrowdown') { flip(); return true; }
                if (k === 's') { cfg.shuffle = !cfg.shuffle; saveCfg(); rebuild(); draw(); return true; }
                return false;
            },
            state: () => ({ pos: pos + 1, total: order.length, w: order[pos], f: flipped, fz: cfg.size, fr: cfg.front, hv: cfg.showHv }),
            sync(s) {
                if (!s || s.w == null) return;
                const i = order.indexOf(s.w); if (i < 0) return;
                const same = i === pos && cfg.front === s.fr && cfg.showHv === s.hv;
                cfg.size = s.fz || 1; cfg.front = s.fr || 'han'; cfg.showHv = s.hv !== false;
                if (same) { root.style.setProperty('--fz', cfg.size); flipped = !!s.f; const c = $('.fcard', root); if (c) c.classList.toggle('flip', flipped); return; }
                pos = i; flipped = !!s.f; draw();
            },
        };
        return view;
    }

    // ---- dialogue (课文)
    function dialogView(slide) {
        const d = slide.dialog || { lines: [] };
        const prose = d.lines.length > 0 && d.lines.every(l => !(l.speaker || l.name));
        let py = d.py != null ? !!d.py : store.get('textPy', false), fsz = d.fz ? +(2.3 * d.fz).toFixed(2) : store.get('textSz', 2.3), hl = store.get('textHl', false);
        let ind = store.get('textInd', true), plh = store.get('textLh', 1.9);
        const vocab = Array.from(new Set(slides.filter(s => s.vocab && s.vocab.han).flatMap(s => String(s.vocab.han).split(/[\/／、]/)))).filter(Boolean).sort((a, b) => b.length - a.length);
        const dlg = h('div', { class: 'dlg' + (py ? '' : ' nopy') + (hl ? ' hl' : '') });
        if (d.reserve) dlg.style.marginRight = (d.reserve * SC) + 'px';          // room on the right for pictures placed on the page
        function marks(text) {
            const m = new Array(text.length).fill(false);
            vocab.forEach(w => { let i = text.indexOf(w); while (i >= 0) { for (let k = 0; k < w.length; k++) m[i + k] = true; i = text.indexOf(w, i + w.length); } });
            return m;
        }
        function lineEl(l, idx) {
            const side = l.side || (idx % 2 === 0 ? 'left' : 'right');
            const text = (l.tokens || []).map(t => t.z != null ? t.z : t.t).join('');
            const mk = marks(text);
            const toks = (l.tokens || []).map((t, i) => {
                const cl = mk[i] ? ' v' : '';
                return t.z != null ? h('span', { class: 'c' + cl }, h('i', null, t.p), h('span', null, t.z)) : h('span', { class: 't' + cl }, t.t);
            });
            const b = h('div', { class: 'bubble' + (prose ? ' prose' : ''), style: { fontSize: fsz + 'rem' }, onclick: () => { if (!STUDENT) speak(text); } }, toks);
            const av = l.avatar || (project.speakers || {})[l.speaker];
            if (!(l.speaker || l.name)) return h('div', { class: 'line narr' }, b);
            return h('div', { class: 'line ' + side }, h('div', { class: 'av' }, h('div', { class: 'frame' }, av ? h('img', { src: resolve(av), alt: '' }) : null), h('b', null, l.speaker || l.name)), b);
        }
        function draw() {
            dlg.innerHTML = ''; d.lines.forEach((l, i) => dlg.append(lineEl(l, i)));
            dlg.classList.toggle('nopy', !py); dlg.classList.toggle('hl', hl);
            dlg.style.setProperty('--ind', ind ? '2em' : '0'); dlg.style.setProperty('--plh', plh);
            dlg.style.setProperty('--avs', d.avs || 1.3); dlg.style.setProperty('--lgap', ((d.gap != null ? d.gap : 1.6) * .625) + 'rem');
        }
        draw();
        const sv = (k, v) => { if (!STUDENT) store.set(k, v); };
        const tg = (label, get, set, title) => { const b = h('button', { class: 'btn sm' + (get() ? ' on' : ''), title, onclick: () => { set(!get()); b.classList.toggle('on', get()); draw(); post(); } }, label); return b; };
        const bar = h('div', { class: 'thead' }, h('h2', null, d.title || slide.name || '课文'), h('div', { class: 'intro' }, d.intro || ''),
            STUDENT ? null : tg('拼', () => py, v => { py = v; sv('textPy', v); }, '显示 / 隐藏拼音'),
            tg('生词', () => hl, v => { hl = v; sv('textHl', v); }, '高亮本课生词'),
            prose ? tg('缩进', () => ind, v => { ind = v; sv('textInd', v); }, '首行缩进') : null,
            prose ? h('button', { class: 'btn sm', title: '行距小一点', onclick: () => { plh = Math.max(1.2, +(plh - .15).toFixed(2)); sv('textLh', plh); draw(); post(); } }, '≡−') : null,
            prose ? h('button', { class: 'btn sm', title: '行距大一点', onclick: () => { plh = Math.min(3.2, +(plh + .15).toFixed(2)); sv('textLh', plh); draw(); post(); } }, '≡+') : null,
            h('button', { class: 'btn sm', title: '字小一点', onclick: () => { fsz = Math.max(1.4, fsz - .2); sv('textSz', fsz); draw(); post(); } }, 'A−'),
            h('button', { class: 'btn sm', title: '字大一点', onclick: () => { fsz = Math.min(6, fsz + .2); sv('textSz', fsz); draw(); post(); } }, 'A+'));
        let scT = 0;
        if (ROLE === 'teacher') dlg.addEventListener('scroll', () => { clearTimeout(scT); scT = setTimeout(post, 120); });
        const dstate = () => ({ py, hl, fsz, ind, plh, sc: dlg.scrollHeight > dlg.clientHeight ? +(dlg.scrollTop / (dlg.scrollHeight - dlg.clientHeight)).toFixed(4) : 0 });
        const dsync = s => {
            if (!s || s.fsz == null) return;
            const ch = py !== s.py || hl !== s.hl || fsz !== s.fsz || ind !== s.ind || plh !== s.plh;
            py = s.py; hl = s.hl; fsz = s.fsz; ind = s.ind; plh = s.plh;
            if (ch) draw();
            if (s.sc != null) dlg.scrollTo({ top: s.sc * Math.max(0, dlg.scrollHeight - dlg.clientHeight), behavior: 'smooth' });
        };
        return { state: dstate, sync: dsync, el: h('div', { class: 'panel text' }, bar, d.image ? h('div', { class: 'dwrap' }, dlg, h('img', { class: 'dimg', src: resolve(d.image), alt: '' })) : dlg), comp: true };
    }

    // ------------------------------------------------------------ shell
    function sectionsOf() {
        const out = []; let last = null;
        slides.forEach((s, i) => { const sec = s.section || ''; if (!last || last.name !== sec) { last = { name: sec, items: [] }; out.push(last); } last.items.push(i); });
        return out;
    }
    function buildOutline() {
        const o = $('#outline'); o.innerHTML = '';
        sectionsOf().forEach(sec => {
            if (sec.name) o.append(h('h3', null, sec.name));
            sec.items.forEach(i => o.append(h('button', { class: 'oi', 'data-i': i, onclick: () => goTo(i) }, h('span', { class: 'ic' }, { flash: '🃏', dialog: '💬' }[slides[i].type] || '▫️'), slideLabel(slides[i], i), h('small', null, i + 1))));
        });
    }
    function render(opts) {
        opts = opts || {};
        const s = slides[S.i];
        if (cur && cur.destroy) cur.destroy();
        if ('speechSynthesis' in window) speechSynthesis.cancel();
        const view = $('#view'); const olds = Array.from(view.children);
        const root = h('div', { class: 'slidelayer' }); view.append(root);
        const bgFor = () => { const lay = CW.layoutOf(project, s); return s.bg || (lay && lay.bg) || null; };
        if (s.type === 'flash' || s.type === 'dialog') {
            // component slide: the slide's own background + (optional) free objects underneath
            const bgSt = CW.makeStage(project, s, { mode: 'player', resolve, noObjects: true }); bgSt.style.transform = `scale(${SC})`; bgSt.style.transformOrigin = '0 0';
            const top = freeView(s, { overlay: true });
            const comp = s.type === 'flash' ? flashView(s) : dialogView(s);
            const wrap = h('div', { class: 'compwrap' }, h('div', { class: 'slideview' }, bgSt), h('div', { class: 'compfront' }, comp.el), top.el);
            root.append(wrap); if (top.relayout) top.relayout();
            cur = Object.assign({}, comp, { destroy() { top.destroy(); }, el: wrap });
            document.body.classList.remove('freemode'); document.body.classList.add('compmode');
        } else {
            cur = freeView(s);
            root.append(cur.el); if (cur.relayout) cur.relayout();
            if (cur.hasQuiz && !STUDENT) root.append(h('button', { class: 'revbtn', onclick: e => { e.stopPropagation(); cur.quizReveal(); } }, '显示答案 ✅'));
            document.body.classList.add('freemode'); document.body.classList.remove('compmode');
            if (opts.fromEnd) cur.finish();
        }
        $('#crumb').innerHTML = (s.section ? `<b>${esc(s.section)}</b> · ` : '') + esc(slideLabel(s, S.i));
        $('#pos').textContent = (S.i + 1) + ' / ' + slides.length;
        $('#progress i').style.width = (S.i / Math.max(1, slides.length - 1) * 100) + '%';
        $('#prev').disabled = S.i === 0; $('#next').disabled = S.i === slides.length - 1;
        $$('#outline .oi').forEach(b => b.classList.toggle('cur', +b.dataset.i === S.i));
        store.set('pos', S.i);
        const dir = opts.dir || 0;
        if (dir && olds.length && root.animate) {
            const opt = { duration: 480, easing: 'cubic-bezier(.65,0,.25,1)', fill: 'backwards' };
            root.animate([{ transform: 'translateY(' + (dir * 100) + '%)' }, { transform: 'translateY(0)' }], opt);
            const a = olds.map(o => o.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(' + (-dir * 100) + '%)' }], opt));
            setTimeout(() => olds.forEach(o => o.remove()), 500);
        } else olds.forEach(o => o.remove());
        post();
        preload(S.i, 4);
        CWP.emit('render');
    }
    function goTo(i, fromEnd) { if (i < 0 || i >= slides.length) return; const dir = i === S.i ? 0 : (i > S.i ? 1 : -1); S.i = i; render({ fromEnd, dir }); closeOutline(); }
    function next() { if (cur && cur.next && cur.next()) { post(); CWP.emit('advance'); return; } if (S.i < slides.length - 1) goTo(S.i + 1); }
    function prev() { if (cur && cur.prev && cur.prev()) { post(); return; } if (S.i > 0) goTo(S.i - 1, true); }
    function toggleOutline() { $('#outline').classList.toggle('on'); }
    function closeOutline() { $('#outline').classList.remove('on'); }
    function setTopHidden(on) { document.body.classList.toggle('notop', !!on || embed); if (!embed) store.set('hideTop', !!on); }

    // ------------------------------------------------------------ full screen / fixed size
    function isFullScreen() { return FIT || !!document.fullscreenElement || (Math.abs(innerWidth - screen.width) < 3 && Math.abs(innerHeight - screen.height) < 3); }
    function applyScale() {
        const app = $('#app'), box = $('#appbox'); if (!app) return;
        if (PRES) { const ps = $('#pstage'); if (ps) { const w = ps.clientWidth, hh = ps.clientHeight, s = Math.min(w / APP_W, hh / APP_H); box.style.width = w + 'px'; box.style.height = hh + 'px'; app.style.transform = 'translate(' + (w - APP_W * s) / 2 + 'px,' + (hh - APP_H * s) / 2 + 'px) scale(' + s + ')'; app.dataset.scale = s; return; } }
        const fs = isFullScreen();
        document.body.classList.toggle('fs', fs);
        if (fs) { const s = Math.min(innerWidth / APP_W, innerHeight / APP_H); box.style.width = innerWidth + 'px'; box.style.height = innerHeight + 'px'; app.style.transform = 'translate(' + (innerWidth - APP_W * s) / 2 + 'px,' + (innerHeight - APP_H * s) / 2 + 'px) scale(' + s + ')'; }
        else { const s = document.documentElement.clientWidth / APP_W; box.style.width = APP_W * s + 'px'; box.style.height = APP_H * s + 'px'; app.style.transform = 'scale(' + s + ')'; }
    }

    // ------------------------------------------------------------ teacher view
    let bc = null, popup = null;
    try { bc = new BroadcastChannel('cwp-' + (project.meta.title || 'x')); } catch (e) { bc = null; }
    function meta() { return { t: 'meta', title: project.meta.title, slides: slides.map((s, i) => ({ name: slideLabel(s, i), section: s.section || '', notes: s.notes || '', type: s.type, words: s.type === 'flash' ? ((s.flash && s.flash.words) || []).length : 0 })) }; }
    function post() {
        liveSend();
        if (PRES && lc) { try { lc.postMessage({ t: 'state', state: { i: S.i, st: fullState(), ts: Date.now() } }); } catch (e) { /* ignore */ } }
        CWP.emit('state');
        const m = { t: 'state', i: S.i, state: fullState() };
        try { bc && bc.postMessage(m); } catch (e) { /* ignore */ }
        if (popup && !popup.closed) { try { popup.postMessage(m, '*'); } catch (e) { /* ignore */ } }
    }
    function onMsg(m) {
        if (!m || !m.t) return;
        if (m.t === 'cmd') {
            if (m.c === 'next') next(); else if (m.c === 'prev') prev(); else if (m.c === 'goto') goTo(m.i);
            else if (m.c === 'hello') { const mm = meta(); try { bc && bc.postMessage(mm); } catch (e) { /* ignore */ } if (popup && !popup.closed) popup.postMessage(mm, '*'); post(); }
        }
    }
    addEventListener('message', e => onMsg(e.data));
    if (bc) bc.onmessage = e => onMsg(e.data);
    function openTeacher() { popup = window.open('teacher.html?k=' + encodeURIComponent(project.meta.title || 'x'), 'cw_teacher'); setTimeout(() => { onMsg({ t: 'cmd', c: 'hello' }); }, 900); }

    function openHelp() {
        const rows = [['→ / 空格 / 点页面', '下一步（有动画先播动画，再翻页）'], ['←', '上一步'], ['点汉字方块', '弹出笔顺窗口'], ['闪卡：点卡片 / 空格', '翻面'], ['闪卡：← →', '上 / 下一张'], ['闪卡：S', '顺序 ⇄ 随机'], ['O', '目录'], ['H', '隐藏 / 显示页眉'], ['P', '讲者视图（备注）'], ['F', '全屏'], ['Esc', '关闭弹窗']];
        openModal(h('div', { class: 'helpbox' }, h('h3', null, '操作说明'), h('table', null, rows.map(r => h('tr', null, h('td', null, r[0]), h('td', null, r[1]))))));
    }

    // ---- the assistant's html pages (flash / dialogue / quiz) inside the slide: teacher's clicks, changes and pen strokes are replayed on the other screens
    const HV = { id: '', ev: [] }, HQ = { id: '', data: null };
    let pendingHv = null, pendingHq = null;
    function htmlFrame() { return $('.o-html iframe', document); }
    function applyHtml(hv, hq) {
        if (hq !== undefined) pendingHq = hq;
        if (ROLE !== 'teacher' && pendingHq && slides[S.i] && pendingHq.id === slides[S.i].id) { const f2 = htmlFrame(); if (f2 && f2._ready && !f2._revealed) { f2._revealed = true; f2.contentWindow.postMessage({ cwb: 1, k: 'reveal', data: pendingHq.data }, '*'); } }
        pendingHv = hv || pendingHv; hv = pendingHv; if (ROLE === 'teacher' || !hv || !slides[S.i] || hv.id !== slides[S.i].id) return;
        const fr = htmlFrame(); if (!fr || !fr._ready) return;
        const from = fr._applied || 0;
        if (hv.ev.length < from) { fr._applied = 0; fr._ready = false; fr.srcdoc = fr.srcdoc; return; }          // the teacher restarted the page
        const fresh = hv.ev.slice(from); if (fresh.length) fr.contentWindow.postMessage({ cwb: 1, k: 'apply', ev: fresh }, '*');
        fr._applied = hv.ev.length;
    }
    window.addEventListener('message', e => {
        const m = e.data; if (!m || !m.cwb) return;
        const fr = $$('.o-html iframe', document).find(f => f.contentWindow === e.source); if (!fr) return;
        if (m.k === 'ready') {
            fr._ready = true; fr._applied = 0;
            e.source.postMessage({ cwb: 1, k: 'role', role: MIRROR ? 'mirror' : STUDENT ? 'student' : ROLE === 'teacher' ? 'teacher' : 'view' }, '*');
            if (ROLE === 'teacher') { HV.id = slides[S.i].id; HV.ev = []; HQ.id = ''; HQ.data = null; post(); } else applyHtml();
            CWP.emit('htmlready');
            return;
        }
        if (m.k === 'quiz') { fr._quiz = m.qs; return; }
        if (m.k === 'ans' && STUDENT && !MIRROR) {
            const key = String(m.q + 1);
            if (CWP.canAnswer && !CWP.canAnswer('q', key)) { e.source.postMessage({ cwb: 1, k: 'deny', q: m.q }, '*'); return; }
            if (live.sendResp) live.sendResp(slides[S.i].id, 'q:' + key, String.fromCharCode(65 + m.o), 'quiz');
            return;
        }
        if (ROLE !== 'teacher') return;
        if (m.k === 'rev') { CWP.htmlQuizReveal(); return; }
        if (m.k === 'ev' && HV.ev.length < 2500) { HV.ev.push(m.e); post(); }
        else if (m.k === 'nav' && m.a === 'next') CWP.emit('advance');
    });
    // teacher: show the quiz answers on every screen, with each student's avatar under the option they chose and the share of right answers
    CWP.htmlQuizReveal = () => {
        const fr = htmlFrame(); if (!fr || !fr._quiz || HQ.data) return;
        const sl = slides[S.i]; HQ.id = sl.id;
        HQ.data = CWP.htmlQuizData ? CWP.htmlQuizData(sl, fr._quiz) : {};
        fr.contentWindow.postMessage({ cwb: 1, k: 'reveal', data: HQ.data }, '*'); post();
    };
    CWP.htmlQuizInfo = () => { const fr = htmlFrame(); return fr && fr._quiz ? fr._quiz : null; };
    CWP.htmlQuizDone = () => !!HQ.data;
    CWP.htmlSend = msg => { const fr = htmlFrame(); if (fr && fr._ready) fr.contentWindow.postMessage(Object.assign({ cwb: 1 }, msg), '*'); };
    const fullState = () => Object.assign({}, (cur && cur.state && cur.state()) || {}, { hq: HQ.data ? { id: HQ.id, data: HQ.data } : null, hv: HV.id ? { id: HV.id, ev: HV.ev } : null, m: modalSync, au: audioSync, vd: videoSync, rvd: CWP.rvd, tn: CWP.turn || null, fl: CWP.fills || null, cl: CWP.cls || null });

    // ------------------------------------------------------------ live class (课堂): teacher writes the state, students follow
    const live = { ref: null, timer: null, db: null, user: null, session: null, members: {}, resp: {}, sendResp: null };
    CWP.live = live;
    function liveSend() {
        if (!live.ref || ROLE !== 'teacher') return;
        clearTimeout(live.timer);
        live.timer = setTimeout(() => { live.ref.update({ state: { i: S.i, st: fullState(), ts: Date.now() } }).catch(() => { }); }, 60);
    }
    function liveApply(state) {
        if (!state || !STUDENT) return;
        if (state.i !== S.i) goTo(state.i);
        setTimeout(() => { const st = state.st || {}; if (cur && cur.sync) cur.sync(st); applyModal(st.m); applyAudio(st.au); applyVideo(st.vd); applyHtml(st.hv, st.hq || null); CWP.emit('applied', st); }, 80);
    }
    async function liveInit() {
        if (MIRROR && lc) { lc.onmessage = e => { const m = e.data || {}; if (m.t === 'state') liveApply(m.state); else CWP.emit('msg', m); }; try { lc.postMessage({ t: 'hello' }); } catch (e) { /* ignore */ } return; }
        if (!LIVE) return;
        const load = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load ' + src)); document.head.append(s); });
        try {
            await load('../../js/config.js');
            const C = window.HSK_CONFIG; if (!C || !C.firebase) return;
            const base = 'https://www.gstatic.com/firebasejs/10.12.2/';
            await load(base + 'firebase-app-compat.js');
            await Promise.all([load(base + 'firebase-auth-compat.js'), load(base + 'firebase-firestore-compat.js')]);
            firebase.initializeApp(C.firebase);
            await new Promise(r => { const u = firebase.auth().onAuthStateChanged(() => { u(); r(); }); });
            live.db = firebase.firestore(); live.user = firebase.auth().currentUser;
            live.ref = live.db.collection('live').doc(LIVE);
            live.ref.onSnapshot(d => { const x = d.data(); if (!x) return; live.session = x; CWP.emit('live'); if (x.open === false && !PRES) { document.body.innerHTML = '<p style="padding:3rem;font:700 28px sans-serif;color:#432B20">课堂已结束 · Lớp học đã kết thúc</p>'; return; } if (!PRES && x.state) liveApply(x.state); });
            if (PRES) {
                live.ref.collection('members').onSnapshot(s => { live.members = {}; s.docs.forEach(d => { live.members[d.id] = d.data(); }); CWP.emit('live'); });
                live.ref.collection('resp').onSnapshot(s => { live.resp = {}; s.docs.forEach(d => { live.resp[d.id] = d.data(); }); CWP.emit('resp'); });
                liveSend();
            } else {
                const email = (live.user && live.user.email || '').toLowerCase();
                live.sendResp = (slideId, key, val, type) => {
                    const id = slideId + '__' + key + '__' + email;
                    const who = ((live.session && live.session.roster) || []).find(r => r.email === email);
                    return live.ref.collection('resp').doc(id).set({ slide: slideId, key, val: String(val), type: type || '', email, name: who ? who.name : email, ts: Date.now() }).catch(e => console.warn('resp', e));
                };
                live.ref.collection('ui').doc('cur').onSnapshot(d => CWP.emit('ui', d.data() || {}));
                CWP.emit('student-ready');
            }
        } catch (e) { console.warn('live', e); }
    }

    // ------------------------------------------------------------ boot
    // media is fetched ahead of time (this slide + the next few) and a failed picture is retried
    const preloaded = new Set();
    function preload(i0, n) {
        for (let i = i0; i < Math.min(slides.length, i0 + n); i++) {
            const s = slides[i]; const urls = [];
            if (s.bg && s.bg.img) urls.push(s.bg.img);
            const lay = CW.layoutOf(project, s); if (lay) { if (lay.bg && lay.bg.img) urls.push(lay.bg.img); CW.walkObjs(lay.objects || [], o => { if (o.kind === 'image') urls.push(o.src); }); }
            CW.walkObjs(s.objects || [], o => { if (o.kind === 'image' && o.src) urls.push(o.src); if (o.fillImg && o.fillImg.src) urls.push(o.fillImg.src); });
            if (s.dialog) { (s.dialog.lines || []).forEach(l => urls.push(l.avatar)); Object.values(project.speakers || {}).forEach(a => urls.push(a)); }
            urls.filter(Boolean).forEach(u => { if (preloaded.has(u)) return; preloaded.add(u); const im = new Image(); im.src = resolve(u); });
        }
    }
    document.addEventListener('error', e => {
        const t = e.target; if (!t || t.tagName !== 'IMG') return;
        const n = +t.dataset.retry || 0; if (n >= 3) return; t.dataset.retry = n + 1;
        setTimeout(() => { const s = t.src.split('#')[0]; t.src = s + (s.indexOf('?') >= 0 ? '&' : '?') + 'r=' + Date.now(); }, 1200 * (n + 1));
    }, true);
    function boot() {
        document.title = project.meta.title || '课件';
        document.body.innerHTML = `<div id="appbox"><div id="app">
          <header id="topbar">
            <span class="seal">${esc(project.meta.no || '·')}</span>
            <span class="ttl">${esc(project.meta.title || '')}<small>${esc(project.meta.vi || '')}</small></span>
            <span class="crumb" id="crumb"></span>
            <button class="tbtn" id="bOutline" title="目录 (O)">☰ 目录</button>
            <button class="tbtn" id="bTeacher" title="讲者视图 (P)">🗒 讲者视图</button>
            <button class="tbtn" id="bFull" title="全屏 (F)">⛶</button>
            <button class="tbtn" id="bHelp" title="操作说明">?</button>
            <button class="tbtn" id="bTop" title="隐藏页眉 (H)">⌃</button>
          </header>
          <button id="topShow" title="显示页眉 (H)">⌄</button>
          <aside id="outline"></aside>
          <main id="view"></main>
          <nav id="dock"><button class="nav" id="prev" title="上一步 ←">◀</button><div id="progress"><i></i></div><div id="pos"></div><button class="nav" id="next" title="下一步 →">▶</button></nav>
          <div id="modal-root"></div></div></div>`;
        if (embed) document.body.classList.add('embed');
        applyScale(); addEventListener('resize', applyScale); document.addEventListener('fullscreenchange', applyScale);
        buildOutline();
        $('#prev').onclick = () => (cur && cur.sectionNav ? goTo(S.i - 1) : prev());
        $('#next').onclick = () => (cur && cur.sectionNav ? goTo(S.i + 1) : next());
        $('#bTop').onclick = () => setTopHidden(true); $('#topShow').onclick = () => setTopHidden(false); setTopHidden(store.get('hideTop', false));
        $('#bOutline').onclick = toggleOutline; $('#bTeacher').onclick = () => { const u = new URL(location.href); u.searchParams.set('presenter', '1'); window.open(u.href, 'cw_presenter'); }; $('#bHelp').onclick = openHelp;
        $('#bFull').onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); };
        $('#progress').onclick = e => { const r = e.currentTarget.getBoundingClientRect(); goTo(Math.round((e.clientX - r.left) / r.width * (slides.length - 1))); };
        // clicking an empty part of a free slide = next step
        $('#view').addEventListener('click', e => { if (STUDENT) return; const t = e.target; if (!t.isConnected) return; if (t.closest('.compfront') || e.defaultPrevented || t.closest('.czpop')) return; if (t.classList && t.classList.contains('cw-scwin') && e.offsetX > t.clientWidth) return; next(); });
        document.addEventListener('click', e => { if (!(e.target.closest && e.target.closest('#outline,#bOutline'))) closeOutline(); });
        document.addEventListener('keydown', e => {
            if (STUDENT) return;
            if (e.target && e.target.closest && e.target.closest('input,textarea,select')) { if (e.key === 'Escape') e.target.blur(); return; }
            if ($('#modal-root').firstElementChild) { if (e.key === 'Escape') { closeModal(); return; } if (modalKeys && modalKeys(e)) e.preventDefault(); return; }
            if (cur && cur.key && cur.key(e)) { e.preventDefault(); return; }
            if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && cur && cur.scrollBy && cur.scrollBy(e.key === 'ArrowDown' ? 1 : -1)) { e.preventDefault(); return; }
            if ((e.key === 'v' || e.key === 'V') && cur && cur.quizReveal) { cur.quizReveal(); return; }
            if ((e.key === 'r' || e.key === 'R') && cur && cur.reset) { cur.reset(); return; }
            switch (e.key) {
                case 'ArrowRight': case 'PageDown': case ' ': case 'Enter': case 'ArrowDown': e.preventDefault(); next(); break;
                case 'ArrowLeft': case 'PageUp': case 'Backspace': case 'ArrowUp': e.preventDefault(); prev(); break;
                case 'Home': goTo(0); break;
                case 'End': goTo(slides.length - 1); break;
                case 'o': case 'O': toggleOutline(); break;
                case 'p': case 'P': if (!PRES) $('#bTeacher').click(); break;
                case 'h': case 'H': setTopHidden(!document.body.classList.contains('notop')); break;
                case 'f': case 'F': $('#bFull').click(); break;
                case 'Escape': closeOutline(); break;
            }
        });
        if (STUDENT) document.body.classList.add('student', 'notop');
        if (MIRROR) document.body.classList.add('mirror');
        if (PRES) { document.body.classList.add('presenter', 'notop'); }
        render();
        liveInit();
        preload(0, 4);
    }
    boot();
    Object.assign(CWP, { videoReset() { videoSync = null; }, project, slides, h, $, $$, esc, STUDENT, MIRROR, PRES, ROLE, LIVE, CODE, lc, avatarUrl, resolve, params, goTo, next, prev, post, fullState, slideLabel, applyScale, liveSend, store });
    // live getters (Object.assign would copy their current value only)
    Object.defineProperty(CWP, 'S', { get() { return S.i; }, configurable: true });
    Object.defineProperty(CWP, 'cur', { get() { return cur; }, configurable: true });
    CWP.emit('boot');
    window.__cwp = { liveApply, live, goTo, next, prev, slides, get cur() { return cur; }, applyScale };
})();
