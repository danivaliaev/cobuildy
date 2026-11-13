import { describe, expect, it } from 'vitest'
import { complete, numbers, parseMoney, score, toCarry, verdict, compatibility } from './funnel'
import { devUpdates } from './carry'

describe('parseMoney with a unit', () => {
  it('a small bare number takes the chosen unit, a large one is euros', () => {
    expect(parseMoney('5', false, 'm')).toBe(5_000_000); expect(parseMoney('2,5', false, 'm')).toBe(2_500_000); expect(parseMoney('750', false, 'k')).toBe(750_000)
    expect(parseMoney('5000000', false, 'm')).toBe(5_000_000); expect(parseMoney('5m', false, 'k')).toBe(5_000_000)
  })
  it('without a unit a few euros is not an amount', () => { expect(parseMoney('5')).toBeNull(); expect(parseMoney('999')).toBeNull(); expect(parseMoney('0', true, 'm')).toBe(0) })
})

describe('parseMoney', () => {
  it('reads common ways to write an amount', () => {
    expect(parseMoney('4.5M')).toBe(4_500_000); expect(parseMoney('€4,500,000')).toBe(4_500_000); expect(parseMoney('750k')).toBe(750_000)
    expect(parseMoney('1,5m')).toBe(1_500_000); expect(parseMoney('2 000 000')).toBe(2_000_000); expect(parseMoney('4.500.000')).toBe(4_500_000)
    expect(parseMoney('12m eur')).toBe(12_000_000)
  })
  it('rejects nonsense, zero (unless allowed) and absurd amounts', () => {
    expect(parseMoney('lots')).toBeNull(); expect(parseMoney('')).toBeNull(); expect(parseMoney('0')).toBeNull(); expect(parseMoney('0', true)).toBe(0)
    expect(parseMoney('99999m')).toBeNull(); expect(parseMoney('-5')).toBeNull()
  })
})

const base = { strategy: 'land', geo: 'BCN', stage: 'licensed', gdv: 10_000_000, ask: 5_000_000, equity: 2_000_000, permit: 'granted' } as const
describe('score', () => {
  it('rewards progress, permits, equity and margin', () => {
    const s = score(base)
    expect(s.parts).toEqual({ stage: 25, permits: 25, equity: 24, margin: 25 }) // equity 28.6% of 7M cost; margin 42.9%
    expect(s.total).toBe(99)
  })
  it('an early project with thin equity and no margin scores low', () => {
    const s = score({ ...base, stage: 'identified', permit: 'none', equity: 100_000, gdv: 5_000_000 })
    expect(s.total).toBeLessThan(25)
  })
  it('stays within 0–100 even when sales value is below cost', () => {
    const s = score({ ...base, gdv: 1_000_000 }); expect(s.parts.margin).toBe(0); expect(s.total).toBeGreaterThanOrEqual(0)
  })
  it('numbers: cost is capital plus equity', () => {
    const n = numbers(base); expect(n.cost).toBe(7_000_000); expect(n.ltc).toBeCloseTo(0.714, 3)
  })
  it('wording follows the score and the matches', () => {
    expect(verdict(78)).toContain('good'); expect(verdict(60)).toContain('moderate'); expect(verdict(30)).toContain('early stage')
    expect(compatibility({ total: 98, high: 3, medium: 0, low: 0 })).toContain('matches'); expect(compatibility({ total: 98, high: 0, medium: 0, low: 0 })).toContain('No investor')
  })
})

describe('carry into the account', () => {
  it('turns the answers into profile updates', () => {
    expect(complete(base)).toBe(true)
    const c = toCarry(base, 99)
    const u = devUpdates(c.dev)
    const by = Object.fromEntries(u.map(x => [x.key, x]))
    expect(by.a_loc.display).toBe('Barcelona'); expect(by.f_gdv.amount).toBe(10_000_000); expect(by.k_ask.amount).toBe(5_000_000)
    expect(by.k_equity.amount).toBe(2_000_000); expect(by.f_cost.amount).toBe(7_000_000); expect(by.p_status.display).toMatch(/granted/i)
    expect(by.l_own.status).toBe('filled')
  })
  it('identified land is only partly under control', () => {
    const u = devUpdates(toCarry({ ...base, stage: 'identified', permit: 'process' }, 40).dev)
    expect(u.find(x => x.key === 'l_own')!.status).toBe('partial'); expect(u.find(x => x.key === 'p_status')!.display).toMatch(/not yet submitted/i)
  })
})
