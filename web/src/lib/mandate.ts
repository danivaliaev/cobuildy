import { eur, pct } from './format'
import { ASSET, GEO, INSTRUMENT, type Investor, type Teaser } from './types'

/** The guided investor mandate: 12 questions in 5 sections, ported from the prototype.
 *  Values live in the investor's own columns (these are the filters the matching function reads);
 *  `investors.mandate` only remembers which questions were answered, skipped or do not apply. */
export type MKey = 'type' | 'geo' | 'asset' | 'ins' | 'tk' | 'stage' | 'ltc' | 'ret' | 'term' | 'track' | 'margin' | 'pre'
export type MSt = 'filled' | 'unknown' | 'na'
export interface Vals {
  geo: string[] | null; asset: string[] | null; ins: string[] | null; tk: { lo: number; hi: number } | null; stage: 0 | 1 | 2 | null
  ltc: number | null; ret: number | null; term: number | null; track: number | null; margin: number | null; pre: number | null
}
export interface Mandate { type: 'priv' | 'inst' | null; st: Partial<Record<MKey, MSt>>; v: Vals }
export interface Chip { l: string; v?: unknown; u?: boolean }
export interface MField { k: MKey; s: string; l: string; w: number; multi?: boolean; q: string; chips: (m: Mandate) => Chip[] }

const NOPREF: Chip = { l: 'No preference', v: null }
const NS: Chip = { l: 'Not sure yet', u: true }
const geoChips: Chip[] = Object.entries(GEO).map(([v, l]) => ({ l, v }))
export const SECS: Array<[string, string]> = [['profile', 'You'], ['where', 'What you invest in'], ['size', 'Size and stage'], ['risk', 'Risk and return'], ['sponsor', 'Sponsor and deal quality']]
export const FIELDS: MField[] = [
  { k: 'type', s: 'profile', l: 'Investor type', w: 1, q: 'Do you invest as a private investor or family office, or as an institutional lender or fund?', chips: () => [{ l: 'Private investor / family office', v: 'priv' }, { l: 'Institutional lender / fund', v: 'inst' }] },
  { k: 'geo', s: 'where', l: 'Regions', w: 2, multi: true, q: 'Which regions do you invest in? Pick all that apply.', chips: () => geoChips },
  { k: 'asset', s: 'where', l: 'Asset types', w: 2, multi: true, q: 'Which asset types?', chips: () => Object.entries(ASSET).map(([v, l]) => ({ l, v })) },
  { k: 'ins', s: 'where', l: 'Instruments', w: 2, multi: true, q: 'Which instruments do you write?', chips: () => [{ l: 'Senior loan', v: 'senior' }, { l: 'Mezzanine', v: 'mezz' }, { l: 'Equity', v: 'equity' }] },
  { k: 'tk', s: 'size', l: 'Ticket size', w: 2, q: 'What ticket size fits?', chips: m => (m.type === 'inst'
    ? [{ l: '€3–6M', v: { lo: 3e6, hi: 6e6 } }, { l: '€6–10M', v: { lo: 6e6, hi: 1e7 } }, { l: '€10M and above', v: { lo: 1e7, hi: 1e10 } }]
    : [{ l: '€0.3–1M', v: { lo: 3e5, hi: 1e6 } }, { l: '€1–3M', v: { lo: 1e6, hi: 3e6 } }, { l: '€3–6M', v: { lo: 3e6, hi: 6e6 } }]) },
  { k: 'stage', s: 'size', l: 'Earliest stage', w: 2, q: 'What is the earliest project stage you accept?', chips: () => [{ l: 'Permit granted only', v: 2 }, { l: 'Permit submitted or better', v: 1 }, { l: 'Any stage', v: 0 }] },
  { k: 'ltc', s: 'risk', l: 'Maximum LTC', w: 1, q: 'What is the highest loan-to-cost you accept on debt?', chips: () => [{ l: 'Up to 55%', v: 0.55 }, { l: 'Up to 65%', v: 0.65 }, { l: 'Up to 75%', v: 0.75 }, NOPREF, NS] },
  { k: 'ret', s: 'risk', l: 'Minimum return', w: 1, q: 'What minimum return do you need (interest for debt, IRR for equity)?', chips: m => (m.type === 'inst'
    ? [{ l: '8% or more', v: 8 }, { l: '10% or more', v: 10 }, { l: '12% or more', v: 12 }, NOPREF, NS]
    : [{ l: '8% or more', v: 8 }, { l: '12% or more', v: 12 }, { l: '18% or more', v: 18 }, NOPREF, NS]) },
  { k: 'term', s: 'risk', l: 'Maximum duration', w: 1, q: 'How long can your capital be tied up?', chips: () => [{ l: 'Up to 12 months', v: 12 }, { l: 'Up to 24 months', v: 24 }, { l: 'Up to 36 months', v: 36 }, NOPREF, NS] },
  { k: 'track', s: 'sponsor', l: 'Sponsor track record', w: 1, q: 'How many delivered projects do you require from the sponsor?', chips: () => [{ l: '3+ projects delivered', v: 3 }, { l: '5+ projects delivered', v: 5 }, NOPREF, NS] },
  { k: 'margin', s: 'sponsor', l: 'Minimum developer margin', w: 1, q: 'What minimum margin on cost should the developer show?', chips: () => [{ l: '15% or more', v: 0.15 }, { l: '20% or more', v: 0.2 }, { l: '25% or more', v: 0.25 }, NOPREF, NS] },
  { k: 'pre', s: 'sponsor', l: 'Minimum pre-sales', w: 1, q: 'What share of units should be pre-sold on residential projects?', chips: () => [{ l: '30% or more', v: 0.3 }, { l: '50% or more', v: 0.5 }, NOPREF, NS] },
]
export const FK = Object.fromEntries(FIELDS.map(f => [f.k, f])) as Record<MKey, MField>
const KEYS = FIELDS.map(f => f.k)

export const blankVals = (): Vals => ({ geo: null, asset: null, ins: null, tk: null, stage: null, ltc: null, ret: null, term: null, track: null, margin: null, pre: null })
const STAGE_FROM = { none: 0, submitted: 1, granted: 2 } as const
const STAGE_TO = ['none', 'submitted', 'granted'] as const

/** Rebuilds the mandate from the investor row. A value in a column counts as answered even if it was entered elsewhere. */
export function hydrate(inv: Investor): Mandate {
  const v: Vals = {
    geo: inv.geos?.length ? inv.geos : null, asset: inv.assets?.length ? inv.assets : null, ins: inv.instruments?.length ? inv.instruments : null,
    tk: inv.ticket_min != null || inv.ticket_max != null ? { lo: Number(inv.ticket_min ?? 0), hi: inv.ticket_max == null ? 1e10 : Number(inv.ticket_max) } : null,
    stage: inv.min_license ? STAGE_FROM[inv.min_license] : null,
    ltc: inv.max_ltc == null ? null : Number(inv.max_ltc), ret: inv.min_return == null ? null : Math.round(Number(inv.min_return) * 1000) / 10,
    term: inv.max_term, track: inv.min_track, margin: inv.min_margin == null ? null : Number(inv.min_margin), pre: inv.min_presales == null ? null : Number(inv.min_presales),
  }
  const saved = inv.mandate?.st ?? {}
  const type = inv.mandate?.type === 'priv' || inv.mandate?.type === 'inst' ? inv.mandate.type : null
  const st: Mandate['st'] = {}
  for (const k of KEYS) {
    const s = saved[k]
    const has = k === 'type' ? type != null : v[k] != null
    if (has) st[k] = 'filled'
    else if (s === 'filled' || s === 'unknown' || s === 'na') st[k] = s
  }
  return normalize({ type, st, v })
}

/** Questions that do not apply are marked so: LTC for equity-only investors, pre-sales for private investors. */
export function normalize(m: Mandate): Mandate {
  const st = { ...m.st }; const v = { ...m.v }
  const equityOnly = m.st.ins === 'filled' && m.v.ins != null && m.v.ins.every(i => i === 'equity')
  if (equityOnly) { st.ltc = 'na'; v.ltc = null } else if (st.ltc === 'na') delete st.ltc
  if (m.type === 'priv') { st.pre = 'na'; v.pre = null } else if (st.pre === 'na') delete st.pre
  return { type: m.type, st, v }
}

/** The investor-row patch for one save: the matching filters plus the answer states. */
export function columnsFor(m: Mandate) {
  const v = m.v
  return {
    geos: v.geo ?? [], assets: v.asset ?? [], instruments: v.ins ?? [],
    ticket_min: v.tk ? v.tk.lo : null, ticket_max: v.tk && v.tk.hi < 1e9 ? v.tk.hi : null,
    min_license: v.stage == null ? null : STAGE_TO[v.stage],
    max_ltc: v.ltc, min_return: v.ret == null ? null : Math.round(v.ret * 10) / 1000, max_term: v.term, min_track: v.track, min_margin: v.margin, min_presales: v.pre,
    mandate: { type: m.type, st: m.st },
  }
}

// ---------- answers ----------
export interface Update { key: MKey; status: 'filled' | 'unknown'; value?: unknown }
const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null)
const frac = (x: unknown): number | null => { const n = num(x); if (n == null || n <= 0) return null; return n > 1 ? (n <= 100 ? n / 100 : null) : n }
const list = (x: unknown, allowed: Record<string, string>): string[] | null | undefined => {
  if (x == null) return null
  if (!Array.isArray(x)) return undefined
  const out = [...new Set(x.filter((i): i is string => typeof i === 'string' && i in allowed))]
  return x.length && !out.length ? undefined : out.length ? out : null
}

/** Checks one answer. `undefined` means the value is not acceptable; `null` means "no preference". */
export function coerce(k: MKey, x: unknown): unknown {
  switch (k) {
    case 'type': return x === 'priv' || x === 'inst' ? x : undefined
    case 'geo': return list(x, GEO)
    case 'asset': return list(x, ASSET)
    case 'ins': return list(x, INSTRUMENT)
    case 'tk': {
      if (x == null) return null
      const o = x as { lo?: unknown; hi?: unknown }; const lo = num(o.lo), hi = num(o.hi)
      return lo != null && hi != null && lo >= 0 && hi >= lo && hi <= 1e10 ? { lo, hi } : undefined
    }
    case 'stage': return x === 0 || x === 1 || x === 2 ? x : x == null ? null : undefined
    case 'ltc': case 'margin': case 'pre': return x == null ? null : frac(x) ?? undefined
    case 'ret': { const n = num(x); return x == null ? null : n != null && n > 0 && n <= 100 ? n : undefined }
    case 'term': { const n = num(x); return x == null ? null : n != null && n >= 1 && n <= 600 ? Math.round(n) : undefined }
    case 'track': { const n = num(x); return x == null ? null : n != null && n >= 0 && n <= 200 ? Math.round(n) : undefined }
  }
}

export function applyUpdates(m: Mandate, updates: Update[]): { next: Mandate; keys: MKey[] } {
  let type = m.type; const st = { ...m.st }; const v: Vals = { ...m.v }; const keys: MKey[] = []
  for (const u of updates) {
    if (!(u.key in FK) || (m.st[u.key] === 'na' && u.status !== 'unknown')) continue
    if (u.status === 'unknown') { if (u.key === 'type') type = null; else (v as unknown as Record<string, unknown>)[u.key] = null; st[u.key] = 'unknown'; keys.push(u.key); continue }
    const c = coerce(u.key, u.value)
    if (c === undefined) continue
    if (u.key === 'type') type = c as 'priv' | 'inst'; else (v as unknown as Record<string, unknown>)[u.key] = c
    st[u.key] = 'filled'; keys.push(u.key)
  }
  return { next: normalize({ type, st, v }), keys: [...new Set(keys)] }
}

export const stateOf = (m: Mandate, k: MKey): MSt | undefined => m.st[k]
export const known = (m: Mandate, k: MKey) => m.st[k] === 'filled' && (k === 'type' ? m.type != null : m.v[k] != null)
export const nextKey = (m: Mandate): MKey | null => FIELDS.find(f => m.st[f.k] === undefined)?.k ?? null

export function fmt(m: Mandate, k: MKey): string {
  const s = m.st[k]
  if (s === 'na') return 'Not asked for this mandate'
  if (s !== 'filled') return ''
  if (k === 'type') return m.type === 'priv' ? 'Private investor / family office' : 'Institutional lender / fund'
  const v = m.v
  switch (k) {
    case 'geo': return v.geo ? v.geo.map(g => GEO[g]).join(', ') : 'No preference'
    case 'asset': return v.asset ? v.asset.map(a => ASSET[a]).join(', ') : 'No preference'
    case 'ins': return v.ins ? v.ins.map(i => INSTRUMENT[i]).join(', ') : 'No preference'
    case 'tk': return v.tk ? (v.tk.hi >= 1e9 ? `${eur(v.tk.lo)} and above` : `${eur(v.tk.lo)} to ${eur(v.tk.hi)}`) : 'No preference'
    case 'stage': return v.stage === 2 ? 'Permit granted only' : v.stage === 1 ? 'Permit submitted or better' : 'Any stage'
    case 'ltc': return v.ltc == null ? 'No preference' : `Up to ${pct(v.ltc)}`
    case 'ret': return v.ret == null ? 'No preference' : `${v.ret}% or more`
    case 'term': return v.term == null ? 'No preference' : `Up to ${v.term} months`
    case 'track': return v.track == null ? 'No preference' : `${v.track}+ projects delivered`
    case 'margin': return v.margin == null ? 'No preference' : `${pct(v.margin)} or more`
    case 'pre': return v.pre == null ? 'No preference' : `${pct(v.pre)} or more`
  }
}

/** How complete the mandate is. level 1: the five filters that decide who sees a project are set. level 2: everything is answered. */
export function clarity(m: Mandate) {
  let W = 0, P = 0
  for (const f of FIELDS) { if (m.st[f.k] === 'na') continue; W += f.w; if (m.st[f.k] === 'filled') P += f.w }
  const core = (['geo', 'asset', 'ins', 'tk', 'stage'] as MKey[]).every(k => m.st[k] === 'filled')
  const all = FIELDS.every(f => m.st[f.k] === 'filled' || m.st[f.k] === 'na')
  return { score: W ? Math.round((100 * P) / W) : 0, level: all ? 2 : core ? 1 : 0 } as { score: number; level: 0 | 1 | 2 }
}

// ---------- checking a teaser against the mandate ----------
export interface Crit { k: MKey; hard: boolean; r: 'pass' | 'fail' | 'unk'; l: string; d: string }
const LICN = ['No permit yet', 'Permit submitted', 'Permit granted']
const LICMIN = ['any stage', 'permit submitted or better', 'permit granted']
const rank = (l: string | null) => (l === 'granted' ? 2 : l === 'submitted' ? 1 : l === 'none' ? 0 : null)
const name = (g: string | null, d: Record<string, string>) => (g ? d[g] ?? g : '')

/** Return and duration are not part of the anonymous teaser, so they are not checked here. */
export function crit(m: Mandate, t: Teaser): Crit[] {
  const out: Crit[] = []; const v = m.v
  const chk = (k: MKey, hard: boolean, value: unknown, test: () => boolean, pass: string, fail: string, applies = true) => {
    if (!applies || m.st[k] === 'na') return
    if (!known(m, k)) { if (m.st[k] !== 'filled') out.push({ k, hard, r: 'unk', l: FK[k].l, d: 'Not set in your mandate yet' }); return }
    if (value == null) { out.push({ k, hard, r: 'unk', l: FK[k].l, d: 'Not in the teaser' }); return }
    out.push({ k, hard, r: test() ? 'pass' : 'fail', l: FK[k].l, d: test() ? pass : fail })
  }
  const debt = t.instrument.some(i => i !== 'equity')
  const ltc = t.ask_eur != null && t.cost_eur ? t.ask_eur / t.cost_eur : null
  chk('geo', true, t.geo, () => v.geo!.includes(t.geo!), `${name(t.geo, GEO)} is in your regions`, `${name(t.geo, GEO)} is outside your regions`)
  chk('asset', true, t.asset, () => v.asset!.includes(t.asset!), `${name(t.asset, ASSET)} matches your asset types`, `${name(t.asset, ASSET)} is not in your asset types`)
  chk('ins', true, t.instrument.length ? t.instrument : null, () => t.instrument.some(i => v.ins!.includes(i)), `${t.instrument.map(i => INSTRUMENT[i]).join(' / ')} is an instrument you write`, `Offers ${t.instrument.map(i => INSTRUMENT[i]?.toLowerCase()).join(' / ')}`)
  chk('tk', true, t.ask_eur, () => t.ask_eur! >= v.tk!.lo && t.ask_eur! <= v.tk!.hi, `Ask ${eur(t.ask_eur)} is in your ${fmt(m, 'tk')} range`, `Ask ${eur(t.ask_eur)} is outside ${fmt(m, 'tk')}`)
  chk('stage', true, rank(t.license), () => rank(t.license)! >= v.stage!, LICN[rank(t.license) ?? 0], `${LICN[rank(t.license) ?? 0]}; you need ${LICMIN[v.stage ?? 0]}`)
  chk('ltc', false, ltc, () => ltc! <= v.ltc!, `LTC ${pct(ltc)} is within your ${pct(v.ltc)} cap`, `LTC ${pct(ltc)} is above your ${pct(v.ltc)} cap`, debt)
  chk('track', false, t.sponsor_delivered, () => t.sponsor_delivered! >= v.track!, `Sponsor delivered ${t.sponsor_delivered} projects`, `Sponsor delivered ${t.sponsor_delivered}, you need ${v.track}+`)
  chk('margin', false, t.margin, () => t.margin! >= v.margin!, `Developer margin ${pct(t.margin)}`, `Developer margin ${pct(t.margin)} is below ${pct(v.margin)}`)
  chk('pre', false, t.presales, () => t.presales! >= v.pre!, `Pre-sales ${pct(t.presales)}`, `Pre-sales ${pct(t.presales)} are below ${pct(v.pre)}`)
  return out
}

export interface Fit { t: Teaser; c: Crit[]; fit: number; bucket: 'match' | 'near' | 'out'; soft: Crit[]; unk: number }
export function evalTeaser(m: Mandate, t: Teaser): Fit {
  const c = crit(m, t); let T = 0, P = 0
  for (const x of c) { const w = x.hard ? 2 : 1; T += w; P += x.r === 'pass' ? w : x.r === 'unk' ? w * 0.5 : 0 }
  const hardFail = c.some(x => x.hard && x.r === 'fail'); const soft = c.filter(x => !x.hard && x.r === 'fail')
  return { t, c, fit: T ? Math.round((100 * P) / T) : 50, bucket: hardFail ? 'out' : soft.length ? 'near' : 'match', soft, unk: c.filter(x => x.r === 'unk').length }
}

/** Which single answer, if relaxed, would bring the most close projects inside the mandate. */
export function unlocks(fits: Fit[]): Array<[MKey, number]> {
  const n: Partial<Record<MKey, number>> = {}
  for (const f of fits) if (f.bucket === 'near' && f.soft.length === 1) n[f.soft[0].k] = (n[f.soft[0].k] ?? 0) + 1
  return (Object.entries(n) as Array<[MKey, number]>).sort((a, b) => b[1] - a[1])
}
