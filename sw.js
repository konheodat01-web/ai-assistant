const CACHE_NAME = 'ai-assistant-v4';
const LOCAL_ASSETS = ['./', './index.html', './css/style.css', './js/app.js', './manifest.json'];
const VAPID_PUBLIC_KEY = 'BNpXnlHm5tfuilpDZLBu5x-2brayp_XvSbYwFXBbAy36UlcSQQOl263zxQ2jeq8oIJbN1FvUK0uyVPngPIlp7Ew';

// ===== CACHE =====
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(LOCAL_ASSETS)).catch(() => {}));
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
  if (url.origin !== self.location.origin) return; // Không can thiệp request ngoài
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) caches.open(CACHE_NAME).then(c => c.put(e.request, res.clone()));
      return res;
    }).catch(() => caches.match(e.request))
  );
});

// ===== PUSH NOTIFICATIONS =====
self.addEventListener('push', e => {
  let data = { title: 'Trợ lý AI', body: 'Có thông báo mới!', icon: './icons/icon-192.png', url: './' };
  try { data = { ...data, ...e.data.json() }; } catch(err) {}

  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || './icons/icon-192.png',
      badge: './icons/icon-192.png',
      vibrate: [200, 100, 200],
      data: { url: data.url || './' },
      actions: [
        { action: 'open', title: '📱 Mở app' },
        { action: 'dismiss', title: 'Bỏ qua' }
      ],
      requireInteraction: false,
      tag: 'ai-notification' // Ghi đè notification cũ thay vì stack
    })
  );
});

// Click notification → mở app
self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'dismiss') return;

  const url = e.notification.data?.url || './';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Nếu app đang mở → focus vào
      for (const client of clientList) {
        if (client.url.includes('ai-assistant') && 'focus' in client) {
          return client.focus();
        }
      }
      // Nếu không → mở tab mới
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// Background sync (khi có kết nối lại)
self.addEventListener('sync', e => {
  if (e.tag === 'sync-messages') {
    console.log('Background sync triggered');
  }
});
