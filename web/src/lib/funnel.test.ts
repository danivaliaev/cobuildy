import { describe, expect, it } from 'vitest'
import { readDraft, complete, numbers, parseMoney, score, toCarry, verdict, compatibility } from './funnel'
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

import { geoCode } from './profile'
describe('typed place', () => {
  it('known towns resolve to a region, unknown ones need a country', () => {
    expect(geoCode('Marbella')).toBe('CS'); expect(geoCode('Sitges')).toBe('BCN'); expect(geoCode('Sevilla')).toBeNull()
    expect(geoCode('Sevilla, Spain')).toBe('XES'); expect(geoCode('Braga, Portugal')).toBe('XPT'); expect(geoCode('Paris, other country')).toBe('XX')
  })
  it('the typed place becomes the project location in the account', () => {
    const u = devUpdates({ geo: 'XES', city: 'Sevilla, Spain' })
    expect(u.find(x => x.key === 'a_loc')!.display).toBe('Sevilla, Spain')
    expect(devUpdates({ geo: 'BCN' }).find(x => x.key === 'a_loc')!.display).toBe('Barcelona')
  })
})

import { loadPlaces, labelFor } from './places'
describe('places', () => {
  it('knows the towns and puts each in its region', async () => {
    const pl = await loadPlaces()
    expect(pl.find('Torremolinos')).toMatchObject({ geo: 'CS', label: 'Torremolinos, Costa del Sol' })
    expect(pl.find('Alcalá de Henares')?.geo).toBe('MAD'); expect(pl.find('alcala de henares')?.geo).toBe('MAD')
    expect(pl.find('Cascais')?.geo).toBe('LIS'); expect(pl.find('Matosinhos')?.geo).toBe('OPO'); expect(pl.find('Tavira')?.geo).toBe('ALG')
    expect(pl.find('Sevilla')).toMatchObject({ geo: 'XES', label: 'Sevilla, Spain' }); expect(pl.find('Seville')?.name).toBe('Sevilla')
    expect(pl.find('Braga')).toMatchObject({ geo: 'XPT', label: 'Braga, Portugal' }); expect(pl.find('Nowhereville')).toBeNull()
  })
  it('suggests larger towns first', async () => {
    const pl = await loadPlaces()
    const s = pl.suggest('mar'); expect(s.length).toBeGreaterThan(1); expect(s.some(x => x.name === 'Marbella')).toBe(true)
    expect(pl.suggest('x')).toEqual([])
  })
  it('the label reads back to the same region, even for towns named like another region', async () => {
    const pl = await loadPlaces()
    for (const name of ['Palma del Río', 'Valencia de Alcántara', 'Porto de Mós', 'Torremolinos', 'Gandía', 'Tavira', 'Sitges', 'Madrid', 'Barcelona', 'Lisbon', 'Porto']) {
      const p = pl.find(name); if (!p) continue
      expect(geoCode(p.label), name).toBe(p.geo)
    }
    expect(labelFor('Madrid', 'MAD')).toBe('Madrid')
    expect(pl.find('Ibiza')).toMatchObject({ geo: 'ISL', label: 'Ibiza, Balearic Islands' }); expect(pl.find('Arrecife')).toMatchObject({ geo: 'ISL', label: 'Arrecife, Canary Islands' })
    expect(geoCode('Arrecife, Canary Islands')).toBe('ISL')
  })
})

import { trafficSource, validName, validPhone } from './funnelTrack'
describe('funnel tracking helpers', () => {
  it('reads the ad tags, the Meta click id and the referrer', () => {
    expect(trafficSource('?utm_source=facebook&utm_campaign=spring_a&fbclid=abc', 'https://l.facebook.com/x', 'cobuildy.com')).toEqual({ utm_source: 'facebook', utm_campaign: 'spring_a', fbclid: '1', referrer: 'l.facebook.com' })
    expect(trafficSource('', '', 'cobuildy.com')).toEqual({})
  })
  it('accepts normal names and phones, rejects the rest', () => {
    expect(validName('  Ana   García ')).toBe('Ana García'); expect(validName('A')).toBeNull()
    expect(validPhone('+34 600 123 456')).toBe('+34 600 123 456'); expect(validPhone('600123')).toBeNull(); expect(validPhone('call me')).toBeNull()
  })
  it('the carry holds the session, so the account can claim it', () => {
    const c = toCarry({ strategy: 'land', geo: 'BCN', stage: 'licensed', gdv: 1e7, ask: 5e6, equity: 2e6, permit: 'granted' }, 90, { sid: 's1', name: 'Ana', phone: '+34 600 123 456' })
    expect(c.sid).toBe('s1'); expect(c.name).toBe('Ana')
  })
})

describe('landing draft', () => {
  const now = 1_000_000
  const good = { strategy: 'land', geo: 'CS', city: 'Marbella', stage: 'purchased', gdv: 6e6, ask: 2.5e6, equity: 0, permit: 'submitted' }
  it('takes valid answers, including zero equity', () => {
    const d = readDraft(JSON.stringify({ a: good, ts: now }), now)
    expect(d).toEqual(good)
    expect(complete(d!)).toBe(true)
  })
  it('drops a stage that does not belong to the project type and values that are not usable', () => {
    const d = readDraft(JSON.stringify({ a: { ...good, strategy: 'wip', gdv: 12, ask: 'x', permit: 'maybe' }, ts: now }), now)
    expect(d).toEqual({ strategy: 'wip', geo: 'CS', city: 'Marbella', equity: 0 })
  })
  it('ignores an old, empty or broken draft', () => {
    expect(readDraft(JSON.stringify({ a: good, ts: now - 2 * 36e5 }), now)).toBeNull()
    expect(readDraft(JSON.stringify({ a: {}, ts: now }), now)).toBeNull()
    expect(readDraft('not json', now)).toBeNull()
    expect(readDraft(null, now)).toBeNull()
  })
})
