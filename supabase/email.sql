-- Run once in Supabase Dashboard > SQL Editor, AFTER phone.sql. Replace EMAIL_SECRET first
-- (same value as the EMAIL_SECRET env var on Vercel). Never commit the real value.
-- A real, verified email next to the username login: resets the password, and a university address
-- earns the green "pessoa real" badge. Codes are emailed by api/email.js; the app never sees them.
insert into app_secrets values ('email_secret', 'EMAIL_SECRET') on conflict (key) do update set value = excluded.value;

-- Verified addresses. Only the owner can read theirs.
create table if not exists user_emails (
  user_id uuid primary key references profiles on delete cascade,
  email text not null unique,
  university boolean not null,
  verified_at timestamptz not null default now()
);
alter table user_emails enable row level security;
drop policy if exists "user_emails own" on user_emails;
create policy "user_emails own" on user_emails for select to authenticated using (user_id = auth.uid());

-- Pending codes and the send log: no policies, only the functions below touch them.
create table if not exists email_codes (
  user_id uuid primary key references profiles on delete cascade,
  purpose text not null check (purpose in ('verify', 'reset')),
  email text not null,
  university boolean not null default false,
  code_hash text not null,
  attempts int not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists email_sends (user_id uuid not null references profiles on delete cascade, at timestamptz not null default now());
create index if not exists email_sends_user_idx on email_sends (user_id, at);
alter table email_codes enable row level security;
alter table email_sends enable row level security;

create or replace function email_user_by_username(p_username text) returns uuid
language sql stable security definer set search_path = public as $$
  select id from auth.users where email = lower(trim(p_username)) || '@users.tinder-lab.vercel.app'
$$;
revoke execute on function email_user_by_username(text) from public, anon, authenticated;

-- Called by api/email.js only (secret). Returns the plain code for the email; at most 1 a minute and 5 an hour per account.
create or replace function email_issue_code(p_secret text, p_user uuid, p_purpose text, p_email text, p_university boolean)
returns text language plpgsql security definer set search_path = public as $$
declare code text;
begin
  if p_secret is distinct from (select value from app_secrets where key = 'email_secret') then raise exception 'forbidden'; end if;
  if p_purpose = 'verify' and exists (select 1 from user_emails where email = lower(p_email) and user_id <> p_user) then
    raise exception 'email_taken';
  end if;
  if exists (select 1 from email_sends where user_id = p_user and at > now() - interval '1 minute') then raise exception 'too_soon'; end if;
  if (select count(*) from email_sends where user_id = p_user and at > now() - interval '1 hour') >= 5 then raise exception 'too_many'; end if;
  code := lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');
  insert into email_codes (user_id, purpose, email, university, code_hash)
  values (p_user, p_purpose, lower(p_email), p_university, encode(extensions.digest(code, 'sha256'), 'hex'))
  on conflict (user_id) do update set purpose = excluded.purpose, email = excluded.email, university = excluded.university,
    code_hash = excluded.code_hash, attempts = 0, created_at = now();
  insert into email_sends (user_id) values (p_user);
  delete from email_sends where at < now() - interval '1 day';
  return code;
end $$;
-- api/email.js connects with the publishable key (anon); the secret is what guards it.
revoke execute on function email_issue_code(text, uuid, text, text, boolean) from public, authenticated;
grant execute on function email_issue_code(text, uuid, text, text, boolean) to anon;

-- Called by api/email.js only (secret): where to send a reset code for this username, if anywhere.
create or replace function email_reset_target(p_secret text, p_username text) returns table (user_id uuid, email text)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_secret is distinct from (select value from app_secrets where key = 'email_secret') then raise exception 'forbidden'; end if;
  return query select e.user_id, e.email from user_emails e where e.user_id = email_user_by_username(p_username);
end $$;
revoke execute on function email_reset_target(text, text) from public, authenticated;
grant execute on function email_reset_target(text, text) to anon;

-- Checks a code: 15 minutes, 5 tries. Returns the row on success (and deletes it). A wrong try is counted, not raised,
-- so the attempt counter survives.
create or replace function email_take_code(p_user uuid, p_purpose text, p_code text) returns email_codes
language plpgsql security definer set search_path = public as $$
declare c email_codes;
begin
  select * into c from email_codes where user_id = p_user and purpose = p_purpose and created_at > now() - interval '15 minutes';
  if c is null or c.attempts >= 5 then return null; end if;
  if c.code_hash <> encode(extensions.digest(trim(p_code), 'sha256'), 'hex') then
    update email_codes set attempts = attempts + 1 where user_id = p_user;
    return null;
  end if;
  delete from email_codes where user_id = p_user;
  return c;
end $$;
revoke execute on function email_take_code(uuid, text, text) from public, anon, authenticated;

-- The app: confirm the email I asked to verify.
create or replace function confirm_email(p_code text) returns boolean
language plpgsql security definer set search_path = public as $$
declare c email_codes := email_take_code(auth.uid(), 'verify', p_code);
begin
  if c is null then return false; end if;
  insert into user_emails (user_id, email, university) values (auth.uid(), c.email, c.university)
  on conflict (user_id) do update set email = excluded.email, university = excluded.university, verified_at = now();
  return true;
end $$;
revoke execute on function confirm_email(text) from public, anon;
grant execute on function confirm_email(text) to authenticated;

-- The login page: new password with the emailed code. Signs out every other session.
create or replace function reset_password(p_username text, p_code text, p_password text) returns boolean
language plpgsql security definer set search_path = public as $$
declare uid uuid := email_user_by_username(p_username);
begin
  if uid is null or length(p_password) < 6 then return false; end if;
  if email_take_code(uid, 'reset', p_code) is null then return false; end if;
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now() where id = uid;
  delete from auth.sessions where user_id = uid;
  return true;
end $$;
revoke execute on function reset_password(text, text, text) from public;
grant execute on function reset_password(text, text, text) to anon, authenticated;

-- Blue verified badge ("phone" column, name kept for the app): phone confirmed by SMS, or any verified email.
create or replace function badges(p_ids uuid[]) returns table (id uuid, premium boolean, phone boolean)
language sql stable security definer set search_path = public as $$
  select u.id, is_premium(u.id),
         u.phone_confirmed_at is not null or exists (select 1 from user_emails e where e.user_id = u.id)
  from auth.users u where u.id = any(p_ids)
$$;

-- My own verified email, for the profile page.
create or replace function my_email() returns table (email text, university boolean)
language sql stable security definer set search_path = public as $$
  select email, university from user_emails where user_id = auth.uid()
$$;
grant execute on function my_email() to authenticated;
