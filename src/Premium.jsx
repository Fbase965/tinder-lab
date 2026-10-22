import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { Icon, Badges, RoleBadge, ROLES } from './icons'
import { Avatar, Modal } from './App'
import { withVerified, shortDate } from './data'

const PRICE = import.meta.env.VITE_PREMIUM_PRICE // e.g. "4,99 €/mês"; set on Vercel with the Stripe price

// The caller's plan from my_plan() (supabase/premium.sql).
export function usePlan() {
  const [plan, setPlan] = useState({ premium: false, loaded: false })
  const reload = useCallback(() => supabase.rpc('my_plan').then(({ data }) => {
    const p = data?.[0] ?? {}
    setPlan({
      loaded: true,
      premium: !!p.premium_until && new Date(p.premium_until) > new Date(),
      until: p.premium_until, source: p.source,
      likesLeft: p.likes_left, superLeft: p.super_left ?? 1,
      canBoost: !!p.can_boost, boostUntil: p.boost_until && new Date(p.boost_until) > new Date() ? p.boost_until : null,
      isAdmin: !!p.is_admin,
    })
  }), [])
  useEffect(() => { reload() }, [reload])
  return { ...plan, reload }
}

const FEATURES = [
  ['heart', 'Vê quem gostou de ti', 'Dá match na hora, sem esperar que apareçam no deck.'],
  ['eye', 'Vê quem visitou o teu perfil', 'Quem abriu o teu perfil nos últimos 30 dias.'],
  ['message', 'Vê de quem gostaste', 'A lista dos teus likes e Super Likes, para não perderes ninguém.'],
  ['brand', 'Chama faísca+ ao lado do nome', 'Toda a gente vê que és faísca+.'],
  ['infinity', 'Likes ilimitados', 'Sem o limite de 50 por dia.'],
  ['star', '5 Super Likes por dia', 'Em vez de 1.'],
  ['bolt', 'Boost diário', 'Apareces primeiro a toda a gente durante 30 minutos.'],
  ['undo', 'Desfazer sem limite de tempo', 'Recupera qualquer perfil que passaste (exceto matches).'],
]

async function billing(action) {
  const { data } = await supabase.auth.getSession()
  const r = await fetch('/api/billing', {
    method: 'POST', body: JSON.stringify({ action }),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token}` },
  })
  const json = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(json.error ?? `erro ${r.status}`)
  location.href = json.url
}

const dateText = (iso) => new Date(iso).toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' })

export function PremiumSheet({ plan, onClose, toast }) {
  const [busy, setBusy] = useState(false)
  const go = async (action) => {
    setBusy(true)
    try { await billing(action) } catch (e) { toast(e.message); setBusy(false) }
  }
  return (
    <Modal className="filter-modal premium-sheet" onClose={onClose}>
      {(close) => <>
        <button className="icon-button sheet-x" onClick={close} aria-label="Fechar"><Icon name="close" /></button>
        <div className="premium-badge"><Icon name="brand" size={26} filled /><span>faísca<b>+</b></span></div>
        <div className="modal-title">{plan.premium ? 'Tens faísca+' : 'Mais matches, menos espera'}</div>
        {plan.premium && (
          <p className="premium-until">
            {plan.source === 'admin' ? 'Oferecido pela equipa' : 'Subscrição ativa'} · até {dateText(plan.until)}
          </p>
        )}
        <ul className="premium-features">
          {FEATURES.map(([icon, title, text], i) => (
            <li key={title} style={{ '--i': i }}><i><Icon name={icon} size={19} filled={icon === 'heart' || icon === 'star'} /></i>
              <div><strong>{title}</strong><span>{text}</span></div></li>
          ))}
        </ul>
        {!plan.premium && (
          <button className="primary-button" disabled={busy} onClick={() => go('checkout')}>
            {busy ? 'A abrir…' : `Subscrever faísca+${PRICE ? ` · ${PRICE}` : ''}`}
          </button>
        )}
        {plan.premium && plan.source === 'stripe' && (
          <button className="primary-button ghost" disabled={busy} onClick={() => go('portal')}>{busy ? 'A abrir…' : 'Gerir subscrição'}</button>
        )}
        {!plan.premium && <p className="premium-fine">Pagamento seguro com Stripe. Renova todos os meses; cancelas quando quiseres.</p>}
      </>}
    </Modal>
  )
}

// "Liked you" / "viewed you" for Explore. Free users only get a count from the server, so the
// blurred tiles are decoration, not hidden data.
export function PeopleStrip({ kind, plan, openPremium, openSheet, refreshKey, fresh = 0 }) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    supabase.rpc('people_for_me', { p_kind: kind }).then(async ({ data }) => setRows(await withVerified(data)))
  }, [kind, plan.premium, refreshKey])
  if (!rows) return null
  const total = rows[0]?.total ?? 0
  const people = rows.filter((r) => r.id)
  const title = kind === 'likes' ? 'Gostam de ti' : 'Viram o teu perfil'
  const empty = kind === 'likes' ? 'Quando alguém gostar de ti, aparece aqui.' : 'Ninguém abriu o teu perfil nos últimos 30 dias.'
  return (
    <section className="people-strip">
      <div className="section-row">
        <div className="section-title">{title} {fresh > 0 && <span className="count-pill" aria-label={`${fresh} novos`}>{fresh}</span>}</div>
        {!plan.premium && total > 0 && <button onClick={openPremium}>Ver quem <Icon name="chevron" size={16} /></button>}
      </div>
      {total === 0 && <p className="empty-note">{empty}</p>}
      <div className="strip">
        {plan.premium
          ? people.map((p, i) => (
            <button key={p.id} style={{ '--i': i }} onClick={() => openSheet({ ...p, swipeable: kind === 'likes' })}>
              <i className={p.super_likes_me ? 'super' : ''}><Avatar p={p} /></i>
              <span>{p.name}, {p.age}<Badges p={p} size={13} /></span>
              {p.at && <small>{shortDate(p.at)}</small>}
            </button>
          ))
          : Array.from({ length: Math.min(total, 8) }, (_, i) => (
            <button key={i} style={{ '--i': i, '--h': (i * 47) % 360 }} onClick={openPremium} aria-label="Desbloquear com faísca+">
              <i className="blurred"><Icon name="lock" size={18} /></i>
              <span>faísca+</span>
            </button>
          ))}
      </div>
    </section>
  )
}

export function BoostButton({ plan, openPremium, toast, compact }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!plan.boostUntil) return
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [plan.boostUntil])
  const minutes = plan.boostUntil ? Math.max(0, Math.ceil((new Date(plan.boostUntil) - now) / 60000)) : 0
  const click = async () => {
    if (!plan.premium) return openPremium()
    if (minutes > 0) return toast(`Boost ativo: mais ${minutes} min no topo`)
    if (!plan.canBoost) return toast('Já usaste o Boost de hoje')
    const { error } = await supabase.rpc('start_boost')
    if (error) return toast(error.message.includes('boost_used') ? 'Já usaste o Boost de hoje' : error.message)
    toast('Boost ativo: estás no topo durante 30 minutos'); plan.reload()
  }
  return (
    <button className={`${compact ? 'icon-button' : 'filter-trigger'} boost-button ${minutes > 0 ? 'active' : ''}`} onClick={click} aria-label="Boost">
      <Icon name="bolt" size={19} filled={minutes > 0} />{!compact && <span>{minutes > 0 ? `${minutes} min` : 'Boost'}</span>}
    </button>
  )
}

// Grant or revoke faísca+ by username (admins table in supabase/premium.sql).
const ADMIN_TABS = [['stats', 'Resumo'], ['plus', 'faísca+'], ['roles', 'Cargos'], ['reports', 'Denúncias'], ['push', 'Notificações']]
const userError = (error, user) => (error.message.includes('user_not_found') ? `Não existe o username “${user}”` : error.message)

// Admin tools, one tab each (admins table in supabase/premium.sql).
export function AdminPanel({ onClose, toast }) {
  const [tab, setTab] = useState('stats')
  return (
    <Modal className="filter-modal admin-panel" onClose={onClose}>
      {(close) => <>
        <div className="modal-heading">
          <div><span className="kicker">ADMINISTRAÇÃO</span><div className="modal-title">{ADMIN_TABS.find(([id]) => id === tab)[1]}</div></div>
          <button className="icon-button" onClick={close} aria-label="Fechar"><Icon name="close" /></button>
        </div>
        <div className="admin-tabs" role="tablist">
          {ADMIN_TABS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'selected' : ''} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
        <div className="admin-body">
          {tab === 'stats' && <AdminStats />}
          {tab === 'plus' && <PlusAdmin toast={toast} />}
          {tab === 'roles' && <RolesAdmin toast={toast} />}
          {tab === 'reports' && <Reports />}
          {tab === 'push' && <PushTester toast={toast} />}
        </div>
      </>}
    </Modal>
  )
}

const STATS = [['users', 'Utilizadores'], ['new_week', 'Novos (7 dias)'], ['matches', 'Matches'], ['messages_day', 'Mensagens (24 h)'],
  ['premium', 'Com faísca+'], ['verified', 'Email verificado'], ['reports', 'Denúncias']]
function AdminStats() {
  const [s, setS] = useState(null)
  useEffect(() => { supabase.rpc('admin_stats').then(({ data }) => setS(data?.[0] ?? {})) }, [])
  return (
    <div className="admin-stats">
      {STATS.map(([k, label]) => <div key={k}><strong>{s ? s[k] ?? '–' : '…'}</strong><span>{label}</span></div>)}
    </div>
  )
}

function PlusAdmin({ toast }) {
  const [list, setList] = useState(null)
  const [username, setUsername] = useState('')
  const [days, setDays] = useState(30)
  const [busy, setBusy] = useState(false)
  const load = () => supabase.rpc('admin_list_premium').then(({ data }) => setList(data ?? []))
  useEffect(() => { load() }, [])
  const set = async (user, d) => {
    setBusy(true)
    const { error } = await supabase.rpc('admin_set_premium', { p_username: user, p_days: d })
    setBusy(false)
    if (error) return toast(userError(error, user))
    toast(d > 0 ? `faísca+ dado a ${user} por ${d} dias` : `faísca+ removido a ${user}`); setUsername(''); load()
  }
  return <>
    <form onSubmit={(e) => { e.preventDefault(); if (username.trim()) set(username.trim(), days) }}>
      <label className="field"><span>Username</span>
        <input value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" placeholder="ex: joana_23" required />
      </label>
      <span className="field-label">Duração</span>
      <div className="choice-row">
        {[[7, '7 dias'], [30, '1 mês'], [365, '1 ano']].map(([d, l]) => (
          <button type="button" key={d} className={days === d ? 'selected' : ''} onClick={() => setDays(d)}>{l}</button>
        ))}
      </div>
      <button className="primary-button" disabled={busy}>Dar faísca+</button>
    </form>
    <span className="settings-label">COM FAÍSCA+ ({list?.length ?? '…'})</span>
    <div className="admin-list">
      {list?.map((u) => (
        <div key={u.username}>
          <div><strong>{u.name}</strong><span>@{u.username} · até {dateText(u.premium_until)}</span></div>
          <button className="link danger" disabled={busy} onClick={() => confirm(`Remover faísca+ a ${u.username}?`) && set(u.username, 0)}>Remover</button>
        </div>
      ))}
      {list?.length === 0 && <p className="empty-note">Ninguém tem faísca+ neste momento.</p>}
    </div>
  </>
}

// Team badges next to the name (supabase/staff.sql).
function RolesAdmin({ toast }) {
  const [list, setList] = useState(null)
  const [username, setUsername] = useState('')
  const [role, setRole] = useState('founder')
  const [busy, setBusy] = useState(false)
  const load = () => supabase.rpc('admin_list_roles').then(({ data }) => setList(data ?? []))
  useEffect(() => { load() }, [])
  const set = async (user, r) => {
    setBusy(true)
    const { error } = await supabase.rpc('admin_set_role', { p_username: user, p_role: r })
    setBusy(false)
    if (error) return toast(userError(error, user))
    toast(r ? `${ROLES[r]} dado a ${user}` : `Cargo removido a ${user}`); setUsername(''); load()
  }
  return <>
    <form onSubmit={(e) => { e.preventDefault(); if (username.trim()) set(username.trim(), role) }}>
      <label className="field"><span>Username</span>
        <input value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" placeholder="ex: joana_23" required />
      </label>
      <span className="field-label">Cargo</span>
      <div className="choice-row role-choice">
        {Object.entries(ROLES).map(([id, label]) => (
          <button type="button" key={id} className={role === id ? 'selected' : ''} onClick={() => setRole(id)}><RoleBadge role={id} size={16} /> {label}</button>
        ))}
      </div>
      <button className="primary-button" disabled={busy}>Dar cargo</button>
    </form>
    <span className="settings-label">EQUIPA ({list?.length ?? '…'})</span>
    <div className="admin-list">
      {list?.map((u) => (
        <div key={u.username}>
          <div><strong>{u.name} <RoleBadge role={u.role} size={15} /></strong><span>@{u.username} · {ROLES[u.role]}</span></div>
          <button className="link danger" disabled={busy} onClick={() => confirm(`Remover o cargo a ${u.username}?`) && set(u.username, null)}>Remover</button>
        </div>
      ))}
      {list?.length === 0 && <p className="empty-note">Ainda ninguém tem cargo.</p>}
    </div>
  </>
}

// Reports = blocks with a reason (supabase/moderation.sql). Newest first.
function Reports() {
  const [rows, setRows] = useState(null)
  useEffect(() => { supabase.rpc('admin_reports').then(({ data }) => setRows(data ?? [])) }, [])
  return <>
    <span className="settings-label">DENÚNCIAS ({rows?.length ?? '…'})</span>
    <div className="admin-list">
      {rows?.map((r) => (
        <div key={`${r.reporter_username}-${r.reported_username}`}>
          <div>
            <strong>{r.reported_name} · @{r.reported_username}{r.reports_against > 1 && ` · ${r.reports_against} denúncias`}</strong>
            <span>“{r.reason}” — por @{r.reporter_username}, {dateText(r.created_at)}</span>
          </div>
        </div>
      ))}
      {rows?.length === 0 && <p className="empty-note">Sem denúncias.</p>}
    </div>
  </>
}

// Sends a test push (supabase/push-test.sql) and shows what the last deliveries returned.
function PushTester({ toast }) {
  const [username, setUsername] = useState('')
  const [message, setMessage] = useState('')
  const [everyone, setEveryone] = useState(false)
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const refresh = () => supabase.rpc('admin_push_status').then(({ data, error }) => setStatus(error ? { error: error.message } : data?.[0]))
  const send = async () => {
    if (everyone && !confirm(`Enviar “${message.trim() || 'Notificação de teste'}” a TODOS os utilizadores?`)) return
    setBusy(true)
    const { data, error } = await supabase.rpc('admin_test_push', { p_username: everyone ? '*' : username.trim() || null, p_message: message.trim() || null })
    setBusy(false)
    if (error) return toast(error.message.includes('user_not_found') ? `Não existe o username “${username}”` : error.message)
    setMessage('')
    const n = data?.[0]?.dispositivos ?? 0
    toast(n ? `Enviada para ${n} ${n === 1 ? 'dispositivo' : 'dispositivos'}` : 'Esta conta não tem notificações ativas em nenhum dispositivo')
    setTimeout(refresh, 3000) // pg_net delivers asynchronously
  }
  return (
    <div className="push-tester">
      <textarea className="push-message" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={200} rows={2}
        placeholder="Mensagem (vazio = notificação de teste)" />
      <div className="choice-row push-target">
        <button type="button" className={!everyone ? 'selected' : ''} onClick={() => setEveryone(false)}>Uma conta</button>
        <button type="button" className={everyone ? 'selected' : ''} onClick={() => setEveryone(true)}>Todos</button>
      </div>
      <div className="push-row">
        {!everyone && <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username (vazio = tu)" autoCapitalize="none" />}
        <button type="button" className="primary-button" onClick={send} disabled={busy}>{busy ? '…' : everyone ? 'Enviar a todos' : 'Enviar'}</button>
      </div>
      <button type="button" className="link" onClick={refresh}>Ver estado</button>
      {status?.error && <p className="form-error">{status.error}</p>}
      {status && !status.error && (
        <div className="push-status">
          <p>{status.dispositivos_total} {status.dispositivos_total === 1 ? 'dispositivo' : 'dispositivos'} com notificações</p>
          {status.ultimas.length === 0 && <p>Ainda nenhuma notificação enviada.</p>}
          {status.ultimas.map((r) => (
            <p key={r.id} className={r.status_code === 200 ? 'ok' : 'bad'}>
              {new Date(r.created).toLocaleTimeString('pt-PT')} · {r.status_code ?? 'sem resposta'} {r.error_msg ?? ''} {r.timed_out ? 'timeout' : ''} <code>{r.resposta}</code>
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
