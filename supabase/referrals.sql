-- Run once in Supabase Dashboard > SQL Editor, AFTER push.sql and premium.sql.
-- Invite links: faiscauni.vercel.app/?ref=<username>. The app passes the ref in the sign-up metadata;
-- an invite counts once the new person creates their profile. At 5, every admin gets a push to grant faísca+.

create table if not exists referrals (
  invited uuid primary key references profiles on delete cascade,
  referrer uuid not null references profiles on delete cascade,
  created_at timestamptz default now()
);
alter table referrals enable row level security; -- no policies: only the trigger writes it
create index if not exists referrals_referrer on referrals (referrer);

create or replace function track_referral() returns trigger language plpgsql security definer set search_path = public as $$
declare ref_id uuid; total int; uname text; adm uuid;
begin
  select u.id, split_part(u.email, '@', 1) into ref_id, uname from auth.users u
  where u.email = lower(trim((select raw_user_meta_data->>'ref' from auth.users where id = new.id))) || '@users.tinder-lab.vercel.app';
  if ref_id is null or ref_id = new.id or not exists (select 1 from profiles where id = ref_id) then return new; end if;
  insert into referrals (invited, referrer) values (new.id, ref_id) on conflict do nothing;
  select count(*) into total from referrals where referrer = ref_id;
  if total = 5 then -- exactly 5, so the admins hear about it once
    for adm in select user_id from admins loop
      perform send_push(adm, '@' || uname || ' convidou 5 pessoas. Dá-lhe faísca+!', '/', 'ref-' || ref_id);
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists referral_track on profiles;
create trigger referral_track after insert on profiles for each row execute function track_referral();

create or replace function my_referrals() returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from referrals where referrer = auth.uid()
$$;

-- Admin: everyone with 5+ invites and whether they already have faísca+.
create or replace function admin_referrals()
returns table (username text, convites int, premium boolean)
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin_only'; end if;
  return query select split_part(u.email, '@', 1), count(*)::int, is_premium(r.referrer)
  from referrals r join auth.users u on u.id = r.referrer
  group by r.referrer, u.email having count(*) >= 5 order by count(*) desc;
end $$;

revoke execute on function track_referral() from public, anon, authenticated;
revoke execute on function my_referrals(), admin_referrals() from anon;
