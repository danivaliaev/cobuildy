import { useEffect, useRef } from 'react'
import { FIELDS, type Fields } from '../lib/profile'
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
          <span className="mono muted">Your account is ready</span>
          <h2 id="welcome-h">{name ? `Welcome, ${name}.` : 'Welcome.'} Your project is already set up.</h2>
        </div>
        <button type="button" className="linkbtn" onClick={onClose} aria-label="Close this message">Close</button>
      </div>
      <div className="welcome-grid">
        <button type="button" className="wstat wbtn" onClick={onInvestors}>
          <span className="mono muted">Investors that fit your project</span>
          {matches ? <b>{fit + poss}</b> : <b>…</b>}
          <small>{matches ? (poss > 0 ? `${fit} confirmed today. ${poss} more once you tell the agent your asset type and capital type. See who →` : `${fit} confirmed today. See who →`) : 'Matching in progress'}</small>
        </button>
        <div className="wstat">
          <span className="mono muted">Profile completeness</span>
          <b>{completeness}<small>%</small></b>
          <small>{openToTeaser > 0 ? `${openToTeaser} more ${openToTeaser === 1 ? 'answer' : 'answers'} until your teaser can go out` : 'Ready to submit your teaser'}</small>
        </div>
      </div>
      {carried.length > 0 && (
        <p className="welcome-carried"><b>Already filled in for you:</b> {carried.join(', ')}. You can change any of it.</p>
      )}
      <p className="muted small">Completeness shows how much investors can already see. It grows with every answer you give the agent.</p>
      <div className="row"><button ref={go} type="button" className="btn pri" onClick={onContinue}>Continue with the agent</button></div>
    </section>
    </div>
  )
}

/** A new developer who arrived without any answers: a dialog over the dashboard that starts the first project. */
export function FirstRun({ name, busy, onStart, onClose }: { name: string; busy: boolean; onStart: () => void; onClose: () => void }) {
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
            <span className="mono muted">Your account is ready</span>
            <h2 id="firstrun-h">{name ? `Welcome, ${name}.` : 'Welcome.'} Let’s set up your first project.</h2>
          </div>
          <button type="button" className="linkbtn" onClick={onClose} aria-label="Close this message">Close</button>
        </div>
        <p className="welcome-carried">Answer a few questions and the agent builds your project profile. Investors that fit are checked as you go.</p>
        <div className="row"><button ref={go} type="button" className="btn pri" disabled={busy} onClick={onStart}>Add my first project</button></div>
      </section>
    </div>
  )
}
