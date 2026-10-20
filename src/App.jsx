import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { Icon, Brand } from './icons'
import { useDeck, useMatches, needsReply, completeness } from './data'
import { Discover, ProfileSheet } from './Discover'
import { Explore } from './Explore'
import { Messages } from './Messages'
import { Profile, ProfileForm, PreferencesModal } from './Profile'

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
      <ProfileForm uid={session.user.id} onSaved={setMe} />
    </div>
  )
  return <Shell me={me} setMe={setMe} />
}

// Supabase Auth needs an email, so the username maps to a placeholder address no mail is ever sent to.
// Requires "Confirm email" OFF in Supabase Auth settings.
const usernameEmail = (u) => `${u}@users.tinderlab.app`
const ERRORS = {
  'Invalid login credentials': 'Username ou password errados.',
  'User already registered': 'Esse username já existe.',
}

function Auth() {
  const [signUp, setSignUp] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const switchMode = () => { setSignUp(!signUp); setMsg(''); setConfirm('') }
  const submit = async (e) => {
    e.preventDefault()
    const u = username.trim().toLowerCase()
    if (signUp && password !== confirm) return setMsg('As passwords não coincidem.')
    setBusy(true)
    const creds = { email: usernameEmail(u), password }
    const { error } = signUp ? await supabase.auth.signUp(creds) : await supabase.auth.signInWithPassword(creds)
    setBusy(false)
    setMsg(error ? (ERRORS[error.message] ?? error.message) : '')
  }

  return (
    <div className="auth-page">
      <aside className="auth-aside">
        <Brand />
        <span className="aside-kicker">MATCH WITH INTENTION</span>
        <div className="aside-title">Pessoas reais.<br />Boas <em>conversas.</em></div>
      </aside>
      <form className={`auth-card ${signUp ? 'signup' : ''}`} onSubmit={submit}>
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
        <button className="primary-button" disabled={busy}>{busy ? '…' : signUp ? 'Criar conta' : 'Entrar'}</button>
        {msg && <p className="form-error">{msg}</p>}
        <p className="switch">
          {signUp ? 'Já tens conta?' : 'Ainda não tens conta?'}{' '}
          <button type="button" className="link" onClick={switchMode}>{signUp ? 'Entrar' : 'Criar conta'}</button>
        </p>
      </form>
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
  const [page, setPage] = useState('discover')
  const [toastText, setToastText] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [sheet, setSheet] = useState(null) // profile shown in the details sheet
  const [matched, setMatched] = useState(null)
  const [chatWith, setChatWith] = useState(null)
  const [hasLocation, setHasLocation] = useState(false)

  const toast = useCallback((t) => setToastText(t), [])
  useEffect(() => {
    if (!toastText) return
    const t = setTimeout(() => setToastText(''), 2200)
    return () => clearTimeout(t)
  }, [toastText])

  useEffect(() => {
    supabase.from('locations').select('id').eq('id', me.id).maybeSingle().then(({ data }) => setHasLocation(!!data))
  }, [me.id])

  const deckApi = useDeck(me, toast)
  const matches = useMatches(me)
  const unread = (matches.list ?? []).filter((m) => needsReply(me, m)).length
  const complete = completeness(me, hasLocation)

  const navigate = (p) => { setPage(p); setChatWith(null); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  // Swipe from anywhere (card, explore grid, details sheet) goes through here.
  const swipe = async (card, kind) => {
    const res = await deckApi.swipe(card, kind)
    if (res === 'match') { setMatched(card); matches.reload() }
    else if (res && kind !== 'nope') toast(kind === 'super' ? `Super Like enviado a ${card.name}` : `Gostaste de ${card.name}`)
    return res
  }

  const openChat = (p) => { setMatched(null); setPage('messages'); setChatWith(p.id) }

  return (
    <main className="web-app">
      <aside className="side-nav">
        <Brand />
        <nav aria-label="Navegação principal">
          {NAV.map((item) => (
            <button key={item.id} className={`side-link ${page === item.id ? 'active' : ''}`} onClick={() => navigate(item.id)}>
              <Icon name={item.icon} filled={page === item.id} />
              <span>{item.label}</span>
              {item.id === 'messages' && unread > 0 && <i>{unread}</i>}
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
        <button className="icon-button" aria-label="Preferências" onClick={() => setFilterOpen(true)}>
          <Icon name="sliders" size={19} />
        </button>
      </header>

      <section className="page-shell">
        {page === 'discover' && (
          <Discover me={me} deckApi={deckApi} swipe={swipe} complete={complete} paused={!!(matched || sheet || filterOpen)}
            openFilters={() => setFilterOpen(true)} openSheet={setSheet} goProfile={() => navigate('profile')} />
        )}
        {page === 'explore' && <Explore me={me} deck={deckApi.deck} swipe={swipe} openSheet={setSheet} />}
        {page === 'messages' && (
          <Messages me={me} matches={matches} selected={chatWith} onSelect={setChatWith} toast={toast} />
        )}
        {page === 'profile' && (
          <Profile me={me} setMe={setMe} complete={complete} hasLocation={hasLocation} setHasLocation={setHasLocation}
            matchesCount={matches.list?.length ?? 0} openFilters={() => setFilterOpen(true)} toast={toast} />
        )}
      </section>

      <nav className="bottom-nav">
        {NAV.map((item) => (
          <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => navigate(item.id)}>
            <Icon name={item.icon} filled={page === item.id} />
            <span>{item.short ?? item.label}</span>
            {item.id === 'messages' && unread > 0 && <i>{unread}</i>}
          </button>
        ))}
      </nav>

      {toastText && <div className="toast" role="status">{toastText}</div>}
      {filterOpen && (
        <PreferencesModal me={me} onClose={() => setFilterOpen(false)}
          onSaved={(p) => { setMe(p); setFilterOpen(false); toast('Preferências atualizadas') }} />
      )}
      {sheet && (
        <ProfileSheet me={me} p={sheet} onClose={() => setSheet(null)}
          onSwipe={deckApi.deck?.some((c) => c.id === sheet.id) ? (kind) => { setSheet(null); swipe(sheet, kind) } : null} />
      )}
      {matched && (
        <div className="modal-backdrop match-overlay" onClick={() => setMatched(null)}>
          <div className="match-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pair"><Avatar p={me} /><Avatar p={matched} /></div>
            <div className="aside-title">É um <em>match!</em></div>
            <p>Tu e {matched.name} gostaram um do outro.</p>
            <button className="primary-button" onClick={() => openChat(matched)}>Enviar mensagem</button>
            <button className="link" onClick={() => setMatched(null)}>Continuar a descobrir</button>
          </div>
        </div>
      )}
    </main>
  )
}

export function Avatar({ p, idx = 0, className = '' }) {
  const url = p.photos?.[idx]
  return url
    ? <img className={className} src={url} alt={p.name} draggable={false} />
    : <span className={`placeholder ${className}`} aria-label={p.name}>{p.name?.[0]}</span>
}
