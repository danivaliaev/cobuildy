import { getLang, tr } from '../i18n'
export type Kind = 'fund' | 'family_office' | 'crowdfunding' | 'hnwi' | 'bank'

const kind = (k: Kind, type: 'priv' | 'inst', en: [string, string, string], es: [string, string, string]) => ({
  k, type,
  get label() { return tr(en[0], es[0]) }, get hint() { return tr(en[1], es[1]) }, get nameLabel() { return tr(en[2], es[2]) },
})
export const KINDS = [
  kind('fund', 'inst', ['Fund', 'Debt, real-estate or private-equity fund', 'Fund name'], ['Fondo', 'Fondo de deuda, inmobiliario o de capital privado', 'Nombre del fondo']),
  kind('family_office', 'priv', ['Family office', 'Manages a family’s capital', 'Family office name'], ['Family office', 'Gestiona el patrimonio de una familia', 'Nombre del family office']),
  kind('crowdfunding', 'inst', ['Crowdfunding platform', 'Raises from many small investors', 'Platform name'], ['Plataforma de crowdfunding', 'Capta de muchos pequeños inversores', 'Nombre de la plataforma']),
  kind('hnwi', 'priv', ['Private investor (HNWI)', 'High-net-worth individual', 'Your full name'], ['Inversor privado (HNWI)', 'Persona de alto patrimonio', 'Tu nombre completo']),
  kind('bank', 'inst', ['Bank or lender', 'Bank, credit fund or direct lender', 'Bank or lender name'], ['Banco o prestamista', 'Banco, fondo de crédito o prestamista directo', 'Nombre del banco o prestamista']),
]

const KEYS = KINDS.map(x => x.k as string)
export const kindLabel = (k: string | null | undefined) => (k ? KINDS.find(x => x.k === k)?.label ?? k : '—')
export const kindType = (k: string | null | undefined) => KINDS.find(x => x.k === k)?.type ?? null

// ISO 3166-1 alpha-2 codes of countries; names come from the browser.
const CODES = 'AD AE AF AG AL AM AO AR AT AU AZ BA BB BD BE BF BG BH BI BJ BN BO BR BS BT BW BY BZ CA CD CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FR GA GB GD GE GH GM GN GQ GR GT GW GY HK HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KM KN KP KR KW KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MK ML MM MN MO MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NZ OM PA PE PG PH PK PL PT PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ TD TG TH TJ TL TM TN TO TR TT TW TZ UA UG US UY UZ VA VC VE VN VU WS YE ZA ZM ZW'.split(' ')

export function countryName(code: string | null | undefined): string {
  if (!code) return '—'
  try { return new Intl.DisplayNames([getLang()], { type: 'region' }).of(code) ?? code } catch { return code }
}
export const COUNTRIES = (): Array<{ code: string; name: string }> =>
  CODES.map(code => ({ code, name: countryName(code) })).sort((a, b) => a.name.localeCompare(b.name))

/** Same rule as the database: optional +, 7 to 24 allowed characters, at least 7 digits. */
export function validPhone(p: string): boolean {
  const t = p.trim()
  return /^\+?[0-9 ()./-]{7,24}$/.test(t) && t.replace(/\D/g, '').length >= 7
}

/** True when an investor still has to give type, country or phone. */
export const needsProfile = (i: { kind: string | null; country?: string | null; phone?: string | null }) =>
  !i.kind || !KEYS.includes(i.kind) || !i.country || !i.phone || !validPhone(i.phone)
