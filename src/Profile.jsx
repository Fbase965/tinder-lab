import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { Icon } from './icons'
import { Avatar } from './App'

const GENDERS = [['man', 'Homem'], ['woman', 'Mulher'], ['other', 'Outro']]
const LOOKING = [['women', 'Mulheres'], ['men', 'Homens'], ['everyone', 'Todos']]

export function Profile({ me, setMe, complete, hasLocation, setHasLocation, matchesCount, openFilters, toast }) {
  const [editing, setEditing] = useState(false)
  const [privacy, setPrivacy] = useState(false)
  const [likes, setLikes] = useState(null)

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
            <div className="name-line dark"><span>{me.name}, {me.age}</span></div>
            <p>{[me.job, me.height_cm && `${me.height_cm} cm`].filter(Boolean).join(' · ') || 'Adiciona a tua profissão e altura'}</p>
            {me.interests.length > 0 && <div className="tags dark-tags">{me.interests.map((t) => <span key={t}>{t}</span>)}</div>}
            {me.bio && <blockquote>“{me.bio}”</blockquote>}
          </div>
        </section>
        <section className="settings-column">
          <div className="profile-stats">
            <div><strong>{likes ?? '–'}</strong><span>Gostos</span></div>
            <div><strong>{matchesCount}</strong><span>Matches</span></div>
            <div><strong>{complete}%</strong><span>Completo</span></div>
          </div>
          <div className="settings-card">
            <span className="settings-label">CONTA</span>
            <button onClick={() => setEditing(true)}>
              <i className="coral"><Icon name="user" /></i>
              <div><strong>Informações pessoais</strong><span>Nome, idade, profissão, fotos e bio</span></div>
              <Icon name="chevron" />
            </button>
            <button onClick={openFilters}>
              <i className="purple"><Icon name="sliders" /></i>
              <div><strong>Preferências de descoberta</strong><span>Idade, distância e altura</span></div>
              <Icon name="chevron" />
            </button>
            <button onClick={() => setPrivacy(!privacy)} aria-expanded={privacy}>
              <i className="mint"><Icon name="shield" /></i>
              <div><strong>Privacidade e segurança</strong><span>Localização e visibilidade</span></div>
              <Icon name="chevron" />
            </button>
            {privacy && <PrivacyPanel uid={me.id} hasLocation={hasLocation} setHasLocation={setHasLocation} toast={toast} />}
          </div>
          <button className="logout-button" onClick={() => supabase.auth.signOut()}>
            <Icon name="logout" size={19} /> Terminar sessão
          </button>
        </section>
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
      // ~1 km precision is plenty for "a X km" and keeps exact homes private.
      const round = (n) => Math.round(n * 100) / 100
      const { error } = await supabase.from('locations')
        .upsert({ id: uid, lat: round(coords.latitude), lng: round(coords.longitude), updated_at: new Date().toISOString() })
      setBusy(false)
      if (error) return toast(error.message)
      setHasLocation(true); toast('Localização atualizada')
    }, (e) => { setBusy(false); toast(`Localização bloqueada: ${e.message}`) })
  }
  const remove = async () => {
    const { error } = await supabase.from('locations').delete().eq('id', uid)
    if (error) return toast(error.message)
    setHasLocation(false); toast('Localização removida')
  }
  return (
    <div className="privacy-panel">
      <p>{hasLocation
        ? 'A tua localização está guardada com cerca de 1 km de precisão. Os outros só veem a distância, nunca a tua posição.'
        : 'Sem localização, não aparece a distância e o filtro de distância não se aplica a ti.'}</p>
      <div className="choice-row">
        <button className="selected" onClick={share} disabled={busy}>{busy ? 'A obter…' : hasLocation ? 'Atualizar localização' : 'Partilhar localização'}</button>
        {hasLocation && <button onClick={remove}>Remover</button>}
      </div>
    </div>
  )
}

export function PreferencesModal({ me, onClose, onSaved }) {
  const [p, setP] = useState({
    looking_for: me.looking_for, max_distance_km: me.max_distance_km ?? 50,
    pref_age_min: me.pref_age_min ?? 18, pref_age_max: me.pref_age_max ?? 99,
    pref_height_min: me.pref_height_min ?? '', pref_height_max: me.pref_height_max ?? '',
  })
  const [err, setErr] = useState('')
  const num = (k) => (e) => setP({ ...p, [k]: e.target.value === '' ? '' : Number(e.target.value) })

  const save = async () => {
    if (p.pref_height_min !== '' && p.pref_height_max !== '' && p.pref_height_min > p.pref_height_max)
      return setErr('Altura: o mínimo tem de ser menor que o máximo.')
    const row = { ...p, pref_height_min: p.pref_height_min === '' ? null : p.pref_height_min,
      pref_height_max: p.pref_height_max === '' ? null : p.pref_height_max }
    const { data, error } = await supabase.from('profiles').update(row).eq('id', me.id).select().single()
    error ? setErr(error.message) : onSaved(data)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="filter-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-heading">
          <div><span className="kicker">DESCOBERTA</span><div className="modal-title">Preferências</div></div>
          <button className="icon-button" onClick={onClose} aria-label="Fechar"><Icon name="close" /></button>
        </div>
        <label>Mostrar-me</label>
        <div className="choice-row">
          {LOOKING.map(([v, l]) => (
            <button key={v} className={p.looking_for === v ? 'selected' : ''} onClick={() => setP({ ...p, looking_for: v })}>{l}</button>
          ))}
        </div>
        <label>Distância máxima <strong>{p.max_distance_km} km</strong></label>
        <input type="range" min="1" max="200" value={p.max_distance_km} onChange={num('max_distance_km')} />
        <label>Intervalo de idades <strong>{p.pref_age_min} – {p.pref_age_max}</strong></label>
        <div className="dual-range">
          <input type="range" min="18" max="99" value={p.pref_age_min} aria-label="Idade mínima"
            onChange={(e) => setP({ ...p, pref_age_min: Math.min(Number(e.target.value), p.pref_age_max) })} />
          <input type="range" min="18" max="99" value={p.pref_age_max} aria-label="Idade máxima"
            onChange={(e) => setP({ ...p, pref_age_max: Math.max(Number(e.target.value), p.pref_age_min) })} />
        </div>
        <label>Altura preferida <strong>opcional</strong></label>
        <div className="height-row">
          <input type="number" min="120" max="230" placeholder="mín. cm" value={p.pref_height_min} onChange={num('pref_height_min')} />
          <span>–</span>
          <input type="number" min="120" max="230" placeholder="máx. cm" value={p.pref_height_max} onChange={num('pref_height_max')} />
        </div>
        {err && <p className="form-error">{err}</p>}
        <button className="primary-button" onClick={save}>Aplicar preferências</button>
      </div>
    </div>
  )
}

const HEIGHT_FIELDS = ['height_cm']
// Inputs need '' instead of null to stay controlled.
const blankNulls = (row, keys) => Object.fromEntries(keys.map((k) => [k, row[k] ?? '']))

export function ProfileForm({ uid, onSaved }) {
  const [f, setF] = useState({ name: '', age: 25, gender: 'man', looking_for: 'women', bio: '', job: '', photos: [], interests: '', height_cm: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const saved = useRef([])
  useEffect(() => {
    supabase.from('profiles').select('*').eq('id', uid).maybeSingle().then(({ data }) => {
      if (!data) return
      saved.current = data.photos
      setF({ ...data, job: data.job ?? '', interests: data.interests.join(', '), ...blankNulls(data, HEIGHT_FIELDS) })
    })
  }, [uid])
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const save = async (e) => {
    e.preventDefault()
    if (!f.photos.length) return setErr('Adiciona pelo menos uma foto.')
    setBusy(true)
    const row = {
      id: uid, name: f.name.trim(), age: Number(f.age), gender: f.gender, looking_for: f.looking_for,
      bio: f.bio, job: f.job.trim(), photos: f.photos,
      height_cm: f.height_cm === '' ? null : Number(f.height_cm),
      interests: [...new Set(f.interests.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))],
    }
    const { data, error } = await supabase.from('profiles').upsert(row).select().single()
    setBusy(false)
    if (error) return setErr(error.message)
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
      <PhotoGrid photos={f.photos} onChange={(photos) => setF((x) => ({ ...x, photos }))} onError={setErr} />
      <div className="form-grid">
        <label className="field"><span>Nome</span><input value={f.name} onChange={set('name')} required maxLength={40} /></label>
        <label className="field"><span>Idade</span><input type="number" min="18" max="99" value={f.age} onChange={set('age')} required /></label>
        <label className="field"><span>Profissão</span><input value={f.job} onChange={set('job')} maxLength={60} placeholder="ex: Designer" /></label>
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

// Photos live in Azure Blob Storage; /api/photos (Vercel function) checks the Supabase session.
async function photosApi(body) {
  const { data } = await supabase.auth.getSession()
  const r = await fetch('/api/photos', {
    method: 'POST', body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token}` },
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
        const blob = await compress(file)
        const { uploadUrl, publicUrl } = await photosApi({ ext: blob.type === 'image/webp' ? 'webp' : 'jpg' })
        // file names are unique, so browsers can cache them for a year instead of re-downloading
        const put = await fetch(uploadUrl, {
          method: 'PUT', body: blob,
          headers: { 'x-ms-blob-type': 'BlockBlob', 'x-ms-blob-content-type': blob.type, 'x-ms-blob-cache-control': 'public, max-age=31536000, immutable' },
        })
        if (!put.ok) throw new Error(`upload ${put.status}`)
        urls.push(publicUrl)
      } catch (e) {
        onError(`Não foi possível carregar ${file.name}: ${e.message}`)
      }
      setBusy((n) => n - 1)
    }
    onChange([...photos, ...urls])
  }

  const remove = (url) => onChange(photos.filter((p) => p !== url))
  const makeMain = (url) => onChange([url, ...photos.filter((p) => p !== url)])

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
              {i < photos.length + busy ? '…' : <Icon name="plus" />}
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
