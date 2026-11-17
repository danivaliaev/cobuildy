/** The visitor's choice about marketing cookies (Meta Pixel). Nothing marketing-related loads until it is "granted". */
const KEY = 'cb.consent.v1'
export type Consent = 'granted' | 'denied' | null
export function getConsent(): Consent {
  try { const v = localStorage.getItem(KEY); return v === 'granted' || v === 'denied' ? v : null } catch { return null }
}
export function setConsent(v: 'granted' | 'denied'): void { try { localStorage.setItem(KEY, v) } catch { /* private mode: asked again next visit */ } }
