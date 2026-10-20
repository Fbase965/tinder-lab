# faísca (tinder-lab)

Tinder-style dating web app for testing a custom matching algorithm with real users.
React + Vite, Supabase (auth, Postgres, realtime), photos in Azure Blob Storage, deployed on Vercel.

## Run locally

```
cp .env.example .env   # Supabase URL + publishable key (Azure vars are only needed on Vercel)
npm install
npm run dev
```

## Supabase setup

- New project: run `supabase/schema.sql` in the SQL Editor.
- Turn off **Authentication → Email → Confirm email** (login is username + password).
- Existing project: run only the migration files you haven't applied yet
  (`photos.sql`, `height.sql`, `features.sql`, `design.sql`, `launch.sql`, `email-domain.sql`, `push.sql`, in that order).
- `storage.sql` is only for the old Supabase photo bucket; new photos go to Azure.

## Photos (Azure Blob Storage)

`api/photos.js` (Vercel function) checks the Supabase session, then uploads (max 1 MB, JPEG/WebP,
12 files per user) or deletes photos in the user's own folder. Needs on Vercel:
`AZURE_STORAGE_ACCOUNT`, `AZURE_STORAGE_KEY`. The `photos` container must allow public blob reads.
The account name is also hardcoded in `supabase/launch.sql` (photo URL check) and `vercel.json` (CSP).

## Push notifications

`supabase/push.sql` adds triggers that call `api/push.js` (via pg_net) on new matches and messages.
Put the same random `PUSH_SECRET` in that SQL and on Vercel, plus a VAPID key pair
(`npx web-push generate-vapid-keys`): `VITE_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`.
On iPhone, notifications only work once the site is added to the home screen (iOS 16.4+).

## Captcha (optional)

Create a Cloudflare Turnstile widget, set `VITE_TURNSTILE_SITE_KEY` on Vercel, and enable
captcha in Supabase → Authentication → Attack Protection with the Turnstile secret key.

## Matching algorithm

`src/algorithm.js`: edit `WEIGHTS` or `score()`. Tests: `node --test src/algorithm.test.js`.
