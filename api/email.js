// Vercel function: emails a 6-digit code to verify an address (signed in) or to reset the password (login page).
// Codes are made and checked in the database (supabase/email.sql); this only delivers them over SMTP.
import nodemailer from 'nodemailer'
import { createClient } from '@supabase/supabase-js'
import { isUniversityEmail } from '../src/emailDomains.js'

const { EMAIL_SECRET, SMTP_HOST, SMTP_PORT = '465', SMTP_USER, SMTP_PASS, SMTP_FROM, VITE_SUPABASE_URL, VITE_SUPABASE_KEY } = process.env
const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_KEY)
const mail = nodemailer.createTransport({ host: SMTP_HOST, port: +SMTP_PORT, secure: SMTP_PORT === '465', auth: { user: SMTP_USER, pass: SMTP_PASS } })
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const send = (to, code, reset) => mail.sendMail({
  from: SMTP_FROM || `faísca <${SMTP_USER}>`, to,
  subject: `${code} é o teu código da faísca`,
  text: `${reset ? 'Para redefinires a tua password' : 'Para confirmares o teu email'}, usa este código: ${code}\n\n`
    + 'Expira em 15 minutos. Se não foste tu, ignora este email. Nunca partilhes este código com ninguém.',
})

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { action, email, username } = req.body ?? {}
  try {
    if (action === 'verify') {
      const { data: { user } } = await supabase.auth.getUser(req.headers.authorization?.replace('Bearer ', ''))
      if (!user) return res.status(401).end()
      const to = String(email ?? '').trim().toLowerCase()
      if (!EMAIL.test(to) || to.length > 120) return res.status(400).json({ error: 'invalid_email' })
      const { data: code, error } = await supabase.rpc('email_issue_code',
        { p_secret: EMAIL_SECRET, p_user: user.id, p_purpose: 'verify', p_email: to, p_university: isUniversityEmail(to) })
      if (error) return res.status(400).json({ error: error.message })
      await send(to, code, false)
      return res.json({ ok: true, university: isUniversityEmail(to) })
    }
    if (action === 'reset') {
      // Same answer whether or not the username exists or has an email, so nobody can probe accounts.
      const { data } = await supabase.rpc('email_reset_target', { p_secret: EMAIL_SECRET, p_username: String(username ?? '') })
      const target = data?.[0]
      if (target) {
        const { data: code, error } = await supabase.rpc('email_issue_code',
          { p_secret: EMAIL_SECRET, p_user: target.user_id, p_purpose: 'reset', p_email: target.email, p_university: false })
        if (!error) await send(target.email, code, true)
      }
      return res.json({ ok: true })
    }
    res.status(400).end()
  } catch (e) {
    res.status(500).json({ error: 'send_failed', detail: String(e.message).slice(0, 200) })
  }
}
