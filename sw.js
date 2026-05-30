const CACHE_NAME = 'ai-assistant-v6';
const LOCAL_ASSETS = ['./', './index.html', './css/style.css', './js/app.js', './manifest.json'];
const VAPID_PUBLIC_KEY = 'BB7YphPy5ZbDpecs8B9lhOnLoAQ7aSTHEUKVhxV7PH8ZITMSf0pTwYvi9SBh794p-E3GNyyiP4DJPb4iQHYogmI';

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
      if (!res || res.status !== 200 || res.type !== 'basic') {
        return res;
      }
      const responseToCache = res.clone();
      caches.open(CACHE_NAME).then(c => c.put(e.request, responseToCache));
      return res;
    }).catch(() => caches.match(e.request))
  );
});

// ===== PUSH NOTIFICATIONS =====
self.addEventListener('push', e => {
  let data = { title: 'Thông báo', body: 'Bạn có thông báo mới!', url: '/' };
  try {
    if (e.data) {
      data = e.data.json();
    }
  } catch(err) {}

  const options = {
    body: data.body,
    icon: '/ai-assistant/icons/icon-192.png',
    badge: '/ai-assistant/icons/icon-192.png',
    data: data,
    vibrate: [200, 100, 200],
    requireInteraction: data.priority === 'critical'
  };
  
  // Gửi data sang cho các tab đang mở
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      clients.forEach(client => {
        client.postMessage({ type: 'push_received', data: data });
      });
    }).then(() => {
      // Chỉ hiện thông báo notification nếu không phải là silent notification
      if (data.silent) return null;
      return self.registration.showNotification(data.title, options);
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
