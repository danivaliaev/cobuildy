import { useState } from 'react'
import { eur } from '../lib/format'
import { ErrorLine } from './ui'
import { FIELDS, GATE_NAMES, SECTIONS, derived, firstInt, isDone, parseMoney, type FieldDef, type FieldState, type Fields } from '../lib/profile'
import { errText } from '../lib/supabase'

const SRC: Record<string, string> = { chat: 'You · chat', edit: 'You · edited', form: 'From your earlier entry', site: 'From the website' }

function Kpis({ f }: { f: Fields }) {
  const d = derived(f)
  const k = (v: string | null, l: string, s = '') => <div className="kpi"><div className={`v ${v ? '' : 'na'}`}>{v ?? '—'}</div><div className="l">{l}</div><div className="s">{s || ' '}</div></div>
  return (
    <div className="kpis">
      {k(d.cost != null ? eur(d.cost) : null, 'Total cost', d.land != null ? 'land ' + eur(d.land) : '')}
      {k(d.gdv != null ? eur(d.gdv) : null, 'Sales value (GDV)')}
      {k(d.margin != null ? Math.round(d.margin * 1000) / 10 + '%' : null, 'Margin on cost', d.margin != null ? (d.margin < 0.15 ? 'thin' : 'cushion') : '')}
      {k(d.ask != null ? eur(d.ask) : null, 'Capital sought', d.ltc != null ? Math.round(d.ltc * 100) + '% of cost' : '')}
      {k(d.eq != null ? eur(d.eq) : null, 'Your equity', d.eqp != null ? Math.round(d.eqp * 100) + '% of cost' : '')}
    </div>
  )
}

function Row({ d, s, flash, editable, onAsk, onEdit }: {
  d: FieldDef; s: FieldState; flash: boolean; editable: boolean; onAsk: () => void; onEdit: (next: FieldState) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const sym = s.st === 'filled' ? '✓' : s.st === 'partial' ? '~' : s.st === 'unknown' ? '!' : ''
  const ic = s.st === 'filled' ? 'f' : s.st === 'partial' ? 'p' : s.st === 'unknown' ? 'u' : ''
  const open = () => { setVal(isDone(s) ? s.v : ''); setErr(null); setEditing(true) }
  const save = async () => {
    const t = val.trim()
    if (!t) return
    let next: FieldState
    if (d.kind === 'money') { const n = parseMoney(t); if (n == null) { setErr('Could not read an amount. Try 5.4M.'); return } next = { st: 'filled', v: eur(n), n, src: 'edit' } }
    else if (d.kind === 'number') { const n = firstInt(t); if (n == null) { setErr('Could not read a number.'); return } next = { st: 'filled', v: `${n} months`, n, src: 'edit' } }
    else next = { st: 'filled', v: t.slice(0, 80), n: null, src: 'edit' }
    try { await onEdit(next); setEditing(false) } catch (e) { setErr(errText(e)) }
  }
  return (
    <div className={`prow ${flash ? 'flash' : ''}`} id={`f-${d.key}`}>
      <span className={`pic ${ic}`} aria-hidden="true">{sym}</span>
      <span className="plab">{d.label}{d.gate > 1 && s.st !== 'filled' && <span className="psrc">needed for {GATE_NAMES[d.gate].toLowerCase()}</span>}</span>
      <span className="pval">
        {editing ? (
          <span className="row">
            <input autoFocus className="sp" value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') setEditing(false) }} aria-label={d.label} />
            <button className="btn sm pri" type="button" onClick={() => void save()}>Save</button>
            <button className="btn sm" type="button" onClick={() => setEditing(false)}>Cancel</button>
          </span>
        ) : isDone(s) ? <>{s.v}<span className="psrc">{SRC[s.src] ?? ''}</span></> : <span className="muted">{s.st === 'unknown' ? 'Not available yet' : 'Not asked yet'}</span>}
        {(s.st === 'partial' || s.st === 'unknown') && !editing && <span className="pgap">{s.st === 'unknown' ? 'Gap' : 'Partly met'} · next: {d.task}</span>}
        {err && <ErrorLine error={err} />}
      </span>
      {editable && !editing && (
        <span className="pact">
          {s.st !== 'filled' && <button className="chipbtn" type="button" onClick={onAsk}>Ask agent</button>}
          <button className="chipbtn" type="button" onClick={open}>{isDone(s) ? 'Edit' : 'Enter'}</button>
        </span>
      )}
    </div>
  )
}

export function ProfileView({ fields, flash, editable, onAsk, onEdit }: {
  fields: Fields; flash: string[]; editable: boolean; onAsk: (key: string) => void; onEdit: (key: string, next: FieldState) => Promise<void>
}) {
  return (
    <section className="card profilecard" aria-label="Project profile">
      <div className="row"><h2>Project profile</h2><span className="sp" /><span className="pill plan">Fills as you talk</span></div>
      <Kpis f={fields} />
      {SECTIONS.map(sec => {
        const fs = FIELDS.filter(d => d.section === sec.id)
        const done = fs.filter(d => fields[d.key]?.st === 'filled').length
        return (
          <section className="psec" key={sec.id} id={`s-${sec.id}`}>
            <div className="psec-h"><h3>{sec.title}</h3><span className="bar sm"><i style={{ width: `${(done / fs.length) * 100}%` }} /></span><span className="mono">{done}/{fs.length}</span></div>
            {fs.map(d => <Row key={d.key} d={d} s={fields[d.key]} flash={flash.includes(d.key)} editable={editable} onAsk={() => onAsk(d.key)} onEdit={n => onEdit(d.key, n)} />)}
          </section>
        )
      })}
    </section>
  )
}
