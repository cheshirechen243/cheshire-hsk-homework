/* 课件工坊 · 核心：数据模型工具 + 对象/页面渲染（编辑器和播放器共用） */
(function () {
    'use strict';
    const CW = (window.CW = window.CW || {});

    CW.uid = (p) => (p || 'o') + Math.random().toString(36).slice(2, 9);
    CW.esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    CW.clone = o => JSON.parse(JSON.stringify(o));
    CW.isCJK = s => /[㐀-鿿]/.test(s || '');

    // ---------------------------------------------------------------- project helpers
    CW.newProject = function (meta) {
        return {
            v: 1,
            meta: Object.assign({ title: '新课件', no: '', vi: '', W: 960, H: 540 }, meta || {}),
            layouts: {},
            slides: [],
            speakers: {},
            memory: { hanviet: {}, pinyin: {}, nghia: {} },
        };
    };
    CW.newSlide = function (props) {
        return Object.assign({ id: CW.uid('s'), type: 'free', name: '', section: '', layout: '', bg: null, objects: [], anim: [], notes: '' }, props || {});
    };
    CW.findObj = function (list, id) {
        for (const o of list) {
            if (o.id === id) return { obj: o, list };
            if (o.kind === 'group') { const r = CW.findObj(o.children || [], id); if (r) return r; }
        }
        return null;
    };
    CW.walkObjs = function (list, fn) { for (const o of list) { fn(o); if (o.kind === 'group') CW.walkObjs(o.children || [], fn); } };

    // every media path used by the project (for export / copy)
    CW.mediaOf = function (project) {
        const set = new Set();
        const add = p => { if (p && typeof p === 'string' && !/^(data:|https?:|blob:)/.test(p)) set.add(p); };
        const bg = b => { if (b && b.img) add(b.img); };
        const objs = list => CW.walkObjs(list, o => { add(o.src); add(o.poster); add(o.icon); if (o.fillImg) add(o.fillImg.src); });
        Object.values(project.layouts || {}).forEach(l => { bg(l.bg); objs(l.objects || []); });
        project.slides.forEach(s => {
            bg(s.bg); objs(s.objects || []);
            if (s.dialog) { (s.dialog.lines || []).forEach(l => add(l.avatar)); add(s.dialog.image); }
        });
        Object.values(project.speakers || {}).forEach(add);
        return Array.from(set);
    };

    // ---------------------------------------------------------------- shapes
    const POLY = { diamond: '50,0 100,50 50,100 0,50', triangle: '50,0 100,100 0,100', rtri: '0,0 100,100 0,100', parallelogram: '25,0 100,0 75,100 0,100', trapezoid: '20,0 80,0 100,100 0,100', hexagon: '25,0 75,0 100,50 75,100 25,100 0,50', pentagon: '50,0 100,38 82,100 18,100 0,38', octagon: '30,0 70,0 100,30 100,70 70,100 30,100 0,70 0,30' };
    CW.SHAPES = ['rect', 'round', 'ellipse', 'diamond', 'triangle', 'parallelogram', 'trapezoid', 'hexagon', 'pentagon', 'octagon', 'line'];

    // ---------------------------------------------------------------- object element
    const SPEAKER_SVG = "data:image/svg+xml;utf8," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><path d='M8 24h12l14-12v40L20 40H8z' fill='#9a9a9a'/><path d='M42 22c4 4 4 16 0 20M48 16c8 8 8 24 0 32' stroke='#9a9a9a' stroke-width='4' fill='none' stroke-linecap='round'/></svg>");
    CW.SPEAKER_SVG = SPEAKER_SVG;

    function url(ctx, src) { return ctx && ctx.resolve ? ctx.resolve(src) : src; }

    CW.bgCss = function (bg, ctx) {
        if (!bg) return '';
        let css = '';
        if (bg.color) css += `background-color:${bg.color};`;
        if (bg.css) css += `background:${bg.css};`;
        return css;
    };

    CW.objEl = function (o, ctx) {
        ctx = ctx || {};
        const el = document.createElement('div');
        el.className = 'o o-' + o.kind + (o.go ? ' go' : '') + (ctx.decor ? ' decor' : '');
        el.dataset.id = o.id;
        const s = el.style;
        s.left = o.x + 'px'; s.top = o.y + 'px'; s.width = o.w + 'px'; s.height = o.h + 'px';
        if (o.rot) s.transform = `rotate(${o.rot}deg)`;
        if (o.opacity != null && o.opacity < 1) s.opacity = o.opacity;
        if (o.shadow) s.filter = o.shadow;
        if (o.hidden) { if (ctx.mode === 'editor') s.opacity = .25; else s.display = 'none'; }
        if (o.go) el.dataset.go = o.go;
        if (o.url) el.dataset.url = o.url;
        if (o.quiz && o.quiz.q) { el.dataset.q = o.quiz.q; el.dataset.opt = o.quiz.opt || ''; el.dataset.qm = o.quiz.m || ''; el.classList.add('qz'); }
        if (o.cloze) el.classList.add('cloze');
        if (o.snap) el.classList.add('snapitem');
        const build = BUILD[o.kind];
        if (build) build(el, o, ctx);
        return el;
    };

    const BUILD = {};

    // box = text box / shape (optionally with text)
    BUILD.box = function (el, o, ctx) {
        const bg = document.createElement('div');
        bg.className = 'bgl';
        const shape = o.shape || 'rect';
        const flip = [o.flipX ? 'scaleX(-1)' : '', o.flipY ? 'scaleY(-1)' : ''].filter(Boolean).join(' ');
        if (flip) bg.style.transform = flip;
        const line = o.line && o.line.w ? o.line : null;
        const dash = line && line.dash && line.dash !== 'solid' ? (/dot/i.test(line.dash) && !/dash/i.test(line.dash) ? 'dotted' : 'dashed') : 'solid';
        if (shape === 'rect' || shape === 'round' || shape === 'ellipse') {
            const bs = bg.style;
            if (o.fill) bs.background = o.fill;
            if (o.fillImg) {
                bs.backgroundImage = `url("${url(ctx, o.fillImg.src)}")`;
                bs.backgroundSize = o.fillImg.tile ? 'auto' : '100% 100%';
                bs.backgroundRepeat = o.fillImg.tile ? 'repeat' : 'no-repeat';
                if (o.fillImg.alpha != null && o.fillImg.alpha < 1) bs.opacity = o.fillImg.alpha;
            }
            if (shape === 'ellipse') bs.borderRadius = '50%';
            else if (o.radius != null) bs.borderRadius = typeof o.radius === 'number' ? o.radius + 'px' : o.radius;
            else if (shape === 'round') bs.borderRadius = Math.min(o.w, o.h) * 0.1667 + 'px';
            if (line) bs.border = `${line.w}px ${dash} ${line.color}`;
            if (o.borders) { const b = o.borders; if (b.l) bs.borderLeft = b.l; if (b.r) bs.borderRight = b.r; if (b.t) bs.borderTop = b.t; if (b.b) bs.borderBottom = b.b; }
            bs.boxSizing = 'border-box';
        } else if (POLY[shape]) {
            bg.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%" style="overflow:visible"><polygon points="${POLY[shape]}" fill="${o.fill || 'none'}" ${line ? `stroke="${line.color}" stroke-width="${line.w}" vector-effect="non-scaling-stroke" ${line.dash && line.dash !== 'solid' ? 'stroke-dasharray="6 4"' : ''}` : ''}/></svg>`;
        } else if (shape === 'line') {
            const w = Math.max(o.w, .01), h = Math.max(o.h, .01);
            const ln = line || { w: 2, color: '#000' };
            bg.innerHTML = `<svg width="${Math.max(w, 2)}" height="${Math.max(h, 2)}" style="overflow:visible"><line x1="0" y1="0" x2="${w}" y2="${h}" stroke="${ln.color}" stroke-width="${ln.w}" ${ln.dash && ln.dash !== 'solid' ? 'stroke-dasharray="6 4"' : ''}/></svg>`;
        } else if (shape === 'path' && o.svg) {
            bg.innerHTML = `<svg viewBox="0 0 ${o.svg.vw} ${o.svg.vh}" preserveAspectRatio="none" width="100%" height="100%" style="overflow:visible"><path d="${o.svg.d}" fill="${o.fill || 'none'}" ${line ? `stroke="${line.color}" stroke-width="${line.w}" vector-effect="non-scaling-stroke"` : ''}/></svg>`;
        }
        el.append(bg);
        if (o.html != null || (ctx.mode === 'editor' && o.kind === 'box')) {
            const tx = document.createElement('div');
            tx.className = 'tx';
            CW.applyTextProps(tx, o);
            tx.innerHTML = (o.cloze && ctx.mode === 'player') ? CW.blankify(o.html || '') : (o.html || '');
            el.append(tx);
        }
    };

    CW.plainText = html => String(html || '').replace(/<[^>]+>/g, '').replace(/&#8203;|\u200b/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
    CW.BLANK_RE = /[_\uFF3F]{3,}/g;
    CW.countBlanks = function (html) { const m = String(html || '').replace(/<[^>]+>/g, '').match(CW.BLANK_RE); return m ? m.length : 0; };
    CW.blankify = function (html) {
        let n = 0;
        return String(html).replace(/(^|>)([^<]+)/g, (all, a, txt) => a + txt.replace(CW.BLANK_RE, m => '<span class="cz" data-i="' + (n++) + '">' + m + '</span>'));
    };

    CW.applyTextProps = function (tx, o) {
        const s = tx.style;
        const pad = o.pad || [4.8, 9.6, 4.8, 9.6];
        s.padding = `${pad[0]}px ${pad[1]}px ${pad[2]}px ${pad[3]}px`;
        s.justifyContent = { t: 'flex-start', m: 'center', b: 'flex-end' }[o.anchor || 't'];
        s.whiteSpace = o.nowrap ? 'pre' : 'pre-wrap';
        s.wordWrap = 'break-word';
        s.writingMode = o.vert ? 'vertical-rl' : '';
        const f = o.font || {};
        if (f.family) s.fontFamily = f.family;
        if (f.size) s.fontSize = f.size + 'px';
        if (f.color) s.color = f.color;
        if (f.bold) s.fontWeight = 'bold';
        if (f.italic) s.fontStyle = 'italic';
        if (f.align) s.textAlign = f.align;
        if (f.lh) s.lineHeight = f.lh;
    };

    BUILD.image = function (el, o, ctx) {
        const wrap = document.createElement('div');
        wrap.className = 'im';
        const c = o.crop || { l: 0, t: 0, r: 0, b: 0 };
        const iw = 1 - c.l - c.r, ih = 1 - c.t - c.b;
        const img = document.createElement('img');
        img.draggable = false;
        img.src = url(ctx, o.src);
        img.alt = '';
        const flip = [o.flipX ? 'scaleX(-1)' : '', o.flipY ? 'scaleY(-1)' : ''].filter(Boolean).join(' ');
        Object.assign(img.style, { position: 'absolute', width: (100 / iw) + '%', height: (100 / ih) + '%', left: (-c.l / iw * 100) + '%', top: (-c.t / ih * 100) + '%', maxWidth: 'none', display: 'block' });
        if (flip) wrap.style.transform = flip;                     // flip the cropped picture as a whole (the crop is defined before flipping)
        const ws = wrap.style;
        if (o.shape === 'ellipse') ws.borderRadius = '50%';
        else if (o.radius != null) ws.borderRadius = typeof o.radius === 'number' ? o.radius + 'px' : o.radius;
        if (o.line && o.line.w) { ws.border = `${o.line.w}px solid ${o.line.color}`; ws.boxSizing = 'border-box'; }
        if (o.alpha != null && o.alpha < 1) ws.opacity = o.alpha;
        wrap.append(img);
        el.append(wrap);
    };

    BUILD.video = function (el, o, ctx) {
        if (ctx.mode === 'editor' || ctx.mode === 'thumb') {
            el.style.cssText += ';background:#222 center/cover no-repeat;color:#fff;display:grid;place-items:center;font:700 20px sans-serif;overflow:hidden;';
            if (o.poster) el.style.backgroundImage = 'url("' + url(ctx, o.poster) + '")';
            const lab = document.createElement('span');
            lab.textContent = '▶ 视频';
            lab.style.cssText = 'background:rgba(0,0,0,.55);padding:4px 12px;border-radius:8px;';
            el.append(lab);
            return;
        }
        const v = document.createElement('video');
        v.src = url(ctx, o.src);
        if (o.poster) v.poster = url(ctx, o.poster);
        v.preload = 'metadata'; v.playsInline = true;
        v.loop = !!o.loop; v.muted = !!o.muted;
        v.style.objectFit = o.fit || 'cover';
        if (ctx.mode === 'editor') { v.controls = false; v.style.pointerEvents = 'none'; } else v.controls = o.controls !== false;
        const ws = el.style;
        if (o.radius != null) ws.borderRadius = typeof o.radius === 'number' ? o.radius + 'px' : o.radius;
        el.style.overflow = 'hidden';
        el.append(v);
    };

    BUILD.audio = function (el, o, ctx) {
        const sp = document.createElement('span');
        sp.textContent = '\uD83D\uDD0A';
        sp.style.cssText = 'display:grid;place-items:center;width:100%;height:100%;font-size:' + (Math.min(o.w, o.h) * 0.78) + 'px;line-height:1;pointer-events:none;';
        el.append(sp);
        if (ctx.mode !== 'editor') {
            const a = document.createElement('audio');
            a.src = url(ctx, o.src); a.preload = 'none';
            el.append(a);
        }
    };
    BUILD.stroke = function (el, o, ctx) {
        const sp = document.createElement('span');
        sp.textContent = o.char || '';
        const st = o.style || {};
        const fs = Math.min(o.w, o.h) * 0.74;
        el.style.cssText += `;display:grid;place-items:center;background:${st.bg || '#fff'};border:1px solid ${st.border || '#e1d6c4'};box-sizing:border-box;`;
        el.style.fontFamily = st.family || "'KaiTi','Kaiti SC','STKaiti',serif";
        el.style.fontSize = fs + 'px'; el.style.lineHeight = 1; el.style.color = st.color || '#c4c4c4';
        el.innerHTML = '<i class="g1"></i><i class="g2"></i>';
        el.append(sp);
    };

    BUILD.html = function (el, o, ctx) {
        if (ctx.mode === 'editor' || ctx.mode === 'thumb') { el.style.cssText += ';background:#ddd;display:grid;place-items:center;font:700 16px sans-serif;color:#666;'; el.textContent = '网页内容'; return; }
        const f = document.createElement('iframe');
        const hm = /window\.__MODE=("[a-z]+")/.exec(o.html || '');
        if (hm) el.dataset.hmode = hm[1].replace(/"/g, '');             // assistant page (flash / dialog / quiz): its clicks can be mirrored to the students
        const BR = "<script>(function(){\nvar ROLE='',cnt=0,seed=1,applying=false,down=null,lastT=0;\nMath.random=function(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};\nfunction pth(el){var p=[];while(el&&el!==document.body&&el.parentNode){p.unshift(Array.prototype.indexOf.call(el.parentNode.children,el));el=el.parentNode;}return p.join('.');}\nfunction at(s){var el=document.body;if(!s)return el;var a=s.split('.');for(var i=0;i<a.length&&el;i++)el=el.children[+a[i]];return el;}\nfunction send(m){m.cwb=1;try{parent.postMessage(m,'*');}catch(e){}}\nfunction rel(el,e){var r=el.getBoundingClientRect();return[(e.clientX-r.left)/(r.width||1),(e.clientY-r.top)/(r.height||1)];}\ndocument.addEventListener('click',function(e){if(ROLE!=='teacher'||applying)return;cnt++;seed=cnt*7919+13;send({k:'ev',e:{t:'c',p:pth(e.target),s:seed}});var n=e.target.closest&&e.target.closest('[data-a]');if(n)send({k:'nav',a:n.getAttribute('data-a')});},true);\ndocument.addEventListener('change',function(e){if(ROLE!=='teacher'||applying)return;var t=e.target;cnt++;seed=cnt*7919+13;send({k:'ev',e:{t:'g',p:pth(t),v:t.type==='checkbox'?t.checked:t.value,s:seed}});},true);\ndocument.addEventListener('pointerdown',function(e){if(ROLE!=='teacher'||applying)return;var sv=e.target.closest&&e.target.closest('svg');if(!sv)return;down=sv;var r=rel(sv,e);send({k:'ev',e:{t:'d',p:pth(sv),x:r[0],y:r[1]}});},true);\ndocument.addEventListener('pointermove',function(e){if(ROLE!=='teacher'||applying||!down)return;var n=Date.now();if(n-lastT<60)return;lastT=n;var r=rel(down,e);send({k:'ev',e:{t:'m',p:pth(down),x:r[0],y:r[1]}});},true);\nfunction up(e){if(ROLE!=='teacher'||applying||!down)return;var r=rel(down,e);send({k:'ev',e:{t:'u',p:pth(down),x:r[0],y:r[1]}});down=null;}\ndocument.addEventListener('pointerup',up,true);document.addEventListener('pointercancel',up,true);\nfunction run(ev){var el=at(ev.p);if(!el)return;\n if(ev.t==='c'){seed=ev.s;el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));}\n else if(ev.t==='g'){if(el.type==='checkbox')el.checked=!!ev.v;else el.value=ev.v;seed=ev.s;el.dispatchEvent(new Event('change',{bubbles:true}));}\n else{var r=el.getBoundingClientRect(),o={bubbles:true,cancelable:true,pointerId:1,isPrimary:true,pointerType:'mouse',clientX:r.left+ev.x*r.width,clientY:r.top+ev.y*r.height,buttons:ev.t==='u'?0:1};\n  el.dispatchEvent(new PointerEvent(ev.t==='d'?'pointerdown':ev.t==='m'?'pointermove':'pointerup',o));}}\nwindow.addEventListener('message',function(e){var m=e.data;if(!m||!m.cwb)return;\n if(m.k==='role')ROLE=m.role;\n else if(m.k==='apply'){applying=true;try{(m.ev||[]).forEach(function(v){try{run(v);}catch(x){}});}finally{applying=false;}}});\nwindow.addEventListener('load',function(){send({k:'ready'});});\n})();</script>";
        f.srcdoc = hm ? (/<head[^>]*>/i.test(o.html) ? o.html.replace(/<head[^>]*>/i, m => m + BR) : BR + o.html) : (o.html || '');
        f.style.cssText = 'width:100%;height:100%;border:0;background:transparent;';
        if (ctx.mode === 'editor') f.style.pointerEvents = 'none';
        el.append(f);
    };

    BUILD.group = function (el, o, ctx) {
        const gc = document.createElement('div');
        gc.className = 'gc';
        (o.children || []).forEach(c => gc.append(CW.objEl(c, ctx)));
        el.append(gc);
    };


    // ---------------------------------------------------------------- scroll area: auto-height boxes push the content below them
    CW.measureBox = function (el) {
        const tx = el.querySelector(':scope > .tx'); if (!tx) return null;
        const keep = tx.style.cssText;
        tx.style.position = 'relative'; tx.style.inset = 'auto'; tx.style.width = '100%'; tx.style.height = 'auto';
        const hh = tx.offsetHeight;
        tx.style.cssText = keep;
        return hh;
    };
    // returns {pos:Map(id->{y,h}), changed}; write=true stores the result into the model
    CW.relayoutScroll = function (stage, slide, write) {
        const sc = slide.scroll; if (!sc || !stage) return false;
        const objs = (slide.objects || []).filter(o => o.sc).sort((a, b) => a.y - b.y);
        const pos = new Map(objs.map(o => [o.id, { y: o.y, h: o.h }]));
        let changed = false;
        for (const o of objs) {
            if (!o.autoH) continue;
            const el = stage.querySelector('.o[data-id="' + o.id + '"]'); if (!el) continue;
            const m = CW.measureBox(el); if (m == null) continue;
            const p = pos.get(o.id), nh = Math.max(Math.ceil(m), 24), d = nh - p.h;
            if (Math.abs(d) < 1) continue;
            const ob = p.y + p.h;
            objs.forEach(q => { if (q !== o) { const pq = pos.get(q.id); if (pq.y >= ob - 2) pq.y += d; } });
            p.h = nh; changed = true;
        }
        if (!changed) return false;
        let bottom = 0;
        objs.forEach(o => {
            const p = pos.get(o.id); bottom = Math.max(bottom, p.y + p.h);
            if (write) { o.y = +p.y.toFixed(1); o.h = +p.h.toFixed(1); }
            const el = stage.querySelector('.o[data-id="' + o.id + '"]');
            if (el) { el.style.top = (stage._scwin ? p.y - sc.y : p.y) + 'px'; el.style.height = p.h + 'px'; }
        });
        if (stage._scwin) stage._scwin.firstChild.style.height = Math.max(sc.h, bottom - sc.y + 24) + 'px';
        return true;
    };
    // ---------------------------------------------------------------- slide stage
    CW.layoutOf = function (project, slide) {
        return slide.layout && project.layouts ? project.layouts[slide.layout] : null;
    };
    CW.makeStage = function (project, slide, ctx) {
        ctx = Object.assign({ mode: 'player' }, ctx || {});
        const W = project.meta.W, H = project.meta.H;
        const st = document.createElement('div');
        st.className = 'cw-stage';
        if (ctx.overlay) st.style.background = 'transparent';
        st.style.width = W + 'px'; st.style.height = H + 'px';
        const lay = CW.layoutOf(project, slide);
        const bg = slide.bg || (lay && lay.bg) || null;
        const bgEl = document.createElement('div');
        bgEl.className = 'cw-bg';
        if (bg) {
            if (bg.color) bgEl.style.backgroundColor = bg.color;
            if (bg.img) {
                const b2 = document.createElement('div');
                b2.className = 'cw-bgimg';
                b2.style.backgroundImage = `url("${url(ctx, bg.img)}")`;
                b2.style.backgroundSize = bg.fit === 'cover' ? 'cover' : '100% 100%';
                if (bg.alpha != null && bg.alpha < 1) b2.style.opacity = bg.alpha;
                bgEl.append(b2);
            }
        } else bgEl.style.background = '#fff';
        if (!ctx.overlay) st.append(bgEl);
        if (lay && !(ctx.mode === 'layout') && !ctx.overlay) (lay.objects || []).forEach(o => st.append(CW.objEl(o, Object.assign({}, ctx, { decor: true }))));
        const sc = slide.scroll;
        const useWin = sc && ctx.mode !== 'editor' && ctx.mode !== 'layout';
        let win = null, cont = null, bottom = 0;
        const mkWin = () => {
            win = document.createElement('div'); win.className = 'cw-scwin' + (sc.snap ? ' snap' : '');
            Object.assign(win.style, { left: sc.x + 'px', top: sc.y + 'px', width: sc.w + 'px', height: sc.h + 'px' });
            if (sc.radius) win.style.borderRadius = sc.radius + 'px';
            cont = document.createElement('div'); cont.className = 'cw-sccont'; win.append(cont); st.append(win);
        };
        (ctx.noObjects ? [] : (slide.objects || [])).forEach(o => {
            if (sc && o.sc) bottom = Math.max(bottom, o.y + o.h);
            if (useWin && o.sc) {
                if (!win) mkWin();
                const el = CW.objEl(o, ctx);
                el.style.left = (o.x - sc.x) + 'px'; el.style.top = (o.y - sc.y) + 'px';
                cont.append(el);
            } else st.append(CW.objEl(o, ctx));
        });
        if (useWin && !ctx.noObjects) {
            if (!win) mkWin();
            cont.style.height = Math.max(sc.h, bottom - sc.y + 24) + 'px';
            st._scwin = win;
        } else if (sc && ctx.mode === 'editor' && !ctx.noObjects) {
            const fr = document.createElement('div'); fr.className = 'cw-scframe';
            Object.assign(fr.style, { left: sc.x + 'px', top: sc.y + 'px', width: sc.w + 'px', height: sc.h + 'px' });
            st.append(fr);
            if (bottom + 24 > H) { st.style.height = (bottom + 24) + 'px'; st.style.background = '#b9b1a4'; bgEl.style.bottom = 'auto'; bgEl.style.height = H + 'px'; }
        }
        return st;
    };
})();
