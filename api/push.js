// Vercel function called by the database (supabase/push.sql) to deliver Web Push notifications.
import { timingSafeEqual } from 'node:crypto'
import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

const { PUSH_SECRET, VAPID_PRIVATE_KEY, VITE_VAPID_PUBLIC_KEY, VITE_SUPABASE_URL, VITE_SUPABASE_KEY } = process.env
webpush.setVapidDetails('https://faiscauni.vercel.app', VITE_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_KEY)

const sameSecret = (given = '') => {
  const a = Buffer.from(given), b = Buffer.from(PUSH_SECRET)
  return a.length === b.length && timingSafeEqual(a, b)
}

export default async function handler(req, res) {
  if (req.method !== 'POST' || !sameSecret(req.headers['x-push-secret'])) return res.status(401).end()
  const { subscriptions = [], title, body, url, tag, force } = req.body ?? {}
  const payload = JSON.stringify({ title, body, url, tag, force })
  const gone = [], failed = []
  await Promise.all(subscriptions.map((sub) =>
    webpush.sendNotification(sub, payload, { TTL: 86400 }).catch((e) => {
      if (e.statusCode === 404 || e.statusCode === 410) gone.push(sub.endpoint)
      else failed.push(`${e.statusCode ?? ''} ${e.body ?? e.message}`.trim().slice(0, 200))
    })))
  if (gone.length) await supabase.rpc('drop_push_subscriptions', { p_secret: PUSH_SECRET, p_endpoints: gone })
  res.json({ sent: subscriptions.length - gone.length - failed.length, gone: gone.length, failed }) // shown in admin_push_status()
}
