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
