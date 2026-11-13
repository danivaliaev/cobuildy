import { describe, expect, it } from 'vitest'
import { clearWelcome, devUpdates, markFirstRun, peekWelcome } from './carry'
import { applyUpdates, calc, columnsFor, emptyFields } from './profile'

describe('landing answers import', () => {
  it('maps the demo answers onto matching columns and reaches teaser stage', () => {
    const { next } = applyUpdates(emptyFields(), devUpdates({ geo: 'CS', as: 'VIL', stage: 'submitted', cost: 4e6, ask: 2.5e6, ins: 'senior' }), 'site')
    const c = columnsFor(next)
    expect(c).toMatchObject({ geo: 'CS', asset: 'RES', license: 'submitted', cost_eur: 4e6, ask_eur: 2.5e6, instrument: ['senior'] })
    expect(c.ltc).toBeCloseTo(0.625, 3)
    expect(calc(next).stage).toBe(0) // units and sales value are still missing
  })
  it('skips unknown codes and bad numbers', () => {
    expect(devUpdates({ geo: 'XX', as: 'ZZ', cost: -5, ask: NaN })).toEqual([])
  })
  it('open capital type is a partial answer with no instrument', () => {
    const { next } = applyUpdates(emptyFields(), devUpdates({ ins: 'any' }), 'site')
    expect(columnsFor(next).instrument).toEqual([])
  })
})

describe('first-run marker', () => {
  it('a developer with no project gets a marker without a project id', () => {
    localStorage.clear()
    expect(peekWelcome()).toBeNull()
    markFirstRun()
    expect(peekWelcome()).toEqual({ id: null, score: 0 })
    clearWelcome()
    expect(peekWelcome()).toBeNull()
  })
  it('ignores a marker with a malformed project id or an old one', () => {
    localStorage.setItem('cb.welcome.v1', JSON.stringify({ id: 'x', score: 1, ts: Date.now() }))
    expect(peekWelcome()).toBeNull()
    localStorage.setItem('cb.welcome.v1', JSON.stringify({ id: null, score: 0, ts: Date.now() - 2 * 36e5 }))
    expect(peekWelcome()).toBeNull()
  })
})
