-- Run once in Supabase Dashboard > SQL Editor, AFTER premium.sql.
-- Chat: reply to a message, react to a message (one emoji per person per message), read state.
-- faísca+: everyone with premium shows a verified badge.

-- ---------- Replies: must point at a message of the same conversation ----------
alter table messages add column if not exists reply_to bigint;
alter table messages drop constraint if exists messages_id_pair_key;
alter table messages add constraint messages_id_pair_key unique (id, a, b);
alter table messages drop constraint if exists messages_reply_to_fkey;
alter table messages add constraint messages_reply_to_fkey
  foreign key (reply_to, a, b) references messages (id, a, b) on delete set null (reply_to);

-- ---------- Reactions: stored on the message, one column per side of the match ----------
alter table messages add column if not exists reaction_a text, add column if not exists reaction_b text;
alter table messages drop constraint if exists messages_reactions_check;
alter table messages add constraint messages_reactions_check check (
  coalesce(reaction_a, '❤️') in ('❤️', '😂', '😮', '😢', '👍', '🔥') and
  coalesce(reaction_b, '❤️') in ('❤️', '😂', '😮', '😢', '👍', '🔥'));

-- Users may only change the reaction columns, and only their own side.
revoke update on messages from anon, authenticated;
grant update (reaction_a, reaction_b) on messages to authenticated;
drop policy if exists "messages react" on messages;
create policy "messages react" on messages for update to authenticated
  using (auth.uid() in (a, b)) with check (auth.uid() in (a, b));

create or replace function own_reaction_only() returns trigger language plpgsql as $$
begin
  if auth.uid() = new.a then new.reaction_b := old.reaction_b; end if;
  if auth.uid() = new.b then new.reaction_a := old.reaction_a; end if;
  return new;
end $$;
drop trigger if exists messages_own_reaction on messages;
create trigger messages_own_reaction before update on messages for each row execute function own_reaction_only();

-- ---------- Verified badge = active faísca+ ----------
-- Public on purpose: the badge is visible to everyone. Only says yes/no, never the plan dates.
create or replace function verified_ids(p_ids uuid[]) returns setof uuid
language sql stable security definer set search_path = public as $$
  select user_id from subscriptions where user_id = any(p_ids) and premium_until > now()
$$;
revoke execute on function verified_ids(uuid[]) from anon, public;
grant execute on function verified_ids(uuid[]) to authenticated;

-- ---------- Read state: when I last opened each chat (clears the new-message alert) ----------
-- Own table, readable only by its owner, so the other person never learns when you read.
create table if not exists chat_reads (
  user_id uuid not null default auth.uid() references profiles on delete cascade,
  other uuid not null references profiles on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, other)
);
alter table chat_reads enable row level security;
drop policy if exists "chat_reads own" on chat_reads;
create policy "chat_reads own" on chat_reads for select to authenticated using (user_id = auth.uid());

create or replace function mark_read(p_other uuid) returns timestamptz
language sql security definer set search_path = public as $$
  insert into chat_reads (user_id, other) values (auth.uid(), p_other)
  on conflict (user_id, other) do update set read_at = now()
  returning read_at
$$;
revoke execute on function mark_read(uuid) from anon, public;
grant execute on function mark_read(uuid) to authenticated;
