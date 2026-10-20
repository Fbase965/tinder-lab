# faísca (tinder-lab)

Tinder-style dating web app for testing a custom matching algorithm with real users.
React + Vite, Supabase (auth, Postgres, storage, realtime), deployed on Vercel.

## Run locally

```
cp .env.example .env   # fill in your Supabase project URL and publishable key
npm install
npm run dev
```

## Supabase setup

- New project: run `supabase/schema.sql`, then `supabase/storage.sql`, in the SQL Editor.
- Turn off **Authentication → Email → Confirm email** (login is username + password).
- Existing project: run only the migration files you haven't applied yet
  (`photos.sql`, `height.sql`, `features.sql`, `design.sql`, in that order).

## Matching algorithm

`src/algorithm.js`: edit `WEIGHTS` or `score()`. Tests: `node --test src/algorithm.test.js`.
