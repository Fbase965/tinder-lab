-- Run once in Supabase Dashboard > SQL Editor.
-- "Voltar a ver quem passei": forget the caller's passes (nope swipes) so those people come back to the deck.
-- Likes stay, so it never touches matches.
create or replace function recycle_passes() returns int
language sql security definer set search_path = public as $$
  with gone as (delete from swipes where swiper = auth.uid() and not liked returning 1)
  select count(*)::int from gone
$$;
revoke execute on function recycle_passes() from anon;
