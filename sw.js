const CACHE_NAME = 'ai-assistant-v2';
const ASSETS = ['./', './index.html', './css/style.css', './js/app.js', './manifest.json'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS))));
self.addEventListener('fetch', e => e.respondWith(
  fetch(e.request).catch(() => caches.match(e.request))
));
