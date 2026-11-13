import { FIELDS, type Fields } from '../lib/profile'
import type { Match } from '../lib/types'

interface Props {
  name: string
  score: number              // the funnel's initial assessment, 0 when unknown
  fields: Fields
  matches: Match[] | null
  completeness: number       // profile completeness, 0–100
  openToTeaser: number       // answers still needed before the teaser can go out
  onContinue: () => void
  onInvestors: () => void
  onClose: () => void
}

/** Shown once, right after the first sign-in from the ad funnel: what was carried over, where things stand, what to do next. */
export function Welcome({ name, score, fields, matches, completeness, openToTeaser, onContinue, onInvestors, onClose }: Props) {
  const carried = FIELDS.filter(d => fields[d.key]?.src === 'site' && fields[d.key].st !== 'empty').map(d => d.label)
  const n = (k: Match['bucket']) => (matches ?? []).filter(m => m.bucket === k).length
  const fit = n('fit'), poss = n('possible')
  return (
    <section className="welcome" aria-label="Welcome">
      <div className="welcome-head">
        <div>
          <span className="mono muted">Your account is ready</span>
          <h2>{name ? `Welcome, ${name}.` : 'Welcome.'} Your project is already set up.</h2>
        </div>
        <button type="button" className="linkbtn" onClick={onClose} aria-label="Hide this message">Hide</button>
      </div>
      <div className="welcome-grid">
        <div className="wstat">
          <span className="mono muted">Your assessment</span>
          {score > 0 ? <b>{score}<small>/100</small></b> : <b>Saved</b>}
          <small>from your answers on the website</small>
        </div>
        <button type="button" className="wstat wbtn" onClick={onInvestors}>
          <span className="mono muted">Investors that match now</span>
          {matches ? <b>{fit}<small> fit</small></b> : <b>…</b>}
          <small>{matches ? `+${poss} need a little more information. See who →` : 'Matching in progress'}</small>
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
      <p className="muted small">The assessment shows how ready your deal looks. Completeness shows how much investors can already see. It grows with every answer you give the agent.</p>
      <div className="row"><button type="button" className="btn pri" onClick={onContinue}>Continue with the agent</button></div>
    </section>
  )
}
