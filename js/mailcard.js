// Builds the grade-report e-mail: a designed HTML "成绩单" (same look as the result pop-up) + a plain-text fallback.
// Email clients only understand table layout and inline styles, so everything below is written that way.
(function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const INK = '#3D3760', SOFT = '#6A648E', PINK = '#F2C1DC', PINKD = '#E2579A', CARD = '#FFF9FD', SKY = '#FFFFFF', YEL = '#FFF4D6', GREEN = '#C9F0D8';
  const FONT = "'Nunito','Segoe UI',Roboto,'PingFang SC','Microsoft YaHei','Noto Sans SC',Arial,sans-serif";

  // o: {lessonName, title, titleVi, student, final, finalMax, auto, autoMax, manual, manualMax, comment, comments:[{label,text}], link, contact}
  // The logo is written as {{LOGO}}: the mail sender swaps in an inline image (cid:) or a plain URL.
  // "Trần Ngọc Hà Trang 陈玉荷庄" -> {zh:'陈玉荷庄', vi:'Trần Ngọc Hà Trang'}  (either part may be missing)
  const CJK = /[\u3400-\u9fff\uf900-\ufaff]+/g;
  function splitName(name) {
    const s = String(name || '').trim();
    const zh = (s.match(CJK) || []).join('');
    const vi = s.replace(CJK, ' ').replace(/\s+/g, ' ').replace(/^[\s·,.-]+|[\s·,.-]+$/g, '');
    return { zh: zh || vi, vi: vi || zh };
  }

  function build(o) {
    const nm = splitName(o.student);    const pct = o.finalMax > 0 ? Math.round(o.final / o.finalMax * 100) : 0;
    const bar = Math.max(pct, 2);
    const subject = `Bảng điểm / 成绩单 - ${o.level || 'HSK3'} ${o.lessonName}`;

    const text = [
      `${nm.zh} 你好 / Chào ${nm.vi},`, '',
      `${o.lessonName}《${o.title}》已批改。`, `${o.titleVi ? o.titleVi + ' — ' : ''}Bài của em đã được chấm.`, '',
      `分数 Điểm: ${o.final} / ${o.finalMax} (${pct}%)`,
      `自动评分 Tự động: ${o.auto}/${o.autoMax} · 老师批改 Cô chấm: ${o.manual}/${o.manualMax}`,
      ...(o.comment ? ['', '老师评语 Nhận xét:', o.comment] : []),
      ...((o.comments || []).length ? ['', ...o.comments.map(c => `· ${c.label}: ${c.text}`)] : []),
      '', '登录查看批改详情 / Đăng nhập xem chi tiết: ' + o.link, '', '沉鱼汉语 NEW HSK 3.0 COURSE'].join('\n');

    const box = (num, den, lab, bg) => `<td width="50%" style="padding:0 5px"><table width="100%" cellpadding="0" cellspacing="0" style="background:${bg};border:3px solid ${INK};border-radius:10px"><tr><td align="center" style="padding:8px 6px 7px;font-family:${FONT}"><span style="font-size:24px;font-weight:800;color:${INK}">${esc(num)}</span><span style="font-size:14px;font-weight:700;color:${SOFT}"> / ${esc(den)}</span><div style="font-size:12px;font-weight:700;color:${SOFT};margin-top:2px">${lab}</div></td></tr></table></td>`;

    const notes = [];
    if (o.comment) notes.push(`<tr><td style="padding:14px 24px 0"><table width="100%" cellpadding="0" cellspacing="0" style="background:${YEL};border:3px solid ${INK};border-radius:10px"><tr><td style="padding:10px 14px;font-family:${FONT};font-size:14px;line-height:1.55;color:${INK}"><b>&#128172; 老师评语 · Nhận xét của cô</b><br>${esc(o.comment).replace(/\n/g, '<br>')}</td></tr></table></td></tr>`);
    if ((o.comments || []).length) notes.push(`<tr><td style="padding:10px 24px 0"><table width="100%" cellpadding="0" cellspacing="0" style="background:#fff;border:2px solid ${INK};border-radius:10px"><tr><td style="padding:8px 14px;font-family:${FONT};font-size:13px;line-height:1.6;color:${INK}">${o.comments.map(c => `<b>${esc(c.label)}:</b> ${esc(c.text)}`).join('<br>')}</td></tr></table></td></tr>`);

    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${SKY};">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${SKY};"><tr><td align="center" style="padding:26px 12px">
 <table width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px">
  <tr><td>
   <table width="100%" cellpadding="0" cellspacing="0" style="background:${CARD};border:3px solid ${INK};border-bottom-width:8px;border-radius:16px">
    <tr><td style="padding:18px 22px 14px;border-bottom:3px dashed ${PINK}">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td width="104" valign="middle" style="width:104px;padding-right:14px"><img src="{{LOGO}}" width="90" height="68" alt="沉鱼汉语" style="display:block;border:0;width:90px;height:auto"></td>
        <td valign="middle" style="font-family:${FONT}">
          <div style="font-size:12px;font-weight:800;letter-spacing:1.5px;color:${PINKD}">成绩单 · BẢNG ĐIỂM</div>
          <div style="font-size:20px;font-weight:800;line-height:1.3;color:${INK};margin-top:3px">${esc(o.lessonName)} · ${esc(o.title)}</div>
          ${o.titleVi ? `<div style="font-size:13px;font-weight:600;color:${SOFT};margin-top:2px">${esc(o.titleVi)}</div>` : ''}
        </td>
      </tr></table>
    </td></tr>    <tr><td style="padding:10px 24px 0;font-family:${FONT};font-size:15px;line-height:1.55;color:${INK}"><b>${esc(nm.zh)}</b> 你好,作业已批改 &#127881;<br><span style="color:${SOFT}">Chào <b>${esc(nm.vi)}</b>, bài của em đã được chấm.</span></td></tr>
    <tr><td align="center" style="padding:16px 24px 4px;font-family:${FONT}">
      <span style="font-size:66px;font-weight:800;line-height:1;color:${INK}">${esc(o.final)}</span><span style="font-size:26px;font-weight:700;color:${SOFT}"> / ${esc(o.finalMax)}</span>
      <span style="display:inline-block;margin-left:10px;vertical-align:18px;background:${PINK};border:3px solid ${INK};border-radius:8px;padding:2px 12px;font-size:24px;font-weight:800;color:${INK}">${pct}%</span>
    </td></tr>
    <tr><td style="padding:6px 24px 4px"><table width="100%" cellpadding="0" cellspacing="0" style="border:3px solid ${INK};border-radius:7px;background:#fff"><tr><td style="padding:2px"><table cellpadding="0" cellspacing="0" width="${bar}%" style="width:${bar}%"><tr><td height="14" style="height:14px;background:${PINKD};border-radius:3px;font-size:0;line-height:0">&nbsp;</td></tr></table></td></tr></table></td></tr>
    <tr><td style="padding:12px 19px 0"><table width="100%" cellpadding="0" cellspacing="0"><tr>${box(o.auto, o.autoMax, '自动评分 · Chấm tự động', '#fff')}${box(o.manual, o.manualMax, '老师批改 · Cô chấm', GREEN)}</tr></table></td></tr>
    ${notes.join('')}
    <tr><td align="center" style="padding:24px 24px 26px"><a href="${esc(o.link)}" style="display:inline-block;background:${PINKD};color:#ffffff;font-family:${FONT};font-size:16px;font-weight:800;text-decoration:none;padding:13px 26px;border:3px solid ${INK};border-bottom-width:6px;border-radius:10px">登录查看批改详情<br><span style="font-size:13px;font-weight:700">Đăng nhập xem chi tiết bài chấm</span></a></td></tr>
   </table>
  </td></tr>
  <tr><td align="center" style="padding:16px 8px 0;font-family:${FONT};font-size:12px;line-height:1.7;font-weight:600;color:${INK}">沉鱼汉语 NEW HSK 3.0 COURSE<br>${esc(o.contact || '')}</td></tr>
 </table>
</td></tr></table></body></html>`;
    const safe = html.replace(/[\u{10000}-\u{10FFFF}]/gu, ch => '&#' + ch.codePointAt(0) + ';');
    return { subject, text, html: safe };
  }

  window.HSKMailCard = { build, splitName };
})();
