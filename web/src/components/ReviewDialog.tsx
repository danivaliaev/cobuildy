import { useEffect, useMemo, useRef, useState } from 'react'
import { AmountInput } from './AmountInput'
import { ErrorLine, Pill, useAction } from './ui'
import { catsFor, money, newLineId, totals, budgetFlags, type BudgetLine, type StrategyCode } from '../lib/budget'
import { DOC_LABEL, applyReview, buildReview, pickBudget, type Applied, type ReadItem } from '../lib/ingest'
import { FK, showValue, type Fields } from '../lib/profile'
import { downloadDoc } from '../lib/docs'
import { useT } from '../i18n'

/**
 * Everything the agent read, for the developer to check. Nothing is saved until Save is pressed:
 * a value that disagrees with the profile starts unticked, and every saved value keeps its file and place.
 */
export function ReviewDialog({ items, fields, strategy, existingLines, onSave, onIgnore, onClose }: {
  items: ReadItem[]; fields: Fields; strategy: StrategyCode | null; existingLines: number
  onSave: (applied: Applied, docIds: string[]) => Promise<void>; onIgnore: (docId: string) => Promise<void>; onClose: () => void
}) {
  const t0 = useT()
  const facts = useMemo(() => buildReview(items, fields), [items, fields])
  const cand = useMemo(() => pickBudget(items, strategy), [items, strategy])
  const [ticked, setTicked] = useState<Record<string, boolean>>({})
  const [lines, setLines] = useState<BudgetLine[]>(cand?.lines ?? [])
  const [useBudget, setUseBudget] = useState(true)
  const act = useAction()
  const first = useRef<HTMLDivElement>(null)
  useEffect(() => { setTicked(Object.fromEntries(facts.map(f => [f.id, f.checked]))) }, [facts])
  useEffect(() => { setLines(cand?.lines ?? []) }, [cand])
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', k)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    first.current?.focus()
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = prev }
  }, [onClose])

  const cats = catsFor(strategy)
  const t = totals(lines, strategy)
  const chosen = facts.filter(f => ticked[f.id])
  const budgetOn = Boolean(cand) && useBudget && lines.length > 0
  const count = chosen.length + (budgetOn ? 1 : 0)
  const setLine = (id: string, p: Partial<BudgetLine>) => setLines(a => a.map(l => (l.id === id ? { ...l, ...p } : l)))
  const docIds = items.map(i => i.docId)

  const save = () => void act.run(async () => {
    const applied = applyReview(fields, chosen, budgetOn && cand ? { docId: cand.docId, docName: cand.docName, lines } : null, strategy)
    await onSave(applied, docIds)
  })
  const open = (i: ReadItem) => { if (i.path) void act.run(() => downloadDoc(i.path!, i.docName)) }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={t0('Review what I found', 'Revisar lo que he encontrado')} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="card wide review" ref={first} tabIndex={-1}>
        <div className="row"><h2>{t0('Review what I found', 'Revisar lo que he encontrado')}</h2><span className="sp" /><button type="button" className="linkbtn" onClick={onClose}>{t0('Not now', 'Ahora no')}</button></div>
        <p className="muted">{t0('Nothing is saved until you press Save. Every value keeps the file and the place it came from, so you can trace it later. Values that differ from what you already told me start unticked.', 'No se guarda nada hasta que pulses Guardar. Cada valor conserva el archivo y el lugar de donde viene, para que puedas rastrearlo. Los valores que difieren de lo que ya me contaste empiezan sin marcar.')}</p>
        <ErrorLine error={act.error} />

        {items.map(i => (
          <div className="rv-doc" key={i.docId}>
            <div className="row">
              <b>{i.docName}</b><Pill tone="plan">{DOC_LABEL[i.ex.doc_type] ?? t0('Document', 'Documento')}</Pill><span className="sp" />
              {i.path && <button type="button" className="linkbtn" onClick={() => open(i)}>{t0('Open file', 'Abrir archivo')}</button>}
              <button type="button" className="linkbtn" disabled={act.busy} onClick={() => void act.run(() => onIgnore(i.docId))}>{t0('Ignore this file', 'Ignorar este archivo')}</button>
            </div>
            {i.ex.summary && <div className="muted small">{i.ex.summary}</div>}
            {i.ex.warnings.map(w => <div key={w} className="rv-warn">⚠ {w}</div>)}
          </div>))}

        {facts.length > 0 && (
          <div className="scrollx"><table className="rv">
            <thead><tr><th /><th>{t0('Field', 'Campo')}</th><th>{t0('What I found', 'Lo que he encontrado')}</th><th>{t0('Now in your profile', 'Ahora en tu perfil')}</th><th>{t0('Where', 'Dónde')}</th></tr></thead>
            <tbody>{facts.map(f => (
              <tr key={f.id} className={ticked[f.id] ? '' : 'off'}>
                <td><input type="checkbox" aria-label={t0(`Save ${FK[f.fact.key].label}`, `Guardar ${FK[f.fact.key].label}`)} checked={Boolean(ticked[f.id])} onChange={e => setTicked({ ...ticked, [f.id]: e.target.checked })} /></td>
                <td>{FK[f.fact.key].label}</td>
                <td><b>{f.fact.display || (f.fact.amount != null ? money(f.fact.amount) : '')}</b>{f.fact.status === 'partial' && <span className="muted small"> · {t0('partly met', 'cumplido en parte')}</span>}
                  {f.fact.confidence !== 'high' && <> <Pill tone={f.fact.confidence === 'low' ? 'warn' : undefined}>{f.fact.confidence === 'low' ? t0('unsure', 'dudoso') : t0('likely', 'probable')}</Pill></>}</td>
                <td className="muted">{f.current ? showValue(f.current.v) : '—'}</td>
                <td className="muted small" title={f.fact.quote}>{f.docName} · {f.fact.ref || t0('in the file', 'en el archivo')}{f.fact.quote && <div className="rv-q">“{f.fact.quote}”</div>}</td>
              </tr>))}</tbody>
          </table></div>)}

        {cand && (
          <div className="rv-budget">
            <label className="chk"><input type="checkbox" checked={useBudget} onChange={e => setUseBudget(e.target.checked)} /><b>{t0('Use the cost budget from', 'Usar el presupuesto de costes de')} {cand.docName}</b></label>
            {useBudget && <>
              <p className="muted small">{lines.length} {t0('lines', 'partidas')}. {t0('I filed each one under a category, check them and fix anything that is off.', 'He archivado cada una en una categoría; revísalas y corrige lo que no cuadre.')}{existingLines > 0 ? t0(` This replaces the budget you have now (${existingLines} lines).`, ` Esto sustituye al presupuesto que tienes ahora (${existingLines} partidas).`) : ''} {t0('It also sets your total cost and the “line-by-line budget” answer.', 'También fija tu coste total y la respuesta «presupuesto por partidas».')}</p>
              <div className="scrollx"><table className="rv">
                <thead><tr><th>{t0('Line in the file', 'Partida del archivo')}</th><th>{t0('Category', 'Categoría')}</th><th>{t0('Amount, €', 'Importe, €')}</th>{strategy === 'wip' && <th>{t0('Spent, €', 'Gastado, €')}</th>}<th>{t0('Where', 'Dónde')}</th><th /></tr></thead>
                <tbody>{lines.map(l => (
                  <tr key={l.id}>
                    <td><input aria-label={t0('Line name', 'Nombre de la partida')} value={l.label} maxLength={120} onChange={e => setLine(l.id, { label: e.target.value })} /></td>
                    <td><select aria-label={t0(`Category of ${l.label}`, `Categoría de ${l.label}`)} value={l.cat} onChange={e => setLine(l.id, { cat: e.target.value })}>{cats.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></td>
                    <td><AmountInput value={l.amount} label={t0(`Amount of ${l.label}`, `Importe de ${l.label}`)} onChange={n => setLine(l.id, { amount: n ?? 0 })} /></td>
                    {strategy === 'wip' && <td><AmountInput value={l.spent ?? null} label={t0(`Spent on ${l.label}`, `Gastado en ${l.label}`)} onChange={n => setLine(l.id, { spent: n })} /></td>}
                    <td className="muted small">{l.from?.ref}</td>
                    <td><button type="button" className="linkbtn" aria-label={t0(`Remove ${l.label}`, `Quitar ${l.label}`)} onClick={() => setLines(a => a.filter(x => x.id !== l.id))}>{t0('Remove', 'Quitar')}</button></td>
                  </tr>))}</tbody>
              </table></div>
              <div className="row"><button type="button" className="btn sm" onClick={() => setLines(a => [...a, { id: newLineId(), cat: 'other', label: t0('New line', 'Nueva partida'), amount: 0 }])}>{t0('Add a line', 'Añadir una partida')}</button><span className="sp" />
                <span>{t0('Development cost', 'Coste de la promoción')} <b>{money(t.cost)}</b>{t.sales > 0 && <span className="muted"> · {t0('sales costs', 'costes de venta')} {money(t.sales)} {t0('counted separately', 'contados aparte')}</span>}
                  {cand.statedTotal != null && <span className="muted"> · {t0('the file states', 'el archivo indica')} {money(cand.statedTotal)}</span>}</span></div>
              {budgetFlags(lines, strategy).map(f => <div key={f} className="rv-warn">⚠ {f}</div>)}
            </>}
          </div>)}

        {facts.length === 0 && !cand && <div className="empty">{t0(`I found nothing new to add from ${items.length === 1 ? 'this file' : 'these files'}. ${items.length === 1 ? 'It stays' : 'They stay'} in your data room.`, `No he encontrado nada nuevo que añadir en ${items.length === 1 ? 'este archivo' : 'estos archivos'}. ${items.length === 1 ? 'Se queda' : 'Se quedan'} en tu data room.`)}</div>}

        <div className="row">
          <button type="button" className="btn pri" disabled={act.busy} onClick={save}>{count > 0 ? t0(`Save ${count} ${count === 1 ? 'change' : 'changes'}`, `Guardar ${count} ${count === 1 ? 'cambio' : 'cambios'}`) : t0('Done', 'Hecho')}</button>
          <button type="button" className="btn" disabled={act.busy} onClick={onClose}>{t0('Not now', 'Ahora no')}</button>
        </div>
      </div>
    </div>
  )
}
