import { ErrorLine, Pill } from './ui'
import { FIELDS, GATE_NAMES, SECTIONS, calc, type Fields } from '../lib/profile'

const STEPS = ['Teaser', 'Outreach', 'Data room']

export function ReadinessPanel({ fields, status, dbStage, onAsk, onSubmit, busy, error }: {
  fields: Fields; status: string; dbStage: number; onAsk: (key: string) => void; onSubmit: () => void; busy: boolean; error: string | null
}) {
  const c = calc(fields)
  const verdict = c.stage === 0 ? 'Not ready for a teaser yet' : c.stage === 1 ? 'Teaser-ready' : c.stage === 2 ? 'Ready for lender outreach' : 'Data room complete'
  const draft = status === 'draft'
  // Only the teaser gate is enforced, and only before the teaser is approved. Later stages are advice.
  const hard = c.next === 1 && (status === 'draft' || status === 'teaser_review')
  const missing = FIELDS.filter(d => d.gate === 1 && fields[d.key]?.st !== 'filled')
  return (
    <aside className="card readycard" aria-label="Readiness">
      <div className="row"><h2>Readiness</h2><span className="sp" /><span className="mono">{c.score}%</span></div>
      <div className="bar"><i style={{ width: `${c.score}%` }} /></div>
      <div><b>{verdict}</b><div className="muted">{c.known} of {FIELDS.length} fields recorded · {c.filled} fully met</div></div>
      <div className="ladder">{STEPS.map((s, i) => <div key={s} className={c.stage >= i + 1 ? 'on' : i === c.stage ? 'now' : ''}><i />{s}</div>)}</div>

      {draft ? (
        <div className="blk">
          <button className="btn pri" disabled={busy || c.stage < 1 || dbStage < 1} onClick={onSubmit}>Submit teaser for review</button>
          {c.stage < 1 ? (
            <span className="muted">Still needed for the teaser: {missing.map(d => d.label.toLowerCase()).join(', ')}.</span>
          ) : dbStage < 1 ? <span className="muted">Saving…</span> : <span className="muted">Cobuildy reviews the teaser before any investor sees it.</span>}
          <ErrorLine error={error} />
        </div>
      ) : <div className="blk"><Pill tone="good">{status.replace('_', ' ')}</Pill></div>}

      {c.blockers.length > 0 && (
        <div className="blk">
          <span className="mono">{hard ? `Needed for ${GATE_NAMES[c.next].toLowerCase()}` : 'Next to strengthen your pitch'} · {c.blockers.length}</span>
          {c.blockers.slice(0, 7).map(d => (
            <button key={d.key} type="button" className="item" onClick={() => onAsk(d.key)}>
              <b>{d.label}</b><span className="muted">{d.why}</span>
            </button>
          ))}
        </div>
      )}

      <div className="blk">
        <span className="mono">By section</span>
        {SECTIONS.map(sec => {
          const fs = FIELDS.filter(d => d.section === sec.id)
          const n = fs.filter(d => fields[d.key]?.st === 'filled').length
          return (
            <a key={sec.id} className="sbar" href={`#s-${sec.id}`}>
              <span>{sec.title}</span><span className="bar sm"><i style={{ width: `${(n / fs.length) * 100}%` }} /></span><em>{n}/{fs.length}</em>
            </a>
          )
        })}
      </div>
    </aside>
  )
}
