-- Run once in Supabase Dashboard > SQL Editor, AFTER premium.sql.
-- University instead of job: new column, and the deck / liked-you / viewed-you lists return it.
alter table profiles add column if not exists university text;
alter table profiles drop constraint if exists profiles_university_len;
alter table profiles add constraint profiles_university_len check (length(university) <= 80);

drop function if exists deck();
create function deck()
returns table (id uuid, name text, age int, gender text, looking_for text, bio text, university text, photos text[],
               interests text[], height_cm int, pref_height_min int, pref_height_max int,
               pref_age_min int, pref_age_max int, max_distance_km int, distance_km int,
               likes_received int, seen_by int, likes_me boolean, super_likes_me boolean, boosted boolean)
language sql security definer set search_path = public stable as $$
  with me as (
    select p.*, coalesce(extract(year from age(p.birth_date))::int, p.age) real_age, l.lat, l.lng, is_premium(p.id) premium
    from profiles p left join locations l on l.id = p.id
    where p.id = auth.uid()
  ), c as (
    select p.*, coalesce(extract(year from age(p.birth_date))::int, p.age) real_age,
           km_bucket(case when l.lat is not null and me.lat is not null then
             6371 * 2 * asin(sqrt(
               power(sin(radians(l.lat - me.lat) / 2), 2) +
               cos(radians(me.lat)) * cos(radians(l.lat)) * power(sin(radians(l.lng - me.lng) / 2), 2))) end) km,
           exists (select 1 from swipes s where s.swiper = p.id and s.target = me.id and s.liked) liked_me,
           exists (select 1 from subscriptions b where b.user_id = p.id and b.boost_until > now()) boosted
    from profiles p cross join me
    left join locations l on l.id = p.id
    where p.id <> me.id
      and not exists (select 1 from swipes s where s.swiper = me.id and s.target = p.id)
      and not exists (select 1 from blocks b where (b.blocker = me.id and b.blocked = p.id)
                                               or (b.blocker = p.id and b.blocked = me.id))
      and cardinality(p.photos) > 0
  )
  select c.id, c.name, c.real_age, c.gender, c.looking_for, c.bio, c.university, c.photos, c.interests,
         c.height_cm, c.pref_height_min, c.pref_height_max,
         c.pref_age_min, c.pref_age_max, c.max_distance_km, c.km,
         (select count(*) from swipes s where s.target = c.id and s.liked)::int,
         (select count(*) from swipes s where s.target = c.id)::int,
         c.liked_me and me.premium, -- free users still get these people early (order by), just not labelled
         exists (select 1 from swipes s where s.swiper = c.id and s.target = me.id and s.super),
         c.boosted
  from c cross join me
  where (me.looking_for = 'everyone' or (me.looking_for = 'men' and c.gender = 'man') or (me.looking_for = 'women' and c.gender = 'woman'))
    and (c.looking_for = 'everyone' or (c.looking_for = 'men' and me.gender = 'man') or (c.looking_for = 'women' and me.gender = 'woman'))
    and c.real_age between me.pref_age_min and me.pref_age_max
    and me.real_age between c.pref_age_min and c.pref_age_max
    and (c.km is null or c.km <= least(me.max_distance_km, c.max_distance_km))
  -- shortcut: the client ranks at most 300 candidates; move scoring into SQL if that cuts good matches
  order by c.boosted desc, c.liked_me desc, c.created_at desc
  limit 300
$$;

drop function if exists people_for_me(text);
create function people_for_me(p_kind text)
returns table (id uuid, name text, age int, gender text, looking_for text, bio text, university text, photos text[],
               interests text[], height_cm int, pref_height_min int, pref_height_max int,
               pref_age_min int, pref_age_max int, max_distance_km int, distance_km int,
               likes_received int, seen_by int, likes_me boolean, super_likes_me boolean, at timestamptz, total int)
language sql stable security definer set search_path = public as $$
  with me as (select p.id, l.lat, l.lng from profiles p left join locations l on l.id = p.id where p.id = auth.uid()),
  src as (
    select s.swiper who, s.created_at at from swipes s, me
    where p_kind = 'likes' and s.target = me.id and s.liked
      and not exists (select 1 from swipes mine where mine.swiper = me.id and mine.target = s.swiper)
    union all
    select v.viewer, v.viewed_at from profile_views v, me
    where p_kind = 'views' and v.viewed = me.id and v.viewed_at > now() - interval '30 days'
  ),
  visible as (
    select src.* from src, me
    where not exists (select 1 from blocks b where (b.blocker = me.id and b.blocked = src.who) or (b.blocker = src.who and b.blocked = me.id))
  )
  select p.id, p.name, coalesce(extract(year from age(p.birth_date))::int, p.age), p.gender, p.looking_for, p.bio, p.university, p.photos,
         p.interests, p.height_cm, p.pref_height_min, p.pref_height_max, p.pref_age_min, p.pref_age_max, p.max_distance_km,
         km_bucket(case when l.lat is not null and me.lat is not null then
           6371 * 2 * asin(sqrt(power(sin(radians(l.lat - me.lat) / 2), 2) +
             cos(radians(me.lat)) * cos(radians(l.lat)) * power(sin(radians(l.lng - me.lng) / 2), 2))) end),
         (select count(*) from swipes s where s.target = p.id and s.liked)::int,
         (select count(*) from swipes s where s.target = p.id)::int,
         exists (select 1 from swipes s where s.swiper = p.id and s.target = me.id and s.liked),
         exists (select 1 from swipes s where s.swiper = p.id and s.target = me.id and s.super),
         visible.at, (select count(*) from visible)::int
  from visible join profiles p on p.id = visible.who cross join me left join locations l on l.id = p.id
  where is_premium(me.id)
  union all -- free users: one row carrying just the count
  select null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
         (select count(*) from visible)::int
  where not is_premium(auth.uid())
  order by at desc nulls last
  limit 200
$$;
