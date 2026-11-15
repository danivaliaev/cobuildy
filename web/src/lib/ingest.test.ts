import { describe, expect, it } from 'vitest'
import { applyReview, buildReview, isStale, pickBudget, type ExFact, type Extraction, type ReadItem } from './ingest'
import { emptyFields, type Fields } from './profile'

const fact = (key: string, display: string, extra: Partial<ExFact> = {}): ExFact => ({ key, status: 'filled', display, amount: null, ref: 'p.1', quote: '', confidence: 'high', ...extra })
const ex = (facts: ExFact[], budget: Extraction['budget'] = null): Extraction => ({ doc_type: 'other', summary: '', slot: null, facts, budget, warnings: [] })
const item = (docId: string, e: Extraction): ReadItem => ({ docId, docName: `${docId}.pdf`, ex: e })

describe('buildReview', () => {
  it('offers new facts ticked and changes unticked', () => {
    const f: Fields = { ...emptyFields(), a_loc: { st: 'filled', v: 'Faro', n: null, src: 'chat' } }
    const r = buildReview([item('d1', ex([fact('a_loc', 'Portimão, Algarve'), fact('a_units', '16 apartments')]))], f)
    expect(r.find(x => x.fact.key === 'a_loc')).toMatchObject({ kind: 'change', checked: false })
    expect(r.find(x => x.fact.key === 'a_units')).toMatchObject({ kind: 'new', checked: true })
  })
  it('leaves out a fact that already matches, and an unknown one', () => {
    const f: Fields = { ...emptyFields(), a_units: { st: 'filled', v: '16 apartments', n: null, src: 'chat' } }
    expect(buildReview([item('d1', ex([fact('a_units', '16 Apartments'), fact('a_area', '', { status: 'unknown' })]))], f)).toEqual([])
  })
  it('compares money by amount, not by wording', () => {
    const f: Fields = { ...emptyFields(), f_gdv: { st: 'filled', v: '€8.3M', n: 8262017, src: 'chat' } }
    expect(buildReview([item('d1', ex([fact('f_gdv', '€8,262,017', { amount: 8262017 })]))], f)).toEqual([])
  })
  it('does not tick a low-confidence fact, and ignores unknown field keys', () => {
    const r = buildReview([item('d1', ex([fact('a_units', '16', { confidence: 'low' }), fact('nope', 'x')]))], emptyFields())
    expect(r).toHaveLength(1)
    expect(r[0].checked).toBe(false)
  })
  it('keeps only the first of two files that give the same field ticked', () => {
    const r = buildReview([item('d1', ex([fact('a_units', '16')])), item('d2', ex([fact('a_units', '18')]))], emptyFields())
    expect(r.map(x => x.checked)).toEqual([true, false])
  })
  it('drops cost facts when the same file has budget lines', () => {
    const b = { lines: [{ label: 'Build', cat: 'build', amount: 10, spent: null, ref: 'B2' }], stated_total: null }
    expect(buildReview([item('d1', ex([fact('f_cost', '€10', { amount: 10 }), fact('a_units', '2')], b))], emptyFields()).map(x => x.fact.key)).toEqual(['a_units'])
  })
})

describe('pickBudget', () => {
  const lines = (n: number) => ({ lines: Array.from({ length: n }, (_, i) => ({ label: `L${i}`, cat: i === 0 ? 'bogus' : 'build', amount: 10, spent: null, ref: `B${i}` })), stated_total: 99 })
  it('takes the file with the most lines and files an unknown category under other', () => {
    const b = pickBudget([item('d1', ex([], lines(2))), item('d2', ex([], lines(4)))], 'land')!
    expect(b.docId).toBe('d2')
    expect(b.lines).toHaveLength(4)
    expect(b.lines[0].cat).toBe('other')
    expect(b.lines[1].from).toMatchObject({ doc: 'd2', ref: 'B1' })
    expect(b.statedTotal).toBe(99)
  })
  it('returns null when no file has a budget', () => { expect(pickBudget([item('d1', ex([]))], 'land')).toBeNull() })
})

describe('applyReview', () => {
  it('writes ticked facts with their source and the budget totals', () => {
    const items = [item('d1', ex([fact('a_units', '16 apartments', { ref: 'p.2' })]))]
    const facts = buildReview(items, emptyFields())
    const lines = [{ id: '1', cat: 'build', label: 'Build', amount: 1000 }, { id: '2', cat: 'contingency', label: 'Cont', amount: 60 }]
    const r = applyReview(emptyFields(), facts, { docId: 'd1', docName: 'd1.xlsx', lines }, 'land')
    expect(r.next.a_units).toMatchObject({ st: 'filled', v: '16 apartments', src: 'doc', from: { doc: 'd1', ref: 'p.2' } })
    expect(r.next.f_cost).toMatchObject({ n: 1060, src: 'doc' })
    expect(r.next.f_budget.st).toBe('filled')
    expect(r.budget).toHaveLength(2)
  })
  it('changes nothing when nothing is ticked and there is no budget', () => {
    const f = emptyFields()
    const r = applyReview(f, [], null, 'land')
    expect(r.keys).toEqual([])
    expect(r.budget).toBeNull()
  })
})

describe('isStale', () => {
  it('treats a read that has run too long as failed', () => {
    const t = Date.now()
    expect(isStale({ status: 'reading', updated_at: new Date(t - 5 * 60 * 1000).toISOString() }, t)).toBe(true)
    expect(isStale({ status: 'reading', updated_at: new Date(t - 30 * 1000).toISOString() }, t)).toBe(false)
    expect(isStale({ status: 'ready', updated_at: new Date(t - 99 * 60 * 1000).toISOString() }, t)).toBe(false)
  })
})
