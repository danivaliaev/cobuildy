export type Role = 'admin' | 'expert' | 'developer' | 'investor'
export type DealStage = 'sent' | 'interested' | 'nda_sent' | 'room' | 'shared' | 'qa' | 'answered' | 'ts' | 'call' | 'passed'
export type ProjectStatus = 'draft' | 'teaser_review' | 'approved' | 'live' | 'closed_won' | 'closed_lost' | 'discarded'

export interface Profile { id: string; role: Role; full_name: string | null }
export interface Invitation {
  id: string; email: string; role: Role; company_name: string | null; status: 'pending' | 'approved' | 'sent' | 'accepted' | 'revoked'
  created_at: string; approved_at: string | null
}
export interface Company {
  id: string; owner_id: string; name: string; website: string | null; founded: number | null; delivered: number; volume_m: number
  units: number; active: number; team: number; refs: number
  ver_registry: boolean; ver_web: boolean; ver_fin: boolean; ver_refs: boolean
}
export interface Project {
  id: string; code: string; company_id: string | null; owner_id: string; title: string; status: ProjectStatus
  geo: string | null; city: string | null; asset: string | null; strategy: 'land' | 'wip' | 'refurb' | 'acq' | null; instrument: string[]
  ask_eur: number | null; cost_eur: number | null; gdv_eur: number | null; ltc: number | null; margin: number | null
  license: 'none' | 'submitted' | 'granted' | null; presales: number | null; units: number | null
  build_months: number | null; term_months: number | null; expected_return: number | null
  readiness: number; stage: number; profile: Record<string, unknown> | null
}
export interface ProjectDoc { id: string; project_id: string; kind: string; title: string; storage_path: string | null; file_name: string | null; size_bytes: number | null; field_key: string | null }
export interface Investor {
  id: string; code: string; kind: string | null; country: string | null; phone: string | null; name: string; email: string | null; user_id: string | null
  instruments: string[]; geos: string[]; assets: string[]
  ticket_min: number | null; ticket_max: number | null; min_license: 'none' | 'submitted' | 'granted' | null
  max_ltc: number | null; min_return: number | null; max_term: number | null; min_track: number | null
  min_margin: number | null; min_presales: number | null
  declared_qualified_at: string | null; kyc_status: 'none' | 'pending' | 'passed' | 'failed'
  mandate: { type?: 'priv' | 'inst' | null; st?: Record<string, string> } | null
  active?: boolean; category?: string | null; crm_id?: string | null
  crm?: { type?: string | null; category?: string; instrument?: string; ticket?: string; geographies?: string; assets?: string; slug?: string } | null
}
export interface Match { investor_id: string; code: string; bucket: 'fit' | 'possible' | 'later' | 'out'; score: number; kind?: string | null; country?: string | null; missing?: string[] }
export interface ProjectDeal {
  deal_id: string; investor_code: string; investor_kind: string | null; stage: DealStage; reason: string | null
  investor_name: string | null; call_slot: string | null; nda_dev_signed?: boolean; nda_inv_signed?: boolean; recorded_channel?: string | null
}
export interface InvestorReply {
  deal_id: string; project_code: string; project_title: string | null; investor_code: string; investor_name: string; investor_category: string | null
  stage: DealStage; sent_at: string; reply: 'interest' | 'pass' | null; channel: string | null; note: string | null; recorded_by: string | null; recorded_at: string | null
}
export const CHANNEL: Record<string, string> = { email: 'email', phone: 'phone call', whatsapp: 'WhatsApp', linkedin: 'LinkedIn', meeting: 'meeting', other: 'other' }
export interface Teaser {
  deal_id: string; stage: DealStage; project_code: string; geo: string | null; asset: string | null; instrument: string[]
  ask_eur: number | null; cost_eur: number | null; gdv_eur: number | null; margin: number | null; license: string | null
  units: number | null; build_months: number | null; presales: number | null; changed_at?: string | null; sent_at?: string | null; nda_dev_signed?: boolean; nda_inv_signed?: boolean
  sponsor_years: number | null; sponsor_delivered: number | null; sponsor_volume_m: number | null; sponsor_checks: number | null
}
export interface DealMessage { id: string; deal_id: string; side: 'investor' | 'developer' | 'agent'; kind: 'question' | 'answer' | 'note'; body: string; created_at: string }

export const GEO: Record<string, string> = {
  CS: 'Costa del Sol', BCN: 'Barcelona', MAD: 'Madrid', VLC: 'Valencia', ISL: 'Balearics / Canaries', LIS: 'Lisbon', OPO: 'Porto', ALG: 'Algarve',
  XES: 'Elsewhere in Spain', XPT: 'Elsewhere in Portugal',
}
export const ASSET: Record<string, string> = { RES: 'Residential', BTR: 'Build-to-rent', HOS: 'Hospitality' }
// Investor mandates may be broader than what a single project uses: whole countries, Europe, other regions, more asset types.
export const INV_GEO: Record<string, string> = {
  ...GEO, ES: 'Spain (all)', PT: 'Portugal (all)', EU: 'Europe', XX: 'Outside Europe',
}
export const INV_ASSET: Record<string, string> = {
  ...ASSET, COM: 'Commercial / office / retail', LND: 'Land', LOG: 'Logistics / storage', PBS: 'Student housing / PBSA', OTH: 'Other',
}
// Does an investor's region list cover a project region? Mirrors public.geo_match in the database.
export const ES_CODES = ['CS', 'BCN', 'MAD', 'VLC', 'ISL', 'XES']
export const PT_CODES = ['LIS', 'OPO', 'ALG', 'XPT']
export function geoCovers(inv: string[], proj: string): boolean {
  return inv.includes(proj) || (inv.includes('EU') && proj !== 'XX') || (inv.includes('ES') && ES_CODES.includes(proj)) || (inv.includes('PT') && PT_CODES.includes(proj))
}
export const INSTRUMENT: Record<string, string> = { senior: 'Senior loan', mezz: 'Mezzanine', equity: 'Equity' }
export const LICENSE: Record<string, string> = { none: 'No permit yet', submitted: 'Permit submitted', granted: 'Permit granted' }
export const STAGE_LABEL: Record<DealStage, string> = {
  sent: 'Sent', interested: 'Interested', nda_sent: 'NDA sent', room: 'Data room', shared: 'Documents shared', qa: 'Questions',
  answered: 'Answers sent', ts: 'Term sheet talk', call: 'Call confirmed', passed: 'Passed',
}
