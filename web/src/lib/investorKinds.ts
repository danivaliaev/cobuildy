export type Kind = 'fund' | 'family_office' | 'crowdfunding' | 'hnwi' | 'bank'

export const KINDS: Array<{ k: Kind; label: string; hint: string; nameLabel: string; type: 'priv' | 'inst' }> = [
  { k: 'fund', label: 'Fund', hint: 'Debt, real-estate or private-equity fund', nameLabel: 'Fund name', type: 'inst' },
  { k: 'family_office', label: 'Family office', hint: 'Manages a family’s capital', nameLabel: 'Family office name', type: 'priv' },
  { k: 'crowdfunding', label: 'Crowdfunding platform', hint: 'Raises from many small investors', nameLabel: 'Platform name', type: 'inst' },
  { k: 'hnwi', label: 'Private investor (HNWI)', hint: 'High-net-worth individual', nameLabel: 'Your full name', type: 'priv' },
  { k: 'bank', label: 'Bank or lender', hint: 'Bank, credit fund or direct lender', nameLabel: 'Bank or lender name', type: 'inst' },
]

const LABEL: Record<string, string> = Object.fromEntries(KINDS.map(x => [x.k, x.label]))
export const kindLabel = (k: string | null | undefined) => (k ? LABEL[k] ?? k : '—')
export const kindType = (k: string | null | undefined) => KINDS.find(x => x.k === k)?.type ?? null

// ISO 3166-1 alpha-2 codes of countries; names come from the browser.
const CODES = 'AD AE AF AG AL AM AO AR AT AU AZ BA BB BD BE BF BG BH BI BJ BN BO BR BS BT BW BY BZ CA CD CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FR GA GB GD GE GH GM GN GQ GR GT GW GY HK HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KM KN KP KR KW KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MK ML MM MN MO MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NZ OM PA PE PG PH PK PL PT PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ TD TG TH TJ TL TM TN TO TR TT TW TZ UA UG US UY UZ VA VC VE VN VU WS YE ZA ZM ZW'.split(' ')

export function countryName(code: string | null | undefined): string {
  if (!code) return '—'
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code } catch { return code }
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
  !i.kind || !LABEL[i.kind] || !i.country || !i.phone || !validPhone(i.phone)
