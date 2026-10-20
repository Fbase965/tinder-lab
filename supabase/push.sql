-- Run once in Supabase Dashboard > SQL Editor, AFTER launch.sql. Replace PUSH_SECRET first
-- (same value as the PUSH_SECRET env var on Vercel). Never commit the real value.
-- Push notifications for new matches and messages: database triggers call api/push.js through pg_net.
create extension if not exists pg_net;

-- Server-only settings: RLS on and no policies, so only security definer functions can read them.
create table if not exists app_secrets (key text primary key, value text not null);
alter table app_secrets enable row level security;
insert into app_secrets values ('push_url', 'https://faiscauni.vercel.app/api/push'), ('push_secret', 'PUSH_SECRET')
on conflict (key) do update set value = excluded.value;

create table if not exists push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references profiles on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);
alter table push_subscriptions enable row level security;
drop policy if exists "push own" on push_subscriptions;
create policy "push own" on push_subscriptions for select to authenticated using (user_id = auth.uid());
drop policy if exists "push delete own" on push_subscriptions;
create policy "push delete own" on push_subscriptions for delete to authenticated using (user_id = auth.uid());

-- One device = one account: whoever subscribes last on a browser takes its endpoint over.
create or replace function save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language sql security definer set search_path = public as $$
  insert into push_subscriptions (endpoint, user_id, p256dh, auth)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth
$$;

-- api/push.js reports endpoints the push service says are gone.
create or replace function drop_push_subscriptions(p_secret text, p_endpoints text[])
returns void language sql security definer set search_path = public as $$
  delete from push_subscriptions
  where endpoint = any(p_endpoints) and p_secret = (select value from app_secrets where key = 'push_secret')
$$;

create or replace function send_push(p_user uuid, p_body text, p_url text, p_tag text)
returns void language plpgsql security definer set search_path = public as $$
declare subs jsonb;
begin
  select jsonb_agg(jsonb_build_object('endpoint', endpoint, 'keys', jsonb_build_object('p256dh', p256dh, 'auth', auth)))
    into subs from push_subscriptions where user_id = p_user;
  if subs is null then return; end if;
  perform net.http_post(
    url := (select value from app_secrets where key = 'push_url'),
    body := jsonb_build_object('subscriptions', subs, 'title', 'faísca', 'body', p_body, 'url', p_url, 'tag', p_tag),
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-push-secret', (select value from app_secrets where key = 'push_secret')));
end $$;
revoke execute on function send_push(uuid, text, text, text) from public, anon, authenticated;

-- Message text never leaves the database: the lock screen only shows who wrote.
create or replace function notify_message() returns trigger language plpgsql security definer set search_path = public as $$
declare to_user uuid := case when new.sender = new.a then new.b else new.a end;
begin
  perform send_push(to_user, 'Nova mensagem de ' || (select name from profiles where id = new.sender),
                    '/?chat=' || new.sender, 'chat-' || new.sender);
  return new;
end $$;
drop trigger if exists message_push on messages;
create trigger message_push after insert on messages for each row execute function notify_message();

create or replace function notify_match() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform send_push(new.a, 'É um match com ' || (select name from profiles where id = new.b) || '!', '/?chat=' || new.b, 'match-' || new.b);
  perform send_push(new.b, 'É um match com ' || (select name from profiles where id = new.a) || '!', '/?chat=' || new.a, 'match-' || new.a);
  return new;
end $$;
drop trigger if exists match_push on matches;
create trigger match_push after insert on matches for each row execute function notify_match();
