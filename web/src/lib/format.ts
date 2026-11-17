import { getLang } from '../i18n'
export const eur = (n: number | null | undefined) =>
  n == null ? '—' : n >= 1e6 ? `€${(Math.round(n / 1e5) / 10).toString().replace(/\.0$/, '')}M` : `€${Math.round(n / 1e3)}k`
/** The same amounts for the screen in the visitor's language: Spanish writes "4,5 M€" and "750 k€". Stored values keep `eur`. */
export const eurFor = (n: number | null | undefined, lang: 'en' | 'es') => {
  if (lang === 'en' || n == null) return eur(n)
  return n >= 1e6 ? `${(Math.round(n / 1e5) / 10).toString().replace(/\.0$/, '').replace('.', ',')} M€` : `${Math.round(n / 1e3)} k€`
}
export const pct = (n: number | null | undefined) => (n == null ? '—' : `${Math.round(n * 100)}%`)
export const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString(getLang() === 'es' ? 'es-ES' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
/** Form helpers: empty string means unknown. */
export const toNum = (s: string): number | null => { const n = Number(s.replace(',', '.')); return s.trim() === '' || Number.isNaN(n) ? null : n }
export const fromNum = (n: number | null | undefined, scale = 1) => (n == null ? '' : String(Math.round((n / scale) * 1000) / 1000))
