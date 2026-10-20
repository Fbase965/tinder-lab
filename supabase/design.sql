-- Run once in Supabase Dashboard > SQL Editor. Adds the job field and the stats the profile page shows.
alter table profiles add column if not exists job text not null default '' check (length(job) <= 60);

-- Likes received are other people's swipes, hidden by RLS, so count them server-side.
create or replace function my_stats()
returns table (likes_received int, matches int)
language sql security definer set search_path = public stable as $$
  select (select count(*) from swipes where target = auth.uid() and liked)::int,
         (select count(*) from matches where auth.uid() in (a, b))::int
$$;

drop function if exists deck();
create function deck()
returns table (id uuid, name text, age int, gender text, looking_for text, bio text, job text, photos text[],
               interests text[], height_cm int, pref_height_min int, pref_height_max int,
               pref_age_min int, pref_age_max int, max_distance_km int, distance_km int,
               likes_received int, seen_by int, likes_me boolean, super_likes_me boolean)
language sql security definer set search_path = public stable as $$
  select p.id, p.name, p.age, p.gender, p.looking_for, p.bio, p.job, p.photos, p.interests,
         p.height_cm, p.pref_height_min, p.pref_height_max,
         p.pref_age_min, p.pref_age_max, p.max_distance_km,
         case when l.id is not null and me.id is not null then
           round(6371 * 2 * asin(sqrt(
             power(sin(radians(l.lat - me.lat) / 2), 2) +
             cos(radians(me.lat)) * cos(radians(l.lat)) * power(sin(radians(l.lng - me.lng) / 2), 2))))::int
         end,
         (select count(*) from swipes s where s.target = p.id and s.liked)::int,
         (select count(*) from swipes s where s.target = p.id)::int,
         exists (select 1 from swipes s where s.swiper = p.id and s.target = auth.uid() and s.liked),
         exists (select 1 from swipes s where s.swiper = p.id and s.target = auth.uid() and s.super)
  from profiles p
  left join locations l on l.id = p.id
  left join locations me on me.id = auth.uid()
  where p.id <> auth.uid()
    and not exists (select 1 from swipes s where s.swiper = auth.uid() and s.target = p.id)
    and not exists (select 1 from blocks b where (b.blocker = auth.uid() and b.blocked = p.id)
                                             or (b.blocker = p.id and b.blocked = auth.uid()))
$$;
