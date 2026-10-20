// Service worker: makes the site installable and shows push notifications (api/push.js).
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (e) => {
  const { title = 'faísca', body = '', url = '/', tag } = e.data?.json() ?? {}
  e.waitUntil((async () => {
    // The app already shows matches and messages live while it is on screen.
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    if (open.some((c) => c.visibilityState === 'visible')) return
    await self.registration.showNotification(title, {
      body, tag, renotify: !!tag, data: { url }, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png',
    })
  })())
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
