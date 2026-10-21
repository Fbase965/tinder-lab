-- Run once in Supabase Dashboard > SQL Editor, AFTER premium.sql.
-- Everyone who liked me (the "Gostos" number on the profile), faísca+ only like "Gostam de ti". Blocked people left out.
create or replace function my_likers() returns table (id uuid, at timestamptz, super boolean)
language sql stable security definer set search_path = public as $$
  select s.swiper, s.created_at, s.super from swipes s
  where s.target = auth.uid() and s.liked and is_premium(auth.uid())
    and not exists (select 1 from blocks b where (b.blocker = auth.uid() and b.blocked = s.swiper)
                                             or (b.blocker = s.swiper and b.blocked = auth.uid()))
  order by s.created_at desc
  limit 200
$$;
revoke execute on function my_likers() from public, anon;
grant execute on function my_likers() to authenticated;
