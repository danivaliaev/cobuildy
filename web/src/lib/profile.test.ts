import { describe, expect, it } from 'vitest'
import { FIELDS, applyUpdates, calc, columnsFor, derived, emptyFields, hydrate, nextField, parseMoney, patchFor } from './profile'
import type { Project } from './types'

describe('profile model', () => {
  it('has 30 fields in 8 sections, every one with a question', () => {
    expect(FIELDS.length).toBe(30)
    expect(new Set(FIELDS.map(f => f.section)).size).toBe(8)
    expect(FIELDS.every(f => f.question && f.chips.length > 0)).toBe(true)
  })
  it('asks teaser fields first', () => {
    const f = emptyFields()
    expect(FIELDS.find(d => d.key === nextField(f))?.gate).toBe(1)
  })
  it('reads money', () => {
    expect(parseMoney('€5.4M')).toBe(5.4e6)
    expect(parseMoney('5,400,000')).toBe(5.4e6)
    expect(parseMoney('800k')).toBe(8e5)
    expect(parseMoney('3')).toBe(3e6)
  })
  it('reaches the teaser stage when gate 1 is filled, and maps columns', () => {
    const { next } = applyUpdates(emptyFields(), [
      { key: 'a_type', status: 'filled', display: 'Residential for sale' },
      { key: 'a_loc', status: 'filled', display: 'Marbella, Costa del Sol' },
      { key: 'a_units', status: 'filled', display: '12 apartments · ~1,250 m²' },
      { key: 'f_cost', status: 'filled', amount: 5.4e6 },
      { key: 'f_gdv', status: 'filled', amount: 6.5e6 },
      { key: 'k_ask', status: 'filled', amount: 3e6 },
      { key: 'k_instr', status: 'filled', display: 'Senior + mezzanine' },
    ])
    expect(calc(next).stage).toBe(1)
    expect(columnsFor(next)).toMatchObject({ asset: 'RES', geo: 'CS', city: 'Marbella', units: 12, cost_eur: 5.4e6, gdv_eur: 6.5e6, ask_eur: 3e6, instrument: ['senior', 'mezz'], ltc: 0.556, margin: 0.204 })
  })
  it('a partial answer counts half and does not open the gate', () => {
    const { next } = applyUpdates(emptyFields(), [{ key: 'p_status', status: 'partial', display: 'Submitted, waiting for the town hall' }])
    expect(columnsFor(next).license).toBe('submitted')
    expect(calc(next).score).toBeGreaterThan(0)
  })
  it('clears the column when an answer is undone', () => {
    const f1 = applyUpdates(emptyFields(), [{ key: 'f_cost', status: 'filled', amount: 7e6 }]).next
    expect(columnsFor(f1).cost_eur).toBe(7e6)
    expect(columnsFor(emptyFields()).cost_eur).toBeNull()
    expect(derived(f1).cost).toBe(7e6)
  })
  it('rebuilds fields from a project made with the old form', () => {
    const p = { asset: 'RES', geo: 'CS', city: 'Marbella', cost_eur: 7e6, gdv_eur: 1e7, ask_eur: 5e6, instrument: ['mezz'], license: 'granted', profile: {} } as unknown as Project
    const f = hydrate(p)
    expect(f.f_cost.n).toBe(7e6)
    expect(f.k_instr.v).toBe('Mezzanine')
    expect(f.p_status.st).toBe('filled')
    expect(patchFor(p, f)).toMatchObject({ stage: 0, license: 'granted' })
  })
})
