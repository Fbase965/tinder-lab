-- Run once in Supabase Dashboard > SQL Editor, BEFORE deploying the app that logs in with @users.tinder-lab.vercel.app.
-- Moves existing accounts off @users.tinderlab.app, a domain anyone could register and use to receive login/reset emails.
update auth.users
set email = replace(email, '@users.tinderlab.app', '@users.tinder-lab.vercel.app')
where email like '%@users.tinderlab.app';

update auth.identities
set identity_data = jsonb_set(identity_data, '{email}',
      to_jsonb(replace(identity_data->>'email', '@users.tinderlab.app', '@users.tinder-lab.vercel.app')))
where provider = 'email' and identity_data->>'email' like '%@users.tinderlab.app';

select count(*) as contas_migradas from auth.users where email like '%@users.tinder-lab.vercel.app';
