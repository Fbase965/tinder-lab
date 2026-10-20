// Icons from the Figma design (Tinder-like design/src/App.tsx).
const paths = {
  brand: (
    <path d="M12 3c1.8 2.2 2.7 4 2.7 5.4 0 .7-.2 1.4-.5 2 1.3-.6 2.1-1.8 2.4-3.5 2.3 2.1 3.4 4.4 3.4 6.8A8 8 0 1 1 6.8 7.6c.2 2.1 1.2 3.5 2.9 4.4-.3-.8-.4-1.5-.2-2.3.2-1.9 1-4.1 2.5-6.7Z" />
  ),
  sliders: (
    <>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="17" r="2" />
    </>
  ),
  location: (
    <>
      <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  verified: (
    <>
      <path d="m9.5 2 2.5 1.5L14.5 2l1.3 2.6 2.9.2-.2 2.9L21 9.5 19.2 12l1.8 2.5-2.5 1.8.2 2.9-2.9.2-1.3 2.6-2.5-1.5L9.5 22l-1.3-2.6-2.9-.2.2-2.9L3 14.5 4.8 12 3 9.5l2.5-1.8-.2-2.9 2.9-.2L9.5 2Z" />
      <path d="m8 12 2.5 2.5L16 9" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  undo: (
    <>
      <path d="M9 7 5 11l4 4" />
      <path d="M5 11h8a5 5 0 0 1 0 10" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
  heart: (
    <path d="M20.8 5.8a5.4 5.4 0 0 0-7.7 0L12 6.9l-1.1-1.1a5.4 5.4 0 0 0-7.7 7.7L12 22l8.8-8.5a5.4 5.4 0 0 0 0-7.7Z" />
  ),
  bolt: <path d="m13 2-8 12h7l-1 8 8-12h-7l1-8Z" />,
  flame: (
    <path d="M12 2c1.7 2.1 2.5 3.9 2.5 5.4 0 .7-.2 1.4-.5 2 1.3-.6 2.2-1.8 2.5-3.5 2.3 2.1 3.5 4.4 3.5 6.9a8 8 0 1 1-13.3-6C7 9 8 10.4 9.7 11.3c-.3-.8-.3-1.6-.2-2.4.2-1.9 1-4.2 2.5-6.9Z" />
  ),
  sparkles: (
    <>
      <path d="m12 3 .8 3.2L16 7l-3.2.8L12 11l-.8-3.2L8 7l3.2-.8L12 3ZM18 13l.7 2.3L21 16l-2.3.7L18 19l-.7-2.3L15 16l2.3-.7L18 13ZM6 12l.7 2.3L9 15l-2.3.7L6 18l-.7-2.3L3 15l2.3-.7L6 12Z" />
    </>
  ),
  message: (
    <path d="M20 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h9a4 4 0 0 1 4 4v8Z" />
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  edit: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
    </>
  ),
  send: (
    <>
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </>
  ),
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />,
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5M21 12H9" />
    </>
  ),
  chevron: <path d="m9 18 6-6-6-6" />,
}
paths.star = <path d="m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7L12 3Z" />
paths.back = <path d="m15 18-6-6 6-6" />
paths.more = <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>
paths.plus = <path d="M12 5v14M5 12h14" />

export function Icon({ name, size = 22, filled = false }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  )
}

export function Brand() {
  return (
    <div className="wordmark">
      <span className="brand-mark"><Icon name="brand" size={28} filled /></span>
      <span>faísca</span>
    </div>
  )
}
