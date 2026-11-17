import { useSyncExternalStore } from 'react'

/** The interface language. English is the default; Spanish is chosen by the /es/ address, ?lang=es, a saved choice or the browser. */
export type Lang = 'en' | 'es'
export const LANGS: Lang[] = ['en', 'es']
const KEY = 'cb.lang'

const isLang = (v: unknown): v is Lang => v === 'en' || v === 'es'

/** Which language an address asks for: /es/... or ?lang=es. */
export function langOfUrl(pathname: string, search: string): Lang | null {
  if (/^\/es(\/|$)/.test(pathname)) return 'es'
  const q = new URLSearchParams(search).get('lang')
  return isLang(q) ? q : null
}

export function detectLang(): Lang {
  try {
    const u = langOfUrl(window.location.pathname, window.location.search)
    if (u) return u
    const saved = localStorage.getItem(KEY)
    if (isLang(saved)) return saved
    const nav = (navigator.languages?.[0] ?? navigator.language ?? 'en').toLowerCase()
    return nav.startsWith('es') ? 'es' : 'en'
  } catch { return 'en' }
}

let current: Lang = typeof window === 'undefined' ? 'en' : detectLang()
const subs = new Set<() => void>()
export const getLang = (): Lang => current

/** Remembers the choice, so the sign-in and the platform that follow a Spanish ad stay in Spanish. */
export function setLang(l: Lang): void {
  if (l === current) return
  current = l
  try { localStorage.setItem(KEY, l) } catch { /* private mode: the choice lasts for this page only */ }
  try { document.documentElement.lang = l } catch { /* ignore */ }
  subs.forEach(f => f())
}
/** Saves the language the address asked for, without notifying (used once at start). */
export function rememberUrlLang(): void {
  const u = langOfUrl(window.location.pathname, window.location.search)
  if (u) { try { localStorage.setItem(KEY, u) } catch { /* ignore */ } }
  try { document.documentElement.lang = current } catch { /* ignore */ }
}

export function useLang(): Lang {
  return useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f) } }, getLang, () => 'en' as Lang)
}

/** The same address in the other language, for the switch in the page header. */
export function otherLangHref(to: Lang, pathname = window.location.pathname, search = window.location.search): string {
  const bare = pathname.replace(/^\/es(?=\/|$)/, '') || '/'
  const path = to === 'es' ? `/es${bare === '/' ? '' : bare}` : bare
  const q = new URLSearchParams(search); q.delete('lang')
  const s = q.toString()
  return `${path}${s ? `?${s}` : ''}`
}

/** `{n}` placeholders in a string. */
export const fill = (s: string, v: Record<string, string | number>): string => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ''))
