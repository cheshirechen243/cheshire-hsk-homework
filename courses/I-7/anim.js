/* 课件工坊 · 动画：效果列表、时间线、播放 */
(function () {
    'use strict';
    const CW = (window.CW = window.CW || {});

    // effect catalogue (used by the editor panel and the runner)
    CW.FX = {
        appear: { label: '出现', dirs: false },
        fade: { label: '淡入淡出', dirs: false },
        fly: { label: '飞入飞出', dirs: true },
        wipe: { label: '擦除', dirs: true },
        zoom: { label: '缩放', dirs: false },
        grow: { label: '放大淡入', dirs: false },
        float: { label: '浮入', dirs: false },
        compress: { label: '压缩', dirs: false },
        randombar: { label: '随机线条', dirs: false },
        play: { label: '播放媒体', dirs: false, mediaOnly: true },
    };
    CW.DIRS = { l: '自左侧', r: '自右侧', t: '自顶部', b: '自底部' };
    CW.TRIGGERS = { click: '单击时', with: '与上一项同时', after: '上一项之后' };

    // Slide animation list -> click steps with absolute start times
    CW.animPlan = function (slide) {
        const steps = [];
        let cur = null, prevStart = 0, prevEnd = 0;
        (slide.anim || []).forEach((e, i) => {
            const dur = Math.max(0, e.dur == null ? .5 : e.dur) * 1000;
            const delay = Math.max(0, e.delay || 0) * 1000;
            if (!cur || e.trigger === 'click') {
                cur = { auto: i === 0 && e.trigger !== 'click', effects: [] };
                steps.push(cur);
                prevStart = 0; prevEnd = 0;
                const start = delay;
                cur.effects.push({ e, start, dur });
                prevStart = start; prevEnd = start + dur;
                return;
            }
            const start = e.trigger === 'with' ? prevStart + delay : prevEnd + delay;
            cur.effects.push({ e, start, dur });
            prevStart = start; prevEnd = start + dur;
        });
        return steps;
    };

    function seeded(seed) { let h = 2166136261 >>> 0; for (const c of String(seed)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return () => { h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; }; }
    function barFrames(e, el) {
        const W = Math.max(1, el.offsetWidth || parseFloat(el.style.width) || (el.parentElement && el.parentElement.offsetWidth) || 600), H = Math.max(1, el.offsetHeight || parseFloat(el.style.height) || 60);
        const N = Math.max(10, Math.min(36, Math.round(H / 7))), sh = H / N, rnd = seeded(e.id || e.obj || 'x');
        const order = Array.from({ length: N }, (_, i) => i).sort(() => rnd() - .5);
        const start = i => order[i] / N * 0.6, K = 30, out = [];
        for (let k = 0; k <= K; k++) {
            const off = k / K; let d = '';
            for (let i = 0; i < N; i++) { const p = Math.max(0, Math.min(1, (off - start(i)) / 0.4)); d += 'M0 ' + (i * sh).toFixed(1) + 'h' + W + 'v' + (p * sh + (p >= 1 ? .6 : 0)).toFixed(1) + 'h-' + W + 'Z'; }
            out.push({ offset: off, clipPath: "path('" + d + "')", visibility: 'visible' });
        }
        return out;
    }
    function frames(e, el, stage, cls) {
        if (e.fx === 'randombar') { const kf = barFrames(e, el); return cls === 'out' ? kf.slice().reverse().map((f, i) => Object.assign({}, f, { offset: i / (kf.length - 1) })) : kf; }
        const W = stage.W, H = stage.H;
        const g = { x: parseFloat(el.style.left) || 0, y: parseFloat(el.style.top) || 0, w: parseFloat(el.style.width) || 0, h: parseFloat(el.style.height) || 0 };
        const V = { visibility: 'visible' };
        let a, b;
        switch (e.fx) {
            case 'fade': a = Object.assign({ opacity: 0 }, V); b = Object.assign({ opacity: 1 }, V); break;
            case 'fly': {
                const d = e.dir || 'b';
                const t = { l: `${-(g.x + g.w + 20)}px 0`, r: `${W - g.x + 20}px 0`, t: `0 ${-(g.y + g.h + 20)}px`, b: `0 ${H - g.y + 20}px` }[d];
                a = Object.assign({ translate: t }, V); b = Object.assign({ translate: '0 0' }, V); break;
            }
            case 'wipe': {
                const d = e.dir || 'l';
                const c = { l: 'inset(0 100% 0 0)', r: 'inset(0 0 0 100%)', t: 'inset(0 0 100% 0)', b: 'inset(100% 0 0 0)' }[d];
                a = Object.assign({ clipPath: c }, V); b = Object.assign({ clipPath: 'inset(0 0 0 0)' }, V); break;
            }
            case 'zoom': a = Object.assign({ scale: '0.05', opacity: 0 }, V); b = Object.assign({ scale: '1', opacity: 1 }, V); break;
            case 'grow': a = Object.assign({ scale: '0.6', opacity: 0 }, V); b = Object.assign({ scale: '1', opacity: 1 }, V); break;
            case 'compress': {
                if (!(el.querySelector && el.querySelector(':scope > .tx'))) { a = Object.assign({ opacity: 0 }, V); b = Object.assign({ opacity: 1 }, V); break; }
                const d = W * 0.3;
                a = Object.assign({ left: (g.x - d / 2) + 'px', width: (g.w + d) + 'px', opacity: 0 }, V); b = Object.assign({ left: g.x + 'px', width: g.w + 'px', opacity: 1 }, V); break;
            }
            case 'float': a = Object.assign({ translate: '0 40px', opacity: 0 }, V); b = Object.assign({ translate: '0 0', opacity: 1 }, V); break;
            default: a = { visibility: 'hidden' }; b = { visibility: 'visible' };
        }
        if (cls === 'out') {
            if (e.fx === 'appear' || !CW.FX[e.fx]) return [{ visibility: 'visible' }, { visibility: 'hidden' }];
            // reverse, finish hidden
            return [b, Object.assign({}, a, { visibility: 'hidden' })];
        }
        return [a, b];
    }

    CW.AnimRunner = class {
        constructor(stageEl, slide, W, H) {
            this.stage = stageEl; this.slide = slide; this.dims = { W, H };
            this.steps = CW.animPlan(slide);
            this.k = 0;
            this.anims = [];
            this.timers = [];
            this.reset(0, true);
        }
        targets(e) {
            const root = this.stage.querySelector(`[data-id="${e.obj}"]`);
            if (!root) return [];
            if (e.para) {
                const tx = root.querySelector('.tx');
                const ps = tx ? Array.from(tx.children).filter(c => c.tagName === 'P') : [];
                return ps.slice(e.para[0], e.para[1] + 1);
            }
            return [root];
        }
        clearAll() {
            this.anims.forEach(a => { try { a.cancel(); } catch (er) { /* ignore */ } });
            this.timers.forEach(clearTimeout);
            this.anims = []; this.timers = [];
        }
        // rebuild the state "k steps done" instantly, then (for k == 0) run the automatic first step
        reset(k, runAuto) {
            this.clearAll();
            // initial visibility: targets whose first effect is an entrance start hidden
            const first = new Map();
            this.steps.forEach(s => s.effects.forEach(({ e }) => { this.targets(e).forEach(t => { if (!first.has(t)) first.set(t, e.cls); }); }));
            this.stage.querySelectorAll('.o, .tx > p').forEach(n => { n.style.visibility = ''; });
            first.forEach((cls, t) => { if (cls === 'in') t.style.visibility = 'hidden'; });
            this.k = 0;
            for (let i = 0; i < k; i++) this.runStep(this.steps[i], true);
            this.k = k;
            if (runAuto && k === 0 && this.steps[0] && this.steps[0].auto) { this.runStep(this.steps[0], false); this.k = 1; }
        }
        runStep(step, instant) {
            step.effects.forEach(({ e, start, dur }) => {
                const ts = this.targets(e);
                if (e.cls === 'media' || e.fx === 'play') {
                    ts.forEach(t => { const m = t.querySelector('audio,video'); if (m && !instant) this.timers.push(setTimeout(() => { try { m.play(); } catch (er) { /* ignore */ } }, start)); });
                    return;
                }
                ts.forEach(t => {
                    const kf = frames(e, t, this.dims, e.cls);
                    const a = t.animate(kf, { duration: instant ? 1 : Math.max(1, dur), delay: instant ? 0 : start, fill: 'both', easing: e.fx === 'randombar' ? 'linear' : 'ease-out' });
                    this.anims.push(a);
                    if (instant) { try { a.finish(); } catch (er) { /* ignore */ } }
                });
            });
        }
        get total() { return this.steps.length; }
        next() { if (this.k >= this.steps.length) return false; this.runStep(this.steps[this.k], false); this.k++; return true; }
        prev() { if (this.k <= 0) return false; this.reset(this.k - 1, false); return true; }
        // show everything in its final state (e.g. when coming back from the next slide)
        finish() { this.reset(this.steps.length, false); }
    };
})();
