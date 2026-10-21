-- Run once in Supabase Dashboard > SQL Editor, AFTER email.sql.
-- Team badges (Founder, Co-founder, Developer) given by admins, and the numbers for the admin overview.
create table if not exists staff_roles (
  user_id uuid primary key references profiles on delete cascade,
  role text not null check (role in ('founder', 'cofounder', 'developer')),
  created_at timestamptz not null default now()
);
alter table staff_roles enable row level security; -- no policies: only the functions below

-- p_role null removes the badge.
create or replace function admin_set_role(p_username text, p_role text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := email_user_by_username(p_username);
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  if uid is null then raise exception 'user_not_found'; end if;
  if p_role is null then delete from staff_roles where user_id = uid;
  else insert into staff_roles (user_id, role) values (uid, p_role) on conflict (user_id) do update set role = excluded.role;
  end if;
end $$;
revoke execute on function admin_set_role(text, text) from public, anon;
grant execute on function admin_set_role(text, text) to authenticated;

create or replace function admin_list_roles() returns table (username text, name text, role text)
language sql stable security definer set search_path = public as $$
  select split_part(u.email, '@', 1), p.name, r.role
  from staff_roles r join profiles p on p.id = r.user_id join auth.users u on u.id = r.user_id
  where is_admin()
  order by array_position(array['founder', 'cofounder', 'developer'], r.role), p.name
$$;
revoke execute on function admin_list_roles() from public, anon;
grant execute on function admin_list_roles() to authenticated;

create or replace function admin_stats()
returns table (users int, new_week int, matches int, messages_day int, premium int, verified int, reports int)
language sql stable security definer set search_path = public as $$
  select (select count(*) from profiles)::int,
         (select count(*) from profiles where created_at > now() - interval '7 days')::int,
         (select count(*) from matches)::int,
         (select count(*) from messages where created_at > now() - interval '24 hours')::int,
         (select count(*) from subscriptions where premium_until > now())::int,
         (select count(*) from user_emails)::int,
         (select count(*) from blocks where reason is not null)::int
  where is_admin()
$$;
revoke execute on function admin_stats() from public, anon;
grant execute on function admin_stats() to authenticated;

-- Badges now also return the team role. The return type changes, so drop first.
drop function if exists badges(uuid[]);
create function badges(p_ids uuid[]) returns table (id uuid, premium boolean, phone boolean, role text)
language sql stable security definer set search_path = public as $$
  select u.id, is_premium(u.id),
         u.phone_confirmed_at is not null or exists (select 1 from user_emails e where e.user_id = u.id),
         (select r.role from staff_roles r where r.user_id = u.id)
  from auth.users u where u.id = any(p_ids)
$$;
revoke execute on function badges(uuid[]) from anon, public;
grant execute on function badges(uuid[]) to authenticated;
