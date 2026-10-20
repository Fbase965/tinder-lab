import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { Icon, Brand } from './icons'
import { useDeck, useMatches, needsReply, completeness } from './data'
import { Discover, ProfileSheet } from './Discover'
import { Explore } from './Explore'
import { Messages } from './Messages'
import { Profile, ProfileForm, PreferencesModal, MIN_AGE, UniversityField } from './Profile'
import { LegalModal } from './Legal'
import { InstallPrompt, NotifyPrompt, markJustSignedUp, openInstall } from './Install'
import { isIOS, isStandalone } from './pwa'
import { usePlan, PremiumSheet, BoostButton } from './Premium'

export default function App() {
  const [session, setSession] = useState(null)
  const [me, setMe] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return setMe(undefined)
    supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle()
      .then(({ data }) => setMe(data))
  }, [session])

  if (!session) return <Auth />
  if (me === undefined) return <p className="loading">A carregar…</p>
  if (!me) return (
    <div className="onboarding">
      <Brand />
      <span className="kicker">BEM-VINDO</span>
      <div className="page-title">Cria o teu perfil</div>
      <ProfileForm uid={session.user.id} onSaved={(p) => { markJustSignedUp(); setMe(p) }} />
    </div>
  )
  return <Shell me={me} setMe={setMe} />
}

// Supabase Auth needs an email, so the username maps to a placeholder address no mail is ever sent to.
// The domain must be one nobody else can receive mail for: vercel.app DNS is Vercel's alone (no MX on it).
// Requires "Confirm email" OFF in Supabase Auth settings. Changing it needs supabase/email-domain.sql.
const usernameEmail = (u) => `${u}@users.tinder-lab.vercel.app`
const ERRORS = {
  'Invalid login credentials': 'Username ou password errados.',
  'User already registered': 'Esse username já existe.',
}

// Cloudflare Turnstile captcha. Off until VITE_TURNSTILE_SITE_KEY is set and captcha is enabled in
// Supabase (Authentication → Attack Protection) with the matching secret key.
const TURNSTILE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY
function useCaptcha(box) {
  const [token, setToken] = useState('')
  const widget = useRef(null)
  useEffect(() => {
    if (!TURNSTILE_KEY) return
    const render = () => {
      if (box.current && widget.current == null)
        widget.current = window.turnstile.render(box.current, { sitekey: TURNSTILE_KEY, callback: setToken, 'expired-callback': () => setToken('') })
    }
    if (window.turnstile) return render()
    const s = Object.assign(document.createElement('script'), { src: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', async: true })
    s.onload = render
    document.head.appendChild(s)
  }, [box])
  // Tokens are single-use: get a fresh one after every attempt.
  const reset = () => { if (widget.current != null) { window.turnstile.reset(widget.current); setToken('') } }
  return { enabled: !!TURNSTILE_KEY, token, reset }
}

function Auth() {
  const [signUp, setSignUp] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [legal, setLegal] = useState(null)
  const [accepted, setAccepted] = useState(false)
  const box = useRef(null)
  const captcha = useCaptcha(box)

  const switchMode = () => { setSignUp(!signUp); setMsg(''); setConfirm(''); setAccepted(false) }
  const submit = async (e) => {
    e.preventDefault()
    const u = username.trim().toLowerCase()
    if (signUp && password !== confirm) return setMsg('As passwords não coincidem.')
    if (captcha.enabled && !captcha.token) return setMsg('Confirma que não és um robô.')
    setBusy(true)
    const creds = { email: usernameEmail(u), password, options: captcha.enabled ? { captchaToken: captcha.token } : undefined }
    const { error } = signUp ? await supabase.auth.signUp(creds) : await supabase.auth.signInWithPassword(creds)
    setBusy(false)
    captcha.reset()
    const captchaFail = error?.message.startsWith('captcha') && 'A verificação anti-robô falhou. Tenta outra vez.'
    setMsg(error ? (captchaFail || ERRORS[error.message] || error.message) : '')
  }

  return (
    <div className="auth-page">
      <aside className="auth-aside">
        <Brand />
        <span className="aside-kicker">MATCH WITH INTENTION</span>
        <div className="aside-title">Pessoas reais.<br />Boas <em>conversas.</em></div>
      </aside>
      <form key={signUp} className={`auth-card ${signUp ? 'signup' : ''}`} onSubmit={submit}>
        {signUp && isIOS() && !isStandalone() && (
          // iOS keeps home-screen apps' storage apart from Safari: creating the account inside the app keeps you signed in there.
          <button type="button" className="ios-tip" onClick={openInstall}>
            <Icon name="addSquare" size={20} />
            <span><b>Vais usar no iPhone?</b> Instala a app primeiro e cria a conta lá, para ficares logo com sessão iniciada.</span>
          </button>
        )}
        <span className="kicker">{signUp ? 'NOVA CONTA' : 'BEM-VINDO DE VOLTA'}</span>
        <div className="page-title">{signUp ? 'Cria a tua conta' : 'Entrar'}</div>
        <p className="sub">{signUp ? 'Escolhe um username e uma password. A seguir crias o teu perfil.' : 'Entra com o teu username.'}</p>
        <label className="field"><span>Username</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} required
            pattern="[A-Za-z0-9_.]{3,20}" title="3–20 letras, números, _ ou ." autoCapitalize="none" autoComplete="username" />
        </label>
        <label className="field"><span>Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6}
            placeholder={signUp ? 'Mínimo 6 caracteres' : ''} autoComplete={signUp ? 'new-password' : 'current-password'} />
        </label>
        {signUp && (
          <label className="field"><span>Repetir password</span>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={6} autoComplete="new-password" />
          </label>
        )}
        {signUp && (
          <label className="consent">
            <input type="checkbox" required checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
            <span>
              Tenho pelo menos {MIN_AGE} anos e aceito os <button type="button" className="link" onClick={() => setLegal('terms')}>Termos</button> e
              a <button type="button" className="link" onClick={() => setLegal('privacy')}>Política de Privacidade</button>, incluindo
              o tratamento de quem procuro (orientação) e da minha localização, se a partilhar.
            </span>
          </label>
        )}
        <div ref={box} className="captcha" />
        <button className="primary-button" disabled={busy || (signUp && !accepted)}>{busy ? '…' : signUp ? 'Criar conta' : 'Entrar'}</button>
        {msg && <p className="form-error">{msg}</p>}
        <p className="switch">
          {signUp ? 'Já tens conta?' : 'Ainda não tens conta?'}{' '}
          <button type="button" className="link" onClick={switchMode}>{signUp ? 'Entrar' : 'Criar conta'}</button>
        </p>
      </form>
      {legal && <LegalModal doc={legal} onClose={() => setLegal(null)} />}
      <InstallPrompt />
    </div>
  )
}

const NAV = [
  { id: 'discover', label: 'Descobrir', icon: 'flame' },
  { id: 'explore', label: 'Explorar', icon: 'sparkles' },
  { id: 'messages', label: 'Mensagens', icon: 'message' },
  { id: 'profile', label: 'O meu perfil', short: 'Perfil', icon: 'user' },
]

function Shell({ me, setMe }) {
  // Notification taps open /?chat=<id> (public/sw.js).
  const params = new URLSearchParams(location.search)
  const deepChat = params.get('chat')
  const deepPremium = params.get('premium') // back from Stripe: 'ok' after paying, '1' to reopen the sheet
  const [page, setPage] = useState(deepChat ? 'messages' : 'discover')
  const [toastText, setToastText] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [sheet, setSheet] = useState(null) // profile shown in the details sheet
  const [matched, setMatched] = useState(null)
  const [chatWith, setChatWith] = useState(deepChat)
  useEffect(() => { if (deepChat || deepPremium) history.replaceState(null, '', '/') }, [deepChat, deepPremium])
  const plan = usePlan()
  const [premiumOpen, setPremiumOpen] = useState(deepPremium === '1')
  const openPremium = () => setPremiumOpen(true)
  const [hasLocation, setHasLocation] = useState(false)

  const toast = useCallback((t) => setToastText(t), [])
  useEffect(() => {
    if (!toastText) return
    const t = setTimeout(() => setToastText(''), 2200)
    return () => clearTimeout(t)
  }, [toastText])

  useEffect(() => {
    supabase.from('locations').select('lat').eq('id', me.id).maybeSingle().then(({ data }) => setHasLocation(data?.lat != null))
  }, [me.id])

  const deckApi = useDeck(me, toast, plan, openPremium)
  const reloadPlan = plan.reload
  useEffect(() => { // the Stripe webhook can land a few seconds after the redirect
    if (deepPremium !== 'ok') return
    toast('Pagamento recebido. A ativar o faísca+…')
    const ts = [2000, 6000, 15000].map((ms) => setTimeout(reloadPlan, ms))
    return () => ts.forEach(clearTimeout)
  }, [deepPremium, toast, reloadPlan])
  const matches = useMatches(me)
  const unread = (matches.list ?? []).filter((m) => needsReply(me, m)).length
  const complete = completeness(me, hasLocation)

  const navigate = (p) => { setPage(p); setChatWith(null); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  // Swipe from anywhere (card, explore grid, details sheet) goes through here.
  const swipe = async (card, kind) => {
    const res = await deckApi.swipe(card, kind)
    if (res) plan.reload() // likes / Super Likes left
    if (res === 'match') { setMatched(card); matches.reload(); navigator.vibrate?.([20, 60, 30]) }
    else if (res && kind !== 'nope') toast(kind === 'super' ? `Super Like enviado a ${card.name}` : `Gostaste de ${card.name}`)
    return res
  }

  const openChat = (p) => { setMatched(null); setPage('messages'); setChatWith(p.id) }

  return (
    <main className={`web-app ${page === 'messages' && chatWith ? 'in-chat' : ''}`}>
      <aside className="side-nav">
        <Brand />
        <nav aria-label="Navegação principal">
          {NAV.map((item) => (
            <button key={item.id} className={`side-link ${page === item.id ? 'active' : ''}`} onClick={() => navigate(item.id)}>
              <Icon name={item.icon} filled={page === item.id} />
              <span>{item.label}</span>
              {item.id === 'messages' && unread > 0 && <i>{unread}</i>}
              {item.id === 'explore' && !plan.premium && <b className="plus-tag">+</b>}
            </button>
          ))}
        </nav>
        <button className="side-profile" onClick={() => navigate('profile')}>
          <Avatar p={me} />
          <div><strong>{me.name}, {me.age}</strong><span>Ver o meu perfil</span></div>
          <Icon name="chevron" size={18} />
        </button>
      </aside>

      <header className="mobile-header">
        <Brand />
        <div className="header-actions">
          <BoostButton plan={plan} openPremium={openPremium} toast={toast} compact />
          <button className="icon-button" aria-label="Preferências" onClick={() => setFilterOpen(true)}>
            <Icon name="sliders" size={19} />
          </button>
        </div>
      </header>

      <section className="page-shell">
        <div key={page} className="page-enter">
          {page === 'discover' && (
            <Discover me={me} deckApi={deckApi} swipe={swipe} complete={complete} paused={!!(matched || sheet || filterOpen || premiumOpen)}
              openFilters={() => setFilterOpen(true)} openSheet={setSheet} goProfile={() => navigate('profile')}
              boost={<BoostButton plan={plan} openPremium={openPremium} toast={toast} />} />
          )}
          {page === 'explore' && <Explore deck={deckApi.deck} swipe={swipe} openSheet={setSheet} plan={plan} openPremium={openPremium} />}
          {page === 'messages' && (
            <Messages me={me} matches={matches} selected={chatWith} onSelect={setChatWith} toast={toast} />
          )}
          {page === 'profile' && (
            <Profile me={me} setMe={setMe} complete={complete} hasLocation={hasLocation} setHasLocation={setHasLocation}
              matchesCount={matches.list?.length ?? 0} openFilters={() => setFilterOpen(true)} toast={toast}
              plan={plan} openPremium={openPremium} />
          )}
        </div>
      </section>

      <nav className="bottom-nav">
        {NAV.map((item) => (
          <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => navigate(item.id)}>
            <Icon name={item.icon} filled={page === item.id} />
            <span>{item.short ?? item.label}</span>
            {item.id === 'messages' && unread > 0 && <i>{unread}</i>}
            {item.id === 'explore' && !plan.premium && <b className="plus-tag">+</b>}
          </button>
        ))}
      </nav>

      {toastText && <div key={toastText} className="toast" role="status">{toastText}</div>}
      {premiumOpen && <PremiumSheet plan={plan} onClose={() => setPremiumOpen(false)} toast={toast} />}
      {me.university == null && <UniversityPrompt me={me} setMe={setMe} toast={toast} />}
      <InstallPrompt />
      <NotifyPrompt toast={toast} />
      {filterOpen && (
        <PreferencesModal me={me} onClose={() => setFilterOpen(false)}
          onSaved={(p) => { setMe(p); toast('Preferências atualizadas') }} />
      )}
      {sheet && (
        <ProfileSheet me={me} p={sheet} onClose={() => setSheet(null)}
          onSwipe={sheet.swipeable || deckApi.deck?.some((c) => c.id === sheet.id) ? (kind) => swipe(sheet, kind) : null} />
      )}
      {matched && (
        <Modal className="match-modal" backdropClass="match-overlay" onClose={() => setMatched(null)}>
          {(close) => <>
            <div className="hearts" aria-hidden="true">
              {Array.from({ length: 12 }, (_, i) => (
                <i key={i} style={{ '--x': `${(i * 37) % 100}%`, '--d': `${(i * 0.29) % 1.6}s`, '--s': 0.6 + ((i * 7) % 5) / 6 }}>
                  <Icon name="heart" size={22} filled />
                </i>
              ))}
            </div>
            <div className="pair"><Avatar p={me} /><Avatar p={matched} /></div>
            <div className="aside-title">É um <em>match!</em></div>
            <p>Tu e {matched.name} gostaram um do outro.</p>
            <button className="primary-button" onClick={() => openChat(matched)}>Enviar mensagem</button>
            <button className="link" onClick={close}>Continuar a descobrir</button>
          </>}
        </Modal>
      )}
    </main>
  )
}

// Backdrop + panel with enter and exit animations. Children may be a function to get `close` for their own buttons.
export function Modal({ onClose, className, backdropClass = '', children }) {
  const [closing, setClosing] = useState(false)
  const close = () => setClosing(true)
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setClosing(true)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden' // no page scroll behind the sheet on phones
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow }
  }, [])
  return (
    <div className={`modal-backdrop ${backdropClass} ${closing ? 'closing' : ''}`} onClick={close}
      onAnimationEnd={(e) => closing && e.target === e.currentTarget && onClose()}>
      <div className={className} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {typeof children === 'function' ? children(close) : children}
      </div>
    </div>
  )
}

export function Avatar({ p, idx = 0, className = '' }) {
  const url = p.photos?.[idx]
  return url
    ? <img className={className} src={url} alt={p.name} draggable={false} />
    : <span className={`placeholder ${className}`} aria-label={p.name}>{p.name?.[0]}</span>
}

// One-time ask for accounts created before the university field existed.
function UniversityPrompt({ me, setMe, toast }) {
  const key = `faisca-uni-later-${me.id}`
  const [open, setOpen] = useState(() => { try { return !sessionStorage.getItem(key) } catch { return true } })
  const [uni, setUni] = useState('')
  const [busy, setBusy] = useState(false)
  if (!open) return null
  const later = () => { try { sessionStorage.setItem(key, '1') } catch { /* ignore */ } }
  return (
    <Modal className="filter-modal uni-modal" onClose={() => setOpen(false)}>
      {(close) => (
        <form onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          const { data, error } = await supabase.from('profiles').update({ university: uni.trim() }).eq('id', me.id).select().single()
          setBusy(false)
          if (error) return toast(error.message)
          toast('Universidade guardada'); close(); setMe(data)
        }}>
          <span className="kicker">NOVIDADE</span>
          <div className="modal-title">Em que universidade andas?</div>
          <p className="install-sub">Aparece no teu perfil em vez da profissão e ajuda-te a encontrar pessoas da tua faculdade.</p>
          <UniversityField value={uni} onChange={setUni} required />
          <button className="primary-button" disabled={busy || !uni.trim()}>{busy ? 'A guardar…' : 'Guardar'}</button>
          <button type="button" className="link" onClick={() => { later(); close() }}>Agora não</button>
        </form>
      )}
    </Modal>
  )
}
