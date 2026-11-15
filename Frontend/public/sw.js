// Service worker: shows lock-time reminder notifications pushed by the server (Web Push).
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'F1 Fantasy', body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'F1 Fantasy', {
      body: data.body || '',
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      data: { url: data.url || '/' },
      tag: 'f1-fantasy-reminder',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url.startsWith(self.location.origin));
      if (open) return open.navigate(url).then((w) => w?.focus());
      return self.clients.openWindow(url);
    })
  );
});
