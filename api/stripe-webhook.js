// Vercel function: Stripe tells us when a faísca+ subscription starts, renews or ends.
// Stripe Dashboard > Webhooks: point to /api/stripe-webhook with checkout.session.completed,
// customer.subscription.created/updated/deleted.
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, BILLING_SECRET, VITE_SUPABASE_URL, VITE_SUPABASE_KEY } = process.env
const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_KEY)
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null

// The signature covers the exact bytes Stripe sent, so read the raw body instead of parsed JSON.
const rawBody = async (req) => {
  const chunks = []
  for await (const c of req) chunks.push(c)
  return Buffer.concat(chunks)
}

// Newer Stripe API versions keep the period end on the subscription item.
const periodEnd = (sub) => sub.items?.data?.[0]?.current_period_end ?? sub.current_period_end

async function setPremium(user, customer, untilSeconds) {
  const { error } = await supabase.rpc('billing_set_premium', {
    p_secret: BILLING_SECRET, p_user: user ?? null, p_customer: customer, p_until: new Date(untilSeconds * 1000).toISOString(),
  })
  if (error) throw new Error(error.message)
}

export default async function handler(req, res) {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) return res.status(503).end()
  let event
  try {
    event = stripe.webhooks.constructEvent(await rawBody(req), req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET)
  } catch {
    return res.status(400).json({ error: 'bad signature' })
  }
  const o = event.data.object
  if (event.type === 'checkout.session.completed' && o.mode === 'subscription') {
    const sub = await stripe.subscriptions.retrieve(o.subscription)
    await setPremium(o.client_reference_id, o.customer, periodEnd(sub))
  } else if (event.type.startsWith('customer.subscription.')) {
    const active = ['active', 'trialing', 'past_due'].includes(o.status) && event.type !== 'customer.subscription.deleted'
    await setPremium(null, o.customer, active ? periodEnd(o) : Date.now() / 1000)
  }
  res.json({ received: true })
}

export const config = { api: { bodyParser: false } }
