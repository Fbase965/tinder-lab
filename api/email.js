// Vercel function: emails a 6-digit code to verify an address (signed in) or to reset the password (login page).
// Codes are made and checked in the database (supabase/email.sql); this only delivers them over SMTP.
import nodemailer from 'nodemailer'
import { createClient } from '@supabase/supabase-js'
import { isUniversityEmail } from '../src/emailDomains.js'

const { EMAIL_SECRET, SMTP_HOST, SMTP_PORT = '465', SMTP_USER, SMTP_PASS, SMTP_FROM, VITE_SUPABASE_URL, VITE_SUPABASE_KEY } = process.env
const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_KEY)
const mail = nodemailer.createTransport({ host: SMTP_HOST, port: +SMTP_PORT, secure: SMTP_PORT === '465', auth: { user: SMTP_USER, pass: SMTP_PASS } })
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Email clients only render inline styles and tables, so the layout is old-school on purpose.
const html = (code, reset) => `<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body style="margin:0;padding:0;background:#fafaf7">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf7;padding:32px 16px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#ffffff;border:1px solid #ecebe6;border-radius:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2420">
<tr><td style="padding:32px 32px 8px" align="center">
  <img src="https://faiscauni.vercel.app/faisca-mark.png" width="56" height="56" alt="" style="display:block;border:0">
  <div style="margin-top:10px;font-size:24px;font-weight:800;letter-spacing:-0.5px">faísca</div>
</td></tr>
<tr><td style="padding:16px 32px 0" align="center">
  <div style="font-size:11px;font-weight:800;letter-spacing:1.5px;color:#ff5b5f">${reset ? 'REDEFINIR PASSWORD' : 'VERIFICAR EMAIL'}</div>
  <div style="margin-top:8px;font-size:15px;line-height:1.5;color:#5f6661">${reset
    ? 'Usa este código para escolheres uma password nova.'
    : 'Usa este código para confirmares o teu email e ganhares o selo de verificado.'}</div>
</td></tr>
<tr><td style="padding:24px 32px" align="center">
  <div style="display:inline-block;padding:16px 14px 16px 24px;border-radius:16px;background:#fff1f0;color:#ff5b5f;font-size:34px;font-weight:800;letter-spacing:10px;font-family:'SF Mono',Menlo,Consolas,monospace">${code}</div>
  <div style="margin-top:12px;font-size:13px;color:#a1a5a2">Expira em 15 minutos</div>
</td></tr>
<tr><td style="padding:0 32px 28px">
  <div style="border-top:1px solid #ecebe6;padding-top:18px;font-size:12px;line-height:1.6;color:#a1a5a2">
    Nunca partilhes este código com ninguém. A equipa da faísca nunca to vai pedir.<br>
    Se não foste tu, ignora este email: a tua conta continua segura.
  </div>
</td></tr>
</table>
<div style="margin-top:16px;font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:11px;color:#a1a5a2">faísca · faiscauni.vercel.app</div>
</td></tr></table></body></html>`

const send = (to, code, reset) => mail.sendMail({
  from: SMTP_FROM || `faísca <${SMTP_USER}>`, to,
  subject: `${code} é o teu código da faísca`,
  text: `${reset ? 'Para redefinires a tua password' : 'Para confirmares o teu email'}, usa este código: ${code}\n\n`
    + 'Expira em 15 minutos. Se não foste tu, ignora este email. Nunca partilhes este código com ninguém.',
  html: html(code, reset),
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
    console.error('email send failed:', e.code, e.responseCode, e.response ?? e.message)
    res.status(500).json({ error: 'send_failed', detail: String(e.message).slice(0, 200) })
  }
}
