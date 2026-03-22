// Service Worker — minéral Spirit
// Gère les push notifications et le clic sur notification

self.addEventListener('push', event => {
  const data = event.data?.json() ?? {};
  const title = data.title || 'minéral Spirit';
  const options = {
    body:    data.body  || '',
    icon:    data.icon  || '/icon-192.png',
    badge:   data.badge || '/badge-72.png',
    vibrate: [200, 100, 200],
    data:    { url: data.url || '/' },
    actions: [{ action: 'open', title: 'Ouvrir' }],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(list => {
        const existing = list.find(c => c.url.includes(self.location.origin));
        if (existing) {
          return existing.focus().then(c => c.navigate(targetUrl));
        }
        return clients.openWindow(targetUrl);
      })
  );
});
