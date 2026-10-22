-- Run once in Supabase Dashboard > SQL Editor, AFTER staff.sql.
-- Adds the "Lenda" badge (a special one for friends), given in Administração like the team roles.
alter table staff_roles drop constraint if exists staff_roles_role_check;
alter table staff_roles add constraint staff_roles_role_check check (role in ('founder', 'cofounder', 'developer', 'legend'));

create or replace function admin_list_roles() returns table (username text, name text, role text)
language sql stable security definer set search_path = public as $$
  select split_part(u.email, '@', 1), p.name, r.role
  from staff_roles r join profiles p on p.id = r.user_id join auth.users u on u.id = r.user_id
  where is_admin()
  order by array_position(array['founder', 'cofounder', 'developer', 'legend'], r.role), p.name
$$;
