import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { Icon, Badges } from './icons'
import { Avatar, Modal } from './App'
import { LegalModal } from './Legal'
import { NotificationsRow } from './Install'
import { disablePush } from './pwa'
import { AdminPanel } from './Premium'
import { UNIVERSITIES, OTHER, isListed } from './universities'
import { isUniversityEmail } from './emailDomains'
import { loadMyLikes, loadLikers, shortDate } from './data'

const GENDERS = [['man', 'Homem'], ['woman', 'Mulher'], ['other', 'Outro']]
const LOOKING = [['women', 'Mulheres'], ['men', 'Homens'], ['everyone', 'Todos']]
const DISTANCES = [5, 10, 25, 50, 100, 200, 500] // must match profiles_max_distance_km_check
export const MIN_AGE = 18
// Database errors (supabase/launch.sql) in words people understand.
const DB_ERRORS = {
  too_young: `Tens de ter pelo menos ${MIN_AGE} anos.`,
  birth_date_locked: 'A data de nascimento não pode ser alterada.',
  invalid_photo_url: 'Uma das fotos não é válida. Volta a carregá-la.',
  location_rate_limit: 'Só podes mudar a localização de 6 em 6 horas.',
}
const dbError = (e) => Object.entries(DB_ERRORS).find(([k]) => e.message.includes(k))?.[1] ?? e.message
// Latest birth date allowed today, as yyyy-mm-dd for <input type="date" max>.
const maxBirthDate = () => { const d = new Date(); d.setFullYear(d.getFullYear() - MIN_AGE); return d.toISOString().slice(0, 10) }

export function Profile({ me, setMe, complete, hasLocation, setHasLocation, matches, openFilters, toast, plan, openPremium, openSheet }) {
  const [editing, setEditing] = useState(false)
  const [privacy, setPrivacy] = useState(false)
  const [likes, setLikes] = useState(null)
  const [legal, setLegal] = useState(null)
  const [admin, setAdmin] = useState(false)
  const [username, setUsername] = useState(null)
  const [renaming, setRenaming] = useState(false)
  const [verifyingEmail, setVerifyingEmail] = useState(false)
  const [likedOpen, setLikedOpen] = useState(false)
  const [list, setList] = useState(null) // 'likers' | 'matches' from the stats
  const [myEmail, setMyEmail] = useState(undefined)
  useEffect(() => { supabase.rpc('my_email').then(({ data }) => setMyEmail(data?.[0] ?? null)) }, [])
  useEffect(() => { supabase.auth.getSession().then(({ data }) => setUsername(data.session?.user.email?.split('@')[0] ?? null)) }, [])

  useEffect(() => {
    supabase.rpc('my_stats').then(({ data }) => setLikes(data?.[0]?.likes_received ?? null))
  }, [])

  if (editing) return (
    <div className="standard-page profile-page">
      <div className="page-heading">
        <div><span className="kicker">O MEU ESPAÇO</span><div className="page-title">Editar perfil</div></div>
        <button className="filter-trigger" onClick={() => setEditing(false)}><Icon name="close" size={18} /><span>Cancelar</span></button>
      </div>
      <ProfileForm uid={me.id} onSaved={(p) => { setMe(p); setEditing(false); toast('Perfil guardado') }} />
    </div>
  )

  return (
    <div className="standard-page profile-page">
      <div className="page-heading">
        <div><span className="kicker">O MEU ESPAÇO</span><div className="page-title">Perfil e definições</div></div>
        <button className="filter-trigger" onClick={() => setEditing(true)}><Icon name="edit" size={18} /><span>Editar perfil</span></button>
      </div>
      <div className="profile-layout">
        <section className="profile-preview">
          <div className="cover-photo">
            <Avatar p={me} />
            <button aria-label="Editar fotos" onClick={() => setEditing(true)}><Icon name="edit" size={17} /></button>
            <span>{complete}% completo</span>
          </div>
          <div className="preview-content">
            <div className="name-line dark"><span>{me.name}, {me.age}</span><Badges p={{ ...me, plus: plan.premium }} /></div>
            {username && <span className="username-tag">@{username}</span>}
            <p>{[me.university, me.height_cm && `${me.height_cm} cm`].filter(Boolean).join(' · ') || 'Adiciona a tua universidade e altura'}</p>
            {me.interests.length > 0 && <div className="tags dark-tags">{me.interests.map((t) => <span key={t}>{t}</span>)}</div>}
            {me.bio && <blockquote>“{me.bio}”</blockquote>}
          </div>
        </section>
        <section className="settings-column stagger">
          <div className="profile-stats">
            <button onClick={() => (plan.premium ? setList('likers') : openPremium())} aria-label="Ver quem gostou de ti">
              <strong>{likes ?? '–'}</strong><span>Gostos{!plan.premium && ' 🔒'}</span>
            </button>
            <button onClick={() => setList('matches')} aria-label="Ver os teus matches"><strong>{matches?.length ?? 0}</strong><span>Matches</span></button>
            <div><strong>{complete}%</strong><span>Completo</span></div>
          </div>
          <button className={`premium-row ${plan.premium ? 'on' : ''}`} onClick={openPremium}>
            <i><Icon name="brand" size={22} filled /></i>
            <div>
              <strong>faísca<b>+</b></strong>
              <span>{plan.premium ? `Ativo até ${new Date(plan.until).toLocaleDateString('pt-PT')}` : 'Vê quem gostou de ti, likes ilimitados e mais'}</span>
            </div>
            <Icon name="chevron" />
          </button>
          <div className="settings-card">
            <span className="settings-label">CONTA</span>
            <button onClick={() => setEditing(true)}>
              <i className="coral"><Icon name="user" /></i>
              <div><strong>Informações pessoais</strong><span>Nome, idade, universidade, fotos e bio</span></div>
              <Icon name="chevron" />
            </button>
            <button onClick={() => (plan.premium ? setLikedOpen(true) : openPremium())}>
              <i className="coral"><Icon name="heart" /></i>
              <div><strong>Pessoas de quem gostaste</strong><span>{plan.premium ? 'Os teus likes e Super Likes' : 'Exclusivo faísca+'}</span></div>
              {plan.premium ? <Icon name="chevron" /> : <Icon name="lock" size={18} />}
            </button>
            <button onClick={openFilters}>
              <i className="purple"><Icon name="sliders" /></i>
              <div><strong>Preferências de descoberta</strong><span>Idade, distância e altura</span></div>
              <Icon name="chevron" />
            </button>
            <button onClick={() => setPrivacy(!privacy)} aria-expanded={privacy}>
              <i className="mint"><Icon name="shield" /></i>
              <div><strong>Privacidade e segurança</strong><span>Localização e pessoas bloqueadas</span></div>
              <Icon name="chevron" />
            </button>
            {privacy && <PrivacyPanel uid={me.id} hasLocation={hasLocation} setHasLocation={setHasLocation} toast={toast} />}
            <button onClick={() => setRenaming(true)}>
              <i className="mint"><Icon name="user" /></i>
              <div><strong>Username</strong><span>{username ? `@${username} · usado para entrar` : '…'}</span></div>
              <Icon name="chevron" />
            </button>
            <button onClick={() => setVerifyingEmail(true)}>
              <i className="mint"><Icon name="mail" /></i>
              <div><strong>Email</strong><span>{myEmail === undefined ? '…' : myEmail
                ? `${myEmail.email} · verificado${myEmail.university ? ' · universidade' : ''}`
                : 'Ganha o selo de verificado e recupera a password'}</span></div>
              {myEmail ? <Badges p={{ verified: true }} /> : <Icon name="chevron" />}
            </button>
            <NotificationsRow toast={toast} />
            {plan.isAdmin && (
              <button onClick={() => setAdmin(true)}>
                <i className="purple"><Icon name="shield" /></i>
                <div><strong>Administração</strong><span>faísca+, denúncias e notificações</span></div>
                <Icon name="chevron" />
              </button>
            )}
          </div>
          <button className="logout-button" onClick={async () => { await disablePush().catch(() => {}); supabase.auth.signOut() }}>
            <Icon name="logout" size={19} /> Terminar sessão
          </button>
          <div className="legal-links">
            <button className="link" onClick={() => setLegal('privacy')}>Política de Privacidade</button>
            <button className="link" onClick={() => setLegal('terms')}>Termos</button>
            <DeleteAccount me={me} toast={toast} />
          </div>
        </section>
        {legal && <LegalModal doc={legal} onClose={() => setLegal(null)} />}
        {admin && <AdminPanel onClose={() => setAdmin(false)} toast={toast} />}
        {likedOpen && <PeopleModal kicker="LIKES" title="Gostaste de" load={loadMyLikes} empty="Ainda não deste like a ninguém."
          onClose={() => setLikedOpen(false)} openSheet={openSheet} />}
        {list === 'likers' && <PeopleModal kicker="GOSTOS" title="Gostam de ti" load={loadLikers} empty="Ainda ninguém gostou de ti."
          onClose={() => setList(null)} openSheet={openSheet} />}
        {list === 'matches' && <PeopleModal kicker="MATCHES" title="Os teus matches" empty="Ainda não tens matches."
          load={async () => (matches ?? []).map((m) => ({ ...m, matched: true }))} onClose={() => setList(null)} openSheet={openSheet} />}
        {verifyingEmail && <EmailModal current={myEmail} onClose={() => setVerifyingEmail(false)} toast={toast}
          onVerified={(e) => { setMyEmail(e); supabase.auth.refreshSession() /* re-reads my badges in App */ }} />}
        {renaming && <UsernameModal current={username} onClose={() => setRenaming(false)} onChanged={setUsername} toast={toast} />}
      </div>
    </div>
  )
}

function PrivacyPanel({ uid, hasLocation, setHasLocation, toast }) {
  const [busy, setBusy] = useState(false)
  const share = () => {
    if (!navigator.geolocation) return toast('Este browser não dá acesso à localização.')
    setBusy(true)
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      // The database rounds to ~1 km and allows a change every 6 hours (supabase/launch.sql).
      const { error } = await supabase.from('locations').upsert({ id: uid, lat: coords.latitude, lng: coords.longitude })
      setBusy(false)
      if (error) return toast(dbError(error))
      setHasLocation(true); toast('Localização atualizada')
    }, (e) => { setBusy(false); toast(`Localização bloqueada: ${e.message}`) })
  }
  const remove = async () => {
    const { error } = await supabase.from('locations').update({ lat: null, lng: null }).eq('id', uid)
    if (error) return toast(dbError(error))
    setHasLocation(false); toast('Localização removida')
  }
  return (
    <div className="privacy-panel">
      <p>{hasLocation
        ? 'A tua localização é guardada arredondada (~1 km). Os outros só veem uma distância aproximada, como “a menos de 10 km”, nunca a tua posição. Podes mudá-la de 6 em 6 horas.'
        : 'Sem localização, não aparece a distância e o filtro de distância não se aplica a ti.'}</p>
      <div className="choice-row">
        <button className="selected" onClick={share} disabled={busy}>{busy ? 'A obter…' : hasLocation ? 'Atualizar localização' : 'Partilhar localização'}</button>
        {hasLocation && <button onClick={remove}>Remover</button>}
      </div>
      <BlockedList toast={toast} />
    </div>
  )
}

// People you blocked or reported. Unblocking a match brings the match back (supabase/moderation.sql).
function BlockedList({ toast }) {
  const [list, setList] = useState(null)
  useEffect(() => {
    supabase.from('blocks').select('blocked, reason').order('created_at', { ascending: false }).then(async ({ data }) => {
      const ids = (data ?? []).map((b) => b.blocked)
      const { data: p } = ids.length ? await supabase.from('profiles').select('id, name').in('id', ids) : { data: [] }
      setList((data ?? []).map((b) => ({ ...b, name: p?.find((x) => x.id === b.blocked)?.name ?? '…' })))
    })
  }, [])
  const unblock = async (b) => {
    if (!confirm(`Desbloquear ${b.name}?${b.reason ? ' A tua denúncia vai ser retirada.' : ''}`)) return
    const { data, error } = await supabase.rpc('unblock', { p_other: b.blocked })
    if (error) return toast(error.message)
    setList((xs) => xs.filter((x) => x.blocked !== b.blocked))
    toast(data ? `${b.name} desbloqueado. O vosso match voltou.` : `${b.name} desbloqueado`)
  }
  if (!list) return null
  return <>
    <span className="settings-label">PESSOAS BLOQUEADAS</span>
    {list.length === 0 && <p>Não bloqueaste ninguém.</p>}
    <div className="admin-list">
      {list.map((b) => (
        <div key={b.blocked}>
          <div><strong>{b.name}</strong><span>{b.reason ? 'Denunciado' : 'Bloqueado'}</span></div>
          <button className="link" onClick={() => unblock(b)}>Desbloquear</button>
        </div>
      ))}
    </div>
  </>
}

export function PreferencesModal({ me, onClose, onSaved }) {
  const [p, setP] = useState({
    looking_for: me.looking_for, max_distance_km: me.max_distance_km ?? 50,
    pref_age_min: me.pref_age_min ?? MIN_AGE, pref_age_max: me.pref_age_max ?? 99,
    pref_height_min: me.pref_height_min ?? '', pref_height_max: me.pref_height_max ?? '',
  })
  const [err, setErr] = useState('')
  const num = (k) => (e) => setP({ ...p, [k]: e.target.value === '' ? '' : Number(e.target.value) })

  const save = async (close) => {
    if (p.pref_height_min !== '' && p.pref_height_max !== '' && p.pref_height_min > p.pref_height_max)
      return setErr('Altura: o mínimo tem de ser menor que o máximo.')
    const row = { ...p, pref_height_min: p.pref_height_min === '' ? null : p.pref_height_min,
      pref_height_max: p.pref_height_max === '' ? null : p.pref_height_max }
    const { data, error } = await supabase.from('profiles').update(row).eq('id', me.id).select().single()
    if (error) return setErr(dbError(error))
    onSaved(data); close()
  }

  return (
    <Modal className="filter-modal" onClose={onClose}>
      {(close) => <>
        <div className="modal-heading">
          <div><span className="kicker">DESCOBERTA</span><div className="modal-title">Preferências</div></div>
          <button className="icon-button" onClick={close} aria-label="Fechar"><Icon name="close" /></button>
        </div>
        <label>Mostrar-me</label>
        <div className="choice-row">
          {LOOKING.map(([v, l]) => (
            <button key={v} className={p.looking_for === v ? 'selected' : ''} onClick={() => setP({ ...p, looking_for: v })}>{l}</button>
          ))}
        </div>
        <label>Distância máxima <strong>{p.max_distance_km} km</strong></label>
        <div className="choice-row distance-row">
          {DISTANCES.map((d) => (
            <button key={d} className={p.max_distance_km === d ? 'selected' : ''} onClick={() => setP({ ...p, max_distance_km: d })}>{d}</button>
          ))}
        </div>
        <label>Intervalo de idades <strong>{p.pref_age_min} – {p.pref_age_max}</strong></label>
        <div className="dual-range">
          <input type="range" min={MIN_AGE} max="99" value={p.pref_age_min} aria-label="Idade mínima"
            onChange={(e) => setP({ ...p, pref_age_min: Math.min(Number(e.target.value), p.pref_age_max) })} />
          <input type="range" min={MIN_AGE} max="99" value={p.pref_age_max} aria-label="Idade máxima"
            onChange={(e) => setP({ ...p, pref_age_max: Math.max(Number(e.target.value), p.pref_age_min) })} />
        </div>
        <label>Altura preferida <strong>opcional</strong></label>
        <div className="height-row">
          <input type="number" min="120" max="230" placeholder="mín. cm" value={p.pref_height_min} onChange={num('pref_height_min')} />
          <span>–</span>
          <input type="number" min="120" max="230" placeholder="máx. cm" value={p.pref_height_max} onChange={num('pref_height_max')} />
        </div>
        {err && <p className="form-error">{err}</p>}
        <button className="primary-button" onClick={() => save(close)}>Aplicar preferências</button>
      </>}
    </Modal>
  )
}

const HEIGHT_FIELDS = ['height_cm']
// Inputs need '' instead of null to stay controlled.
const blankNulls = (row, keys) => Object.fromEntries(keys.map((k) => [k, row[k] ?? '']))

export function ProfileForm({ uid, onSaved }) {
  const [f, setF] = useState({ name: '', birth_date: '', gender: 'man', looking_for: 'women', bio: '', university: '', photos: [], interests: '', height_cm: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const saved = useRef([])
  const [locked, setLocked] = useState(false) // birth date can be set once (profile_guard)
  useEffect(() => {
    supabase.from('profiles').select('*').eq('id', uid).maybeSingle().then(({ data }) => {
      if (!data) return
      saved.current = data.photos
      setF({ ...data, university: data.university ?? '', interests: data.interests.join(', '), ...blankNulls(data, [...HEIGHT_FIELDS, 'birth_date']) })
      setLocked(!!data.birth_date)
    })
  }, [uid])
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const save = async (e) => {
    e.preventDefault()
    if (!f.photos.length) return setErr('Adiciona pelo menos uma foto.')
    setBusy(true)
    const row = {
      id: uid, name: f.name.trim(), birth_date: f.birth_date, gender: f.gender, looking_for: f.looking_for,
      bio: f.bio, university: f.university.trim() || null, photos: f.photos,
      height_cm: f.height_cm === '' ? null : Number(f.height_cm),
      interests: [...new Set(f.interests.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))],
    }
    const { data, error } = await supabase.from('profiles').upsert(row).select().single()
    setBusy(false)
    if (error) return setErr(dbError(error))
    // Delete removed photos only after the profile stops pointing at them.
    const removed = saved.current.filter((u) => !data.photos.includes(u))
    const old = removed.map(storagePath).filter(Boolean) // photos from before the move to Azure
    if (old.length) supabase.storage.from('photos').remove(old)
    const azure = removed.map(azurePath).filter(Boolean)
    if (azure.length) photosApi({ remove: azure }).catch(() => {})
    onSaved(data)
  }

  return (
    <form className="profile-form" onSubmit={save}>
      <PhotoGrid photos={f.photos} onChange={(next) => setF((x) => ({ ...x, photos: next(x.photos) }))} onError={setErr} />
      <div className="form-grid">
        <label className="field"><span>Nome</span><input value={f.name} onChange={set('name')} required maxLength={40} /></label>
        <label className="field"><span>Data de nascimento</span>
          <input type="date" value={f.birth_date} onChange={set('birth_date')} required disabled={locked} max={maxBirthDate()} min="1920-01-01" />
        </label>
        <UniversityField value={f.university} onChange={(university) => setF((x) => ({ ...x, university }))} required />
        <label className="field"><span>Altura (cm)</span><input type="number" min="120" max="230" value={f.height_cm} onChange={set('height_cm')} placeholder="opcional" /></label>
      </div>
      <span className="field-label">Sou</span>
      <div className="choice-row">
        {GENDERS.map(([v, l]) => (
          <button type="button" key={v} className={f.gender === v ? 'selected' : ''} onClick={() => setF({ ...f, gender: v })}>{l}</button>
        ))}
      </div>
      <span className="field-label">Mostrar-me</span>
      <div className="choice-row">
        {LOOKING.map(([v, l]) => (
          <button type="button" key={v} className={f.looking_for === v ? 'selected' : ''} onClick={() => setF({ ...f, looking_for: v })}>{l}</button>
        ))}
      </div>
      <label className="field"><span>Bio</span><textarea value={f.bio} onChange={set('bio')} maxLength={500} placeholder="Conta algo sobre ti" /></label>
      <label className="field"><span>Interesses</span>
        <input value={f.interests} onChange={set('interests')} placeholder="separados por vírgulas: surf, concertos, café" />
      </label>
      {err && <p className="form-error">{err}</p>}
      <button className="primary-button" disabled={busy}>{busy ? 'A guardar…' : 'Guardar perfil'}</button>
    </form>
  )
}

const MAX_PHOTOS = 6

// Downscale + WebP in the browser: keeps storage and egress (Supabase free tier) small.
async function compress(file, max = 960) {
  const img = await createImageBitmap(file)
  const k = Math.min(1, max / Math.max(img.width, img.height))
  const canvas = Object.assign(document.createElement('canvas'), { width: img.width * k, height: img.height * k })
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
  const encode = (type) => new Promise((ok) => canvas.toBlob(ok, type, 0.75))
  const webp = await encode('image/webp')
  return webp?.type === 'image/webp' ? webp : encode('image/jpeg') // browsers without WebP encoding return PNG
}

const storagePath = (url) => url.split('/object/public/photos/')[1]
const azurePath = (url) => url.split('.blob.core.windows.net/photos/')[1]

// Photos live in Azure Blob Storage; /api/photos (Vercel function) checks the Supabase session, size and type.
async function photosApi(body) {
  const { data } = await supabase.auth.getSession()
  const raw = body instanceof Blob
  const r = await fetch('/api/photos', {
    method: 'POST', body: raw ? body : JSON.stringify(body),
    headers: { 'Content-Type': raw ? 'application/octet-stream' : 'application/json', Authorization: `Bearer ${data.session?.access_token}` },
  })
  const json = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(json.error ?? `erro ${r.status}`)
  return json
}

function PhotoGrid({ photos, onChange, onError }) {
  const [busy, setBusy] = useState(0)
  const input = useRef(null)

  const add = async (files) => {
    const picked = [...files].slice(0, MAX_PHOTOS - photos.length)
    setBusy(picked.length)
    const urls = []
    for (const file of picked) {
      try {
        // shortcut: photos uploaded but never saved stay in storage, add a cleanup job if it matters
        urls.push((await photosApi(await compress(file))).url)
      } catch (e) {
        onError(`Não foi possível carregar ${file.name}: ${e.message}`)
      }
      setBusy((n) => n - 1)
    }
    onChange((cur) => [...cur, ...urls].slice(0, MAX_PHOTOS))
  }

  const remove = (url) => onChange((cur) => cur.filter((p) => p !== url))
  const makeMain = (url) => onChange((cur) => [url, ...cur.filter((p) => p !== url)])

  return (
    <div>
      <div className="photo-grid">
        {Array.from({ length: MAX_PHOTOS }, (_, i) => {
          const url = photos[i]
          if (url) return (
            <div key={url} className="slot filled">
              <img src={url} alt={`Foto ${i + 1}`} onClick={() => i && makeMain(url)} />
              {i === 0 && <span className="main-badge">Principal</span>}
              <button type="button" className="remove" onClick={() => remove(url)} aria-label="Remover foto">×</button>
            </div>
          )
          return (
            <button type="button" key={i} className="slot empty" disabled={busy > 0}
              onClick={() => input.current.click()} aria-label="Adicionar foto">
              {i < photos.length + busy ? <span className="spinner" aria-label="A carregar" /> : <Icon name="plus" />}
            </button>
          )
        })}
      </div>
      <p className="hint">Até {MAX_PHOTOS} fotos. Toca numa foto para a tornar principal.</p>
      <input ref={input} type="file" accept="image/*" multiple hidden
        onChange={(e) => { add(e.target.files); e.target.value = '' }} />
    </div>
  )
}

// GDPR art. 17: photos first (they live outside the database), then the account; everything else cascades.
function DeleteAccount({ me, toast }) {
  const [busy, setBusy] = useState(false)
  const run = async () => {
    if (!confirm('Apagar a tua conta? Perfil, fotos, matches e mensagens são apagados para sempre.')) return
    if (prompt('Para confirmar, escreve APAGAR') !== 'APAGAR') return
    setBusy(true)
    try {
      await photosApi({ removeAll: true })
      const { data: old } = await supabase.storage.from('photos').list(me.id)
      if (old?.length) await supabase.storage.from('photos').remove(old.map((o) => `${me.id}/${o.name}`))
      const { error } = await supabase.rpc('delete_me')
      if (error) throw error
      await supabase.auth.signOut()
    } catch (e) {
      setBusy(false)
      toast(`Não foi possível apagar a conta: ${e.message}`)
    }
  }
  return <button className="link danger" onClick={run} disabled={busy}>{busy ? 'A apagar…' : 'Apagar conta'}</button>
}

// Picker from the list, or free text after choosing "Outra".
export function UniversityField({ value, onChange, required }) {
  const [other, setOther] = useState(() => !!value && !isListed(value))
  return (
    <label className="field university-field"><span>Universidade</span>
      <select value={other ? OTHER : value} required={required}
        onChange={(e) => { const v = e.target.value; setOther(v === OTHER); onChange(v === OTHER ? '' : v) }}>
        <option value="">Escolhe…</option>
        {UNIVERSITIES.map(([group, list]) => (
          <optgroup key={group} label={group}>{list.map((u) => <option key={u}>{u}</option>)}</optgroup>
        ))}
        <option value={OTHER}>Outra…</option>
      </select>
      {other && <input value={value} onChange={(e) => onChange(e.target.value)} maxLength={80} placeholder="Nome da universidade" required={required} autoFocus />}
    </label>
  )
}

const USERNAME_ERRORS = {
  username_invalid: 'Usa 3 a 20 letras, números, _ ou .',
  username_taken: 'Esse username já existe.',
  username_recent: 'Só podes mudar o username uma vez por semana.',
}

// change_username() in supabase/username.sql; the login email follows the username.
// A real email next to the username login: password reset and the blue verified badge.
// api/email.js sends the code; confirm_email (supabase/email.sql) checks it.
const EMAIL_ERRORS = {
  email_taken: 'Este email já está associado a outra conta.',
  too_soon: 'Espera um minuto antes de pedir outro código.',
  too_many: 'Pediste demasiados códigos. Tenta daqui a uma hora.',
  invalid_email: 'Esse email não parece válido.',
  send_failed: 'Não foi possível enviar o email. Tenta mais tarde.',
}

function EmailModal({ current, onClose, onVerified, toast }) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const uni = isUniversityEmail(email)
  return (
    <Modal className="filter-modal" onClose={onClose}>
      {(close) => (
        <form className="username-form" onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true); setErr('')
          if (!sent) {
            const { data: { session } } = await supabase.auth.getSession()
            const r = await fetch('/api/email', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
              body: JSON.stringify({ action: 'verify', email }) }).then((x) => x.json()).catch(() => ({ error: 'send_failed' }))
            setBusy(false)
            if (r.error) return setErr(Object.entries(EMAIL_ERRORS).find(([k]) => r.error.includes(k))?.[1] ?? r.error)
            return setSent(true)
          }
          const { data, error } = await supabase.rpc('confirm_email', { p_code: code })
          setBusy(false)
          if (error || !data) return setErr('Código errado ou expirado.')
          onVerified({ email: email.trim().toLowerCase(), university: uni })
          toast('Email verificado. Ganhaste o selo de verificado!')
          close()
        }}>
          <div className="modal-heading">
            <div><span className="kicker">CONTA</span><div className="modal-title">{current ? 'Mudar email' : 'Verificar email'}</div></div>
            <button type="button" className="icon-button" onClick={close} aria-label="Fechar"><Icon name="close" /></button>
          </div>
          {sent ? (
            <label className="field"><span>Código enviado para {email.trim()}</span>
              <input value={code} onChange={(e) => { setCode(e.target.value); setErr('') }} required autoFocus
                inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="123456" />
            </label>
          ) : (
            <label className="field"><span>Email</span>
              <input value={email} onChange={(e) => { setEmail(e.target.value); setErr('') }} required autoFocus
                type="email" autoComplete="email" autoCapitalize="none" placeholder="o.teu.email@up.pt" />
            </label>
          )}
          <p className="hint">{sent
            ? <>Não chegou? Vê o spam ou <button type="button" className="link" onClick={() => { setSent(false); setCode('') }}>muda o email ou reenvia</button>.</>
            : 'Ao confirmar, ganhas o selo azul de verificado e podes recuperar a password. Ninguém vê o teu email.'}</p>
          {err && <p className="form-error">{err}</p>}
          <button className="primary-button" disabled={busy}>{busy ? 'Aguarda…' : sent ? 'Confirmar código' : 'Enviar código'}</button>
        </form>
      )}
    </Modal>
  )
}

// My likes, newest first (my own swipes are readable, supabase/schema.sql). Tap opens the profile.
// A list of people (my likes, who liked me, my matches); tap opens the profile.
function PeopleModal({ kicker, title, load, empty, onClose, openSheet }) {
  const [rows, setRows] = useState(null)
  useEffect(() => { load().then(setRows) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal className="filter-modal" onClose={onClose}>
      {(close) => <>
        <div className="modal-heading">
          <div><span className="kicker">{kicker}</span><div className="modal-title">{title}</div></div>
          <button className="icon-button" onClick={close} aria-label="Fechar"><Icon name="close" /></button>
        </div>
        {rows === null && <p className="empty-note">A carregar…</p>}
        {rows?.length === 0 && <p className="empty-note">{empty}</p>}
        <div className="admin-list liked-list">
          {rows?.map((p) => (
            <button key={p.id} onClick={() => { close(); openSheet(p) }}>
              <i className="avatar-wrap"><Avatar p={p} /></i>
              <div><strong>{p.name}, {p.age}<Badges p={p} size={14} /></strong>
                {(p.matched || p.super) && <span>{[p.matched && 'Match', p.super && 'Super Like'].filter(Boolean).join(' · ')}</span>}</div>
              {(p.liked_at ?? p.matched_at) && <time>{shortDate(p.liked_at ?? p.matched_at)}</time>}
            </button>
          ))}
        </div>
      </>}
    </Modal>
  )
}

function UsernameModal({ current, onClose, onChanged, toast }) {
  const [value, setValue] = useState(current ?? '')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Modal className="filter-modal" onClose={onClose}>
      {(close) => (
        <form className="username-form" onSubmit={async (e) => {
          e.preventDefault()
          const next = value.trim().toLowerCase()
          if (next === current) return close()
          setBusy(true)
          const { data, error } = await supabase.rpc('change_username', { p_new: next })
          if (error) { setBusy(false); return setErr(Object.entries(USERNAME_ERRORS).find(([k]) => error.message.includes(k))?.[1] ?? error.message) }
          await supabase.auth.refreshSession() // new email in the session
          onChanged(data); toast(`Username alterado para @${data}`); close()
        }}>
          <div className="modal-heading">
            <div><span className="kicker">CONTA</span><div className="modal-title">Mudar username</div></div>
            <button type="button" className="icon-button" onClick={close} aria-label="Fechar"><Icon name="close" /></button>
          </div>
          <label className="field"><span>Novo username</span>
            <input value={value} onChange={(e) => { setValue(e.target.value); setErr('') }} required autoFocus
              pattern="[A-Za-z0-9_.]{3,20}" title="3–20 letras, números, _ ou ." autoCapitalize="none" autoComplete="username" />
          </label>
          <p className="hint">Passas a entrar com o novo username (a password fica igual). Só os teus matches o veem. Podes mudá-lo uma vez por semana.</p>
          {err && <p className="form-error">{err}</p>}
          <button className="primary-button" disabled={busy}>{busy ? 'A guardar…' : 'Guardar'}</button>
        </form>
      )}
    </Modal>
  )
}
