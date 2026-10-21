-- Run once in Supabase Dashboard > SQL Editor, AFTER push.sql.
-- No push while the app is on screen: the app pings every 30 s while visible (the in-app banner shows instead),
-- and send_push skips anyone seen in the last 45 s. Done here, not in the service worker, because Safari
-- revokes push for sites that receive a push and show nothing.
create table if not exists presence (user_id uuid primary key references profiles on delete cascade, seen_at timestamptz not null);
alter table presence enable row level security; -- no policies: only the functions below

create or replace function touch_presence(p_visible boolean) returns void
language sql security definer set search_path = public as $$
  insert into presence (user_id, seen_at) values (auth.uid(), case when p_visible then now() else 'epoch' end)
  on conflict (user_id) do update set seen_at = excluded.seen_at
$$;
revoke execute on function touch_presence(boolean) from public, anon;
grant execute on function touch_presence(boolean) to authenticated;

create or replace function send_push(p_user uuid, p_body text, p_url text, p_tag text)
returns void language plpgsql security definer set search_path = public as $$
declare subs jsonb;
begin
  if exists (select 1 from presence where user_id = p_user and seen_at > now() - interval '45 seconds') then return; end if;
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
