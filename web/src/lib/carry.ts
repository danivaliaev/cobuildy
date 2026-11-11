import { supabase } from './supabase'
import { GEO } from './types'
import { applyUpdates, emptyFields, patchFor, type Update } from './profile'
import { eur } from './format'

/** Answers a visitor gave to the demo agent on the landing page. The landing saves them in this browser; the app imports them once after sign-in. */
export const CARRY_KEY = 'cb.carry.v1'
const MAX_AGE = 30 * 864e5

interface DevA { geo?: string; as?: string; stage?: string; cost?: number; ask?: number; ins?: string }
interface InvA { geo?: string[]; ins?: string; tk?: string; as?: string; lic?: number }
export interface Carry { role?: 'dev' | 'inv'; dev?: DevA; inv?: InvA; ts?: number }

function read(): Carry | null {
  try {
    const raw = localStorage.getItem(CARRY_KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as Carry
    if (!c || typeof c !== 'object' || !c.ts || Date.now() - c.ts > MAX_AGE) return null
    return c
  } catch { return null }
}
const clear = () => { try { localStorage.removeItem(CARRY_KEY) } catch { /* ignore */ } }

/** Which role the visitor was exploring on the landing, if they answered anything. */
export function carryRole(): 'developer' | 'investor' | null {
  const c = read()
  if (!c) return null
  if (c.role === 'inv' && c.inv && Object.keys(c.inv).length) return 'investor'
  if (c.dev && Object.keys(c.dev).length) return 'developer'
  return c.role === 'inv' ? 'investor' : c.role === 'dev' ? 'developer' : null
}

const ASSET_TEXT: Record<string, string> = { RES: 'Residential for sale', VIL: 'Luxury villas (residential)', BTR: 'Build-to-rent', HOS: 'Hospitality' }
const STAGE_TEXT: Record<string, string> = {
  none: 'No licence yet, not submitted', submitted: 'Licence submitted, waiting', granted: 'Licence granted', build: 'Licence granted, under construction',
}
const INS_TEXT: Record<string, string> = { senior: 'Senior loan', mezz: 'Mezzanine', equity: 'Equity partner' }
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 1e10 ? Math.round(v) : null)

/** Landing answers as profile updates. Unknown or invalid values are skipped. */
export function devUpdates(a: DevA): Update[] {
  const u: Update[] = []
  if (a.as && ASSET_TEXT[a.as]) u.push({ key: 'a_type', status: 'filled', display: ASSET_TEXT[a.as] })
  if (a.geo && GEO[a.geo]) u.push({ key: 'a_loc', status: 'filled', display: GEO[a.geo] })
  if (a.stage && STAGE_TEXT[a.stage]) u.push({ key: 'p_status', status: a.stage === 'granted' || a.stage === 'build' ? 'filled' : 'partial', display: STAGE_TEXT[a.stage] })
  const cost = num(a.cost); if (cost) u.push({ key: 'f_cost', status: 'filled', display: eur(cost), amount: cost })
  const ask = num(a.ask); if (ask) u.push({ key: 'k_ask', status: 'filled', display: eur(ask), amount: ask })
  if (a.ins === 'any') u.push({ key: 'k_instr', status: 'partial', display: 'Open to any capital type' })
  else if (a.ins && INS_TEXT[a.ins]) u.push({ key: 'k_instr', status: 'filled', display: INS_TEXT[a.ins] })
  return u
}

async function importDeveloper(userId: string, a: DevA) {
  const updates = devUpdates(a)
  if (!updates.length) return
  const { data: existing } = await supabase.from('projects').select('id').eq('owner_id', userId).limit(1)
  if (existing && existing.length) return // never touch an account that already has projects
  const { data: co } = await supabase.from('companies').select('id').eq('owner_id', userId).maybeSingle()
  const { next } = applyUpdates(emptyFields(), updates, 'form')
  const title = [a.as ? ASSET_TEXT[a.as] : 'My project', a.geo ? GEO[a.geo] : ''].filter(Boolean).join(' · ').slice(0, 120)
  const { data: p, error } = await supabase.from('projects').insert({ title, owner_id: userId, company_id: co?.id ?? null, status: 'draft' }).select('id,profile').single()
  if (error || !p) return
  await supabase.from('projects').update(patchFor({ profile: (p.profile as Record<string, unknown> | null) ?? null }, next)).eq('id', p.id)
}

const TK: Record<string, [number, number]> = { '0.3,1': [3e5, 1e6], '1,3': [1e6, 3e6], '3,6': [3e6, 6e6], '6,20': [6e6, 2e7] }
const ALL = { ins: ['senior', 'mezz', 'equity'], as: ['RES', 'BTR', 'HOS'] }

async function importInvestor(userId: string, a: InvA) {
  const row: Record<string, unknown> = {}
  const geos = (a.geo ?? []).filter(g => GEO[g]); if (geos.length) row.geos = geos
  if (a.ins === 'any') row.instruments = ALL.ins; else if (a.ins && INS_TEXT[a.ins]) row.instruments = [a.ins]
  if (a.as === 'any') row.assets = ALL.as; else if (a.as && ALL.as.includes(a.as)) row.assets = [a.as]
  if (a.tk && TK[a.tk]) { row.ticket_min = TK[a.tk][0]; row.ticket_max = TK[a.tk][1] }
  if (a.lic === 2) row.min_license = 'granted'; else if (a.lic === 1) row.min_license = 'submitted'; else if (a.lic === 0) row.min_license = 'none'
  if (!Object.keys(row).length) return
  const { data: inv } = await supabase.from('investors').select('id,geos,instruments').eq('user_id', userId).maybeSingle()
  if (!inv || (inv.geos?.length ?? 0) > 0 || (inv.instruments?.length ?? 0) > 0) return // keep a mandate that already exists
  await supabase.from('investors').update(row).eq('id', inv.id)
}

/** Imports the saved landing answers into the account, once. Failures are silent: the person can always answer again. */
export async function importCarry(userId: string, role: string): Promise<void> {
  const c = read()
  if (!c) return
  clear()
  try {
    if (role === 'developer' && c.dev) await importDeveloper(userId, c.dev)
    else if (role === 'investor' && c.inv) await importInvestor(userId, c.inv)
  } catch { /* ignore */ }
}
