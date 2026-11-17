import { describe, expect, it } from 'vitest'
import { fill, langOfUrl, otherLangHref } from './index'
import { FUNNEL } from './funnel'
import { STAGES } from '../lib/funnel'
import { eurFor } from '../lib/format'

describe('language of an address', () => {
  it('takes /es and ?lang', () => {
    expect(langOfUrl('/es/meta', '')).toBe('es'); expect(langOfUrl('/es', '')).toBe('es'); expect(langOfUrl('/meta', '?lang=es')).toBe('es')
    expect(langOfUrl('/meta', '')).toBeNull(); expect(langOfUrl('/estate', '')).toBeNull(); expect(langOfUrl('/meta', '?lang=fr')).toBeNull()
  })
  it('switches keeping the query', () => {
    expect(otherLangHref('es', '/meta', '?utm_source=x')).toBe('/es/meta?utm_source=x')
    expect(otherLangHref('en', '/es/meta', '?utm_source=x&lang=es')).toBe('/meta?utm_source=x')
    expect(otherLangHref('es', '/', '')).toBe('/es'); expect(otherLangHref('en', '/es', '')).toBe('/')
  })
  it('fills placeholders', () => { expect(fill('{a} of {b}', { a: 1, b: 'x' })).toBe('1 of x') })
})
describe('funnel text', () => {
  it('has every stage and permit in both languages', () => {
    for (const l of ['en', 'es'] as const) {
      for (const [s, list] of Object.entries(STAGES)) for (const st of list) expect(FUNNEL[l].stages[s][st.v], `${l} ${s} ${st.v}`).toBeTruthy()
      for (const p of ['granted', 'submitted', 'process', 'none', 'notreq']) expect(FUNNEL[l].permits[p]).toBeTruthy()
    }
  })
  it('writes Spanish money with a decimal comma', () => { expect(eurFor(4_500_000, 'es')).toBe('4,5 M€'); expect(eurFor(750_000, 'es')).toBe('750 k€'); expect(eurFor(4_000_000, 'en')).toBe('€4M') })
})
