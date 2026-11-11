import { describe, it, expect } from 'vitest'
import { validPhone, needsProfile, kindLabel, kindType, COUNTRIES, KINDS } from './investorKinds'

describe('investor profile helpers', () => {
  it('validates phones like the database', () => {
    expect(validPhone('+34 600 123 456')).toBe(true)
    expect(validPhone('600123456')).toBe(true)
    expect(validPhone('123')).toBe(false)
    expect(validPhone('abc 600 123 456')).toBe(false)
    expect(validPhone('+++++++')).toBe(false)
  })
  it('knows when a profile is incomplete', () => {
    expect(needsProfile({ kind: null, country: 'ES', phone: '+34600123456' })).toBe(true)
    expect(needsProfile({ kind: 'fund', country: null, phone: '+34600123456' })).toBe(true)
    expect(needsProfile({ kind: 'fund', country: 'ES', phone: '12' })).toBe(true)
    expect(needsProfile({ kind: 'old-value', country: 'ES', phone: '+34600123456' })).toBe(true)
    expect(needsProfile({ kind: 'bank', country: 'ES', phone: '+34600123456' })).toBe(false)
  })
  it('labels kinds and maps them to the mandate type', () => {
    expect(KINDS).toHaveLength(5)
    expect(kindLabel('bank')).toBe('Bank or lender'); expect(kindLabel(null)).toBe('—'); expect(kindLabel('x')).toBe('x')
    expect(kindType('fund')).toBe('inst'); expect(kindType('hnwi')).toBe('priv'); expect(kindType('family_office')).toBe('priv')
  })
  it('lists countries with names', () => {
    const c = COUNTRIES(); expect(c.find(x => x.code === 'ES')?.name).toBe('Spain'); expect(c.find(x => x.code === 'PT')).toBeTruthy()
  })
})
