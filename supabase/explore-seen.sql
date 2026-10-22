-- Run once in Supabase Dashboard > SQL Editor, AFTER premium.sql.
-- The "something new" dot on Explorar: likes, views and matches since you last opened it. Kept on the server so
-- every device agrees and a seen novelty never comes back.
create table if not exists explore_seen (
  user_id uuid primary key references profiles on delete cascade,
  seen_at timestamptz not null default now()
);
alter table explore_seen enable row level security; -- no policies: only the functions below touch it
insert into explore_seen (user_id) select id from profiles on conflict do nothing; -- existing accounts start with nothing new

-- Counts only (no names), so free accounts get it too. Same rules as people_for_me: pending likes, 30-day views, no blocked people.
create or replace function explore_news() returns table (likes int, views int, matches int)
language sql stable security definer set search_path = public as $$
  with s as (select coalesce((select seen_at from explore_seen where user_id = auth.uid()), '-infinity') t)
  select
    (select count(*) from swipes x, s where x.target = auth.uid() and x.liked and x.created_at > s.t
       and not exists (select 1 from swipes mine where mine.swiper = auth.uid() and mine.target = x.swiper)
       and not exists (select 1 from blocks b where (b.blocker = auth.uid() and b.blocked = x.swiper) or (b.blocker = x.swiper and b.blocked = auth.uid())))::int,
    (select count(*) from profile_views v, s where v.viewed = auth.uid() and v.viewed_at > s.t and v.viewed_at > now() - interval '30 days'
       and not exists (select 1 from blocks b where (b.blocker = auth.uid() and b.blocked = v.viewer) or (b.blocker = v.viewer and b.blocked = auth.uid())))::int,
    (select count(*) from matches m, s where auth.uid() in (m.a, m.b) and m.created_at > s.t)::int
$$;

create or replace function mark_explore_seen() returns void
language sql security definer set search_path = public as $$
  insert into explore_seen (user_id, seen_at) values (auth.uid(), now())
  on conflict (user_id) do update set seen_at = now()
$$;

revoke execute on function explore_news() from public, anon;
revoke execute on function mark_explore_seen() from public, anon;
grant execute on function explore_news() to authenticated;
grant execute on function mark_explore_seen() to authenticated;
