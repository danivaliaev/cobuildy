import { GEO } from './types'

/** The seven questions of the public funnel (/start) and the maths behind its result. No network, so it can be tested. */

export type Strategy = 'land' | 'wip' | 'refurb'
export const STRATEGY: Array<{ v: Strategy; label: string }> = [
  { v: 'land', label: 'Land development' }, { v: 'wip', label: 'Work in progress' },
  { v: 'refurb', label: 'Refurbishment / Renovation' },
]
/** `pts` is how far along the project is, out of 25. */
export const STAGES: Record<Strategy, Array<{ v: string; label: string; pts: number }>> = {
  land: [
    { v: 'identified', label: 'Land identified', pts: 5 }, { v: 'reserved', label: 'Land reserved', pts: 12 },
    { v: 'purchased', label: 'Land purchased', pts: 19 }, { v: 'licensed', label: 'Building licence granted', pts: 25 },
  ],
  wip: [
    { v: 'started', label: 'Construction started', pts: 18 }, { v: 'partial', label: 'Construction partially completed', pts: 22 },
    { v: 'near', label: 'Near completion', pts: 25 },
  ],
  refurb: [
    { v: 'identified', label: 'Property identified', pts: 5 }, { v: 'acquired', label: 'Property acquired', pts: 14 },
    { v: 'started', label: 'Renovation started', pts: 20 }, { v: 'done', label: 'Renovation completed', pts: 25 },
  ],
}
export type Permit = 'granted' | 'submitted' | 'process' | 'none' | 'notreq'
export const PERMITS: Array<{ v: Permit; label: string; pts: number; license: 'granted' | 'submitted' | 'none' }> = [
  { v: 'granted', label: 'Yes, all permits granted', pts: 25, license: 'granted' },
  { v: 'submitted', label: 'Application submitted', pts: 17, license: 'submitted' },
  { v: 'process', label: 'In process', pts: 10, license: 'none' },
  { v: 'none', label: 'Not yet applied', pts: 3, license: 'none' },
  { v: 'notreq', label: 'Not required', pts: 25, license: 'granted' },
]
/** Regions offered as answers to "Where is your project located?" */
/** The islands are one region for investors but two answers for the visitor. */
export const REGIONS = [
  ...['CS', 'BCN', 'MAD', 'VLC'].map(v => ({ v, label: GEO[v], city: undefined as string | undefined })),
  { v: 'ISL', label: 'Balearic Islands', city: 'Balearic Islands' }, { v: 'ISL', label: 'Canary Islands', city: 'Canary Islands' },
  ...['LIS', 'OPO', 'ALG'].map(v => ({ v, label: GEO[v], city: undefined as string | undefined })),
]
/** Asked only when the typed place is not one the platform knows. */
export const COUNTRIES = [{ v: 'XES', label: 'Spain' }, { v: 'XPT', label: 'Portugal' }, { v: 'XX', label: 'Other country' }]
export const cleanCity = (t: string) => t.replace(/\s+/g, ' ').trim().slice(0, 80)

export interface Answers { strategy?: Strategy; geo?: string; city?: string; stage?: string; gdv?: number; ask?: number; equity?: number; permit?: Permit }
export type Complete = Required<Omit<Answers, 'city'>> & { city?: string }
export const complete = (a: Answers): a is Complete =>
  !!(a.strategy && a.geo && a.stage && a.gdv && a.ask && a.equity != null && a.permit)

/** "4.5M", "€4,500,000", "750k", "1.2 m", "2 000 000" → euros. Returns null when it is not a usable amount. */
export type Unit = 'k' | 'm'
/** `unit` is what a bare number means when it is small: with unit 'm', "5" is five million. A bare number of 1,000 or more is taken as euros. */
export function parseMoney(text: string, allowZero = false, unit?: Unit): number | null {
  const t = text.toLowerCase().replace(/[€\s]/g, '').replace(/eur(os?)?/, '')
  const m = t.match(/^(\d+(?:[.,]\d+)?|\d{1,3}(?:[.,]\d{3})+)(k|m|mm|mln)?$/)
  if (!m) return null
  let num = m[1]
  if (m[2]) num = num.replace(',', '.')                       // "1,5m" means 1.5 million
  else if (/^\d{1,3}([.,]\d{3})+$/.test(num)) num = num.replace(/[.,]/g, '') // "4,500,000" or "4.500.000"
  else num = num.replace(',', '.')
  const bare = !m[2] && unit && parseFloat(num) < 1000 ? (unit === 'k' ? 1e3 : 1e6) : 1
  const x = parseFloat(num) * (m[2] === 'k' ? 1e3 : m[2] ? 1e6 : bare)
  if (!Number.isFinite(x) || x > 5e9) return null
  if (x === 0) return allowZero ? 0 : null
  if (x < 1000) return null // nobody finances a project of a few euros: the amount was meant in thousands or millions
  return Math.round(x)
}

/** Everything a visitor answered, as short labelled parts for the admin lead tables. */
export function describeAnswers(a: Record<string, unknown> | null | undefined): string[] {
  if (!a) return []
  const x = a as Answers & Record<string, unknown>
  const str = STRATEGY.find(s => s.v === x.strategy)
  const stage = x.strategy ? STAGES[x.strategy as Strategy]?.find(s => s.v === x.stage) : undefined
  const place = typeof x.city === 'string' && x.city ? x.city : REGIONS.find(r => r.v === x.geo)?.label ?? COUNTRIES.find(c => c.v === x.geo)?.label
  const m = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const gdv = m(x.gdv), ask = m(x.ask), eq = m(x.equity)
  const fmt = (v: number) => (v >= 1e6 ? `€${Math.round(v / 1e5) / 10}M` : `€${Math.round(v / 1e3)}k`)
  return [
    str?.label, place, stage?.label,
    gdv ? `GDV ${fmt(gdv)}` : null, ask ? `Ask ${fmt(ask)}` : null,
    eq === 0 ? 'No own equity' : eq ? `Own equity ${fmt(eq)}` : null,
    PERMITS.find(p => p.v === x.permit)?.label ? `Permits: ${PERMITS.find(p => p.v === x.permit)!.label}` : null,
  ].filter((v): v is string => !!v)
}
/** Where a lead started: the Meta ad page, or the chat on the main site. Older leads all came from the Meta page. */
export const ENTRY_LABEL: Record<string, string> = { meta: 'Meta page', site: 'Main site' }

export interface Numbers { cost: number; ltc: number; margin: number; equityShare: number }
/** Total cost is what the developer needs plus what they put in. The funnel does not ask for it separately. */
export function numbers(a: { gdv: number; ask: number; equity: number }): Numbers {
  const cost = a.ask + a.equity
  return { cost, ltc: a.ask / cost, margin: (a.gdv - cost) / cost, equityShare: a.equity / cost }
}

/** 0–100: progress of the project (25), permits (25), the developer's own equity (25), profit on cost (25). */
export function score(a: Complete): { total: number; parts: { stage: number; permits: number; equity: number; margin: number } } {
  const n = numbers(a)
  const stage = STAGES[a.strategy].find(s => s.v === a.stage)?.pts ?? 0
  const permits = PERMITS.find(p => p.v === a.permit)?.pts ?? 0
  const equity = Math.round(25 * Math.min(1, Math.max(0, n.equityShare) / 0.3))
  const margin = Math.round(25 * Math.min(1, Math.max(0, n.margin) / 0.2))
  return { total: stage + permits + equity + margin, parts: { stage, permits, equity, margin } }
}

export function verdict(total: number): string {
  if (total >= 75) return 'Your project demonstrates good financing readiness.'
  if (total >= 50) return 'Your project shows moderate financing readiness. A few gaps are worth closing before you approach investors.'
  return 'Your project is at an early stage. Closing the main gaps will raise its chances with investors.'
}

export interface Matches { total: number; high: number; medium: number; low: number }
export function compatibility(m: Matches): string {
  if (m.high > 0) return 'Your project matches the investment criteria of investors in our network.'
  if (m.medium > 0 || m.low > 0) return 'Some investors in our network could be a fit. Completing your project profile shows how close.'
  return 'No investor in our network matches yet. Completing your project profile may change that.'
}

const PERMIT_STAGE: Record<Permit, string> = { granted: 'granted', submitted: 'submitted', process: 'prep', none: 'none', notreq: 'notreq' }

/** What the account gets once the visitor registers: the same shape the landing agent saves. */
export function toCarry(a: Complete, total: number, who?: { sid?: string; name?: string; phone?: string }) {
  const n = numbers(a)
  return {
    role: 'dev' as const, ts: Date.now(), sid: who?.sid, name: who?.name, phone: who?.phone,
    dev: { geo: a.geo, city: a.city, strategy: a.strategy, fstage: a.stage, gdv: a.gdv, ask: a.ask, equity: a.equity, cost: n.cost, stage: PERMIT_STAGE[a.permit], score: total },
  }
}

/** Meta Pixel, only when VITE_META_PIXEL_ID is set. Everything here is a no-op otherwise. */
type Fbq = (...args: unknown[]) => void
export function initPixel(): void {
  const id = import.meta.env.VITE_META_PIXEL_ID as string | undefined
  if (!id || !/^\d{6,20}$/.test(id) || (window as unknown as { fbq?: Fbq }).fbq) return
  const w = window as unknown as { fbq: Fbq & { queue?: unknown[]; callMethod?: (...a: unknown[]) => void; loaded?: boolean; version?: string; push?: unknown } }
  const f = function (...args: unknown[]) { if (f.callMethod) f.callMethod(...args); else f.queue!.push(args) } as Fbq & { queue: unknown[]; callMethod?: (...a: unknown[]) => void; loaded: boolean; version: string; push: unknown }
  f.push = f; f.loaded = true; f.version = '2.0'; f.queue = []
  w.fbq = f
  const s = document.createElement('script'); s.async = true; s.src = 'https://connect.facebook.net/en_US/fbevents.js'
  document.head.appendChild(s)
  w.fbq('init', id); w.fbq('track', 'PageView')
}
export function track(event: string, custom = false, data?: Record<string, unknown>): void {
  const fbq = (window as unknown as { fbq?: Fbq }).fbq
  if (fbq) fbq(custom ? 'trackCustom' : 'track', event, data)
}
