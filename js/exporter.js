// Teacher page: pack a student's (or a whole class's) work into ONE .html file: pages with the student's answers, ✅/❌, the teacher's scores and
// comments, and the voice recordings (embedded).  The file opens offline with its own viewer (js/export-viewer.js).
(function () {
  const blobToDataURL = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
  const getText = async url => { const r = await fetch(url + (url.includes('?') ? '&' : '?') + 'v=' + Date.now(), { cache: 'no-store' }); if (!r.ok) throw new Error(url + ' ' + r.status); return r.text(); };
  const getDataURL = async url => { const r = await fetch(url); if (!r.ok) throw new Error(url + ' ' + r.status); return blobToDataURL(await r.blob()); };
  const safeScript = s => String(s).replace(/<\/script/gi, '<\\/script');

  // rows: [{ student: {name, email, cls}, subs: [submission, ...] }]
  async function build({ S, rows, getLK, lessonMap, embedImages, title, subtitle, progress }) {
    const say = progress || (() => { });
    say('读取页面脚本…');
    const [cssRaw, gradeJs, renderJs, viewerJs, logo] = await Promise.all([getText(S.root + 'css/style.css'), getText(S.root + 'js/grade.js'), getText(S.root + 'js/render.js'), getText(S.root + 'js/export-viewer.js'), getDataURL(S.root + 'img/logo.png').catch(() => '')]);
    const css = cssRaw.replace(/url\((["']?)\.\.\//g, 'url($1' + S.root);          // fonts / images used by the stylesheet: absolute addresses on the site
    const imgCache = {};
    const lessonImages = async (lesson) => {
      const base = S.root + 'lessons/' + lesson.id + '/';
      if (!embedImages) return { lesson, base };
      const L = JSON.parse(JSON.stringify(lesson));
      for (let i = 0; i < L.pages.length; i++) {
        const u = base + L.pages[i].img;
        if (!imgCache[u]) imgCache[u] = await getDataURL(u);
        L.pages[i].img = imgCache[u];
      }
      return { lesson: L, base: '' };
    };
    const students = [];
    let done = 0; const total = rows.reduce((n, r) => n + r.subs.length, 0);
    for (const row of rows) {
      const items = [];
      const subs = row.subs.slice().sort((a, b) => ((lessonMap[a.lessonId] || {}).course || 'HSK3').localeCompare((lessonMap[b.lessonId] || {}).course || 'HSK3') || ((lessonMap[a.lessonId] || {}).no || 0) - ((lessonMap[b.lessonId] || {}).no || 0));
      for (const sub of subs) {
        say(`整理 ${row.student.name} · ${sub.lessonId}  (${++done}/${total})`);
        const lk = await getLK(sub.lessonId); const li = await lessonImages(lk.lesson);
        // recordings: stored in Firestore (found by their uid), or still inside the submission (older data)
        const recs = {};
        const needs = Object.entries(sub.answers || {}).filter(([k, v]) => v && v.rec && !v.rec.data);
        if (needs.length && S.listRecordings) {
          let files = []; try { files = await S.listRecordings(sub.lessonId, sub.email); } catch (e) { }
          for (const [fid, v] of needs) { const hit = files.find(f => v.rec.uid && f.uid === v.rec.uid); if (hit) { try { recs[fid] = await blobToDataURL(await (await fetch(hit.url)).blob()); } catch (e) { } } }
        }
        Object.entries(sub.answers || {}).forEach(([fid, v]) => { if (v && v.rec && v.rec.data) recs[fid] = v.rec.data; });
        const cleanSub = JSON.parse(JSON.stringify(sub));
        Object.values(cleanSub.answers || {}).forEach(v => { if (v && v.rec && v.rec.data) delete v.rec.data; });   // the audio travels in `recs`
        items.push({ lesson: li.lesson, base: li.base, key: lk.key, sub: cleanSub, recs });
      }
      students.push({ name: row.student.name, email: row.student.email, cls: row.student.cls || '', items });
    }
    say('生成文件…');
    const data = { title, subtitle, logo, students, generated: new Date().toISOString(), embedded: !!embedImages };
    const json = JSON.stringify(data).replace(/</g, '\\u003c');
    return `<!doctype html>\n<html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${String(title).replace(/[<&]/g, '')}</title>
<style>${css}
.exp-wrap { max-width: 1000px; margin: 0 auto; padding: 14px 14px 60px; } .exp-head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; } .exp-head .btn { margin-left: auto; }
.exp-logo { width: 54px; height: 54px; border-radius: 50%; } .exp-pages { overflow: visible; } .exp-sum { margin: 10px 0; } .exp-tog { display: block; margin: 8px 0; font-weight: 700; }
.exp-list { margin-top: 18px; } .exp-cmt { margin-top: 4px; background: #E8F0FF; border-radius: 6px; padding: 4px 8px; } .gi { cursor: pointer; }
</style></head><body><div id="app"></div>
<script id="data" type="application/json">${json}</script>
<script>${safeScript(gradeJs)}</script>
<script>${safeScript(renderJs)}</script>
<script>${safeScript(viewerJs)}</script>
</body></html>`;
  }

  window.HSKExport = { build };
})();
