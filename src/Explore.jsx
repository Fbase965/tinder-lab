import { useState } from 'react'
import { Icon } from './icons'
import { Avatar } from './App'
import { matchPercent } from './algorithm'
import { PeopleStrip } from './Premium'

export function Explore({ deck, swipe, openSheet, plan, openPremium }) {
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  if (!deck) return <p className="loading">A carregar…</p>

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
      <PeopleStrip kind="likes" plan={plan} openPremium={openPremium} openSheet={openSheet} refreshKey={deck.length} />
      <PeopleStrip kind="views" plan={plan} openPremium={openPremium} openSheet={openSheet} />
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
              <strong>{c.name}, {c.age}</strong>
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
