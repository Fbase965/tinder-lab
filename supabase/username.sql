-- Run once in Supabase Dashboard > SQL Editor.
-- Usernames live in auth.users.email as <username>@users.tinder-lab.vercel.app (src/App.jsx usernameEmail).
-- Adds: matches can see each other's username, and users can change theirs (once every 7 days).

create table if not exists username_changes (
  user_id uuid not null references auth.users on delete cascade,
  changed_at timestamptz not null default now()
);
alter table username_changes enable row level security; -- no policies: only change_username() writes it

-- A match's username; null for anyone you are not matched with.
create or replace function match_username(p_other uuid) returns text
language sql stable security definer set search_path = public as $$
  select split_part(u.email, '@', 1) from auth.users u
  where u.id = p_other
    and exists (select 1 from matches m where m.a = least(auth.uid(), p_other) and m.b = greatest(auth.uid(), p_other))
$$;

create or replace function change_username(p_new text) returns text
language plpgsql security definer set search_path = public as $$
declare uname text := lower(trim(p_new)); new_email text;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if uname !~ '^[a-z0-9_.]{3,20}$' then raise exception 'username_invalid'; end if;
  new_email := uname || '@users.tinder-lab.vercel.app';
  if exists (select 1 from auth.users where email = new_email and id <> auth.uid()) then raise exception 'username_taken'; end if;
  if exists (select 1 from username_changes where user_id = auth.uid() and changed_at > now() - interval '7 days') then
    raise exception 'username_recent';
  end if;
  update auth.users set email = new_email, updated_at = now() where id = auth.uid();
  update auth.identities set identity_data = jsonb_set(identity_data, '{email}', to_jsonb(new_email)), updated_at = now()
  where user_id = auth.uid() and provider = 'email';
  insert into username_changes (user_id) values (auth.uid());
  return uname;
end $$;

revoke execute on function match_username(uuid), change_username(text) from anon;
