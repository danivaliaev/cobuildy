import { useState } from 'react'
import { eurFor } from '../lib/format'
import { getLang, tr, useT } from '../i18n'
import { ErrorLine } from './ui'
import { FIELDS, GATE_NAMES, SECTIONS, derived, firstInt, isDone, parseMoney, showValue, type FieldDef, type FieldState, type Fields } from '../lib/profile'
import { errText } from '../lib/supabase'
import { isDocId } from '../lib/docs'

const SRC = (): Record<string, string> => ({ chat: tr('You · chat', 'Tú · chat'), edit: tr('You · edited', 'Tú · editado'), form: tr('From your earlier entry', 'De tu entrada anterior'), site: tr('From the website', 'De la web'), doc: tr('From a document', 'De un documento') })
const eur = (n: number | null | undefined) => eurFor(n, getLang())

function Kpis({ f }: { f: Fields }) {
  const t = useT()
  const d = derived(f)
  const k = (v: string | null, l: string, s = '') => <div className="kpi"><div className={`v ${v ? '' : 'na'}`}>{v ?? '—'}</div><div className="l">{l}</div><div className="s">{s || ' '}</div></div>
  return (
    <div className="kpis">
      {k(d.cost != null ? eur(d.cost) : null, t('Total cost', 'Coste total'), d.land != null ? t('land ', 'suelo ') + eur(d.land) : '')}
      {k(d.gdv != null ? eur(d.gdv) : null, t('Sales value (GDV)', 'Valor de venta (GDV)'))}
      {k(d.margin != null ? Math.round(d.margin * 1000) / 10 + '%' : null, t('Margin on cost', 'Margen sobre coste'), d.margin != null ? (d.margin < 0.15 ? t('thin', 'ajustado') : t('cushion', 'con colchón')) : '')}
      {k(d.ask != null ? eur(d.ask) : null, t('Capital sought', 'Capital buscado'), d.ltc != null ? Math.round(d.ltc * 100) + t('% of cost', ' % del coste') : '')}
      {k(d.eq != null ? eur(d.eq) : null, t('Your equity', 'Tu capital'), d.eqp != null ? Math.round(d.eqp * 100) + t('% of cost', ' % del coste') : '')}
    </div>
  )
}

function Row({ d, s, flash, editable, onAsk, onEdit, onOpenDoc }: {
  d: FieldDef; s: FieldState; flash: boolean; editable: boolean; onAsk: () => void; onEdit: (next: FieldState) => Promise<void>; onOpenDoc?: (docId: string) => void
}) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const sym = s.st === 'filled' ? '✓' : s.st === 'partial' ? '~' : s.st === 'unknown' ? '!' : ''
  const ic = s.st === 'filled' ? 'f' : s.st === 'partial' ? 'p' : s.st === 'unknown' ? 'u' : ''
  const open = () => { setVal(isDone(s) ? showValue(s.v) : ''); setErr(null); setEditing(true) }
  const save = async () => {
    const txt = val.trim()
    if (!txt) return
    let next: FieldState
    if (d.kind === 'money') { const n = parseMoney(txt); if (n == null) { setErr(t('Could not read an amount. Try 5.4M.', 'No he podido leer un importe. Prueba con 5,4 millones.')); return } next = { st: 'filled', v: eur(n), n, src: 'edit' } }
    else if (d.kind === 'number') { const n = firstInt(txt); if (n == null) { setErr(t('Could not read a number.', 'No he podido leer un número.')); return } next = { st: 'filled', v: `${n} months`, n, src: 'edit' } }
    else next = { st: 'filled', v: txt.slice(0, 80), n: null, src: 'edit' }
    try { await onEdit(next); setEditing(false) } catch (e) { setErr(errText(e)) }
  }
  return (
    <div className={`prow ${flash ? 'flash' : ''}`} id={`f-${d.key}`}>
      <span className={`pic ${ic}`} aria-hidden="true">{sym}</span>
      <span className="plab">{d.label}{d.gate > 1 && s.st !== 'filled' && <span className="psrc">{t('needed for', 'necesario para')} {GATE_NAMES[d.gate].toLowerCase()}</span>}</span>
      <span className="pval">
        {editing ? (
          <span className="row">
            <input autoFocus className="sp" value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') setEditing(false) }} aria-label={d.label} />
            <button className="btn sm pri" type="button" onClick={() => void save()}>{t('Save', 'Guardar')}</button>
            <button className="btn sm" type="button" onClick={() => setEditing(false)}>{t('Cancel', 'Cancelar')}</button>
          </span>
        ) : isDone(s) ? <>{showValue(s.v)}<span className={`psrc${s.from ? ' fromdoc' : ''}`}>{s.from
          ? <><span>{t('From', 'De')}</span>{onOpenDoc && isDocId(s.from.doc) ? <button type="button" className="linkbtn" onClick={() => onOpenDoc(s.from!.doc)} title={s.from.name}>{s.from.name}</button> : <span>{s.from.name}</span>}{s.from.ref && <span>· {s.from.ref}</span>}</>
          : SRC()[s.src] ?? ''}</span></> : <span className="muted">{s.st === 'unknown' ? t('Not available yet', 'Aún no disponible') : t('Not asked yet', 'Aún sin preguntar')}</span>}
        {err && <ErrorLine error={err} />}
      </span>
      {editable && !editing && (
        <span className="pact">
          {s.st !== 'filled' && <button className="chipbtn" type="button" onClick={onAsk}>{t('Ask agent', 'Preguntar al agente')}</button>}
          <button className="chipbtn" type="button" onClick={open}>{isDone(s) ? t('Edit', 'Editar') : t('Enter', 'Introducir')}</button>
        </span>
      )}
    </div>
  )
}

export function ProfileView({ fields, flash, editable, onAsk, onEdit, onOpenDoc }: {
  fields: Fields; flash: string[]; editable: boolean; onAsk: (key: string) => void; onEdit: (key: string, next: FieldState) => Promise<void>; onOpenDoc?: (docId: string) => void
}) {
  const t = useT()
  return (
    <section className="card profilecard" aria-label={t('Project profile', 'Perfil del proyecto')}>
      <div className="row"><h2>{t('Project profile', 'Perfil del proyecto')}</h2><span className="sp" /><span className="pill plan">{t('Fills as you talk', 'Se rellena mientras hablas')}</span></div>
      <Kpis f={fields} />
      {SECTIONS.map(sec => {
        const fs = FIELDS.filter(d => d.section === sec.id)
        const done = fs.filter(d => fields[d.key]?.st === 'filled').length
        return (
          <section className="psec" key={sec.id} id={`s-${sec.id}`}>
            <div className="psec-h"><h3>{sec.title}</h3><span className="bar sm"><i style={{ width: `${(done / fs.length) * 100}%` }} /></span><span className="mono">{done}/{fs.length}</span></div>
            {fs.map(d => <Row key={d.key} d={d} s={fields[d.key]} flash={flash.includes(d.key)} editable={editable} onAsk={() => onAsk(d.key)} onEdit={n => onEdit(d.key, n)} onOpenDoc={onOpenDoc} />)}
          </section>
        )
      })}
    </section>
  )
}
