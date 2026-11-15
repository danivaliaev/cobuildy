import { describe, expect, it } from 'vitest'
import { budgetFlags, budgetUpdates, catsFor, contingencyShare, hydrateEcon, parseEuros, totals, type BudgetLine } from './budget'

const L = (cat: string, amount: number, extra: Partial<BudgetLine> = {}): BudgetLine => ({ id: cat + amount, cat, label: cat, amount, ...extra })
// The Vale de Lagar budget: sales costs sit outside the development cost.
const vale = [L('land', 1213850), L('build', 3677591), L('design', 684747), L('vat', 468156), L('finance', 156778), L('sales', 406491)]

describe('budget totals', () => {
  it('keeps sales costs out of the development cost', () => {
    const t = totals(vale, 'land')
    expect(t.cost).toBe(6201122)
    expect(t.sales).toBe(406491)
  })
  it('has categories for every project type', () => {
    for (const s of ['land', 'wip', 'refurb'] as const) expect(catsFor(s).some(c => c.id === 'contingency')).toBe(true)
    expect(catsFor('refurb').some(c => c.id === 'acq')).toBe(true)
    expect(catsFor('land').some(c => c.id === 'acq')).toBe(false)
  })
  it('sums what was spent only for cost lines', () => {
    const t = totals([L('build', 100, { spent: 40 }), L('sales', 10, { spent: 5 })], 'wip')
    expect(t.spent).toBe(40)
  })
})

describe('contingency and flags', () => {
  it('measures contingency against the build cost, or the works cost for a refurbishment', () => {
    expect(contingencyShare([L('build', 1000), L('contingency', 50)], 'land')).toBeCloseTo(0.05)
    expect(contingencyShare([L('works', 200), L('contingency', 10)], 'refurb')).toBeCloseTo(0.05)
    expect(contingencyShare([L('contingency', 10)], 'land')).toBeNull()
  })
  it('flags a missing or thin contingency', () => {
    expect(budgetFlags(vale, 'land').join(' ')).toMatch(/no contingency line/)
    expect(budgetFlags([L('build', 1000), L('contingency', 30)], 'land').join(' ')).toMatch(/3% of the build cost/)
    expect(budgetFlags([L('build', 1000), L('contingency', 60)], 'land')).toEqual([])
  })
  it('flags a large "other" line and overspending on work in progress', () => {
    expect(budgetFlags([L('build', 1000), L('contingency', 60), L('other', 300)], 'land').join(' ')).toMatch(/Other costs/)
    expect(budgetFlags([L('build', 100, { spent: 120 }), L('contingency', 10)], 'wip').join(' ')).toMatch(/Spent is already above/)
  })
  it('says nothing about an empty budget', () => { expect(budgetFlags([], 'land')).toEqual([]) })
})

describe('budget updates', () => {
  it('sets the total cost and marks the budget as a full one when the reserve is 5% or more', () => {
    const u = budgetUpdates([L('build', 1000), L('land', 500), L('contingency', 50)], 'land')
    expect(u[0]).toMatchObject({ key: 'f_cost', status: 'filled', amount: 1550 })
    expect(u[1]).toMatchObject({ key: 'f_budget', status: 'filled' })
  })
  it('marks it partial when the reserve is missing or small', () => {
    expect(budgetUpdates(vale, 'land')[1]).toMatchObject({ status: 'partial', display: 'Line-by-line budget, no contingency' })
    expect(budgetUpdates([L('build', 1000), L('contingency', 20)], 'land')[1].display).toMatch(/only 2%/)
  })
  it('returns nothing for no lines', () => { expect(budgetUpdates([], 'land')).toEqual([]) })
})

describe('hydrateEcon', () => {
  it('reads saved lines and drops broken ones', () => {
    const e = hydrateEcon({ econ: { budget: [{ id: 'a', cat: 'build', label: 'Build', amount: 5 }, { label: 'x' }, null, { cat: 'land', label: 'Land', amount: 'no' }] } })
    expect(e.budget).toHaveLength(1)
    expect(e.budget[0]).toMatchObject({ id: 'a', amount: 5 })
  })
  it('returns an empty budget when there is none', () => { expect(hydrateEcon(null).budget).toEqual([]); expect(hydrateEcon({}).budget).toEqual([]) })
})

describe('parseEuros', () => {
  it('reads amounts as typed in a budget', () => {
    expect(parseEuros('3,677,591')).toBe(3677591)
    expect(parseEuros('3.677.591')).toBe(3677591)
    expect(parseEuros('€ 1 213 850')).toBe(1213850)
    expect(parseEuros('1.2M')).toBe(1200000)
    expect(parseEuros('450k')).toBe(450000)
    expect(parseEuros('45')).toBe(45)
    expect(parseEuros('1234,5')).toBe(1235)
  })
  it('rejects text and negatives', () => { expect(parseEuros('abc')).toBeNull(); expect(parseEuros('-5')).toBeNull(); expect(parseEuros('')).toBeNull() })
})
