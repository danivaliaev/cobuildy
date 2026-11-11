import { describe, expect, it } from 'vitest'
import { applyUpdates, clarity, columnsFor, coerce, evalTeaser, hydrate, nextKey, unlocks, type Mandate } from './mandate'
import type { Investor, Teaser } from './types'

const inv = (o: Partial<Investor> = {}): Investor => ({
  id: 'i', code: 'I-1', kind: null, name: 'X', email: null, user_id: 'u', instruments: [], geos: [], assets: [], ticket_min: null, ticket_max: null, min_license: null,
  max_ltc: null, min_return: null, max_term: null, min_track: null, min_margin: null, min_presales: null, declared_qualified_at: null, kyc_status: 'none', mandate: null, ...o,
})
const teaser = (o: Partial<Teaser> = {}): Teaser => ({
  deal_id: 'd', stage: 'sent', project_code: 'P-1', geo: 'BCN', asset: 'RES', instrument: ['senior'], ask_eur: 5e6, cost_eur: 8e6, gdv_eur: 10e6, margin: 0.25, license: 'granted',
  units: 10, build_months: 18, presales: 0.4, sponsor_years: 5, sponsor_delivered: 4, sponsor_volume_m: 20, sponsor_checks: 3, ...o,
})
const answer = (m: Mandate) => applyUpdates(m, [
  { key: 'type', status: 'filled', value: 'inst' }, { key: 'geo', status: 'filled', value: ['BCN', 'LIS'] }, { key: 'asset', status: 'filled', value: ['RES'] },
  { key: 'ins', status: 'filled', value: ['senior'] }, { key: 'tk', status: 'filled', value: { lo: 3e6, hi: 6e6 } }, { key: 'stage', status: 'filled', value: 1 },
]).next

describe('mandate', () => {
  it('starts empty and asks the first question', () => {
    const m = hydrate(inv())
    expect(nextKey(m)).toBe('type'); expect(clarity(m)).toEqual({ score: 0, level: 0 })
  })
  it('five core answers switch screening on; percent and fraction inputs are both read', () => {
    const m = answer(hydrate(inv()))
    expect(clarity(m).level).toBe(1)
    expect(coerce('ltc', 65)).toBe(0.65); expect(coerce('ltc', 0.65)).toBe(0.65); expect(coerce('geo', ['XX'])).toBeUndefined(); expect(coerce('ret', 150)).toBeUndefined()
  })
  it('writes the filters into the investor columns', () => {
    const c = columnsFor(answer(hydrate(inv())))
    expect(c).toMatchObject({ geos: ['BCN', 'LIS'], assets: ['RES'], instruments: ['senior'], ticket_min: 3e6, ticket_max: 6e6, min_license: 'submitted' })
    expect(c.mandate.st.geo).toBe('filled')
  })
  it('marks LTC as not applicable for equity-only and pre-sales for private investors, and reverts', () => {
    let m = applyUpdates(hydrate(inv()), [{ key: 'type', status: 'filled', value: 'priv' }, { key: 'ins', status: 'filled', value: ['equity'] }]).next
    expect(m.st.ltc).toBe('na'); expect(m.st.pre).toBe('na')
    m = applyUpdates(m, [{ key: 'type', status: 'filled', value: 'inst' }, { key: 'ins', status: 'filled', value: ['senior', 'equity'] }]).next
    expect(m.st.ltc).toBeUndefined(); expect(m.st.pre).toBeUndefined()
  })
  it('rebuilds from columns, keeping "not sure" and "no preference"', () => {
    const m = hydrate(inv({ geos: ['MAD'], max_ltc: 0.6, min_return: 0.1, mandate: { type: 'priv', st: { ltc: 'filled', term: 'unknown', track: 'filled' } } }))
    expect(m.v.ret).toBe(10); expect(m.st.term).toBe('unknown'); expect(m.st.track).toBe('filled'); expect(m.v.track).toBeNull(); expect(m.type).toBe('priv')
  })
  it('checks a teaser: fit, close and outside', () => {
    const m = answer(hydrate(inv()))
    expect(evalTeaser(m, teaser()).bucket).toBe('match')
    expect(evalTeaser(m, teaser({ geo: 'MAD' })).bucket).toBe('out')
    const withLtc = applyUpdates(m, [{ key: 'ltc', status: 'filled', value: 0.55 }]).next
    const near = evalTeaser(withLtc, teaser()) // 5/8 = 62.5% > 55%
    expect(near.bucket).toBe('near'); expect(unlocks([near])).toEqual([['ltc', 1]])
  })
  it('does not exclude on data missing from the teaser', () => {
    const m = answer(hydrate(inv()))
    expect(evalTeaser(m, teaser({ license: null })).bucket).toBe('match')
  })
})
