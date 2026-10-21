-- Run once in Supabase Dashboard > SQL Editor, AFTER premium.sql.
-- Unblock someone blocked by accident, and let admins read reports (blocks with a reason) in the app.

-- Unblocking a match brings the match back (the block deleted it), unless they blocked you too.
-- Messages are not restored: they went with the match. Unblocking a report also withdraws it.
create or replace function unblock(p_other uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); rematched boolean := false;
begin
  delete from blocks where blocker = me and blocked = p_other;
  if not found then return false; end if;
  if not exists (select 1 from blocks where blocker = p_other and blocked = me)
     and exists (select 1 from swipes where swiper = me and target = p_other and liked)
     and exists (select 1 from swipes where swiper = p_other and target = me and liked) then
    insert into matches (a, b) values (least(me, p_other), greatest(me, p_other)) on conflict do nothing;
    rematched := found;
  end if;
  return rematched;
end $$;
revoke execute on function unblock(uuid) from anon, public;
grant execute on function unblock(uuid) to authenticated;

create or replace function admin_reports()
returns table (reporter_username text, reporter_name text, reported_username text, reported_name text,
               reason text, created_at timestamptz, reports_against int)
language sql stable security definer set search_path = public as $$
  select split_part(ur.email, '@', 1), pr.name, split_part(ud.email, '@', 1), pd.name, b.reason, b.created_at,
         (select count(*) from blocks x where x.blocked = b.blocked and x.reason is not null)::int
  from blocks b
  join profiles pr on pr.id = b.blocker join auth.users ur on ur.id = b.blocker
  join profiles pd on pd.id = b.blocked join auth.users ud on ud.id = b.blocked
  where is_admin() and b.reason is not null
  order by b.created_at desc
  limit 200
$$;
revoke execute on function admin_reports() from anon, public;
grant execute on function admin_reports() to authenticated;
