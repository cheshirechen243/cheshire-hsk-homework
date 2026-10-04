// Page shell: banner, sign-in, access check. Calls ready(user, main) once the visitor is allowed in.
(function () {
  const C = window.HSK_CONFIG, S = window.HSKStore;
  const $ = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };

  function boot(opts, ready) {
    const shell = document.getElementById('app');
    shell.className = 'shell' + (opts.wide ? ' wide' : '');
    shell.innerHTML = '';
    if (!document.querySelector('.cloud')) {
      const cl = (c, w) => `<div class="cloud ${c}" style="width:${w}px"><svg viewBox="0 0 100 50"><ellipse cx="30" cy="35" rx="22" ry="15" fill="#fff"/><ellipse cx="55" cy="28" rx="26" ry="20" fill="#fff"/><ellipse cx="78" cy="36" rx="18" ry="14" fill="#fff"/></svg></div>`;
      document.body.insertAdjacentHTML('afterbegin', cl('c1', 150) + cl('c2', 110) + cl('c3', 86));
    }
    if (!opts.noBanner) { const w = $('div', 'banner-wrap'); const b = $('img', 'banner'); b.src = S.root + 'img/banner.jpg'; b.alt = C.siteName; w.appendChild(b); shell.appendChild(w); }
    if (S.isDemo) shell.appendChild($('div', 'demo-tag', '🧪 演示模式:数据只保存在这台电脑的浏览器里。正式使用请按 SETUP.md 连接 Firebase。<br><span class="vi">Chế độ thử nghiệm: dữ liệu chỉ lưu trên trình duyệt này.</span>'));
    const main = $('div', 'main'); shell.appendChild(main);
    const foot = $('div', 'footer', `沉鱼汉语 NEW HSK 3.0 COURSE · <a href="${C.contact.messenger}" target="_blank" rel="noopener">Messenger</a> · Zalo ${C.contact.zalo} · ${C.contact.email}`);
    shell.appendChild(foot);

    S.onAuth(user => {
      main.innerHTML = '';
      if (!user) return loginView(main);
      if (user.role === 'denied') return deniedView(main, user);
      if (opts.need === 'teacher' && user.role !== 'teacher') {
        const c = $('div', 'card login', `<h2>需要老师账号 · Chỉ dành cho giáo viên</h2><p class="hint">${user.email}</p>`);
        const a = $('a', 'btn', '返回 Quay lại'); a.href = S.root + 'index.html'; c.appendChild(a); main.appendChild(c); return;
      }
      ready(user, main);
    });
  }

  function loginView(main) {
    const c = $('div', 'card login');
    c.innerHTML = '<h1>作业登录 · Đăng nhập làm bài</h1><p class="hint">请用登记过的 Google 邮箱登录。<br><span class="vi">Đăng nhập bằng email Google đã đăng ký.</span></p>';
    if (S.isDemo) {
      const f = $('form'); f.innerHTML = '<input type="text" name="n" placeholder="姓名 Họ tên"><input type="email" name="e" placeholder="邮箱 Email" required><button class="btn" type="submit">进入演示 Vào thử</button><div class="hint" style="font-size:12.5px">老师演示:输入 ' + C.teacherEmails[0] + '</div>';
      f.onsubmit = e => { e.preventDefault(); S.signIn(f.n.value.trim(), f.e.value.trim()); };
      c.appendChild(f);
    } else {
      const b = $('button', 'gbtn', '<svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg> 使用 Google 登录 · Đăng nhập bằng Google');
      b.type = 'button'; b.onclick = () => S.signIn().catch(e => alert('登录失败 Lỗi: ' + e.message)); c.appendChild(b);
    }
    main.appendChild(c);
  }

  function deniedView(main, user) {
    const c = $('div', 'card login', `<h2 class="denied">这个邮箱还没有被授权</h2><p>${user.email}</p><p class="hint">请联系老师把这个邮箱加入名单。<br><span class="vi">Email này chưa được cô cho phép. Hãy nhắn cô để thêm vào danh sách.</span></p>`);
    const b = $('button', 'btn ghost', '换一个账号 Đổi tài khoản'); b.onclick = () => S.signOut(); c.appendChild(b); main.appendChild(c);
  }

  function topline(user, extra) {
    const t = $('div', 'topline');
    const who = $('div', 'who', `<img class="avatar" src="${S.root}img/logo.png" alt=""><span>${user.name}<small>${user.email}</small></span>`);
    const out = $('button', 'btn ghost sm', '退出 Thoát'); out.onclick = () => S.signOut(); who.appendChild(out);
    t.appendChild(extra || $('span')); t.appendChild(who); return t;
  }

  // display name of a lesson: 第N课, or its own label (e.g. the mock test)
  window.lname = L => (L && L.label) || ('第' + (L && L.no) + '课');

  window.HSKShell = { boot, topline, $ };
})();
