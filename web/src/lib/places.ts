import { GEO } from './types'

/** Towns of Spain and Portugal with 1,000+ inhabitants, each in one platform region. Loaded only when a visitor types a place (lib/places.json, built by scripts/build-places.mjs). */
export interface Place { name: string; geo: string; label: string }

const CODE: Record<string, string> = { C: 'CS', B: 'BCN', M: 'MAD', V: 'VLC', I: 'ISL', L: 'LIS', O: 'OPO', A: 'ALG', E: 'XES', P: 'XPT' }
const ALIAS: Record<string, string> = { lisboa: 'lisbon', seville: 'sevilla', gerona: 'girona', saragossa: 'zaragoza', majorca: 'palma', oporto: 'porto', 'la coruna': 'a coruna', corunna: 'a coruna' }
export const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

/** How the place is written in the project: the region comes last, so it can be read back. A city named like its region stays bare. */
export function labelFor(name: string, geo: string): string {
  const region = geo === 'XES' ? 'Spain' : geo === 'XPT' ? 'Portugal' : GEO[geo]
  return norm(name) === norm(region) || (geo === 'LIS' && norm(name) === 'lisbon') ? name : `${name}, ${region}`
}

export interface Places { suggest: (text: string, max?: number) => Place[]; find: (text: string) => Place | null }
let cache: Promise<Places> | null = null
export function loadPlaces(): Promise<Places> {
  cache ??= import('./places.json').then(m => {
    const data = (m.default ?? m) as { n: string; c: string }
    const names = data.n.split('|')
    const keys = names.map(norm)
    const make = (i: number): Place => { const geo = CODE[data.c[i]]; return { name: names[i], geo, label: labelFor(names[i], geo) } }
    const find = (text: string) => { const k = norm(text); const i = keys.indexOf(ALIAS[k] ?? k); return i < 0 ? null : make(i) }
    const suggest = (text: string, max = 6) => {
      const k = ALIAS[norm(text)] ?? norm(text)
      if (k.length < 2) return []
      const out: Place[] = []
      // names are ordered by population, so the larger towns come first
      for (let i = 0; i < keys.length && out.length < max; i++) if (keys[i].startsWith(k)) out.push(make(i))
      for (let i = 0; i < keys.length && out.length < max; i++) if (!keys[i].startsWith(k) && keys[i].split(' ').some(w => w.length > 2 && w.startsWith(k))) out.push(make(i))
      return out
    }
    return { suggest, find }
  })
  return cache
}
