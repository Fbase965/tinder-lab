// The matching algorithm under test. Edit WEIGHTS or score() and reload.
export const WEIGHTS = {
  interests: 3,   // shared interests (Jaccard 0..1)
  age: 2,         // closeness in age, 0 at 15+ years apart
  desirability: 1, // smoothed like ratio received from others
  likesMe: 2,     // they already liked me
  superLikesMe: 3, // they super liked me (on top of likesMe)
  fresh: 0.5,     // boost profiles few people have seen yet
  height: 1,      // each side's height inside the other's preferred range
  distance: 1,    // closer is better, 0 at the max distance
}

const wants = (who, gender) =>
  who.looking_for === 'everyone' ||
  (who.looking_for === 'men' && gender === 'man') ||
  (who.looking_for === 'women' && gender === 'woman')

// 1 = inside the range, 0 = outside, 0.5 = unknown (no height or no preference set)
const inRange = (h, min, max) =>
  h == null || (min == null && max == null) ? 0.5 : h >= (min ?? 0) && h <= (max ?? Infinity) ? 1 : 0

const ageOk = (who, age) => age >= (who.pref_age_min ?? 18) && age <= (who.pref_age_max ?? 99)

export function score(me, c) {
  if (!wants(me, c.gender) || !wants(c, me.gender)) return null
  if (!ageOk(me, c.age) || !ageOk(c, me.age)) return null
  // Unknown distance (someone shared no location) is let through at a neutral score.
  const maxKm = Math.min(me.max_distance_km ?? Infinity, c.max_distance_km ?? Infinity)
  if (c.distance_km != null && c.distance_km > maxKm) return null
  const a = new Set(me.interests ?? []), b = new Set(c.interests ?? [])
  const shared = [...a].filter((x) => b.has(x)).length
  const union = new Set([...a, ...b]).size
  const parts = {
    interests: union ? shared / union : 0,
    age: Math.max(0, 1 - Math.abs(me.age - c.age) / 15),
    desirability: (c.likes_received + 1) / (c.seen_by + 2),
    likesMe: c.likes_me ? 1 : 0,
    superLikesMe: c.super_likes_me ? 1 : 0,
    fresh: 1 / (1 + c.seen_by),
    height: (inRange(c.height_cm, me.pref_height_min, me.pref_height_max) +
             inRange(me.height_cm, c.pref_height_min, c.pref_height_max)) / 2,
    distance: c.distance_km == null ? 0.5 : maxKm === Infinity ? 1 : 1 - c.distance_km / maxKm,
  }
  const total = Object.entries(parts).reduce((s, [k, v]) => s + WEIGHTS[k] * v, 0)
  return { total, parts }
}

export const rank = (me, candidates) =>
  candidates
    .map((c) => ({ ...c, score: score(me, c) }))
    .filter((c) => c.score)
    .sort((x, y) => y.score.total - x.score.total)

// 0–100 for the UI: share of the best possible score (every part at 1).
export const matchPercent = (score) =>
  Math.round((100 * score.total) / Object.values(WEIGHTS).reduce((s, w) => s + w, 0))

export const sharedInterests = (me, c) => (c.interests ?? []).filter((i) => (me.interests ?? []).includes(i))
