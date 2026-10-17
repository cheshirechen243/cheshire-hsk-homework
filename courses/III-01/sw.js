/* 课件工坊 · 缓存媒体：第一次下载后，再上课秒开（视频走流式，不缓存） */
const C = 'cw-media-v1';
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
    const r = e.request, u = new URL(r.url);
    if (r.method !== 'GET' || r.headers.has('range') || u.origin !== location.origin) return;
    if (!/\/(media|avatars|vendor)\//.test(u.pathname) && !/(hanzi-data|hzinfo)/.test(u.pathname)) return;
    if (/\.(mp4|mov|webm|mp3)$/i.test(u.pathname)) return;
    e.respondWith(caches.open(C).then(c => c.match(r).then(hit => hit || fetch(r).then(res => { if (res.ok) c.put(r, res.clone()); return res; }))));
});
