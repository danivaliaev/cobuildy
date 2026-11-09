import { describe, expect, it } from 'vitest'
import { readiness } from './readiness'

const teaser = { geo: 'CS', asset: 'RES', instrument: ['senior'], ask_eur: 3e6, cost_eur: 5.4e6, gdv_eur: 6.5e6, license: 'submitted' as const }

describe('readiness', () => {
  it('is stage 0 with nothing filled', () => {
    expect(readiness({}, 0).stage).toBe(0)
  })
  it('reaches the teaser stage when gate 1 is complete', () => {
    const r = readiness(teaser, 0)
    expect(r.stage).toBe(1)
    expect(r.blockers.every(b => b.gate > 1)).toBe(true)
  })
  it('reaches outreach with gate 2 and data room with four documents', () => {
    const full = { ...teaser, ltc: 0.56, margin: 0.2, units: 12, build_months: 18, presales: 0.3 }
    expect(readiness(full, 0).stage).toBe(2)
    expect(readiness(full, 4).stage).toBe(3)
  })
  it('does not ask pre-sales for non-residential assets', () => {
    const r = readiness({ ...teaser, asset: 'HOS', ltc: 0.5, margin: 0.2, units: 30, build_months: 24 }, 0)
    expect(r.stage).toBe(2)
  })
  it('does not skip a gate', () => {
    const r = readiness({ ltc: 0.5, margin: 0.2, units: 3, build_months: 12, presales: 0.4 }, 4)
    expect(r.stage).toBe(0)
  })
})
