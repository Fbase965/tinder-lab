-- Run once in Supabase Dashboard > SQL Editor, AFTER messages.sql.
-- Badges shown next to names: premium = active faísca+ (blue), phone = confirmed phone number by SMS (green, "pessoa real").
-- The phone number itself stays in auth.users and is never readable by other users; this only returns yes/no.
create or replace function badges(p_ids uuid[]) returns table (id uuid, premium boolean, phone boolean)
language sql stable security definer set search_path = public as $$
  select u.id, is_premium(u.id), u.phone_confirmed_at is not null
  from auth.users u where u.id = any(p_ids)
$$;
revoke execute on function badges(uuid[]) from anon, public;
grant execute on function badges(uuid[]) to authenticated;
