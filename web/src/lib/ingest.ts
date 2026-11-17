import { budgetUpdates, isCat, newLineId, type BudgetLine, type StrategyCode } from './budget'
import { FK, applyUpdates, isDone, type Fields, type Source, type Update } from './profile'
import { pick } from '../i18n'

/** What the document reader sends back for one file. Nothing in it is saved until the developer reviews it. */
export interface ExFact { key: string; status: 'filled' | 'partial' | 'unknown'; display: string; amount: number | null; ref: string; quote: string; confidence: 'high' | 'medium' | 'low' }
export interface ExLine { label: string; cat: string; amount: number; spent: number | null; ref: string }
export interface Extraction {
  doc_type: string; summary: string; slot: string | null; facts: ExFact[]
  budget: { lines: ExLine[]; stated_total: number | null } | null; warnings: string[]
}
export type ReadStatus = 'reading' | 'ready' | 'applied' | 'dismissed' | 'failed'
export interface DocRead { doc_id: string; project_id: string; status: ReadStatus; doc_type: string | null; result: Extraction | null; error: string | null; updated_at: string }

export const DOC_LABEL = pick<Record<string, string>>({
  budget: 'Cost budget', financial_model: 'Financial model', nota_simple: 'Nota simple / land registry extract', planning_certificate: 'Planning certificate',
  building_licence: 'Building licence', basic_project: 'Basic project', build_contract: 'Build contract', track_record: 'Track record', company_docs: 'Company documents',
  equity_proof: 'Proof of equity', comparables: 'Comparable sales', appraisal: 'Valuation', contractor_quote: 'Contractor quote', other: 'Other document',
}, {
  budget: 'Presupuesto de costes', financial_model: 'Modelo financiero', nota_simple: 'Nota simple / extracto del Registro', planning_certificate: 'Certificado urbanístico',
  building_licence: 'Licencia de obra', basic_project: 'Proyecto básico', build_contract: 'Contrato de obra', track_record: 'Trayectoria', company_docs: 'Documentos de la empresa',
  equity_proof: 'Justificante de capital', comparables: 'Ventas comparables', appraisal: 'Tasación', contractor_quote: 'Oferta del constructor', other: 'Otro documento',
})

/** A read that started and never finished (the page was closed, the request died) is shown as failed after this long. */
export const STALE_MS = 4 * 60 * 1000
export const isStale = (r: Pick<DocRead, 'status' | 'updated_at'>, now = Date.now()) => r.status === 'reading' && now - new Date(r.updated_at).getTime() > STALE_MS

export interface ReadItem { docId: string; docName: string; path?: string | null; ex: Extraction }

export interface ReviewFact { id: string; docId: string; docName: string; fact: ExFact; current: FieldState_ | null; kind: 'new' | 'change'; checked: boolean }
type FieldState_ = Fields[string]

const norm = (s: string) => s.toLowerCase().replace(/[\s€,.]/g, '')
/** The same answer as the one on file: nothing to review. */
const same = (cur: FieldState_, f: ExFact) => isDone(cur) && cur.st === f.status && (f.amount != null && cur.n != null ? Math.round(cur.n) === Math.round(f.amount) : norm(cur.v) === norm(f.display))

/** The facts to put in front of the developer. A fact that agrees with the profile is left out; one that disagrees starts unticked. */
export function buildReview(items: ReadItem[], fields: Fields): ReviewFact[] {
  const out: ReviewFact[] = []
  const taken = new Set<string>()
  const hasBudget = (it: ReadItem) => (it.ex.budget?.lines.length ?? 0) > 0
  for (const it of items) {
    for (const f of it.ex.facts) {
      if (!FK[f.key] || f.status === 'unknown') continue
      if (hasBudget(it) && (f.key === 'f_cost' || f.key === 'f_budget')) continue // worked out from the budget lines instead
      const cur = fields[f.key] && isDone(fields[f.key]) ? fields[f.key] : null
      if (cur && same(cur, f)) continue
      const dup = taken.has(f.key)
      taken.add(f.key)
      out.push({ id: `${it.docId}:${f.key}`, docId: it.docId, docName: it.docName, fact: f, current: cur, kind: cur || dup ? 'change' : 'new', checked: !cur && !dup && f.confidence !== 'low' })
    }
  }
  return out
}

export interface BudgetCandidate { docId: string; docName: string; lines: BudgetLine[]; statedTotal: number | null; ref: string }
/** The budget to offer: the file with the most lines. One budget at a time; the others stay in the data room. */
export function pickBudget(items: ReadItem[], s: StrategyCode | null): BudgetCandidate | null {
  let best: ReadItem | null = null
  for (const it of items) if ((it.ex.budget?.lines.length ?? 0) > (best?.ex.budget?.lines.length ?? 0)) best = it
  if (!best?.ex.budget) return null
  const lines: BudgetLine[] = best.ex.budget.lines.map(l => ({
    id: newLineId(), cat: isCat(s, l.cat) ? l.cat : 'other', label: l.label.slice(0, 120), amount: l.amount, spent: l.spent,
    from: { doc: best!.docId, name: best!.docName, ref: l.ref } satisfies Source,
  }))
  return { docId: best.docId, docName: best.docName, lines, statedTotal: best.ex.budget.stated_total, ref: 'budget lines' }
}

export interface Applied { next: Fields; keys: string[]; budget: BudgetLine[] | null }
/** Writes the ticked facts, and the budget if it is used, into a copy of the profile. Every value keeps the file and place it came from. */
export function applyReview(fields: Fields, facts: ReviewFact[], budget: { docId: string; docName: string; lines: BudgetLine[] } | null, s: StrategyCode | null): Applied {
  const updates: Update[] = facts.map(r => ({ key: r.fact.key, status: r.fact.status, display: r.fact.display, amount: r.fact.amount, from: { doc: r.docId, name: r.docName, ref: r.fact.ref } }))
  if (budget && budget.lines.length) updates.push(...budgetUpdates(budget.lines, s, { doc: budget.docId, name: budget.docName, ref: 'budget lines' }))
  const { next, keys } = applyUpdates(fields, updates, 'doc')
  return { next, keys, budget: budget && budget.lines.length ? budget.lines : null }
}
