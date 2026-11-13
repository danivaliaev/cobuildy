// Builds web/src/lib/places.json: every town of Spain and Portugal with at least 1,000 inhabitants (GeoNames, via the all-the-cities package),
// each assigned to one of the platform regions. Run: cd scripts && npm i --no-save all-the-cities && node build-places.mjs
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
const require = createRequire(import.meta.url)
const cities = require('all-the-cities')

const km = ([lo1, la1], [lo2, la2]) => {
  const r = Math.PI / 180, dLa = (la2 - la1) * r, dLo = (lo2 - lo1) * r
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dLo / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(h))
}
// one-letter region codes: C Costa del Sol, B Barcelona, M Madrid, V Valencia, I Balearics/Canaries, L Lisbon, O Porto, A Algarve, E elsewhere in Spain, P elsewhere in Portugal
function region(c) {
  const [lo, la] = c.loc.coordinates
  if (c.country === 'ES') {
    if (c.adminCode === '29') return 'M'
    if (c.adminCode === '07' || c.adminCode === '53') return 'I'
    if (c.adminCode === '60') return 'V'
    if (c.adminCode === '56' && km([lo, la], [2.17, 41.39]) <= 110) return 'B'
    if (c.adminCode === '51' && la >= 36.2 && la <= 36.95 && lo >= -5.5 && lo <= -3.6) return 'C'
    return 'E'
  }
  if (c.adminCode === '14' || km([lo, la], [-9.14, 38.72]) <= 50) return 'L'
  if (c.adminCode === '17' || km([lo, la], [-8.61, 41.15]) <= 40) return 'O'
  if (c.adminCode === '09') return 'A'
  return 'P'
}
const norm = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
const seen = new Map()
for (const c of cities.filter(x => (x.country === 'ES' || x.country === 'PT') && x.population >= 1000).sort((a, b) => b.population - a.population)) {
  const key = norm(c.name) + '|' + c.country
  if (!seen.has(key)) seen.set(key, { name: c.name, r: region(c) })
}
const list = [...seen.values()]
writeFileSync(new URL('../web/src/lib/places.json', import.meta.url), JSON.stringify({ n: list.map(x => x.name).join('|'), c: list.map(x => x.r).join('') }))
console.log(list.length, 'places')
