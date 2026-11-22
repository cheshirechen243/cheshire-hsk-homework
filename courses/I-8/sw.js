/* 课件工坊 · 缓存媒体：第一次下载后，再上课秒开（视频走流式，不缓存）
   媒体文件名里带内容指纹（如 image109.3fa9c1d2.gif），换了内容就换名字，所以缓存不会拿到旧图 */
const C = 'cw-media-v2';
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
    const r = e.request, u = new URL(r.url);
    if (r.method !== 'GET' || r.headers.has('range') || u.origin !== location.origin) return;
    if (!/\/(media|avatars|vendor)\//.test(u.pathname)) return;
    if (/\.(mp4|mov|webm|mp3)$/i.test(u.pathname)) return;
    // files that came from the lesson itself carry a fingerprint; the older plain names are always fetched fresh
    const stamped = /\.[0-9a-f]{8}\.\w+$/i.test(u.pathname) || /\/(avatars|vendor)\//.test(u.pathname);
    if (!stamped) return;
    e.respondWith(caches.open(C).then(c => c.match(r).then(hit => hit || fetch(r).then(res => { if (res.ok) c.put(r, res.clone()); return res; }))));
});
