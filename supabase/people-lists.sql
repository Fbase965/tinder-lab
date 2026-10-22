-- Run once in Supabase Dashboard > SQL Editor, AFTER university.sql.
-- The "Gostos" and "Gostaste de" lists. Profiles of people you haven't matched are hidden from direct reads
-- (launch.sql), so this returns them with the like: 'likers' = who liked me (faísca+), 'liked' = whom I liked.
-- Blocked people left out both ways.
create or replace function people_list(p_kind text)
returns table (id uuid, name text, age int, gender text, looking_for text, bio text, university text, photos text[],
               interests text[], height_cm int, pref_height_min int, pref_height_max int,
               pref_age_min int, pref_age_max int, max_distance_km int, distance_km int,
               super boolean, liked_at timestamptz, matched boolean)
language sql stable security definer set search_path = public as $$
  with me as (select p.id, l.lat, l.lng from profiles p left join locations l on l.id = p.id where p.id = auth.uid()),
  src as (
    select s.swiper who, s.super, s.created_at at from swipes s, me
    where p_kind = 'likers' and s.target = me.id and s.liked and is_premium(me.id)
    union all
    select s.target, s.super, s.created_at from swipes s, me
    where p_kind = 'liked' and s.swiper = me.id and s.liked
  )
  select p.id, p.name, coalesce(extract(year from age(p.birth_date))::int, p.age), p.gender, p.looking_for, p.bio, p.university, p.photos,
         p.interests, p.height_cm, p.pref_height_min, p.pref_height_max, p.pref_age_min, p.pref_age_max, p.max_distance_km,
         km_bucket(case when l.lat is not null and me.lat is not null then
           6371 * 2 * asin(sqrt(power(sin(radians(l.lat - me.lat) / 2), 2) +
             cos(radians(me.lat)) * cos(radians(l.lat)) * power(sin(radians(l.lng - me.lng) / 2), 2))) end),
         src.super, src.at,
         exists (select 1 from matches m where m.a = least(me.id, p.id) and m.b = greatest(me.id, p.id))
  from src join profiles p on p.id = src.who cross join me left join locations l on l.id = p.id
  where not exists (select 1 from blocks b where (b.blocker = me.id and b.blocked = p.id) or (b.blocker = p.id and b.blocked = me.id))
  order by src.at desc
  limit 200
$$;
revoke execute on function people_list(text) from public, anon;
grant execute on function people_list(text) to authenticated;
