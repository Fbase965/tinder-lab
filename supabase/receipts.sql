-- Run once in Supabase Dashboard > SQL Editor, AFTER email.sql (chat_reads lives in messages.sql).
-- Read receipts: when my match last opened our chat. Only for an existing match, only that one timestamp.
-- Live updates go over Realtime broadcast between the two open chats (src/Messages.jsx).
create or replace function their_read_at(p_other uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  select r.read_at from chat_reads r
  where r.user_id = p_other and r.other = auth.uid()
    and exists (select 1 from matches m where m.a = least(auth.uid(), p_other) and m.b = greatest(auth.uid(), p_other))
$$;
revoke execute on function their_read_at(uuid) from public, anon;
grant execute on function their_read_at(uuid) to authenticated;
