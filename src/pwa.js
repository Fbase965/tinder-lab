// Install-as-app and push notifications. The service worker is public/sw.js.
import { supabase } from './supabase'

export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export const isPhone = () => matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820
// iOS only allows Web Push inside an installed (home screen) app.
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

// Chrome/Android fire this once, early; keep it so the install card can show the native dialog later.
let installEvent = null
const listeners = new Set()
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; listeners.forEach((f) => f()) })
window.addEventListener('appinstalled', () => { installEvent = null; listeners.forEach((f) => f()) })
export const canPromptInstall = () => !!installEvent
export const onInstallChange = (f) => { listeners.add(f); return () => listeners.delete(f) }
export async function promptInstall() {
  if (!installEvent) return false
  installEvent.prompt()
  const { outcome } = await installEvent.userChoice
  installEvent = null
  return outcome === 'accepted'
}

export function registerServiceWorker() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})
}

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY
const toBytes = (b64) => Uint8Array.from(atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

// Must run from a tap (browsers only show the permission dialog after a user gesture).
export async function enablePush() {
  if (!pushSupported() || !VAPID) throw new Error('Este browser não suporta notificações.')
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('Notificações bloqueadas nas definições do browser.')
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(VAPID) })
  const { endpoint, keys } = sub.toJSON()
  const { error } = await supabase.rpc('save_push_subscription', { p_endpoint: endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth })
  if (error) throw error
}

// On sign-out: this device stops getting the previous account's notifications.
export async function disablePush() {
  if (!pushSupported()) return
  const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

export const pushEnabled = async () =>
  pushSupported() && Notification.permission === 'granted' &&
  !!(await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription())
