import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import { setLang, useLang, useT } from '../i18n'

const initials = (name: string | null | undefined, email: string | undefined) => {
  const src = (name ?? '').trim() || (email ?? '?')
  const parts = src.split(/[\s@.]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[1][0] : '')).toUpperCase()
}

/** Account menu in the header: who is signed in, settings, company or investor profile, sign out. */
export function AccountMenu() {
  const { profile, session, signOut } = useAuth()
  const t = useT(); const lang = useLang()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const out = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', out); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', out); document.removeEventListener('keydown', esc) }
  }, [open])
  const email = session?.user.email
  const item = (to: string, label: string) => <Link className="mitem" to={to} role="menuitem" onClick={() => setOpen(false)}>{label}</Link>
  return (
    <div className="bell" ref={box}>
      <button type="button" className="avatar" aria-label={t('Account menu', 'Menú de la cuenta')} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}>{initials(profile?.full_name, email)}</button>
      {open && (
        <div className="bpanel menu" role="menu">
          <div className="mhead"><b>{profile?.full_name || email}</b><span className="muted">{email}</span><span className="mono">{profile?.role}</span></div>
          {item('/settings', t('Account settings', 'Ajustes de la cuenta'))}
          {profile?.role === 'developer' && item('/settings?tab=profile', t('Company profile', 'Perfil de empresa'))}
          {profile?.role === 'investor' && item('/settings?tab=profile', t('Investor profile', 'Perfil de inversor'))}
          {item('/settings?tab=privacy', t('Data and privacy', 'Datos y privacidad'))}
          <div className="mitem langrow" role="group" aria-label={t('Language', 'Idioma')}><span>{t('Language', 'Idioma')}</span>{(['en', 'es'] as const).map(l => <button key={l} type="button" className={l === lang ? 'on' : ''} aria-pressed={l === lang} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}</div>
          <button type="button" className="mitem" role="menuitem" onClick={() => void signOut()}>{t('Sign out', 'Cerrar sesión')}</button>
        </div>)}
    </div>
  )
}
