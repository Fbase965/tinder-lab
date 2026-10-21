import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { rank } from './algorithm'


// Ranked deck plus swipe/rewind. Shared by Discover and Explore so both see the same people.
// plan: usePlan() (Premium.jsx). Limits are enforced by the database; these copies only drive the UI.
export function useDeck(me, toast, plan, onLimit) {
  const [deck, setDeck] = useState(null)
  const [last, setLast] = useState(null) // { card, kind } of the most recent swipe, for rewind
  const [superLeft, setSuperLeft] = useState(1)
  useEffect(() => { if (plan.loaded) setSuperLeft(plan.superLeft) }, [plan.loaded, plan.superLeft])

  const reload = useCallback(() => supabase.rpc('deck').then(async ({ data, error }) => {
    if (error) toast(error.message)
    setDeck(error ? [] : rank(me, await withVerified(data)))
  }), [me, toast])

  useEffect(() => { reload() }, [reload, plan.premium]) // premium reveals who liked you in the deck

  // Returns 'match', 'ok' or null (failed).
  const swipe = async (card, kind) => {
    if (kind === 'super' && superLeft <= 0) {
      toast(plan.premium ? 'Já usaste os 5 Super Likes de hoje' : 'Já usaste o teu Super Like de hoje. Com faísca+ tens 5.')
      if (!plan.premium) onLimit()
      return null
    }
    setDeck((d) => d?.filter((x) => x.id !== card.id))
    const liked = kind !== 'nope'
    const { error } = await supabase.from('swipes').insert({ swiper: me.id, target: card.id, liked, super: kind === 'super' })
    if (error) { // e.g. super_like_limit from the database: put the card back
      setDeck((d) => (card.swipeable ? d : [card, ...d])) // swipeable = opened from the liked-you list, not the deck
      if (error.message.includes('like_limit') && !error.message.includes('super')) {
        toast('Chegaste aos 50 likes de hoje. Com faísca+ são ilimitados.'); onLimit()
      } else toast(error.message.includes('super_like_limit') ? 'Já não tens Super Likes hoje' : error.message)
      return null
    }
    setLast({ card, kind })
    if (kind === 'super') setSuperLeft((n) => n - 1)
    if (!liked) return 'ok'
    const [a, b] = [me.id, card.id].sort()
    const { data } = await supabase.from('matches').select('a').eq('a', a).eq('b', b).maybeSingle()
    if (data) setLast(null) // a match can't be rewound: it would delete the other person's chat
    return data ? 'match' : 'ok'
  }

  const rewind = async () => {
    if (!last) return
    // RLS only allows rewinding the last 10 minutes and never a match: 0 rows deleted means too late.
    const { data, error } = await supabase.from('swipes').delete().eq('swiper', me.id).eq('target', last.card.id).select()
    if (error) return toast(error.message)
    if (!data.length) { setLast(null); return toast('Já não dá para desfazer este perfil') }
    setDeck((d) => [last.card, ...d])
    if (last.kind === 'super') setSuperLeft((n) => n + 1)
    setLast(null)
    toast('Perfil recuperado')
  }

  // Brings back everyone the user passed on (recycle_passes in supabase/recycle.sql).
  const recycle = async () => {
    const { data, error } = await supabase.rpc('recycle_passes')
    if (error) return toast(error.message)
    if (!data) return toast('Ainda não passaste ninguém')
    setLast(null)
    toast(`${data} ${data === 1 ? 'perfil voltou' : 'perfis voltaram'} ao teu deck`)
    reload()
  }

  return { deck, swipe, rewind, canRewind: !!last, superLeft, reload, recycle }
}

// Matches with their profile and last message, live.
export function useMatches(me) {
  const [list, setList] = useState(null)
  const load = useCallback(async () => {
    const { data: m } = await supabase.from('matches').select('*').order('created_at', { ascending: false })
    const ids = (m ?? []).map((x) => (x.a === me.id ? x.b : x.a))
    if (!ids.length) return setList([])
    // shortcut: pulls recent messages across all matches to find each last one; move to an SQL view if chats get big
    const [{ data: p }, { data: msgs }, { data: reads }, badges] = await Promise.all([
      supabase.from('profiles').select('*').in('id', ids),
      supabase.from('messages').select('a, b, sender, body, created_at').order('created_at', { ascending: false }).limit(500),
      supabase.from('chat_reads').select('other, read_at'),
      badgeMap(ids),
    ])
    setList(ids.map((id, i) => {
      const prof = p?.find((x) => x.id === id)
      return prof && { ...prof, ...badges.get(id), matched_at: m[i].created_at, read_at: reads?.find((r) => r.other === id)?.read_at, last: msgs?.find((x) => x.a === id || x.b === id) }
    }).filter(Boolean))
  }, [me.id])

  useEffect(() => {
    load()
    const ch = supabase.channel('matches')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, load)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, load)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [load])

  // mark_read returns the server time it stored, so the alert compares server clocks only.
  const markRead = useCallback((id, at) => setList((xs) => xs?.map((m) => (m.id === id ? { ...m, read_at: at } : m))), [])
  return { list, reload: load, markRead }
}

// Name badges: verified = confirmed email or phone, plus = active faísca+. Both are private, so ask the server.
const badgeMap = async (ids) => {
  if (!ids.length) return new Map()
  const { data } = await supabase.rpc('badges', { p_ids: ids })
  return new Map((data ?? []).map((b) => [b.id, { verified: b.phone, plus: b.premium, role: b.role }]))
}
export async function withVerified(rows) {
  const badges = await badgeMap((rows ?? []).map((r) => r.id).filter(Boolean))
  return (rows ?? []).map((r) => ({ ...r, ...badges.get(r.id) }))
}

// New match never opened, or their last message arrived after I last opened the chat.
export const isUnread = (me, m) => m.last
  ? m.last.sender !== me.id && !(m.read_at && new Date(m.read_at) >= new Date(m.last.created_at))
  : !m.read_at

export function completeness(p, hasLocation) {
  const checks = [p.photos?.length >= 3, !!p.bio, !!p.university, p.interests?.length >= 3, !!p.height_cm, hasLocation]
  return Math.round((100 * checks.filter(Boolean).length) / checks.length)
}

const sameDay = (a, b) => a.toDateString() === b.toDateString()
const yesterday = () => new Date(Date.now() - 864e5)

export function shortTime(iso) {
  const d = new Date(iso)
  if (sameDay(d, new Date())) return d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })
  if (sameDay(d, yesterday())) return 'Ontem'
  return d.toLocaleDateString('pt-PT', { weekday: 'short' })
}

export function dayLabel(iso) {
  const d = new Date(iso)
  if (sameDay(d, new Date())) return 'HOJE'
  if (sameDay(d, yesterday())) return 'ONTEM'
  return d.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' }).toUpperCase()
}

// My likes, newest first, with profile, badges and whether it became a match (my own swipes are readable).
export async function loadMyLikes(limit = 100) {
  const { data: s } = await supabase.from('swipes').select('target, super, created_at').eq('liked', true)
    .order('created_at', { ascending: false }).limit(limit)
  const ids = (s ?? []).map((x) => x.target)
  if (!ids.length) return []
  const [{ data: p }, { data: m }] = await Promise.all([supabase.from('profiles').select('*').in('id', ids), supabase.from('matches').select('a, b')])
  const matched = new Set((m ?? []).flatMap((x) => [x.a, x.b]))
  const people = await withVerified(p)
  return s.map((x) => {
    const prof = people.find((y) => y.id === x.target)
    return prof && { ...prof, super: x.super, liked_at: x.created_at, matched: matched.has(x.target) }
  }).filter(Boolean)
}

// "New since you last opened Explore" for likes and views: totals now minus totals when last seen.
// shortcut: seen totals live in this browser (another phone shows them as new again); move to the DB if that annoys.
const KINDS = ['likes', 'views']
const seenKey = (uid, k) => `faisca-seen-${uid}-${k}`
const readSeen = (uid) => Object.fromEntries(KINDS.map((k) => { try { return [k, +localStorage.getItem(seenKey(uid, k)) || 0] } catch { return [k, 0] } }))
export function useExploreNews(me) {
  const [totals, setTotals] = useState({ likes: 0, views: 0 })
  const [seen, setSeen] = useState(() => readSeen(me.id))
  const latest = useRef(totals)
  useEffect(() => { latest.current = totals }, [totals])
  const load = useCallback(() => Promise.all(KINDS.map((k) => supabase.rpc('people_for_me', { p_kind: k })))
    .then((rs) => setTotals(Object.fromEntries(KINDS.map((k, i) => [k, rs[i].data?.[0]?.total ?? 0])))), [])
  useEffect(() => {
    load()
    const onShow = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onShow)
    return () => document.removeEventListener('visibilitychange', onShow)
  }, [load])
  const markSeen = useCallback(() => {
    setSeen(latest.current)
    try { KINDS.forEach((k) => localStorage.setItem(seenKey(me.id, k), latest.current[k])) } catch { /* private mode: badge just comes back */ }
  }, [me.id])
  // Views expire after 30 days, so a total can drop below what was seen: never negative.
  const news = Object.fromEntries(KINDS.map((k) => [k, Math.max(0, totals[k] - seen[k])]))
  return { news, total: news.likes + news.views, markSeen }
}
