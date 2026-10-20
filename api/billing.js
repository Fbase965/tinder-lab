// Vercel function: starts a Stripe Checkout for faísca+ or opens the Stripe customer portal (cancel, invoices).
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const { STRIPE_SECRET_KEY, STRIPE_PRICE_ID, BILLING_SECRET, VITE_SUPABASE_URL, VITE_SUPABASE_KEY } = process.env
const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_KEY)
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!stripe || !STRIPE_PRICE_ID) return res.status(503).json({ error: 'Os pagamentos ainda não estão ativos.' })
  const token = req.headers.authorization?.replace(/^Bearer /, '')
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return res.status(401).json({ error: 'Sessão inválida' })
  const uid = data.user.id
  const origin = `https://${req.headers.host}`
  const { data: customer } = await supabase.rpc('billing_customer', { p_secret: BILLING_SECRET, p_user: uid })

  try {
    if (req.body?.action === 'portal') {
      if (!customer) return res.status(404).json({ error: 'Ainda não tens uma subscrição.' })
      const portal = await stripe.billingPortal.sessions.create({ customer, return_url: `${origin}/?premium=1` })
      return res.json({ url: portal.url })
    }
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
      client_reference_id: uid, // api/stripe-webhook.js links the payment to this account
      ...(customer ? { customer } : {}),
      locale: 'pt',
      allow_promotion_codes: true,
      success_url: `${origin}/?premium=ok`,
      cancel_url: `${origin}/?premium=1`,
    })
    res.json({ url: session.url })
  } catch (e) {
    res.status(502).json({ error: `Stripe: ${e.message}` })
  }
}
