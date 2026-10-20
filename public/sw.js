// Service worker: makes the site installable and shows push notifications (api/push.js).
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (e) => {
  const { title = 'faísca', body = '', url = '/', tag, force } = e.data?.json() ?? {}
  // Always show something: Safari revokes the subscription after a few pushes that show nothing,
  // and Chrome replaces them with a generic notice. (force: admin test, supabase/push-test.sql)
  e.waitUntil(self.registration.showNotification(title, {
    body, tag, renotify: !!tag, data: { url, force }, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png',
  }))
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = new URL(e.notification.data?.url ?? '/', self.location.origin).href
  e.waitUntil((async () => {
    const [client] = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    if (!client) return self.clients.openWindow(url)
    await client.navigate(url)
    return client.focus()
  })())
})
