import { useEffect, useRef } from 'react'
import { FIELDS, type Fields } from '../lib/profile'
import { useT } from '../i18n'
import type { Match } from '../lib/types'

interface Props {
  name: string
  fields: Fields
  matches: Match[] | null
  completeness: number       // profile completeness, 0–100
  openToTeaser: number       // answers still needed before the teaser can go out
  onContinue: () => void
  onInvestors: () => void
  onClose: () => void
}

/** Shown once, in a dialog over a dimmed page, right after the first sign-in from the ad funnel: what was carried over, where things stand, what to do next. */
export function Welcome({ name, fields, matches, completeness, openToTeaser, onContinue, onInvestors, onClose }: Props) {
  const t = useT()
  const carried = FIELDS.filter(d => fields[d.key]?.src === 'site' && fields[d.key].st !== 'empty').map(d => d.label)
  const n = (k: Match['bucket']) => (matches ?? []).filter(m => m.bucket === k).length
  const fit = n('fit'), poss = n('possible')
  const go = useRef<HTMLButtonElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    go.current?.focus()
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current() }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = prev }
  }, [])
  return (
    <div className="modal welcome-veil" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
    <section className="welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-h">
      <div className="welcome-head">
        <div>
          <span className="mono muted">{t('Your account is ready', 'Tu cuenta está lista')}</span>
          <h2 id="welcome-h">{name ? t(`Welcome, ${name}.`, `Te damos la bienvenida, ${name}.`) : t('Welcome.', 'Te damos la bienvenida.')} {t('Your project is already set up.', 'Tu proyecto ya está creado.')}</h2>
        </div>
        <button type="button" className="linkbtn" onClick={onClose} aria-label={t('Close this message', 'Cerrar este mensaje')}>{t('Close', 'Cerrar')}</button>
      </div>
      <div className="welcome-grid">
        <button type="button" className="wstat wbtn" onClick={onInvestors}>
          <span className="mono muted">{t('Investors that fit your project', 'Inversores que encajan con tu proyecto')}</span>
          {matches ? <b>{fit + poss}</b> : <b>…</b>}
          <small>{matches ? (poss > 0 ? t(`${fit} confirmed today. ${poss} more once you tell the agent your asset type and capital type. See who →`, `${fit} confirmados hoy. ${poss} más cuando le digas al agente tu tipo de activo y de capital. Ver quiénes →`) : t(`${fit} confirmed today. See who →`, `${fit} confirmados hoy. Ver quiénes →`)) : t('Matching in progress', 'Emparejamiento en curso')}</small>
        </button>
        <div className="wstat">
          <span className="mono muted">{t('Profile completeness', 'Perfil completado')}</span>
          <b>{completeness}<small>%</small></b>
          <small>{openToTeaser > 0 ? t(`${openToTeaser} more ${openToTeaser === 1 ? 'answer' : 'answers'} until your teaser can go out`, `${openToTeaser} ${openToTeaser === 1 ? 'respuesta más' : 'respuestas más'} hasta que tu teaser pueda salir`) : t('Ready to submit your teaser', 'Listo para enviar tu teaser')}</small>
        </div>
      </div>
      {carried.length > 0 && (
        <p className="welcome-carried"><b>{t('Already filled in for you:', 'Ya rellenado por ti:')}</b> {carried.join(', ')}. {t('You can change any of it.', 'Puedes cambiar cualquier dato.')}</p>
      )}
      <p className="muted small">{t('Completeness shows how much investors can already see. It grows with every answer you give the agent.', 'El porcentaje muestra cuánto pueden ver ya los inversores. Crece con cada respuesta que das al agente.')}</p>
      <div className="row"><button ref={go} type="button" className="btn pri" onClick={onContinue}>{t('Continue with the agent', 'Continuar con el agente')}</button></div>
    </section>
    </div>
  )
}

/** A new developer who arrived without any answers: a dialog over the dashboard that starts the first project. */
export function FirstRun({ name, busy, onStart, onClose }: { name: string; busy: boolean; onStart: () => void; onClose: () => void }) {
  const t = useT()
  const go = useRef<HTMLButtonElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    go.current?.focus()
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current() }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = prev }
  }, [])
  return (
    <div className="modal welcome-veil" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <section className="welcome" role="dialog" aria-modal="true" aria-labelledby="firstrun-h">
        <div className="welcome-head">
          <div>
            <span className="mono muted">{t('Your account is ready', 'Tu cuenta está lista')}</span>
            <h2 id="firstrun-h">{name ? t(`Welcome, ${name}.`, `Te damos la bienvenida, ${name}.`) : t('Welcome.', 'Te damos la bienvenida.')} {t('Let’s set up your first project.', 'Vamos a crear tu primer proyecto.')}</h2>
          </div>
          <button type="button" className="linkbtn" onClick={onClose} aria-label={t('Close this message', 'Cerrar este mensaje')}>{t('Close', 'Cerrar')}</button>
        </div>
        <p className="welcome-carried">{t('Answer a few questions and the agent builds your project profile. Investors that fit are checked as you go.', 'Responde unas preguntas y el agente construye el perfil de tu proyecto. Los inversores que encajan se comprueban sobre la marcha.')}</p>
        <div className="row"><button ref={go} type="button" className="btn pri" disabled={busy} onClick={onStart}>{t('Add my first project', 'Añadir mi primer proyecto')}</button></div>
      </section>
    </div>
  )
}
