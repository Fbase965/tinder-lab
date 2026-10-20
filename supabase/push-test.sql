-- Run once in Supabase Dashboard > SQL Editor, AFTER premium.sql.
-- Admin tools to test push notifications: send a test push and see what the last deliveries returned.

create or replace function admin_test_push(p_username text default null)
returns table (dispositivos int, pedido bigint)
language plpgsql security definer set search_path = public as $$
declare uid uuid; subs jsonb; req bigint;
begin
  if not is_admin() then raise exception 'admin_only'; end if;
  if coalesce(trim(p_username), '') = '' then uid := auth.uid();
  else select id into uid from auth.users where email = lower(trim(p_username)) || '@users.tinder-lab.vercel.app';
  end if;
  if uid is null then raise exception 'user_not_found'; end if;
  select jsonb_agg(jsonb_build_object('endpoint', endpoint, 'keys', jsonb_build_object('p256dh', p256dh, 'auth', auth)))
    into subs from push_subscriptions where user_id = uid;
  if subs is null then return query select 0, null::bigint; return; end if;
  -- force: shown even while the app is open (public/sw.js normally stays quiet then)
  select net.http_post(
    url := (select value from app_secrets where key = 'push_url'),
    body := jsonb_build_object('subscriptions', subs, 'title', 'faísca', 'body', 'Notificação de teste 🔔', 'url', '/', 'tag', 'test', 'force', true),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', (select value from app_secrets where key = 'push_secret'))
  ) into req;
  return query select jsonb_array_length(subs), req;
end $$;

create or replace function admin_push_status()
returns table (dispositivos_total int, ultimas jsonb)
language plpgsql security definer set search_path = public, net as $$
begin
  if not is_admin() then raise exception 'admin_only'; end if;
  return query select
    (select count(*) from push_subscriptions)::int,
    (select coalesce(jsonb_agg(r), '[]') from (
       select id, status_code, error_msg, timed_out, left(content, 160) as resposta, created
       from net._http_response order by created desc limit 5) r);
end $$;

revoke execute on function admin_test_push(text), admin_push_status() from anon;
