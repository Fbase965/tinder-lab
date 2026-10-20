-- Run once in Supabase Dashboard > SQL Editor. Replaces the single photo_url with up to 6 photos.
alter table profiles add column if not exists photos text[] not null default '{}'
  check (cardinality(photos) <= 6);
update profiles set photos = array[photo_url] where photo_url <> '' and photos = '{}';
drop function if exists deck();
alter table profiles drop column if exists photo_url;

create function deck()
returns table (id uuid, name text, age int, gender text, looking_for text, bio text, photos text[],
               interests text[], likes_received int, seen_by int, likes_me boolean)
language sql security definer set search_path = public stable as $$
  select p.id, p.name, p.age, p.gender, p.looking_for, p.bio, p.photos, p.interests,
         (select count(*) from swipes s where s.target = p.id and s.liked)::int,
         (select count(*) from swipes s where s.target = p.id)::int,
         exists (select 1 from swipes s where s.swiper = p.id and s.target = auth.uid() and s.liked)
  from profiles p
  where p.id <> auth.uid()
    and not exists (select 1 from swipes s where s.swiper = auth.uid() and s.target = p.id)
$$;
