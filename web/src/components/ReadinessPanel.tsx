import { useEffect, useRef, useState } from 'react'
import { ErrorLine, Pill } from './ui'
import { FIELDS, calc, type FieldDef, type Fields } from '../lib/profile'

/** The three stages of a project. A stage opens once every field of its gate is fully met. */
const STAGES = [
  { n: 1, name: 'Teaser', what: 'Opens investor matching. Cobuildy reviews it before any investor sees it.' },
  { n: 2, name: 'Outreach', what: 'What lenders and investors want to see before they take a call.' },
  { n: 3, name: 'Data room', what: 'The detail and documents for due diligence.' },
]

const MARK: Record<string, { sym: string; label: string }> = {
  filled: { sym: '✓', label: 'Done' }, partial: { sym: '◐', label: 'Needs more detail' },
  unknown: { sym: '?', label: 'Not available yet' }, empty: { sym: '', label: 'To do' },
}

export function ReadinessPanel({ fields, status, dbStage, onAsk, onSubmit, busy, error }: {
  fields: Fields; status: string; dbStage: number; onAsk: (key: string) => void; onSubmit: () => void; busy: boolean; error: string | null
}) {
  const c = calc(fields)
  const draft = status === 'draft'
  const cur = Math.min(c.stage + 1, 3)
  const [open, setOpen] = useState<number | null>(null) // null follows the current stage, 0 means all closed
  const shown = open ?? cur
  const st = (d: FieldDef) => fields[d.key]?.st ?? 'empty'
  const stageFields = (n: number) => FIELDS.filter(d => d.gate === n)
  const done = (n: number) => stageFields(n).filter(d => st(d) === 'filled').length

  // A short confirmation each time a field is completed.
  const prev = useRef<number | null>(null)
  const [note, setNote] = useState('')
  useEffect(() => {
    if (prev.current !== null && c.filled > prev.current) {
      const s = STAGES[cur - 1]
      setNote(c.stage >= cur ? `${s.name} complete.` : `Saved. ${done(cur)} of ${stageFields(cur).length} done for your ${s.name.toLowerCase()}.`)
      const t = setTimeout(() => setNote(''), 4000)
      prev.current = c.filled
      return () => clearTimeout(t)
    }
    prev.current = c.filled
  }, [c.filled]) // eslint-disable-line react-hooks/exhaustive-deps

  const curFields = stageFields(cur)
  const nextUp = curFields.find(d => st(d) === 'empty') ?? curFields.find(d => st(d) !== 'filled')
  const total = c.stage >= 3 ? 0 : stageFields(cur).length

  return (
    <aside className="card readycard path" aria-label="Your path">
      <div className="row"><h2>Your path</h2><span className="sp" /><span className="mono">{c.score}%</span></div>
      <div className="bar"><i style={{ width: `${c.score}%` }} /></div>
      <div className="note" role="status" aria-live="polite">{note}</div>

      {STAGES.map(s => {
        const fs = stageFields(s.n), n = done(s.n)
        const state = c.stage >= s.n ? 'done' : s.n === cur ? 'now' : 'next'
        const isOpen = shown === s.n
        return (
          <section key={s.n} className={`stg ${state}`}>
            <button type="button" className="stg-h" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? 0 : s.n)}>
              <span className="stg-n" aria-hidden="true">{state === 'done' ? '✓' : s.n}</span>
              <span className="stg-t"><b>{s.name}</b><em>{state === 'done' ? 'Done' : state === 'now' ? 'In progress' : 'Up next'}</em></span>
              <span className="stg-c">{n}/{fs.length}</span>
            </button>
            <div className="bar sm"><i style={{ width: `${(n / fs.length) * 100}%` }} /></div>
            {isOpen && (
              <div className="stg-b">
                <p className="muted">{s.what}</p>
                {s.n === cur && nextUp && (
                  <button type="button" className="nextcard" onClick={() => onAsk(nextUp.key)}>
                    <span className="mono">Next step</span>
                    <b>{nextUp.label}</b>
                    <span>{nextUp.why}</span>
                    <span className="go">{nextUp.doc ? 'Answer now · document needed →' : 'Answer now →'}</span>
                  </button>)}
                <ul className="frows">
                  {fs.map(d => {
                    const k = st(d), m = MARK[k]
                    if (d === nextUp && s.n === cur) return null
                    return (
                      <li key={d.key}>
                        <button type="button" className={`frow ${k}`} onClick={() => onAsk(d.key)} aria-label={`${d.label}: ${m.label}`}>
                          <i aria-hidden="true">{m.sym}</i>
                          <span><b>{d.label}</b>{(k === 'filled' || k === 'partial') && fields[d.key]?.v
                            ? <em>{fields[d.key].v}</em>
                            : d.doc ? <em>Needs: {d.doc}</em> : null}</span>
                        </button>
                      </li>)
                  })}
                </ul>
              </div>)}
          </section>)
      })}

      {draft ? (
        <div className={`blk submit${c.stage >= 1 ? ' ready' : ''}`}>
          {c.stage >= 1 && <b className="ready-t">Teaser ready. You can submit it now.</b>}
          <button className="btn pri" disabled={busy || c.stage < 1 || dbStage < 1} onClick={onSubmit}>Submit teaser for review</button>
          {c.stage < 1
            ? <span className="muted">{done(1)} of {stageFields(1).length} teaser fields done. Finish them to submit.</span>
            : dbStage < 1 ? <span className="muted">Saving…</span> : <span className="muted">Cobuildy reviews the teaser before any investor sees it.</span>}
          <ErrorLine error={error} />
        </div>
      ) : <div className="blk"><Pill tone="good">{status.replace('_', ' ')}</Pill></div>}
      {c.stage >= 3 && total === 0 && <div className="muted">Every field is complete.</div>}
    </aside>
  )
}
