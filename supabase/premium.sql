-- Run once in Supabase Dashboard > SQL Editor, AFTER push.sql.
-- faísca+ (premium): who liked you, who viewed you, unlimited likes, 5 Super Likes, boost, unlimited rewind.
-- Premium comes from Stripe (api/stripe-webhook.js) or from an admin grant. Replace BILLING_SECRET first
-- (same value as the BILLING_SECRET env var on Vercel). Never commit the real value.

insert into app_secrets values ('billing_secret', 'BILLING_SECRET') on conflict (key) do update set value = excluded.value;

-- Who is premium. RLS on, read own only, no write policies: only the functions below change it.
create table if not exists subscriptions (
  user_id uuid primary key references profiles on delete cascade,
  premium_until timestamptz,
  source text check (source in ('stripe', 'admin')),
  stripe_customer_id text unique,
  boost_until timestamptz,
  last_boost_at timestamptz
);
alter table subscriptions enable row level security;
drop policy if exists "subscriptions own" on subscriptions;
create policy "subscriptions own" on subscriptions for select to authenticated using (user_id = auth.uid());

create or replace function is_premium(p_user uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from subscriptions where user_id = p_user and premium_until > now())
$$;

-- Admins: add yourself at the bottom of this file. No policies, so nobody can read or change it from the app.
create table if not exists admins (user_id uuid primary key references auth.users on delete cascade);
alter table admins enable row level security;
create or replace function is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid())
$$;

-- Everything the app needs to know about the caller's plan in one call.
create or replace function my_plan()
returns table (premium_until timestamptz, source text, boost_until timestamptz, can_boost boolean,
               likes_left int, super_left int, is_admin boolean)
language sql stable security definer set search_path = public as $$
  with s as (select * from subscriptions where user_id = auth.uid()),
       p as (select is_premium(auth.uid()) premium),
       used as (select count(*) filter (where liked and not super) likes, count(*) filter (where super) supers
                from swipes where swiper = auth.uid() and created_at > now() - interval '24 hours')
  select (select premium_until from s), (select source from s), (select boost_until from s),
         p.premium and coalesce((select last_boost_at from s) < now() - interval '24 hours', true),
         case when p.premium then null else greatest(0, 50 - used.likes)::int end,
         greatest(0, (case when p.premium then 5 else 1 end) - used.supers)::int,
         is_admin()
  from p, used
$$;

-- ---------- Limits: free 50 likes + 1 Super Like per 24h, premium unlimited likes + 5 Super Likes ----------
create or replace function limit_super() returns trigger language plpgsql security definer set search_path = public as $$
declare premium boolean := is_premium(new.swiper);
begin
  if new.super and (select count(*) from swipes where swiper = new.swiper and super and created_at > now() - interval '24 hours')
                   >= (case when premium then 5 else 1 end) then -- parentheses: plpgsql IF stops at the first THEN
    raise exception 'super_like_limit';
  end if;
  if new.liked and not new.super and not premium
     and (select count(*) from swipes where swiper = new.swiper and liked and not super and created_at > now() - interval '24 hours') >= 50 then
    raise exception 'like_limit';
  end if;
  return new;
end $$;

-- ---------- Rewind: premium has no 10-minute window (still never after a match) ----------
drop policy if exists "swipes delete own" on swipes;
create policy "swipes delete own" on swipes for delete to authenticated using (
  swiper = auth.uid() and (created_at > now() - interval '10 minutes' or is_premium(auth.uid()))
  and not exists (select 1 from matches m where m.a = least(swiper, target) and m.b = greatest(swiper, target)));

-- ---------- Boost: premium, once a day, 30 minutes at the top of other people's decks ----------
create or replace function start_boost() returns timestamptz language plpgsql security definer set search_path = public as $$
declare until timestamptz;
begin
  if not is_premium(auth.uid()) then raise exception 'premium_required'; end if;
  if exists (select 1 from subscriptions where user_id = auth.uid() and last_boost_at > now() - interval '24 hours') then
    raise exception 'boost_used';
  end if;
  update subscriptions set boost_until = now() + interval '30 minutes', last_boost_at = now()
  where user_id = auth.uid() returning boost_until into until;
  return until;
end $$;

-- ---------- Who viewed you ----------
create table if not exists profile_views (
  viewer uuid references profiles on delete cascade,
  viewed uuid references profiles on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (viewer, viewed),
  check (viewer <> viewed)
);
alter table profile_views enable row level security; -- no policies: only through the functions below
create index if not exists profile_views_viewed_idx on profile_views (viewed, viewed_at desc);

-- Called when someone opens a full profile. Blocked pairs are not recorded.
create or replace function record_view(p_viewed uuid) returns void language sql security definer set search_path = public as $$
  insert into profile_views (viewer, viewed)
  select auth.uid(), p_viewed
  where p_viewed <> auth.uid()
    and not exists (select 1 from blocks b where (b.blocker = auth.uid() and b.blocked = p_viewed) or (b.blocker = p_viewed and b.blocked = auth.uid()))
  on conflict (viewer, viewed) do update set viewed_at = now()
$$;

-- People for the "liked you" / "viewed you" grids, shaped like deck() rows so they can be swiped.
-- Free users get the count only (no rows), so blurring on the client hides nothing that was sent.
create or replace function people_for_me(p_kind text)
returns table (id uuid, name text, age int, gender text, looking_for text, bio text, job text, photos text[],
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
  select p.id, p.name, coalesce(extract(year from age(p.birth_date))::int, p.age), p.gender, p.looking_for, p.bio, p.job, p.photos,
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

-- ---------- Deck: boosted people first; "liked you" only revealed to premium ----------
drop function if exists deck();
create function deck()
returns table (id uuid, name text, age int, gender text, looking_for text, bio text, job text, photos text[],
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
  select c.id, c.name, c.real_age, c.gender, c.looking_for, c.bio, c.job, c.photos, c.interests,
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

-- ---------- Admin: grant / revoke premium by username ----------
create or replace function admin_set_premium(p_username text, p_days int)
returns table (username text, name text, premium_until timestamptz)
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not is_admin() then raise exception 'admin_only'; end if;
  select u.id into uid from auth.users u where u.email = lower(trim(p_username)) || '@users.tinder-lab.vercel.app';
  if uid is null or not exists (select 1 from profiles where id = uid) then raise exception 'user_not_found'; end if;
  insert into subscriptions (user_id, premium_until, source)
  values (uid, case when p_days > 0 then now() + make_interval(days => p_days) end, 'admin')
  on conflict (user_id) do update set
    premium_until = case when p_days > 0 then greatest(coalesce(subscriptions.premium_until, now()), now()) + make_interval(days => p_days) end,
    source = case when p_days > 0 then 'admin' else subscriptions.source end;
  return query select * from admin_list_premium() l where l.username = lower(trim(p_username));
end $$;

create or replace function admin_list_premium()
returns table (username text, name text, premium_until timestamptz)
language sql stable security definer set search_path = public as $$
  select split_part(u.email, '@', 1), p.name, s.premium_until
  from subscriptions s join profiles p on p.id = s.user_id join auth.users u on u.id = s.user_id
  where is_admin() and s.premium_until > now()
  order by s.premium_until
$$;

-- ---------- Stripe (called only by api/stripe-webhook.js with the billing secret) ----------
create or replace function billing_set_premium(p_secret text, p_user uuid, p_customer text, p_until timestamptz)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_secret is distinct from (select value from app_secrets where key = 'billing_secret') then raise exception 'forbidden'; end if;
  if p_user is null then select user_id into p_user from subscriptions where stripe_customer_id = p_customer; end if;
  if p_user is null then return; end if;
  insert into subscriptions (user_id, premium_until, source, stripe_customer_id) values (p_user, p_until, 'stripe', p_customer)
  on conflict (user_id) do update set premium_until = excluded.premium_until, source = 'stripe',
    stripe_customer_id = coalesce(excluded.stripe_customer_id, subscriptions.stripe_customer_id);
end $$;

create or replace function billing_customer(p_secret text, p_user uuid) returns text language sql stable security definer set search_path = public as $$
  select stripe_customer_id from subscriptions
  where user_id = p_user and p_secret = (select value from app_secrets where key = 'billing_secret')
$$;

revoke execute on function is_premium(uuid) from anon;
revoke execute on function admin_set_premium(text, int), admin_list_premium() from anon;

-- ---------- Make yourself admin: replace O_TEU_USERNAME with your faísca username ----------
insert into admins select id from auth.users where email = lower('O_TEU_USERNAME') || '@users.tinder-lab.vercel.app'
on conflict do nothing;
