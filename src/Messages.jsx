import { Fragment, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { Icon } from './icons'
import { Avatar } from './App'
import { needsReply, shortTime, dayLabel } from './data'

export function Messages({ me, matches, selected, onSelect, toast }) {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const list = matches.list
  if (!list) return <p className="loading">A carregar…</p>

  const fresh = list.filter((m) => !m.last)
  const q = query.trim().toLowerCase()
  const talking = list.filter((m) => m.last && (!q || m.name.toLowerCase().includes(q)))
    .sort((x, y) => y.last.created_at.localeCompare(x.last.created_at))
  const current = list.find((m) => m.id === selected)

  return (
    <div className={`messages-page ${current ? 'has-chat' : ''}`}>
      <aside className="conversation-list">
        <div className="conversation-heading">
          <div>
            <span className="kicker">LIGAÇÕES</span>
            <div className="page-title">Mensagens</div>
          </div>
          <button className="icon-button" aria-label="Pesquisar" onClick={() => { setSearching(!searching); setQuery('') }}>
            <Icon name={searching ? 'close' : 'search'} />
          </button>
        </div>
        {searching && (
          <div className="search-box full">
            <Icon name="search" size={19} />
            <input autoFocus placeholder="Pesquisar conversas" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        )}
        {!list.length && <p className="empty-note">Ainda não tens matches. Continua a descobrir!</p>}
        {fresh.length > 0 && (
          <div className="new-matches">
            <span>Novos matches</span>
            <div>
              {fresh.map((m) => (
                <button key={m.id} onClick={() => onSelect(m.id)}>
                  <i><Avatar p={m} /></i>
                  <span>{m.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="chat-list">
          {talking.map((m) => (
            <button className={`chat-row ${selected === m.id ? 'active' : ''}`} key={m.id} onClick={() => onSelect(m.id)}>
              <i className="avatar-wrap"><Avatar p={m} /></i>
              <div>
                <strong>{m.name}</strong>
                <span>{m.last.sender === me.id && 'Tu: '}{m.last.body}</span>
              </div>
              <small>{shortTime(m.last.created_at)}</small>
              {needsReply(me, m) && <em aria-label="A tua vez">1</em>}
            </button>
          ))}
        </div>
      </aside>
      {current
        ? <Chat key={current.id} me={me} other={current} onBack={() => onSelect(null)} onGone={() => { onSelect(null); matches.reload() }} toast={toast} />
        : <section className="chat-panel chat-empty"><Icon name="message" size={40} /><p>Escolhe uma conversa</p></section>}
    </div>
  )
}

function Chat({ me, other, onBack, onGone, toast }) {
  const [a, b] = [me.id, other.id].sort()
  const [msgs, setMsgs] = useState(null)
  const [text, setText] = useState('')
  const [menu, setMenu] = useState(false)
  const body = useRef(null)

  useEffect(() => {
    supabase.from('messages').select('*').eq('a', a).eq('b', b).order('created_at')
      .then(({ data }) => setMsgs(data ?? []))
    const ch = supabase.channel(`chat-${a}-${b}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `a=eq.${a}` },
        ({ new: m }) => m.b === b && setMsgs((xs) => (xs ?? []).some((x) => x.id === m.id) ? xs : [...(xs ?? []), m]))
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [a, b])
  useEffect(() => { body.current?.scrollTo({ top: body.current.scrollHeight }) }, [msgs])

  const send = async (e) => {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    setText('')
    const { data, error } = await supabase.from('messages').insert({ a, b, body: t }).select().single()
    if (error) { setText(t); return toast(error.code === '23503' ? `${other.name} já não é um match.` : error.message) }
    setMsgs((xs) => xs.some((x) => x.id === data.id) ? xs : [...xs, data])
  }

  const unmatch = async () => {
    if (!confirm(`Desfazer o match com ${other.name}? A conversa vai ser apagada.`)) return
    const { error } = await supabase.from('matches').delete().eq('a', a).eq('b', b)
    if (error) return toast(error.message)
    toast('Match desfeito'); onGone()
  }
  const block = async (report) => {
    const reason = report ? prompt(`Porque estás a denunciar ${other.name}?`) : null
    if (report && !reason?.trim()) return
    if (!report && !confirm(`Bloquear ${other.name}? Não se voltam a ver.`)) return
    const { error } = await supabase.from('blocks').insert({ blocker: me.id, blocked: other.id, reason: reason?.trim() || null })
    if (error) return toast(error.message)
    toast(report ? 'Denúncia enviada' : `${other.name} foi bloqueado`); onGone()
  }

  return (
    <section className="chat-panel">
      <header>
        <button className="icon-button back-button" onClick={onBack} aria-label="Voltar"><Icon name="back" /></button>
        <div className="chat-person">
          <i className="avatar-wrap"><Avatar p={other} /></i>
          <div><strong>{other.name}</strong><span>{other.age} anos{other.job && ` · ${other.job}`}</span></div>
        </div>
        <div className="menu-wrap">
          <button className="icon-button" aria-label="Mais opções" onClick={() => setMenu(!menu)}><Icon name="more" /></button>
          {menu && (
            <div className="menu" onClick={() => setMenu(false)}>
              <button onClick={unmatch}>Desfazer match</button>
              <button onClick={() => block(false)}>Bloquear</button>
              <button className="danger" onClick={() => block(true)}>Denunciar</button>
            </div>
          )}
        </div>
      </header>
      <div className="chat-body" ref={body}>
        <div className="match-intro">
          <div><Avatar p={other} /><Avatar p={me} /></div>
          <strong>É um match!</strong>
          <span>Tu e {other.name} gostaram um do outro.</span>
        </div>
        {msgs?.map((m, i) => (
          <Fragment key={m.id}>
            {(i === 0 || dayLabel(msgs[i - 1].created_at) !== dayLabel(m.created_at)) && (
              <span className="date-divider">{dayLabel(m.created_at)}</span>
            )}
            <div className={`bubble ${m.sender === me.id ? 'mine' : 'theirs'}`}>{m.body}</div>
          </Fragment>
        ))}
      </div>
      <form className="message-composer" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Escreve uma mensagem..." maxLength={2000} />
        <button className="send-button" aria-label="Enviar" disabled={!text.trim()}><Icon name="send" size={18} filled /></button>
      </form>
    </section>
  )
}
