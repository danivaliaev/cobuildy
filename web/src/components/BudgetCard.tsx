import { AmountInput } from './AmountInput'
import { ErrorLine, useAction } from './ui'
import { budgetFlags, catsFor, money, newLineId, pctText, totals, type BudgetLine, type StrategyCode } from '../lib/budget'
import { isDone, type Fields } from '../lib/profile'
import { isDocId } from '../lib/docs'
import { useT } from '../i18n'

/** The development budget as a table the developer can fix line by line. The total cost on the profile follows it. */
export function BudgetCard({ strategy, lines, fields, editable, onChange, onUseTotal, onOpenDoc }: {
  strategy: StrategyCode | null; lines: BudgetLine[]; fields: Fields; editable: boolean
  onChange: (lines: BudgetLine[]) => Promise<void>; onUseTotal: () => Promise<void>; onOpenDoc: (docId: string) => void
}) {
  const t0 = useT()
  const act = useAction()
  const cats = catsFor(strategy)
  const order = (c: string) => { const i = cats.findIndex(x => x.id === c); return i < 0 ? 99 : i }
  const sorted = [...lines].sort((a, b) => order(a.cat) - order(b.cat))
  const t = totals(lines, strategy)
  const wip = strategy === 'wip'
  const edit = (id: string, p: Partial<BudgetLine>) => void act.run(() => onChange(lines.map(l => (l.id === id ? { ...l, ...p, edited: true } : l))))
  const profileCost = isDone(fields.f_cost ?? { st: 'empty', v: '', n: null, src: '' }) ? fields.f_cost.n : null
  const differs = lines.length > 0 && profileCost != null && Math.abs(profileCost - t.cost) / Math.max(t.cost, 1) > 0.01

  return (
    <section className="card budgetcard" aria-label={t0('Development budget', 'Presupuesto de la promoción')}>
      <div className="row"><h2>{t0('Development budget', 'Presupuesto de la promoción')}</h2><span className="sp" />{lines.length > 0 && <span className="mono">{lines.length} {t0('lines', 'partidas')}</span>}</div>
      {lines.length === 0
        ? <p className="muted">{t0('No budget yet. Drop your cost budget (Excel, PDF or Word) in the card above and I file every line under a category, or add the lines yourself.', 'Aún no hay presupuesto. Suelta tu presupuesto de costes (Excel, PDF o Word) en la tarjeta de arriba y archivo cada partida en su categoría, o añade las partidas tú mismo.')}</p>
        : <p className="muted">{t0('Each line sits under a category investors recognise. Sales costs are shown below the total, because they come off the sales value and are not part of the development cost.', 'Cada partida está bajo una categoría que los inversores reconocen. Los costes de venta se muestran bajo el total, porque se restan del valor de venta y no forman parte del coste de la promoción.')}</p>}
      <ErrorLine error={act.error} />
      {lines.length > 0 && (
        <div className="scrollx"><table className="rv bt">
          <thead><tr><th>{t0('Category', 'Categoría')}</th><th>{t0('Line', 'Partida')}</th><th>{t0('Amount, €', 'Importe, €')}</th><th>{t0('% of cost', '% del coste')}</th>{wip && <><th>{t0('Spent, €', 'Gastado, €')}</th><th>{t0('Left, €', 'Pendiente, €')}</th></>}<th>{t0('Source', 'Origen')}</th>{editable && <th />}</tr></thead>
          <tbody>{sorted.map(l => {
            const inCost = cats.find(c => c.id === l.cat)?.inCost !== false
            return (
              <tr key={l.id}>
                <td>{editable ? <select aria-label={t0(`Category of ${l.label}`, `Categoría de ${l.label}`)} value={l.cat} disabled={act.busy} onChange={e => edit(l.id, { cat: e.target.value })}>{cats.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select> : cats.find(c => c.id === l.cat)?.label}</td>
                <td>{editable ? <input aria-label={t0('Line name', 'Nombre de la partida')} defaultValue={l.label} maxLength={120} disabled={act.busy} onBlur={e => { if (e.target.value.trim() && e.target.value !== l.label) edit(l.id, { label: e.target.value.trim() }) }} /> : l.label}</td>
                <td>{editable ? <AmountInput value={l.amount} label={t0(`Amount of ${l.label}`, `Importe de ${l.label}`)} disabled={act.busy} onChange={n => edit(l.id, { amount: n ?? 0 })} /> : money(l.amount)}</td>
                <td className="muted">{inCost && t.cost > 0 ? pctText(l.amount / t.cost) : '—'}</td>
                {wip && <>
                  <td>{editable ? <AmountInput value={l.spent ?? null} label={t0(`Spent on ${l.label}`, `Gastado en ${l.label}`)} disabled={act.busy} onChange={n => edit(l.id, { spent: n })} /> : money(l.spent)}</td>
                  <td className="muted">{money(Math.max(0, l.amount - (l.spent ?? 0)))}</td></>}
                <td className="muted small">{l.from ? (isDocId(l.from.doc) ? <button type="button" className="linkbtn" onClick={() => onOpenDoc(l.from!.doc)}>{l.from.name} · {l.from.ref}</button> : `${l.from.name} · ${l.from.ref}`) : l.edited ? t0('You', 'Tú') : ''}</td>
                {editable && <td><button type="button" className="linkbtn" disabled={act.busy} aria-label={t0(`Remove ${l.label}`, `Quitar ${l.label}`)} onClick={() => void act.run(() => onChange(lines.filter(x => x.id !== l.id)))}>{t0('Remove', 'Quitar')}</button></td>}
              </tr>)
          })}</tbody>
          <tfoot>
            <tr><td colSpan={2}><b>{t0('Development cost', 'Coste de la promoción')}</b></td><td><b>{money(t.cost)}</b></td><td />{wip && <><td><b>{money(t.spent)}</b></td><td><b>{money(Math.max(0, t.cost - t.spent))}</b></td></>}<td colSpan={editable ? 2 : 1} /></tr>
            {t.sales > 0 && <tr><td colSpan={2} className="muted">{t0('Sales costs (outside the development cost)', 'Costes de venta (fuera del coste de la promoción)')}</td><td className="muted">{money(t.sales)}</td><td colSpan={wip ? 5 : 3} /></tr>}
          </tfoot>
        </table></div>)}
      {budgetFlags(lines, strategy).map(f => <div key={f} className="rv-warn">⚠ {f}</div>)}
      {differs && (
        <div className="rv-warn">{t0('The total cost on your profile', 'El coste total de tu perfil')} ({money(profileCost)}) {t0('differs from this budget', 'difiere de este presupuesto')} ({money(t.cost)}).{' '}
          {editable && <button type="button" className="linkbtn" disabled={act.busy} onClick={() => void act.run(onUseTotal)}>{t0('Use the budget total', 'Usar el total del presupuesto')}</button>}</div>)}
      {editable && <div className="row"><button type="button" className="btn sm" disabled={act.busy} onClick={() => void act.run(() => onChange([...lines, { id: newLineId(), cat: strategy === 'refurb' ? 'works' : 'build', label: t0('New line', 'Nueva partida'), amount: 0, edited: true }]))}>{t0('Add a line', 'Añadir una partida')}</button></div>}
    </section>
  )
}
