import data from './budget.json'
import { eur } from './format'
import type { Source, Update } from './profile'

/** The development budget: one list of lines, each filed under a category. The categories depend on the project type. */
export type StrategyCode = 'land' | 'wip' | 'refurb'
export interface Cat { id: string; label: string; hint: string; inCost: boolean }
export interface BudgetLine { id: string; cat: string; label: string; amount: number; spent?: number | null; from?: Source; edited?: boolean }
export interface Econ { budget: BudgetLine[] }

const T = data as Record<StrategyCode, { base: string; cats: Cat[] }>
const tpl = (s: StrategyCode | null) => T[s ?? 'land']
export const catsFor = (s: StrategyCode | null): Cat[] => tpl(s).cats
export const catLabel = (s: StrategyCode | null, id: string) => catsFor(s).find(c => c.id === id)?.label ?? 'Other costs'
export const isCat = (s: StrategyCode | null, id: string) => catsFor(s).some(c => c.id === id)

/** Whole euros with thousands separators, for the budget table. */
export const money = (n: number | null | undefined) => (n == null ? '—' : `€${Math.round(n).toLocaleString('en-GB')}`)
export const newLineId = () => crypto.randomUUID()
export const emptyEcon = (): Econ => ({ budget: [] })

/** The saved econ block of a project profile, checked line by line. */
export function hydrateEcon(profile: unknown): Econ {
  const raw = (profile as { econ?: { budget?: unknown } } | null)?.econ?.budget
  if (!Array.isArray(raw)) return emptyEcon()
  const budget: BudgetLine[] = []
  for (const x of raw as Array<Partial<BudgetLine>>) {
    if (!x || typeof x.amount !== 'number' || !Number.isFinite(x.amount) || typeof x.label !== 'string') continue
    budget.push({ id: typeof x.id === 'string' ? x.id : newLineId(), cat: typeof x.cat === 'string' ? x.cat : 'other', label: x.label.slice(0, 120), amount: x.amount,
      spent: typeof x.spent === 'number' && Number.isFinite(x.spent) ? x.spent : null, ...(x.from ? { from: x.from } : {}), ...(x.edited ? { edited: true } : {}) })
  }
  return { budget }
}

export interface Totals { cost: number; sales: number; spent: number; byCat: Record<string, number>; lines: number }
/** Sales costs are taken off the sales value, so the development cost leaves them out (the same split the investor teaser uses). */
export function totals(lines: BudgetLine[], s: StrategyCode | null): Totals {
  const cats = catsFor(s)
  const t: Totals = { cost: 0, sales: 0, spent: 0, byCat: {}, lines: lines.length }
  for (const l of lines) {
    const c = cats.find(x => x.id === l.cat)
    t.byCat[l.cat] = (t.byCat[l.cat] ?? 0) + l.amount
    if (c && !c.inCost) t.sales += l.amount
    else { t.cost += l.amount; t.spent += l.spent ?? 0 }
  }
  return t
}

/** Contingency as a share of the build cost (the works cost for a refurbishment). Null when there is no build cost to compare with. */
export function contingencyShare(lines: BudgetLine[], s: StrategyCode | null): number | null {
  const t = totals(lines, s)
  const base = t.byCat[tpl(s).base] ?? 0
  return base > 0 ? (t.byCat.contingency ?? 0) / base : null
}

export const pctText = (n: number) => `${Math.round(n * 1000) / 10}%`

/** Things an investor would notice in this budget, in plain words. */
export function budgetFlags(lines: BudgetLine[], s: StrategyCode | null): string[] {
  if (!lines.length) return []
  const out: string[] = []
  const t = totals(lines, s)
  const share = contingencyShare(lines, s)
  const baseLabel = s === 'refurb' ? 'works cost' : 'build cost'
  if (!(t.byCat.contingency > 0)) out.push(`There is no contingency line. Lenders usually expect about 5% of the ${baseLabel}.`)
  else if (share != null && share < 0.05) out.push(`Contingency is ${pctText(share)} of the ${baseLabel}, below the 5% lenders usually expect.`)
  if (t.cost > 0 && (t.byCat.other ?? 0) / t.cost > 0.1) out.push(`"Other costs" is ${pctText((t.byCat.other ?? 0) / t.cost)} of the cost. Split it so investors can see what it covers.`)
  if (s === 'wip') {
    const over = lines.filter(l => (l.spent ?? 0) > l.amount).map(l => l.label)
    if (over.length) out.push(`Spent is already above the budget on: ${over.slice(0, 3).join(', ')}.`)
  }
  return out
}

/** What a budget says about two profile fields: the total cost and whether there is a line-by-line budget with a reserve. */
export function budgetUpdates(lines: BudgetLine[], s: StrategyCode | null, from?: Source): Update[] {
  if (!lines.length) return []
  const t = totals(lines, s)
  const share = contingencyShare(lines, s)
  const ok = share != null && share >= 0.05
  const note = share == null ? 'Line-by-line budget' : ok ? `Line-by-line budget, ${pctText(share)} contingency` : (t.byCat.contingency ?? 0) > 0 ? `Line-by-line budget, only ${pctText(share)} contingency` : 'Line-by-line budget, no contingency'
  return [
    ...(t.cost > 0 ? [{ key: 'f_cost', status: 'filled' as const, display: eur(t.cost), amount: Math.round(t.cost), ...(from ? { from } : {}) }] : []),
    { key: 'f_budget', status: ok ? 'filled' as const : 'partial' as const, display: note, ...(from ? { from } : {}) },
  ]
}

/** An amount typed into the budget: "3,677,591", "3.677.591", "1.2M", "450k" or plain euros. A bare number is euros, not millions. */
export function parseEuros(t: string): number | null {
  const s = String(t).replace(/€|eur(os)?/gi, '').replace(/\s/g, '')
  const m = s.match(/^(\d+(?:[.,]\d+)*)(mm|m|k)?$/i)
  if (!m) return null
  const raw = m[1], u = (m[2] ?? '').toLowerCase()
  let v = /^\d{1,3}([.,]\d{3})+$/.test(raw) && !u ? +raw.replace(/[.,]/g, '') : +raw.replace(',', '.')
  if (u === 'k') v *= 1e3
  else if (u) v *= 1e6
  return Number.isFinite(v) && v >= 0 ? Math.round(v) : null
}
