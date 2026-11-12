import data from './fields.json'
import { eur } from './format'
import type { Project } from './types'

/** The guided project profile: 30 fields in 8 sections, ported from the prototype. Single source: fields.json. */
export type Status = 'empty' | 'filled' | 'partial' | 'unknown'
export interface FieldState { st: Status; v: string; n: number | null; src: '' | 'chat' | 'edit' | 'form' | 'site' }
export type Fields = Record<string, FieldState>
export interface Chip { label: string; value: string; amount?: number; partial: boolean; unknown: boolean; note?: string; task?: string }
export interface FieldDef {
  key: string; section: string; label: string; gate: 1 | 2 | 3; weight: number; kind: 'text' | 'money' | 'number'
  question: string; why: string; chips: Chip[]; task: string; doc?: string
}

export const SECTIONS = data.sections as Array<{ id: string; title: string }>
export const GATE_NAMES = data.gates as string[]
export const FIELDS = data.fields as FieldDef[]
export const FK: Record<string, FieldDef> = Object.fromEntries(FIELDS.map(f => [f.key, f]))

export const blank = (): FieldState => ({ st: 'empty', v: '', n: null, src: '' })
export const emptyFields = (): Fields => Object.fromEntries(FIELDS.map(f => [f.key, blank()]))
/** Whether a field satisfies its gate. A teaser accepts a partly met answer; the later stages need fully met fields. */
export const meets = (d: { gate: number }, s: FieldState) => s.st === 'filled' || (d.gate === 1 && s.st === 'partial')
export const isDone = (s: FieldState) => s.st === 'filled' || s.st === 'partial'

// ---------- parsing ----------
/** "5.4M", "€5,400,000", "800k", "5" (a bare number under 100 is read as millions). */
export function parseMoney(t: string): number | null {
  const s = String(t).replace(/€|eur(os)?/gi, '').replace(/\s/g, '')
  const m = s.match(/(\d+(?:[.,]\d+)*)(mm|m|million|millones|k|mil)?/i)
  if (!m) return null
  const raw = m[1]
  let v = /^\d{1,3}([.,]\d{3})+$/.test(raw) ? +raw.replace(/[.,]/g, '') : +raw.replace(',', '.')
  const u = (m[2] ?? '').toLowerCase()
  if (u === 'k' || u === 'mil') v *= 1e3
  else if (u) v *= 1e6
  else if (v < 100) v *= 1e6
  return Number.isFinite(v) ? Math.round(v) : null
}
export const firstInt = (s: string): number | null => { const m = String(s).match(/\d+/); return m ? +m[0] : null }

// ---------- scoring ----------
export interface Calc { score: number; stage: 0 | 1 | 2 | 3; next: number; blockers: FieldDef[]; known: number; filled: number }
export function calc(f: Fields): Calc {
  let W = 0, P = 0, known = 0, filled = 0
  for (const d of FIELDS) {
    const s = f[d.key] ?? blank()
    W += d.weight
    if (s.st === 'filled') { P += d.weight; filled++ } else if (s.st === 'partial') P += d.weight * 0.5
    if (isDone(s)) known++
  }
  const open = (g: number) => FIELDS.some(d => d.gate === g && !meets(d, f[d.key] ?? blank()))
  let stage: 0 | 1 | 2 | 3 = 0
  if (!open(1)) { stage = 1; if (!open(2)) { stage = 2; if (!open(3)) stage = 3 } }
  const next = Math.min(stage + 1, 3)
  const blockers = stage < 3 ? FIELDS.filter(d => d.gate <= next && !meets(d, f[d.key] ?? blank())) : []
  return { score: Math.round((P / W) * 100), stage, next, blockers, known, filled }
}

/** The next field to ask about: lowest gate first, then heavier fields, then section order. */
export function nextField(f: Fields): string | null {
  const open = FIELDS.filter(d => (f[d.key] ?? blank()).st === 'empty')
  if (!open.length) return null
  const si = (id: string) => SECTIONS.findIndex(s => s.id === id)
  return [...open].sort((a, b) => a.gate - b.gate || b.weight - a.weight || si(a.section) - si(b.section))[0].key
}

export function derived(f: Fields) {
  const n = (k: string) => (f[k] && isDone(f[k]) ? f[k].n : null)
  const cost = n('f_cost'), gdv = n('f_gdv'), ask = n('k_ask'), eq = n('k_equity')
  return {
    cost, gdv, ask, eq, land: n('l_price'),
    margin: cost && gdv ? (gdv - cost) / cost : null,
    ltc: cost && ask ? ask / cost : null,
    eqp: cost && eq != null ? eq / cost : null,
  }
}

// ---------- mapping to the project columns used by matching ----------
const GEO_WORDS: Array<[RegExp, string]> = [
  [/marbella|estepona|m[aá]laga|fuengirola|benahav[ií]s|mijas|sotogrande|nerja|costa del sol/i, 'CS'],
  [/barcelona|sitges|girona|catalonia|catalu/i, 'BCN'], [/madrid/i, 'MAD'], [/valencia|alicante|denia/i, 'VLC'],
  [/mallorca|ibiza|palma|menorca|tenerife|canar|balear/i, 'ISL'], [/lisbon|lisboa|cascais|sintra/i, 'LIS'],
  [/porto|oporto/i, 'OPO'], [/algarve|faro|lagos|albufeira|vilamoura/i, 'ALG'],
]
export const geoCode = (t: string): string | null => GEO_WORDS.find(([re]) => re.test(t))?.[1] ?? null
const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d

export function assetCode(v: string): string | null {
  if (/rent|btr/i.test(v)) return 'BTR'
  if (/hospital|hotel/i.test(v)) return 'HOS'
  if (/residential|apartment|villa|house|flat/i.test(v)) return 'RES'
  return null
}
export function instrumentCodes(v: string): string[] {
  const out: string[] = []
  if (/senior|loan|debt/i.test(v)) out.push('senior')
  if (/mezz/i.test(v)) out.push('mezz')
  if (/equity|partner/i.test(v)) out.push('equity')
  return out
}
export function licenseCode(v: string): 'none' | 'submitted' | 'granted' | null {
  if (/not (yet )?(submitted|applied)|no licen[cs]e|none/i.test(v)) return 'none'
  if (/grant|approved|obtained/i.test(v)) return 'granted'
  if (/submit|filed|applied|waiting|pending/i.test(v)) return 'submitted'
  return null
}
function presalesFraction(v: string, units: number | null): number | null {
  const of = v.match(/(\d+)\s*(?:of|\/)\s*(\d+)/i)
  if (of && +of[2] > 0) return round(+of[1] / +of[2], 3)
  const pc = v.match(/(\d+(?:[.,]\d+)?)\s*%/)
  if (pc) return round(+pc[1].replace(',', '.') / 100, 3)
  if (/none|no pre-?sales|zero/i.test(v)) return 0
  const n = firstInt(v)
  return n != null && units ? round(Math.min(1, n / units), 3) : null
}

/** Column values derived from the whole profile. Fields that are not answered clear their column. */
export function columnsFor(f: Fields) {
  const s = (k: string) => f[k] ?? blank()
  const done = (k: string) => isDone(s(k))
  const d = derived(f)
  const loc = done('a_loc') ? s('a_loc').v : ''
  const units = done('a_units') ? firstInt(s('a_units').v) : null
  return {
    asset: done('a_type') ? assetCode(s('a_type').v) : null,
    geo: loc ? geoCode(loc) : null,
    city: loc ? loc.split(',')[0].trim().slice(0, 80) || null : null,
    units,
    cost_eur: d.cost, gdv_eur: d.gdv, ask_eur: d.ask,
    instrument: done('k_instr') ? instrumentCodes(s('k_instr').v) : [],
    license: done('p_status') ? licenseCode(s('p_status').v) : null,
    build_months: done('c_sched') ? s('c_sched').n : null,
    presales: done('e_presales') ? presalesFraction(s('e_presales').v, units) : null,
    ltc: d.ltc != null ? round(d.ltc, 3) : null,
    margin: d.margin != null ? round(d.margin, 3) : null,
  }
}

/** Everything one save writes: the profile, the matching columns and the readiness numbers. */
export function patchFor(project: Pick<Project, 'profile'>, f: Fields) {
  const c = calc(f)
  const profile = { ...((project.profile as Record<string, unknown> | null) ?? {}), fields: f }
  return { profile, ...columnsFor(f), stage: c.stage, readiness: c.score }
}

/** Fields for a project: the saved profile, or, for projects made with the old form, rebuilt from its columns. */
export function hydrate(p: Project): Fields {
  const saved = (p.profile as { fields?: Fields } | null)?.fields
  const f = emptyFields()
  if (saved) {
    for (const k of Object.keys(f)) if (saved[k]) f[k] = saved[k]
    return f
  }
  const put = (k: string, v: string, n: number | null = null) => { f[k] = { st: 'filled', v, n, src: 'form' } }
  const asset = { RES: 'Residential for sale', BTR: 'Build-to-rent', HOS: 'Hospitality' } as Record<string, string>
  const geo = { CS: 'Costa del Sol', BCN: 'Barcelona', MAD: 'Madrid', VLC: 'Valencia', ISL: 'Balearics / Canaries', LIS: 'Lisbon', OPO: 'Porto', ALG: 'Algarve' } as Record<string, string>
  if (p.asset && asset[p.asset]) put('a_type', asset[p.asset])
  if (p.city || p.geo) put('a_loc', [p.city, p.geo ? geo[p.geo] : null].filter(Boolean).join(', '))
  if (p.units) put('a_units', `${p.units} units`)
  if (p.cost_eur) put('f_cost', eur(p.cost_eur), p.cost_eur)
  if (p.gdv_eur) put('f_gdv', eur(p.gdv_eur), p.gdv_eur)
  if (p.ask_eur) put('k_ask', eur(p.ask_eur), p.ask_eur)
  const instr = { senior: 'Senior loan', mezz: 'Mezzanine', equity: 'Equity partner' } as Record<string, string>
  if (p.instrument?.length) put('k_instr', p.instrument.map(i => instr[i] ?? i).join(' + '))
  if (p.license) put('p_status', { none: 'Not submitted', submitted: 'Submitted, waiting', granted: 'Granted' }[p.license])
  if (p.build_months) put('c_sched', `${p.build_months} months`, p.build_months)
  if (p.presales != null) put('e_presales', `${Math.round(p.presales * 100)}% pre-sold`)
  return f
}

/** Applies one agent or chip answer to a copy of the fields. */
export interface Update { key: string; status: 'filled' | 'partial' | 'unknown'; display?: string; amount?: number | null }
export function applyUpdates(f: Fields, updates: Update[], src: FieldState['src'] = 'chat'): { next: Fields; keys: string[] } {
  const next = { ...f }
  const keys: string[] = []
  for (const u of updates) {
    const d = FK[u.key]
    if (!d) continue
    if (u.status === 'unknown') next[u.key] = { st: 'unknown', v: '', n: null, src: '' }
    else {
      const amount = u.amount != null && Number.isFinite(u.amount) ? u.amount : null
      const v = (u.display ?? '').slice(0, 80) || (amount != null ? (d.kind === 'money' ? eur(amount) : String(amount)) : '')
      if (!v) continue
      next[u.key] = { st: u.status, v, n: d.kind === 'text' && d.key !== 'e_presales' ? null : amount, src }
    }
    keys.push(u.key)
  }
  return { next, keys }
}

export const MILESTONES = [
  '',
  'Milestone: the project is now teaser-ready. You can submit it for review.',
  'Milestone: the project is ready for lender outreach.',
  'Milestone: the data room is complete. Ask a Cobuildy expert to review before sharing.',
]

/** What a save changes in the figures investors see in the teaser. Used to ask for confirmation once a project is live. */
const KEY_LABEL: Record<string, string> = { ask_eur: 'Capital sought', cost_eur: 'Total cost', gdv_eur: 'Sales value (GDV)', margin: 'Margin', ltc: 'Loan to cost', units: 'Units', geo: 'Region', asset: 'Asset type', instrument: 'Instrument', license: 'Licence' }
export function keyChanges(prev: Fields, next: Fields): string[] {
  const a = columnsFor(prev) as Record<string, unknown>, b = columnsFor(next) as Record<string, unknown>
  const show = (k: string, v: unknown) => (v == null || (Array.isArray(v) && !v.length) ? '—' : k.endsWith('_eur') ? `€${Math.round(Number(v) / 1e4) / 100}M` : k === 'margin' || k === 'ltc' ? `${Math.round(Number(v) * 100)}%` : Array.isArray(v) ? v.join('/') : String(v))
  return Object.keys(KEY_LABEL).filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k])).map(k => `${KEY_LABEL[k]}: ${show(k, a[k])} → ${show(k, b[k])}`)
}
