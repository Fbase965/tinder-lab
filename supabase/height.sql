-- Run once in Supabase Dashboard > SQL Editor (after photos.sql). Adds height and an optional preferred height range.
alter table profiles
  add column if not exists height_cm int check (height_cm between 120 and 230),
  add column if not exists pref_height_min int check (pref_height_min between 120 and 230),
  add column if not exists pref_height_max int check (pref_height_max between 120 and 230);

drop function if exists deck();
create function deck()
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
