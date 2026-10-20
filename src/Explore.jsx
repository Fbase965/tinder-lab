import { useState } from 'react'
import { Icon } from './icons'
import { Avatar } from './App'
import { matchPercent } from './algorithm'
import { distanceText } from './Discover'

export function Explore({ me, deck, swipe, openSheet }) {
  const [query, setQuery] = useState('')
  const [likedMeOnly, setLikedMeOnly] = useState(false)
  const [showAll, setShowAll] = useState(false)
  if (!deck) return <p className="loading">A carregar…</p>

  const q = query.trim().toLowerCase()
  const likedMe = deck.filter((c) => c.likes_me)
  const list = deck
    .filter((c) => !likedMeOnly || c.likes_me)
    .filter((c) => !q || c.name.toLowerCase().includes(q) || c.job?.toLowerCase().includes(q) || c.interests.some((i) => i.includes(q)))
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
      <div className="featured-banner">
        <div>
          <span>{likedMeOnly ? 'A MOSTRAR' : 'GOSTAM DE TI'}</span>
          <strong>{likedMe.length ? `${likedMe.length} ${likedMe.length === 1 ? 'pessoa já gostou' : 'pessoas já gostaram'} de ti` : 'Ainda ninguém novo'}</strong>
          <p>{likedMe.length ? 'Dá-lhes um gosto de volta e o match é imediato.' : 'Quando alguém gostar de ti, aparece aqui primeiro.'}</p>
          {likedMe.length > 0 && (
            <button onClick={() => setLikedMeOnly(!likedMeOnly)}>{likedMeOnly ? 'Ver toda a gente' : 'Ver quem gostou'}</button>
          )}
        </div>
        <div className="featured-portraits">
          {(likedMe.length ? likedMe : deck).slice(0, 3).map((c) => <Avatar key={c.id} p={c} />)}
        </div>
      </div>
      <div className="section-row">
        <div className="section-title">{likedMeOnly ? 'Gostaram de ti' : 'Perfis para ti'}</div>
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
                {c.distance_km != null && <><Icon name="location" size={12} /> {distanceText(c.distance_km).replace('a ', '')}</>}
                {c.distance_km != null && c.job && ' · '}
                {c.job}
              </span>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
