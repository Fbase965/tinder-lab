-- Run once in Supabase Dashboard > SQL Editor, AFTER design.sql.
-- Launch hardening: server-side matching filters, coarse distances, birth dates (18+),
-- photo URL checks, safer rewind, account deletion, indexes.

-- ---------- Profiles: who can read them ----------
-- Strangers only reach each other through deck(), which applies everyone's preferences.
-- Direct reads are limited to yourself and your matches.
drop policy if exists "profiles read" on profiles;
drop policy if exists "profiles read own or matched" on profiles;
create policy "profiles read own or matched" on profiles for select to authenticated using (
  id = auth.uid() or exists (
    select 1 from matches m where (m.a = auth.uid() and m.b = profiles.id) or (m.b = auth.uid() and m.a = profiles.id)));

-- ---------- Age: birth date, minimum 18 ----------
alter table profiles add column if not exists birth_date date;
alter table profiles add column if not exists accepted_terms_at timestamptz;
alter table profiles drop constraint if exists profiles_age_check;
alter table profiles add constraint profiles_age_check check (age >= 18);
alter table profiles drop constraint if exists profiles_pref_age_min_check;
alter table profiles add constraint profiles_pref_age_min_check check (pref_age_min >= 18);
alter table profiles alter column pref_age_min set default 18;

-- Text limits the form already has, now enforced (not valid = existing rows are not rechecked).
alter table profiles drop constraint if exists profiles_limits;
alter table profiles add constraint profiles_limits check (
  length(name) between 1 and 40 and length(coalesce(bio, '')) <= 500 and cardinality(coalesce(interests, '{}')) <= 20) not valid;

-- ---------- Distance: fixed steps only ----------
-- Exact km (and a 1 km max-distance slider) let anyone trilaterate a person. Distances are
-- shown and filtered only in these steps, and max distance must be one of them.
create or replace function km_bucket(d double precision) returns int language sql immutable as $$
  select case when d is null then null when d <= 5 then 5 when d <= 10 then 10 when d <= 25 then 25
              when d <= 50 then 50 when d <= 100 then 100 when d <= 200 then 200 when d <= 500 then 500 else 1000 end
$$;
alter table profiles drop constraint if exists profiles_max_distance_km_check;
update profiles set max_distance_km = km_bucket(max_distance_km) where max_distance_km not in (5, 10, 25, 50, 100, 200, 500);
alter table profiles add constraint profiles_max_distance_km_check check (max_distance_km in (5, 10, 25, 50, 100, 200, 500));

-- ---------- Profile writes: photos, birth date, consent ----------
-- Hardcoded hosts: the Azure container (api/photos.js) and the old Supabase bucket, own folder only.
create or replace function profile_guard() returns trigger language plpgsql as $$
begin
  if exists (select 1 from unnest(new.photos) u
             where u not like 'https://faiscadoj8ck.blob.core.windows.net/photos/' || new.id || '/%'
               and u not like 'https://xuqpfehokposmawiogzj.supabase.co/storage/v1/object/public/photos/' || new.id || '/%') then
    raise exception 'invalid_photo_url';
  end if;
  if tg_op = 'UPDATE' and old.birth_date is not null and new.birth_date is distinct from old.birth_date then
    raise exception 'birth_date_locked';
  end if;
  if new.birth_date is not null then
    if new.birth_date > current_date - interval '18 years' then raise exception 'too_young'; end if;
    new.age := extract(year from age(new.birth_date))::int;
  end if;
  if tg_op = 'INSERT' then new.accepted_terms_at := now(); end if; -- sign-up requires ticking the terms box
  return new;
end $$;
drop trigger if exists profile_guard on profiles;
create trigger profile_guard before insert or update on profiles for each row execute function profile_guard();

-- ---------- Location: rounded, changeable every 6 hours, removable ----------
alter table locations alter column lat drop not null, alter column lng drop not null;
create or replace function location_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.lat is not null and old.updated_at > now() - interval '6 hours' then
    raise exception 'location_rate_limit';
  end if;
  new.lat := round(new.lat::numeric, 2); new.lng := round(new.lng::numeric, 2); -- ~1 km grid
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists location_guard on locations;
create trigger location_guard before insert or update on locations for each row execute function location_guard();
-- No delete: removing sets lat/lng to null, so remove + re-add cannot skip the 6-hour wait.
drop policy if exists "locations own" on locations;
drop policy if exists "locations read own" on locations;
drop policy if exists "locations insert own" on locations;
drop policy if exists "locations update own" on locations;
create policy "locations read own" on locations for select to authenticated using (id = auth.uid());
create policy "locations insert own" on locations for insert to authenticated with check (id = auth.uid());
create policy "locations update own" on locations for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ---------- Rewind: last 10 minutes, never once it made a match ----------
drop trigger if exists swipe_unmatch on swipes;
drop function if exists on_unswipe();
drop policy if exists "swipes delete own" on swipes;
create policy "swipes delete own" on swipes for delete to authenticated using (
  swiper = auth.uid() and created_at > now() - interval '10 minutes'
  and not exists (select 1 from matches m where m.a = least(swiper, target) and m.b = greatest(swiper, target)));

-- ---------- Old Supabase bucket: read/delete only, new uploads go through api/photos.js ----------
drop policy if exists "photos upload own" on storage.objects;
drop policy if exists "photos update own" on storage.objects;

-- ---------- Indexes for deck() and chats ----------
create index if not exists swipes_target_idx on swipes (target);
create index if not exists messages_pair_idx on messages (a, b, created_at);

-- ---------- Account deletion (GDPR art. 17) ----------
-- Everything cascades from auth.users. The app deletes the photos first (api/photos.js removeAll).
create or replace function delete_me() returns void language sql security definer set search_path = public as $$
  delete from auth.users where id = auth.uid()
$$;

-- ---------- Deck: every hard filter on the server ----------
drop function if exists deck();
create function deck()
returns table (id uuid, name text, age int, gender text, looking_for text, bio text, job text, photos text[],
               interests text[], height_cm int, pref_height_min int, pref_height_max int,
               pref_age_min int, pref_age_max int, max_distance_km int, distance_km int,
               likes_received int, seen_by int, likes_me boolean, super_likes_me boolean)
language sql security definer set search_path = public stable as $$
  with me as (
    select p.*, coalesce(extract(year from age(p.birth_date))::int, p.age) real_age, l.lat, l.lng
    from profiles p left join locations l on l.id = p.id
    where p.id = auth.uid()
  ), c as (
    select p.*, coalesce(extract(year from age(p.birth_date))::int, p.age) real_age,
           km_bucket(case when l.lat is not null and me.lat is not null then
             6371 * 2 * asin(sqrt(
               power(sin(radians(l.lat - me.lat) / 2), 2) +
               cos(radians(me.lat)) * cos(radians(l.lat)) * power(sin(radians(l.lng - me.lng) / 2), 2))) end) km,
           exists (select 1 from swipes s where s.swiper = p.id and s.target = me.id and s.liked) liked_me
    from profiles p cross join me
    left join locations l on l.id = p.id
    where p.id <> me.id
      and not exists (select 1 from swipes s where s.swiper = me.id and s.target = p.id)
      and not exists (select 1 from blocks b where (b.blocker = me.id and b.blocked = p.id)
                                               or (b.blocker = p.id and b.blocked = me.id))
      and cardinality(p.photos) > 0
  )
  select c.id, c.name, c.real_age, c.gender, c.looking_for, c.bio, c.job, c.photos, c.interests,
         c.height_cm, c.pref_height_min, c.pref_height_max,
         c.pref_age_min, c.pref_age_max, c.max_distance_km, c.km,
         (select count(*) from swipes s where s.target = c.id and s.liked)::int,
         (select count(*) from swipes s where s.target = c.id)::int,
         c.liked_me,
         exists (select 1 from swipes s where s.swiper = c.id and s.target = me.id and s.super)
  from c cross join me
  where (me.looking_for = 'everyone' or (me.looking_for = 'men' and c.gender = 'man') or (me.looking_for = 'women' and c.gender = 'woman'))
    and (c.looking_for = 'everyone' or (c.looking_for = 'men' and me.gender = 'man') or (c.looking_for = 'women' and me.gender = 'woman'))
    and c.real_age between me.pref_age_min and me.pref_age_max
    and me.real_age between c.pref_age_min and c.pref_age_max
    and (c.km is null or c.km <= least(me.max_distance_km, c.max_distance_km))
  -- shortcut: the client ranks at most 300 candidates; move scoring into SQL if that cuts good matches
  order by c.liked_me desc, c.created_at desc
  limit 300
$$;
