import { useEffect, useState } from 'react'
import { Icon, Badges } from './icons'
import { Avatar } from './App'
import { loadMyLikes } from './data'
import { matchPercent } from './algorithm'
import { PeopleStrip } from './Premium'

export function Explore({ deck, swipe, openSheet, plan, openPremium, fresh = {} }) {
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  if (!deck) return <p className="loading">A carregar…</p>
  if (!plan.premium) return <ExploreLocked deck={deck} openPremium={openPremium} />

  const q = query.trim().toLowerCase()
  const list = deck
    .filter((c) => !q || c.name.toLowerCase().includes(q) || c.university?.toLowerCase().includes(q) || c.interests.some((i) => i.includes(q)))
  const shown = showAll ? list : list.slice(0, 9)

  return (
    <div className="standard-page">
      <div className="page-heading">
        <div>
          <span className="kicker">EXPLORAR</span>
          <div className="page-title">Descobre à tua maneira</div>
        </div>
        <div className="search-box">
          <Icon name="search" size={19} />
          <input aria-label="Pesquisar" placeholder="Pesquisar interesses" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>
      <PeopleStrip kind="likes" plan={plan} openPremium={openPremium} openSheet={openSheet} refreshKey={deck.length} fresh={fresh.likes} />
      <PeopleStrip kind="views" plan={plan} openPremium={openPremium} openSheet={openSheet} fresh={fresh.views} />
      <MyLikesStrip openSheet={openSheet} refreshKey={deck.length} />
      <div className="section-row">
        <div className="section-title">Perfis para ti</div>
        {list.length > 9 && (
          <button onClick={() => setShowAll(!showAll)}>{showAll ? 'Ver menos' : `Ver todos (${list.length})`} <Icon name="chevron" size={16} /></button>
        )}
      </div>
      {!list.length && <p className="empty-note">{q ? `Ninguém com “${query}”.` : 'Não há perfis novos por agora.'}</p>}
      <div className="profile-grid">
        {shown.map((c, i) => (
          <article className="mini-profile" key={c.id} style={{ '--i': i }} onClick={() => openSheet(c)}>
            <Avatar p={c} />
            <div className="mini-shade" />
            <span className="match-badge">{matchPercent(c.score)}% match</span>
            <button aria-label={`Gostar de ${c.name}`} onClick={(e) => { e.stopPropagation(); swipe(c, 'like') }}>
              <Icon name="heart" size={18} filled />
            </button>
            <div>
              <strong>{c.name}, {c.age}<Badges p={c} size={15} /></strong>
              <span>
                {c.distance_km != null && <><Icon name="location" size={12} /> {`< ${c.distance_km} km`}</>}
                {c.distance_km != null && c.university && ' · '}
                {c.university}
              </span>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

// Explore is faísca+. Free users see a blurred preview of profiles they already get in Discover.
// People I liked, newest first (faísca+; Explore itself is faísca+ only).
function MyLikesStrip({ openSheet, refreshKey }) {
  const [rows, setRows] = useState(null)
  useEffect(() => { loadMyLikes(30).then(setRows) }, [refreshKey])
  if (!rows) return null
  return (
    <section className="people-strip">
      <div className="section-row"><div className="section-title">Gostaste de</div></div>
      {rows.length === 0 && <p className="empty-note">Quando gostares de alguém, aparece aqui.</p>}
      <div className="strip">
        {rows.map((p, i) => (
          <button key={p.id} style={{ '--i': i }} onClick={() => openSheet(p)}>
            <i className={p.super ? 'super' : ''}><Avatar p={p} /></i>
            <span>{p.name}, {p.age}<Badges p={p} size={13} /></span>
          </button>
        ))}
      </div>
    </section>
  )
}

function ExploreLocked({ deck, openPremium }) {
  const preview = deck.slice(0, 6)
  return (
    <div className="standard-page">
      <div className="page-heading">
        <div>
          <span className="kicker">EXPLORAR</span>
          <div className="page-title">Descobre à tua maneira</div>
        </div>
      </div>
      <div className="explore-locked">
        <div className="locked-grid" aria-hidden="true">
          {preview.map((c, i) => <div key={c.id} style={{ '--i': i }}><Avatar p={c} /></div>)}
          {Array.from({ length: Math.max(0, 6 - preview.length) }, (_, i) => <div key={i} className="blank" style={{ '--i': preview.length + i }} />)}
        </div>
        <div className="locked-card">
          <div className="premium-badge"><Icon name="brand" size={22} filled /><span>faísca<b>+</b></span></div>
          <strong>Explorar é exclusivo faísca+</strong>
          <ul>
            <li><Icon name="search" size={17} /> Pesquisa por universidade e interesses</li>
            <li><Icon name="sparkles" size={17} /> Vê todos os perfis numa grelha, com % de match</li>
            <li><Icon name="heart" size={17} filled /> Quem gostou de ti e quem viu o teu perfil</li>
          </ul>
          <button className="primary-button" onClick={openPremium}>Desbloquear Explorar</button>
        </div>
      </div>
    </div>
  )
}
