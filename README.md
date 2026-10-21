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
  (`photos.sql`, `height.sql`, `features.sql`, `design.sql`, `launch.sql`, `email-domain.sql`, `push.sql`, `premium.sql`, `messages.sql`, `moderation.sql`, `phone.sql`, `email.sql`, `presence.sql`, in that order).
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

## faísca+ (premium)

`supabase/premium.sql`: who liked/viewed you, like limits (free 50/day, 1 Super Like; premium unlimited, 5),
boost, unlimited rewind, admin grants. Put a random `BILLING_SECRET` in that SQL and on Vercel, and add
yourself to `admins` (last line of the file). Admins get Perfil → Administração to give or remove faísca+.

Stripe: create a monthly Price, then set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `VITE_PREMIUM_PRICE`
(label, e.g. `4,99 €/mês`) on Vercel; add a webhook to `/api/stripe-webhook` for `checkout.session.completed`
and `customer.subscription.*`, and set its signing secret as `STRIPE_WEBHOOK_SECRET`. Enable the customer portal.
Charging money needs a registered business (Finanças) and Vercel Pro (Hobby is non-commercial).

## Captcha (optional)

Create a Cloudflare Turnstile widget, set `VITE_TURNSTILE_SITE_KEY` on Vercel, and enable
captcha in Supabase → Authentication → Attack Protection with the Turnstile secret key.

## Matching algorithm

`src/algorithm.js`: edit `WEIGHTS` or `score()`. Tests: `node --test src/algorithm.test.js`.

## Email (password reset + university badge)

`supabase/email.sql` + `api/email.js`. Usernames log in with a placeholder address, so a real email is
verified separately (Perfil → Email) and used for "Esqueci-me da password"; a university domain
(`src/emailDomains.js`) earns the green badge. Put the same random `EMAIL_SECRET` in that SQL and on Vercel,
plus SMTP on Vercel: `SMTP_HOST`, `SMTP_PORT` (465), `SMTP_USER`, `SMTP_PASS`, optional `SMTP_FROM`
(e.g. a Gmail account with an App Password: `smtp.gmail.com`).
