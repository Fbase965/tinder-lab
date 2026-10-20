-- Full schema for a FRESH Supabase project. Run once in SQL Editor.
-- (Existing project: run only the newer migration files instead.)
create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null,
  age int not null check (age >= 18),
  gender text not null check (gender in ('man','woman','other')),
  looking_for text not null check (looking_for in ('men','women','everyone')),
  bio text default '',
  photos text[] not null default '{}' check (cardinality(photos) <= 6),
  interests text[] default '{}',
  height_cm int check (height_cm between 120 and 230),
  pref_height_min int check (pref_height_min between 120 and 230),
  pref_height_max int check (pref_height_max between 120 and 230),
  created_at timestamptz default now()
);

create table if not exists swipes (
  swiper uuid references profiles on delete cascade,
  target uuid references profiles on delete cascade,
  liked boolean not null,
  created_at timestamptz default now(),
  primary key (swiper, target)
);

-- a < b so each pair is stored once
create table if not exists matches (
  a uuid references profiles on delete cascade,
  b uuid references profiles on delete cascade,
  created_at timestamptz default now(),
  primary key (a, b),
  check (a < b)
);

create table if not exists messages (
  id bigint generated always as identity primary key,
  a uuid, b uuid,
  sender uuid not null default auth.uid() references profiles on delete cascade,
  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz default now(),
  foreign key (a, b) references matches on delete cascade
);

alter table profiles enable row level security;
alter table swipes enable row level security;
alter table matches enable row level security;
alter table messages enable row level security;

create policy "profiles read" on profiles for select to authenticated using (true);
create policy "profiles own insert" on profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles own update" on profiles for update to authenticated using (id = auth.uid());

create policy "swipes own" on swipes for select to authenticated using (swiper = auth.uid());
create policy "swipes insert" on swipes for insert to authenticated with check (swiper = auth.uid() and target <> auth.uid());

create policy "matches mine" on matches for select to authenticated using (auth.uid() in (a, b));

create policy "messages read" on messages for select to authenticated using (auth.uid() in (a, b));
create policy "messages send" on messages for insert to authenticated with check (sender = auth.uid() and auth.uid() in (a, b));

-- Mutual like => match. Security definer: the reverse swipe is hidden from the swiper by RLS.
create or replace function on_swipe() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.liked and exists (select 1 from swipes where swiper = new.target and target = new.swiper and liked) then
    insert into matches (a, b) values (least(new.swiper, new.target), greatest(new.swiper, new.target))
    on conflict do nothing;
  end if;
  return new;
end $$;

drop trigger if exists swipe_match on swipes;
create trigger swipe_match after insert on swipes for each row execute function on_swipe();

-- Unswiped candidates plus aggregate signals the ranking algorithm (src/algorithm.js) uses.
create or replace function deck()
returns table (id uuid, name text, age int, gender text, looking_for text, bio text, photos text[],
               interests text[], height_cm int, pref_height_min int, pref_height_max int,
               likes_received int, seen_by int, likes_me boolean)
language sql security definer set search_path = public stable as $$
  select p.id, p.name, p.age, p.gender, p.looking_for, p.bio, p.photos, p.interests,
         p.height_cm, p.pref_height_min, p.pref_height_max,
         (select count(*) from swipes s where s.target = p.id and s.liked)::int,
         (select count(*) from swipes s where s.target = p.id)::int,
         exists (select 1 from swipes s where s.swiper = p.id and s.target = auth.uid() and s.liked)
  from profiles p
  where p.id <> auth.uid()
    and not exists (select 1 from swipes s where s.swiper = auth.uid() and s.target = p.id)
$$;

alter publication supabase_realtime add table matches, messages;

-- ===== features.sql =====
-- Run once in Supabase Dashboard > SQL Editor, AFTER height.sql.
-- Adds: super likes, rewind, age range, distance, unmatch, block/report.

-- Super like (3 per 24h, enforced here so the client can't cheat)
alter table swipes add column if not exists super boolean not null default false;
alter table swipes drop constraint if exists super_is_like;
alter table swipes add constraint super_is_like check (not super or liked);

create or replace function limit_super() returns trigger language plpgsql as $$
begin
  if new.super and (select count(*) from swipes
                    where swiper = new.swiper and super and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'super_like_limit';
  end if;
  return new;
end $$;
drop trigger if exists swipe_super_limit on swipes;
create trigger swipe_super_limit before insert on swipes for each row execute function limit_super();

-- Rewind: users may delete their own swipes; undoing a like also undoes its match.
drop policy if exists "swipes delete own" on swipes;
create policy "swipes delete own" on swipes for delete to authenticated using (swiper = auth.uid());

create or replace function on_unswipe() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.liked then
    delete from matches where a = least(old.swiper, old.target) and b = greatest(old.swiper, old.target);
  end if;
  return old;
end $$;
drop trigger if exists swipe_unmatch on swipes;
create trigger swipe_unmatch after delete on swipes for each row execute function on_unswipe();

-- Unmatch (messages go with it via the cascade)
drop policy if exists "matches delete mine" on matches;
create policy "matches delete mine" on matches for delete to authenticated using (auth.uid() in (a, b));

-- Age range and max distance preferences
alter table profiles
  add column if not exists pref_age_min int not null default 18 check (pref_age_min >= 18),
  add column if not exists pref_age_max int not null default 99 check (pref_age_max <= 99),
  add column if not exists max_distance_km int not null default 50 check (max_distance_km between 1 and 500);

-- Location lives apart from profiles so nobody can read anyone's coordinates;
-- deck() only hands out a rounded distance.
create table if not exists locations (
  id uuid primary key references profiles on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  updated_at timestamptz default now()
);
alter table locations enable row level security;
drop policy if exists "locations own" on locations;
create policy "locations own" on locations for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Block / report. Blocking removes the match and hides both people from each other.
create table if not exists blocks (
  blocker uuid references profiles on delete cascade,
  blocked uuid references profiles on delete cascade,
  reason text,  -- null = plain block, otherwise a report you can review in the dashboard
  created_at timestamptz default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
alter table blocks enable row level security;
drop policy if exists "blocks own" on blocks;
create policy "blocks own" on blocks for select to authenticated using (blocker = auth.uid());
drop policy if exists "blocks insert" on blocks;
create policy "blocks insert" on blocks for insert to authenticated with check (blocker = auth.uid());

create or replace function on_block() returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from matches where a = least(new.blocker, new.blocked) and b = greatest(new.blocker, new.blocked);
  return new;
end $$;
drop trigger if exists block_unmatch on blocks;
create trigger block_unmatch after insert on blocks for each row execute function on_block();

-- Deck with every signal the algorithm uses
drop function if exists deck();
create function deck()
returns table (id uuid, name text, age int, gender text, looking_for text, bio text, photos text[],
               interests text[], height_cm int, pref_height_min int, pref_height_max int,
               pref_age_min int, pref_age_max int, max_distance_km int, distance_km int,
               likes_received int, seen_by int, likes_me boolean, super_likes_me boolean)
language sql security definer set search_path = public stable as $$
  select p.id, p.name, p.age, p.gender, p.looking_for, p.bio, p.photos, p.interests,
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

-- ===== design.sql =====
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

-- ===== launch.sql =====

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
