import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { rank } from './algorithm'


// Ranked deck plus swipe/rewind. Shared by Discover and Explore so both see the same people.
// plan: usePlan() (Premium.jsx). Limits are enforced by the database; these copies only drive the UI.
export function useDeck(me, toast, plan, onLimit) {
  const [deck, setDeck] = useState(null)
  const [last, setLast] = useState(null) // { card, kind } of the most recent swipe, for rewind
  const [superLeft, setSuperLeft] = useState(1)
  useEffect(() => { if (plan.loaded) setSuperLeft(plan.superLeft) }, [plan.loaded, plan.superLeft])

  const reload = useCallback(() => supabase.rpc('deck').then(({ data, error }) => {
    if (error) toast(error.message)
    setDeck(error ? [] : rank(me, data))
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
    const [{ data: p }, { data: msgs }] = await Promise.all([
      supabase.from('profiles').select('*').in('id', ids),
      supabase.from('messages').select('a, b, sender, body, created_at').order('created_at', { ascending: false }).limit(500),
    ])
    setList(ids.map((id, i) => {
      const prof = p?.find((x) => x.id === id)
      return prof && { ...prof, matched_at: m[i].created_at, last: msgs?.find((x) => x.a === id || x.b === id) }
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

  return { list, reload: load }
}

// Matches nobody has written to yet, or where the last word is theirs.
export const needsReply = (me, m) => !m.last || m.last.sender !== me.id

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
