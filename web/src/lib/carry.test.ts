import { describe, expect, it } from 'vitest'
import { devUpdates } from './carry'
import { applyUpdates, calc, columnsFor, emptyFields } from './profile'

describe('landing answers import', () => {
  it('maps the demo answers onto matching columns and reaches teaser stage', () => {
    const { next } = applyUpdates(emptyFields(), devUpdates({ geo: 'CS', as: 'VIL', stage: 'submitted', cost: 4e6, ask: 2.5e6, ins: 'senior' }), 'form')
    const c = columnsFor(next)
    expect(c).toMatchObject({ geo: 'CS', asset: 'RES', license: 'submitted', cost_eur: 4e6, ask_eur: 2.5e6, instrument: ['senior'] })
    expect(c.ltc).toBeCloseTo(0.625, 3)
    expect(calc(next).stage).toBe(0) // units and sales value are still missing
  })
  it('skips unknown codes and bad numbers', () => {
    expect(devUpdates({ geo: 'XX', as: 'ZZ', cost: -5, ask: NaN })).toEqual([])
  })
  it('open capital type is a partial answer with no instrument', () => {
    const { next } = applyUpdates(emptyFields(), devUpdates({ ins: 'any' }), 'form')
    expect(columnsFor(next).instrument).toEqual([])
  })
})
