import { useEffect, useRef, useState } from 'react'
import { Icon } from './icons'
import { Avatar } from './App'
import { matchPercent, sharedInterests, WEIGHTS } from './algorithm'

const FLY_MS = 330
const PART_LABELS = {
  interests: 'Interesses', age: 'Idade', desirability: 'Popularidade', likesMe: 'Gostou de ti',
  superLikesMe: 'Super Like', fresh: 'Perfil novo', height: 'Altura', distance: 'Distância',
}

export const distanceText = (km) => (km == null ? null : km < 1 ? 'a menos de 1 km' : `a ${km} km`)

export function Discover({ me, deckApi, swipe, complete, paused, openFilters, openSheet, goProfile }) {
  const { deck, rewind, canRewind, superLeft, reload } = deckApi
  const [drag, setDrag] = useState({ x: 0, y: 0 })
  const [leaving, setLeaving] = useState(null)
  const [photoIdx, setPhotoIdx] = useState(0)
  const [showParts, setShowParts] = useState(false)
  const start = useRef(null)
  const c = deck?.[0], next = deck?.[1]

  const choose = async (kind) => {
    if (!c || leaving) return
    if (kind === 'super' && superLeft <= 0) return swipe(c, kind) // shows the limit toast, card stays
    setLeaving(kind)
    await new Promise((ok) => setTimeout(ok, FLY_MS))
    setLeaving(null); setDrag({ x: 0, y: 0 }); setPhotoIdx(0)
    swipe(c, kind)
  }
  const nextPhoto = (step) => c && setPhotoIdx((i) => Math.min(c.photos.length - 1, Math.max(0, i + step)))

  useEffect(() => {
    const onKey = (e) => {
      if (paused || e.target.closest?.('input, textarea, select')) return
      const act = { ArrowLeft: () => choose('nope'), ArrowRight: () => choose('like'), ArrowUp: () => choose('super'),
        Backspace: rewind, ' ': () => nextPhoto(1) }[e.key]
      if (act) { e.preventDefault(); act() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const onPointerDown = (e) => {
    if (e.target.closest('button')) return
    start.current = { x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e) => start.current && setDrag({ x: e.clientX - start.current.x, y: e.clientY - start.current.y })
  const onPointerUp = (e) => {
    if (!start.current) return
    start.current = null
    const { x, y } = drag
    if (y < -120 && Math.abs(x) < 90) return choose('super')
    if (Math.abs(x) > 90) return choose(x > 0 ? 'like' : 'nope')
    if (Math.abs(x) < 5 && Math.abs(y) < 5) { // tap: left half = previous photo, right half = next
      const r = e.currentTarget.getBoundingClientRect()
      nextPhoto(e.clientX - r.left > r.width / 2 ? 1 : -1)
    }
    setDrag({ x: 0, y: 0 })
  }

  const transform = leaving
    ? { nope: 'translate(-140%, 30px) rotate(-18deg)', like: 'translate(140%, 30px) rotate(18deg)', super: 'translate(0, -130%)' }[leaving]
    : `translate(${drag.x}px, ${Math.min(drag.y, 0) * 0.5}px) rotate(${drag.x * 0.04}deg)`
  const stamp = leaving ?? (drag.y < -60 && Math.abs(drag.x) < 60 ? 'super' : drag.x > 35 ? 'like' : drag.x < -35 ? 'nope' : null)
  const shared = c ? sharedInterests(me, c) : []
  const pct = c ? matchPercent(c.score) : 0

  return (
    <div className="discover-page">
      <div className="page-heading">
        <div>
          <span className="kicker">DESCOBERTA</span>
          <div className="page-title">Perto de ti</div>
        </div>
        <button className="filter-trigger" onClick={openFilters}>
          <Icon name="sliders" size={19} /><span>Preferências</span>
        </button>
      </div>
      <div className="discover-layout">
        <div className="swipe-column">
          <div className="card-stage">
            {!deck && <div className="profile-card empty-card"><p>A procurar pessoas…</p></div>}
            {deck && !c && (
              <div className="profile-card empty-card">
                <Icon name="sparkles" size={34} />
                <strong>Não há mais ninguém por perto</strong>
                <p>Alarga a distância ou as idades nas preferências, ou volta mais tarde.</p>
                <div className="empty-actions">
                  <button className="filter-trigger" onClick={openFilters}>Preferências</button>
                  <button className="filter-trigger" onClick={reload}>Atualizar</button>
                </div>
              </div>
            )}
            {next && <article className="profile-card next-card"><Avatar p={next} /></article>}
            {c && (
              <article key={c.id} className={`profile-card active-card ${start.current ? 'dragging' : ''}`} style={{ transform }}
                onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
                onPointerCancel={() => { start.current = null; setDrag({ x: 0, y: 0 }) }}>
                <Avatar p={c} idx={photoIdx} />
                {c.photos.length > 1 && (
                  <div className="photo-bars">{c.photos.map((u, i) => <span key={u} className={i === photoIdx ? 'on' : ''} />)}</div>
                )}
                <div className="photo-shade" />
                {stamp === 'like' && <div className="swipe-stamp like-stamp">GOSTO</div>}
                {stamp === 'nope' && <div className="swipe-stamp nope-stamp">PASSO</div>}
                {stamp === 'super' && <div className="swipe-stamp super-stamp">SUPER LIKE</div>}
                <div className="card-content">
                  {c.super_likes_me && <div className="super-badge"><Icon name="star" size={13} filled /> Deu-te Super Like</div>}
                  {c.distance_km != null && (
                    <div className="card-location"><Icon name="location" size={14} /> {distanceText(c.distance_km)}</div>
                  )}
                  <div className="name-line"><span>{c.name}, {c.age}</span></div>
                  {(c.job || c.height_cm) && (
                    <div className="job">{[c.job, c.height_cm && `${c.height_cm} cm`].filter(Boolean).join(' · ')}</div>
                  )}
                  <div className="tags">
                    {c.interests.slice(0, 5).map((t) => <span key={t} className={shared.includes(t) ? 'shared' : ''}>{t}</span>)}
                  </div>
                  <button className="info-button" aria-label="Ver detalhes" onClick={() => openSheet(c)}>
                    <Icon name="info" size={25} />
                  </button>
                </div>
              </article>
            )}
          </div>
          <div className="actions">
            <button className="action-button undo" aria-label="Desfazer" onClick={rewind} disabled={!canRewind}>
              <Icon name="undo" />
            </button>
            <button className="action-button dislike" aria-label="Passo" onClick={() => choose('nope')} disabled={!c}>
              <Icon name="close" size={32} />
            </button>
            <button className="action-button like" aria-label="Gosto" onClick={() => choose('like')} disabled={!c}>
              <Icon name="heart" size={30} filled />
            </button>
            <button className="action-button super" aria-label={`Super Like, ${superLeft} restantes`} onClick={() => choose('super')} disabled={!c}>
              <Icon name="star" filled /><b>{superLeft}</b>
            </button>
          </div>
          <p className="keys-hint">← passo · → gosto · ↑ super like · ⌫ desfazer</p>
        </div>
        <aside className="discovery-aside">
          <span className="aside-kicker">MATCH WITH INTENTION</span>
          <div className="aside-title">Pessoas reais.<br />Boas <em>conversas.</em></div>
          <p>Ordenamos os perfis pelo nosso algoritmo de compatibilidade — interesses, idade, altura, distância e quem já gostou de ti.</p>
          {c && (
            <button className="compatibility" onClick={() => setShowParts(!showParts)} aria-expanded={showParts}>
              <div className="match-ring" style={{ '--pct': pct }}><strong>{pct}%</strong><span>match</span></div>
              <div>
                <strong>{pct >= 70 ? 'Alta compatibilidade' : pct >= 45 ? 'Boa compatibilidade' : 'Compatibilidade moderada'}</strong>
                <span>{shared.length ? `${shared.length} ${shared.length === 1 ? 'interesse' : 'interesses'} em comum contigo` : 'Sem interesses em comum'}</span>
                <span className="parts-toggle">{showParts ? 'Esconder' : 'Ver'} detalhe do algoritmo</span>
              </div>
            </button>
          )}
          {c && showParts && (
            <div className="score-parts">
              {Object.entries(c.score.parts).map(([k, v]) => (
                <div key={k}>
                  <span>{PART_LABELS[k] ?? k}</span>
                  <i><b style={{ width: `${v * 100}%` }} /></i>
                  <small>{(v * WEIGHTS[k]).toFixed(1)}/{WEIGHTS[k]}</small>
                </div>
              ))}
            </div>
          )}
          {complete < 100 && (
            <div className="tip-card">
              <Icon name="sparkles" />
              <div>
                <strong>Dica faísca</strong>
                <span>O teu perfil está {complete}% completo. Perfis completos recebem mais matches.</span>
              </div>
              <button onClick={goProfile}>Completar</button>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

// Full profile details, opened from the card's (i) or from Explore.
export function ProfileSheet({ me, p, onClose, onSwipe }) {
  const [idx, setIdx] = useState(0)
  const shared = sharedInterests(me, p)
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="profile-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-photo">
          <Avatar p={p} idx={idx} />
          {p.photos.length > 1 && (
            <div className="photo-bars">{p.photos.map((u, i) => (
              <button key={u} className={i === idx ? 'on' : ''} onClick={() => setIdx(i)} aria-label={`Foto ${i + 1}`} />
            ))}</div>
          )}
          <button className="icon-button sheet-close" onClick={onClose} aria-label="Fechar"><Icon name="close" /></button>
        </div>
        <div className="preview-content">
          <div className="name-line dark"><span>{p.name}, {p.age}</span></div>
          <p>{[p.job, p.height_cm && `${p.height_cm} cm`, distanceText(p.distance_km)].filter(Boolean).join(' · ')}</p>
          {p.score && <span className="match-badge static">{matchPercent(p.score)}% match</span>}
          {p.interests.length > 0 && (
            <div className="tags dark-tags">
              {p.interests.map((t) => <span key={t} className={shared.includes(t) ? 'shared' : ''}>{t}</span>)}
            </div>
          )}
          {p.bio && <blockquote>“{p.bio}”</blockquote>}
        </div>
        {onSwipe && (
          <div className="actions">
            <button className="action-button dislike" aria-label="Passo" onClick={() => onSwipe('nope')}><Icon name="close" size={32} /></button>
            <button className="action-button like" aria-label="Gosto" onClick={() => onSwipe('like')}><Icon name="heart" size={30} filled /></button>
            <button className="action-button super" aria-label="Super Like" onClick={() => onSwipe('super')}><Icon name="star" filled /></button>
          </div>
        )}
      </div>
    </div>
  )
}
