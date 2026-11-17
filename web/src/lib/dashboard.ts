import { calc, hydrate, type Calc } from './profile'
import { eur, eurFor } from './format'
import { kindLabel } from './investorKinds'
import { STAGE_LABEL, type Project, type ProjectDeal } from './types'
import { getLang, tr } from '../i18n'

export type Tone = 'bad' | 'warn' | 'good' | 'plan'
export type ProjTab = 'profile' | 'investors' | 'room'
export interface ProjView { p: Project; c: Calc; fit: string[]; poss: string[]; deals: ProjectDeal[] }
export interface Attn { tone: Tone; projectId: string; project: string; title: string; sub: string; go: string; tab: ProjTab }

export function view(p: Project, matches: Array<{ code: string; bucket: string }>, deals: ProjectDeal[]): ProjView {
  return { p, c: calc(hydrate(p)), fit: matches.filter(m => m.bucket === 'fit').map(m => m.code), poss: matches.filter(m => m.bucket === 'possible').map(m => m.code), deals }
}

/** Investor replies come first: they are the only items with someone waiting. */
const W: Record<Tone, number> = { bad: 0, good: 1, warn: 2, plan: 3 }
const byTone = (a: Attn, b: Attn) => W[a.tone] - W[b.tone]
const who = (d: ProjectDeal) => `${d.investor_name ?? d.investor_code} · ${kindLabel(d.investor_kind)}`
const ES_NOUN: Record<string, [string, string]> = { project: ['proyecto', 'proyectos'], investor: ['inversor', 'inversores'], 'matching investor': ['inversor compatible', 'inversores compatibles'], item: ['elemento', 'elementos'], 'open question': ['pregunta abierta', 'preguntas abiertas'] }
const plural = (n: number, w: string) => (getLang() === 'es' && ES_NOUN[w] ? `${n} ${ES_NOUN[w][n === 1 ? 0 : 1]}` : `${n} ${w}${n === 1 ? '' : 's'}`)
export { plural }

const DEAL = (): Partial<Record<ProjectDeal['stage'], [Tone, string, string, string, ProjTab]>> => ({
  interested: ['good', tr('is interested', 'está interesado'), tr('Accept and send the NDA, or decline.', 'Acepta y envía el NDA, o recházalo.'), tr('Respond', 'Responder'), 'investors'],
  nda_sent: ['good', tr('is waiting for the NDA', 'espera el NDA'), tr('Sign the NDA so the data room can open.', 'Firma el NDA para que se abra el data room.'), tr('Sign', 'Firmar'), 'investors'],
  room: ['good', tr('signed the NDA', 'ha firmado el NDA'), tr('Choose which documents to share.', 'Elige qué documentos compartir.'), tr('Share documents', 'Compartir documentos'), 'room'],
  qa: ['good', tr('sent questions', 'ha enviado preguntas'), tr('Answer them to keep the process moving.', 'Respóndelas para que el proceso siga avanzando.'), tr('Answer', 'Responder'), 'investors'],
  ts: ['good', tr('wants a term sheet discussion', 'quiere hablar del term sheet'), tr('Confirm a call slot.', 'Confirma una franja para la llamada.'), tr('Confirm', 'Confirmar'), 'investors'],
})

/** What needs the developer's action in one project, most urgent first. */
export function attention(v: ProjView): Attn[] {
  const { p, c } = v; const out: Attn[] = []
  const add = (tone: Tone, title: string, sub: string, go: string, tab: ProjTab) => out.push({ tone, projectId: p.id, project: p.title, title, sub, go, tab })
  if (p.status === 'draft' && c.stage >= 1) add('warn', tr('Teaser is ready to submit', 'El teaser está listo para enviarse'), tr('Check the wording, then send it to Cobuildy for review.', 'Revisa el texto y envíalo a Cobuildy para su revisión.'), tr('Review', 'Revisar'), 'profile')
  if (p.status === 'teaser_review') add('warn', tr('Teaser is waiting for approval', 'El teaser espera aprobación'), tr('Cobuildy reviews it before any investor sees it.', 'Cobuildy lo revisa antes de que lo vea ningún inversor.'), tr('View', 'Ver'), 'profile')
  const sent = v.deals.length
  if ((p.status === 'approved' || p.status === 'live') && sent === 0 && v.fit.length > 0) add('plan', tr(`Send the teaser to ${plural(v.fit.length, 'matching investor')}`, `Envía el teaser a ${plural(v.fit.length, 'matching investor')}`), tr('Teaser approved. You confirm before anything goes out.', 'Teaser aprobado. Tú confirmas antes de que salga nada.'), tr('Open investors', 'Abrir inversores'), 'investors')
  for (const d of v.deals) { const t = DEAL()[d.stage]; if (t && !(d.stage === 'nda_sent' && d.nda_dev_signed)) add(t[0], `${who(d)} ${t[1]}`, t[2], t[3], t[4]) }
  const hard = (p.status === 'draft' || p.status === 'teaser_review') && c.next === 1
  for (const f of c.blockers.slice(0, 2)) add(hard ? 'warn' : 'plan', `${tr('Missing', 'Falta')}: ${f.label}`, hard ? tr('Needed before the teaser can go out.', 'Necesario antes de que el teaser pueda salir.') : tr('Not required, but investors will ask for it.', 'No es obligatorio, pero los inversores lo pedirán.'), tr('Answer', 'Responder'), 'profile')
  return out.sort(byTone)
}

export function nextStep(v: ProjView): string {
  const a = attention(v)[0]
  if (a) return a.title
  return v.c.stage >= 3 ? tr('Everything is in place', 'Todo está en orden') : tr('Answer a few more questions in the profile', 'Responde algunas preguntas más en el perfil')
}

export function totals(vs: ProjView[]) {
  const fit = new Set(vs.flatMap(v => v.fit)); const poss = new Set(vs.flatMap(v => v.poss).filter(c => !fit.has(c)))
  const ready = vs.filter(v => v.c.stage >= 2).length
  const interested = vs.flatMap(v => v.deals).filter(d => d.stage !== 'sent' && d.stage !== 'passed').length
  const sentAny = vs.some(v => v.deals.length > 0)
  const attn = vs.flatMap(attention).sort(byTone)
  const ask = vs.reduce((s, v) => s + (v.p.ask_eur ?? 0), 0)
  return { fit: fit.size, poss: poss.size, ready, interested, sentAny, attn, ask, n: vs.length }
}

export function activity(vs: ProjView[], max = 6) {
  return vs.flatMap(v => v.deals.map(d => ({ project: v.p.title, who: who(d), s: STAGE_LABEL[d.stage] + (d.reason ? ` · ${d.reason}` : ''), key: d.deal_id }))).slice(0, max)
}

/** Answers for the dashboard assistant, built only from the loaded data. */
export function reply(q: string, vs: ProjView[]): string {
  const t = totals(vs); const s = q.toLowerCase()
  if (!vs.length) return tr('You have no projects yet. Use “New project” and I will help you build the profile.', 'Aún no tienes proyectos. Usa «Nuevo proyecto» y te ayudo a montar el perfil.')
  if (/attention|todo|to do|urgent|next|atenci[oó]n|urgente|pendiente|siguiente/.test(s)) return t.attn.length ? t.attn.slice(0, 4).map(a => `• ${a.project}: ${a.title}`).join('\n') : tr('Nothing needs you right now.', 'Ahora mismo nada te necesita.')
  if (/missing|blocker|need|falta|bloque|necesit/.test(s)) {
    const v = vs.find(x => x.c.blockers.length) ?? vs[0]
    return v.c.blockers.length ? tr(`${v.p.title} is still missing: ${v.c.blockers.slice(0, 5).map(f => f.label.toLowerCase()).join(', ')}.`, `A ${v.p.title} aún le falta: ${v.c.blockers.slice(0, 5).map(f => f.label.toLowerCase()).join(', ')}.`) : tr(`${v.p.title} has nothing left to add for the next stage.`, `${v.p.title} no necesita nada más para la siguiente fase.`)
  }
  if (/investor|fit|match|inversor|encaj|coincid/.test(s)) return tr(`${plural(t.fit, 'investor')} fit at least one project, and ${t.poss} more need more information from you. `, `${plural(t.fit, 'investor')} encajan con al menos un proyecto, y ${t.poss} más necesitan más información tuya. `) + vs.map(v => `${v.p.title}: ${v.fit.length}`).join('; ') + '.'
  return tr(`${plural(t.n, 'project')}, ${t.ready} ready for outreach or beyond. ${eur(t.ask)} sought. `, `${plural(t.n, 'project')}, ${t.ready} listos para el contacto o más. Buscas ${eurFor(t.ask, 'es')}. `) + vs.map(v => `${v.p.title}: ${v.c.score}% ${tr('ready', 'listo')}`).join('; ') + '.'
}
