import { describe, it, expect } from 'vitest'
import { view, attention, totals, reply, activity } from './dashboard'
import type { Project, ProjectDeal } from './types'

const proj = (o: Partial<Project> = {}): Project => ({ id: 'p1', code: 'P-001', company_id: null, owner_id: 'u', title: 'Alba', status: 'draft', geo: null, city: null, asset: null, strategy: null, instrument: [], ask_eur: 5e6,
  cost_eur: null, gdv_eur: null, ltc: null, margin: null, license: null, presales: null, units: null, build_months: null, term_months: null, expected_return: null, readiness: 0, stage: 0, profile: null, ...o })
const deal = (stage: ProjectDeal['stage']): ProjectDeal => ({ deal_id: 'd' + stage, investor_code: 'I-1', investor_kind: 'fund', stage, reason: null, investor_name: null, call_slot: null })

describe('developer dashboard', () => {
  it('turns investor replies into actions, replies first, gaps after', () => {
    const v = view(proj({ status: 'approved' }), [{ code: 'I-1', bucket: 'fit' }], [deal('interested'), deal('sent')])
    const a = attention(v)
    expect(a[0].tone).toBe('good'); expect(a[0].title).toContain('Fund'); expect(a[0].tab).toBe('investors')
    expect(a.some(x => x.title.startsWith('Missing'))).toBe(true)
  })
  it('suggests the first wave only when nothing was sent', () => {
    const v = view(proj({ status: 'approved' }), [{ code: 'I-1', bucket: 'fit' }, { code: 'I-2', bucket: 'possible' }], [])
    expect(attention(v).some(x => x.title.startsWith('Send the teaser to 1 matching investor'))).toBe(true)
  })
  it('sums capital and counts unique investors', () => {
    const a = view(proj(), [{ code: 'I-1', bucket: 'fit' }], [deal('qa')]); const b = view(proj({ id: 'p2', ask_eur: 3e6 }), [{ code: 'I-1', bucket: 'fit' }, { code: 'I-2', bucket: 'possible' }], [])
    const t = totals([a, b]); expect(t.ask).toBe(8e6); expect(t.fit).toBe(1); expect(t.poss).toBe(1); expect(t.interested).toBe(1); expect(t.sentAny).toBe(true)
  })
  it('answers from the data and lists activity', () => {
    const v = view(proj(), [], [deal('call')])
    expect(reply('summary', [v])).toContain('Alba'); expect(reply('anything', [])).toContain('no projects')
    expect(activity([v])[0].s).toBe('Call confirmed')
  })
})
