import { Fragment, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { Icon, Badges } from './icons'
import { Avatar } from './App'
import { isUnread, shortTime, dayLabel } from './data'

export function Messages({ me, matches, selected, onSelect, toast, openSheet }) {
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
        {!list.length && (
          <div className="messages-empty">
            <Icon name="message" size={34} />
            <strong>Ainda não tens matches</strong>
            <p>Quando gostares de alguém e essa pessoa gostar de ti, a conversa aparece aqui.</p>
          </div>
        )}
        {fresh.length > 0 && (
          <div className="new-matches">
            <span>Novos matches</span>
            <div>
              {fresh.map((m, i) => (
                <button key={m.id} style={{ '--i': i }} onClick={() => onSelect(m.id)}>
                  <i><Avatar p={m} /></i>
                  <span>{m.name}<Badges p={m} size={13} /></span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="chat-list">
          {talking.map((m, i) => (
            <button className={`chat-row ${selected === m.id ? 'active' : ''}`} key={m.id} style={{ '--i': i }} onClick={() => onSelect(m.id)}>
              <i className="avatar-wrap"><Avatar p={m} /></i>
              <div>
                <strong>{m.name}<Badges p={m} size={15} /></strong>
                <span>{m.last.sender === me.id && 'Tu: '}{m.last.body}</span>
              </div>
              <small>{shortTime(m.last.created_at)}</small>
              {isUnread(me, m) && <em aria-label="Mensagem nova">1</em>}
            </button>
          ))}
        </div>
      </aside>
      {current
        ? <Chat key={current.id} me={me} other={current} onRead={matches.markRead} onBack={() => onSelect(null)} onGone={() => { onSelect(null); matches.reload() }} toast={toast}
            openProfile={() => openSheet({ ...current, matched: true })} />
        : <section className="chat-panel chat-empty"><Icon name="message" size={40} /><p>Escolhe uma conversa</p></section>}
    </div>
  )
}

const REACTIONS = ['❤️', '😂', '😮', '😢', '👍', '🔥'] // same list as the check in supabase/messages.sql

function Chat({ me, other, onRead, onBack, onGone, toast, openProfile }) {
  const [a, b] = [me.id, other.id].sort()
  const mySide = me.id === a ? 'reaction_a' : 'reaction_b'
  const [msgs, setMsgs] = useState(null)
  const [text, setText] = useState('')
  const [menu, setMenu] = useState(false)
  const [picked, setPicked] = useState(null) // message id whose reaction bar is open
  const [replyTo, setReplyTo] = useState(null)
  const body = useRef(null)
  const input = useRef(null)

  useEffect(() => {
    supabase.from('messages').select('*').eq('a', a).eq('b', b).order('created_at')
      .then(({ data }) => setMsgs(data ?? []))
    const ch = supabase.channel(`chat-${a}-${b}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `a=eq.${a}` },
        ({ new: m }) => m.b === b && setMsgs((xs) => (xs ?? []).some((x) => x.id === m.id) ? xs : [...(xs ?? []), m]))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `a=eq.${a}` },
        ({ new: m }) => m.b === b && setMsgs((xs) => xs?.map((x) => (x.id === m.id ? { ...x, ...m } : x))))
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [a, b])
  const first = useRef(true) // jump to the bottom on open, glide for new messages
  const count = msgs?.length // reactions update msgs too, but only new messages should scroll
  // Opening the chat, or their message arriving while it's on screen, clears the alert.
  const lastFromThem = !count || msgs.at(-1).sender !== me.id
  useEffect(() => {
    if (!msgs || !lastFromThem) return
    const mark = () => document.visibilityState === 'visible' &&
      supabase.rpc('mark_read', { p_other: other.id }).then(({ data, error }) => !error && onRead(other.id, data))
    mark()
    document.addEventListener('visibilitychange', mark)
    return () => document.removeEventListener('visibilitychange', mark)
  }, [count, lastFromThem, other.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!count) return
    body.current?.scrollTo({ top: body.current.scrollHeight, behavior: first.current ? 'auto' : 'smooth' })
    first.current = false
  }, [count])

  const send = async (e) => {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    setText(''); setReplyTo(null)
    const { data, error } = await supabase.from('messages').insert({ a, b, body: t, ...(replyTo && { reply_to: replyTo.id }) }).select().single()
    if (error) { setText(t); setReplyTo(replyTo); return toast(error.code === '23503' ? `${other.name} já não é um match.` : error.message) }
    setMsgs((xs) => (xs ?? []).some((x) => x.id === data.id) ? xs : [...(xs ?? []), data])
  }

  // One reaction per person per message; picking the same one again removes it.
  const react = async (m, emoji) => {
    setPicked(null)
    const next = m[mySide] === emoji ? null : emoji
    const swap = (val) => setMsgs((xs) => xs.map((x) => (x.id === m.id ? { ...x, [mySide]: val } : x)))
    swap(next)
    const { error } = await supabase.from('messages').update({ [mySide]: next }).eq('id', m.id)
    if (error) { swap(m[mySide]); toast(error.message) }
  }
  const reply = (m) => { setPicked(null); setReplyTo(m); input.current?.focus() }
  const author = (m) => (m.sender === me.id ? 'Tu' : other.name)
  const jumpTo = (id) => document.getElementById(`msg-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })

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
        <button className="chat-person" onClick={openProfile} aria-label={`Ver o perfil de ${other.name}`}>
          <i className="avatar-wrap"><Avatar p={other} /></i>
          <div><strong>{other.name}<Badges p={other} size={15} /></strong><span>{other.age} anos{other.university && ` · ${other.university}`}</span></div>
        </button>
        <div className="menu-wrap">
          <button className="icon-button" aria-label="Mais opções" onClick={() => setMenu(!menu)}><Icon name="more" /></button>
          {menu && (
            <div className="menu" onClick={() => setMenu(false)}>
              <button onClick={openProfile}>Ver perfil</button>
              <button onClick={unmatch}>Desfazer match</button>
              <button onClick={() => block(false)}>Bloquear</button>
              <button className="danger" onClick={() => block(true)}>Denunciar</button>
            </div>
          )}
        </div>
      </header>
      <div className="chat-body" ref={body} onClick={() => setPicked(null)}>
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
            <Message m={m} mine={m.sender === me.id} quoted={m.reply_to && msgs.find((x) => x.id === m.reply_to)}
              author={author} mySide={mySide} open={picked === m.id}
              onToggle={() => setPicked(picked === m.id ? null : m.id)} onReact={react} onReply={reply} onJump={jumpTo} />
          </Fragment>
        ))}
      </div>
      {replyTo && (
        <div className="reply-bar">
          <Icon name="reply" size={16} />
          <div><strong>{author(replyTo)}</strong><span>{replyTo.body}</span></div>
          <button type="button" aria-label="Cancelar resposta" onClick={() => setReplyTo(null)}><Icon name="close" size={16} /></button>
        </div>
      )}
      <form className="message-composer" onSubmit={send}>
        <input ref={input} value={text} onChange={(e) => setText(e.target.value)} placeholder="Escreve uma mensagem..." maxLength={2000} enterKeyHint="send" />
        <button className="send-button" aria-label="Enviar" disabled={!text.trim()}><Icon name="send" size={18} filled /></button>
      </form>
    </section>
  )
}

// Tap a message for the reaction bar; double-tap to like it (by hand: phones don't reliably fire dblclick).
function Message({ m, mine, quoted, author, mySide, open, onToggle, onReact, onReply, onJump }) {
  const reactions = [m.reaction_a, m.reaction_b].filter(Boolean)
  const lastTap = useRef(0)
  const tap = () => {
    const double = Date.now() - lastTap.current < 300
    lastTap.current = double ? 0 : Date.now()
    if (!double) onToggle()
    else if (m[mySide] !== '❤️') onReact(m, '❤️')
    else onToggle() // already liked: just close the bar the first tap opened
  }
  return (
    <div className={`msg ${mine ? 'mine' : 'theirs'}`} id={`msg-${m.id}`} onClick={(e) => e.stopPropagation()}>
      {open && (
        <div className="msg-actions">
          {REACTIONS.map((r) => (
            <button key={r} className={m[mySide] === r ? 'on' : ''} aria-label={`Reagir com ${r}`} onClick={() => onReact(m, r)}>{r}</button>
          ))}
          <button aria-label="Responder" onClick={() => onReply(m)}><Icon name="reply" size={18} /></button>
        </div>
      )}
      {quoted && (
        <button className="quote" onClick={() => onJump(quoted.id)}>
          <strong>{author(quoted)}</strong> {quoted.body}
        </button>
      )}
      <div className="bubble" role="button" tabIndex={0} onClick={tap}
        onKeyDown={(e) => e.key === 'Enter' && onToggle()}>{m.body}</div>
      {reactions.length > 0 && (
        <button className="reactions" aria-label="Mudar reação" onClick={onToggle}>{reactions.join('')}</button>
      )}
    </div>
  )
}
