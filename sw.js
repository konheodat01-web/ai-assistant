const CACHE_NAME = 'ai-assistant-v3';
const LOCAL_ASSETS = ['./', './index.html', './css/style.css', './js/app.js', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(LOCAL_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // CHỈ cache tài nguyên LOCAL (cùng origin GitHub Pages)
  // KHÔNG can thiệp vào requests đến VPS (103.82.195.87)
  const isLocal = url.origin === self.location.origin;

  if (!isLocal) {
    // Để browser tự xử lý requests đến VPS/external
    return;
  }

  // Với tài nguyên local: network first, fallback to cache
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
