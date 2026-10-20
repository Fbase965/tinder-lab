import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rank } from './algorithm.js'

const base = { age: 25, interests: [], likes_received: 0, seen_by: 0, likes_me: false }
const me = { ...base, gender: 'man', looking_for: 'women', interests: ['hiking', 'jazz'] }

test('filters by mutual orientation', () => {
  const out = rank(me, [
    { ...base, id: 1, gender: 'woman', looking_for: 'men' },
    { ...base, id: 2, gender: 'man', looking_for: 'women' },
    { ...base, id: 3, gender: 'woman', looking_for: 'women' },
    { ...base, id: 4, gender: 'woman', looking_for: 'everyone' },
  ])
  assert.deepEqual(out.map((c) => c.id).sort(), [1, 4])
})

test('shared interests and likes_me rank higher', () => {
  const w = { ...base, gender: 'woman', looking_for: 'men' }
  const out = rank(me, [
    { ...w, id: 'plain' },
    { ...w, id: 'shared', interests: ['hiking', 'jazz'] },
    { ...w, id: 'liker', likes_me: true },
  ])
  assert.equal(out[0].id, 'shared')
  assert.equal(out.at(-1).id, 'plain')
})

test('height preference ranks people in range higher', () => {
  const w = { ...base, gender: 'woman', looking_for: 'men' }
  const picky = { ...me, height_cm: 180, pref_height_min: 160, pref_height_max: 175 }
  const out = rank(picky, [
    { ...w, id: 'short', height_cm: 150 },
    { ...w, id: 'fits', height_cm: 168 },
    { ...w, id: 'unknown' },
  ])
  assert.deepEqual(out.map((c) => c.id), ['fits', 'unknown', 'short'])
  assert.equal(out[0].score.parts.height, 0.75) // fits mine (1), she has no preference (0.5)
})

test('age range and distance are hard filters, both ways', () => {
  const w = { ...base, gender: 'woman', looking_for: 'men', pref_age_min: 18, pref_age_max: 99, max_distance_km: 100 }
  const me2 = { ...me, pref_age_min: 22, pref_age_max: 30, max_distance_km: 50 }
  const out = rank(me2, [
    { ...w, id: 'ok', age: 26, distance_km: 10 },
    { ...w, id: 'too-old', age: 40 },
    { ...w, id: 'wants-older', age: 26, pref_age_min: 30 },
    { ...w, id: 'too-far', age: 26, distance_km: 80 },
    { ...w, id: 'no-location', age: 26 },
  ])
  assert.deepEqual(out.map((c) => c.id).sort(), ['no-location', 'ok'])
  assert.equal(out.find((c) => c.id === 'ok').score.parts.distance, 0.8)
})

test('super like outranks plain like', () => {
  const w = { ...base, gender: 'woman', looking_for: 'men' }
  const out = rank(me, [{ ...w, id: 'like', likes_me: true }, { ...w, id: 'super', likes_me: true, super_likes_me: true }])
  assert.equal(out[0].id, 'super')
})

test('matchPercent is 100 when every part is maxed', async () => {
  const { matchPercent, WEIGHTS } = await import('./algorithm.js')
  const total = Object.values(WEIGHTS).reduce((s, w) => s + w, 0)
  assert.equal(matchPercent({ total }), 100)
  assert.equal(matchPercent({ total: 0 }), 0)
})
