import type { Project } from './types'

export interface Blocker { gate: 1 | 2 | 3; label: string }
export interface Readiness { stage: 0 | 1 | 2 | 3; pct: number; blockers: Blocker[] }

const has = (v: unknown) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)

/** Gate 1 teaser, gate 2 outreach, gate 3 data room. A stage is reached only when every earlier gate is complete. */
export function readiness(p: Partial<Project>, docCount: number): Readiness {
  const checks: Array<[1 | 2 | 3, string, boolean]> = [
    [1, 'Region', has(p.geo)], [1, 'Asset type', has(p.asset)], [1, 'Instrument', has(p.instrument)],
    [1, 'Capital sought', has(p.ask_eur)], [1, 'Total cost', has(p.cost_eur)], [1, 'Sales value', has(p.gdv_eur)],
    [1, 'Permit status', has(p.license)],
    [2, 'Loan to cost', has(p.ltc)], [2, 'Developer margin', has(p.margin)], [2, 'Units', has(p.units)],
    [2, 'Build programme', has(p.build_months)], [2, 'Pre-sales', p.asset && p.asset !== 'RES' ? true : has(p.presales)],
    [3, 'Four data room documents', docCount >= 4],
  ]
  const blockers = checks.filter(c => !c[2]).map(c => ({ gate: c[0], label: c[1] }))
  const done = (g: number) => !blockers.some(b => b.gate === g)
  const stage = done(1) ? (done(2) ? (done(3) ? 3 : 2) : 1) : 0
  return { stage: stage as 0 | 1 | 2 | 3, pct: Math.round((100 * (checks.length - blockers.length)) / checks.length), blockers }
}
