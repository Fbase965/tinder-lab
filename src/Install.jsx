import { useEffect, useState } from 'react'
import { Icon } from './icons'
import { Modal } from './App'
import {
  canPromptInstall, disablePush, enablePush, isIOS, isPhone, isStandalone, onInstallChange, promptInstall, pushEnabled, pushSupported,
} from './pwa'

// localStorage can throw (private mode, blocked storage): these flags are conveniences only.
const flag = {
  get: (k) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v) } catch { /* ignore */ } },
}
const INSTALL = 'faisca-install' // 'pending' right after sign-up on a phone
const PUSH_ASKED = 'faisca-push-asked'
const OPEN_EVENT = 'faisca-open-install'

const NEW_ACCOUNT = 'faisca-new-account'
export const markJustSignedUp = () => {
  flag.set(NEW_ACCOUNT, '1')
  if (isPhone() && !isStandalone()) flag.set(INSTALL, 'pending')
}
export const openInstall = () => window.dispatchEvent(new Event(OPEN_EVENT))

// Bottom sheet that turns the site into a home-screen app: native dialog on Android/Chrome, steps on iOS.
export function InstallPrompt() {
  const [open, setOpen] = useState(() => flag.get(INSTALL) === 'pending' && isPhone() && !isStandalone())
  const [native, setNative] = useState(canPromptInstall)
  useEffect(() => onInstallChange(() => setNative(canPromptInstall())), [])
  useEffect(() => {
    const show = () => setOpen(true)
    window.addEventListener(OPEN_EVENT, show)
    return () => window.removeEventListener(OPEN_EVENT, show)
  }, [])
  if (!open) return null

  const done = () => { flag.set(INSTALL, null); setOpen(false) }
  const steps = isIOS()
    ? [['share', <>Toca em <b>Partilhar</b> na barra do Safari</>], ['addSquare', <>Escolhe <b>Adicionar ao ecrã principal</b></>], ['brand', <>Toca em <b>Adicionar</b> e abre a faísca pelo ícone</>]]
    : [['more', <>Abre o menu <b>⋮</b> do browser</>], ['addSquare', <>Escolhe <b>Instalar app</b> ou <b>Adicionar ao ecrã principal</b></>], ['brand', <>Abre a faísca pelo ícone</>]]

  return (
    <Modal className="filter-modal install-sheet" onClose={done}>
      {(close) => <>
        <img className="install-icon" src="/icons/icon-192.png" alt="" />
        <div className="modal-title">Instala a faísca</div>
        <p className="install-sub">Abre como uma app, em ecrã inteiro, e recebe notificações de matches e mensagens.</p>
        {native ? (
          <button className="primary-button" onClick={async () => { if (await promptInstall()) close() }}>Instalar app</button>
        ) : (
          <ol className="install-steps">
            {steps.map(([icon, text], i) => <li key={i}><i><Icon name={icon} size={20} filled={icon === 'brand'} /></i><span>{text}</span></li>)}
          </ol>
        )}
        {isIOS() && <p className="install-note">No iPhone, a app do ecrã principal não partilha a sessão com o Safari: entra lá uma vez com o teu username e password.</p>}
        <button className="link" onClick={close}>{native ? 'Agora não' : 'Percebi'}</button>
      </>}
    </Modal>
  )
}

// One-time nudge to turn notifications on, where push can work (installed app, or any desktop browser).
export function NotifyPrompt({ toast }) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    // iPhone only allows push inside the installed app; there the install sheet comes first.
    const canPushHere = pushSupported() && !(isIOS() && !isStandalone())
    const fresh = !!flag.get(NEW_ACCOUNT) // right after creating the account: ask even if asked before
    if (!canPushHere || Notification.permission !== 'default' || (!fresh && flag.get(PUSH_ASKED))) return
    const t = setTimeout(() => { flag.set(NEW_ACCOUNT, null); setShow(true) }, fresh ? 1200 : 4000) // let the first screen settle
    return () => clearTimeout(t)
  }, [])
  if (!show) return null
  const close = () => { flag.set(PUSH_ASKED, '1'); setShow(false) }
  const enable = async () => {
    close()
    try { await enablePush(); toast('Notificações ativadas') } catch (e) { toast(e.message) }
  }
  return (
    <div className="notify-card" role="dialog" aria-label="Notificações">
      <i><Icon name="bell" size={20} /></i>
      <div><strong>Não percas um match</strong><span>Recebe um aviso quando alguém gostar de ti de volta ou te escrever.</span></div>
      <div className="notify-actions">
        <button className="link" onClick={close}>Agora não</button>
        <button className="primary-button" onClick={enable}>Ativar</button>
      </div>
    </div>
  )
}

// Settings row: on/off, or how to get there.
export function NotificationsRow({ toast }) {
  const [on, setOn] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => { pushEnabled().then(setOn) }, [])
  const needsInstall = isPhone() && !isStandalone() && (isIOS() || !pushSupported())
  // Once denied, a site can't ask again: only the phone's settings can undo it.
  const blocked = !needsInstall && pushSupported() && Notification.permission === 'denied'
  const fix = isIOS() ? 'Definições do iPhone → Notificações → faísca → Permitir notificações'
    : 'Definições do site no browser (cadeado ao lado do endereço) → Notificações → Permitir'

  const click = async () => {
    if (needsInstall) return openInstall()
    if (blocked) return toast(`Notificações bloqueadas. Ativa em: ${fix}`)
    setBusy(true)
    try {
      if (on) { await disablePush(); setOn(false); toast('Notificações desativadas') }
      else { await enablePush(); setOn(true); toast('Notificações ativadas') }
    } catch (e) { toast(e.message) }
    setBusy(false)
  }
  return <>
    <button onClick={click} disabled={busy}>
      <i className="coral"><Icon name="bell" /></i>
      <div><strong>Notificações</strong><span>{needsInstall ? 'Instala a app para as ativar' : blocked ? `Bloqueadas · ${fix}` : on ? 'Ativas · matches e mensagens' : 'Desativadas · toca para ativar'}</span></div>
      {needsInstall ? <Icon name="chevron" /> : <span className={`switch-pill ${on ? 'on' : ''}`} aria-hidden="true" />}
    </button>
    {isPhone() && !isStandalone() && !needsInstall && (
      <button onClick={openInstall}>
        <i className="purple"><Icon name="addSquare" /></i>
        <div><strong>Instalar app</strong><span>Abre a faísca pelo ecrã principal</span></div>
        <Icon name="chevron" />
      </button>
    )}
  </>
}
