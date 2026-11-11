import { calc, hydrate, type Calc } from './profile'
import { eur } from './format'
import { kindLabel } from './investorKinds'
import { STAGE_LABEL, type Project, type ProjectDeal } from './types'

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
const who = (d: ProjectDeal) => `${d.investor_code} · ${kindLabel(d.investor_kind)}`
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
export { plural }

const DEAL: Partial<Record<ProjectDeal['stage'], [Tone, string, string, string, ProjTab]>> = {
  interested: ['good', 'is interested', 'Accept and send the NDA, or decline.', 'Respond', 'investors'],
  nda_sent: ['good', 'is waiting for the NDA', 'Sign the NDA so the data room can open.', 'Sign', 'investors'],
  room: ['good', 'signed the NDA', 'Choose which documents to share.', 'Share documents', 'room'],
  qa: ['good', 'sent questions', 'Answer them to keep the process moving.', 'Answer', 'investors'],
  ts: ['good', 'wants a term sheet discussion', 'Confirm a call slot.', 'Confirm', 'investors'],
}

/** What needs the developer's action in one project, most urgent first. */
export function attention(v: ProjView): Attn[] {
  const { p, c } = v; const out: Attn[] = []
  const add = (tone: Tone, title: string, sub: string, go: string, tab: ProjTab) => out.push({ tone, projectId: p.id, project: p.title, title, sub, go, tab })
  if (p.status === 'draft' && c.stage >= 1) add('warn', 'Teaser is ready to submit', 'Check the wording, then send it to Cobuildy for review.', 'Review', 'profile')
  if (p.status === 'teaser_review') add('warn', 'Teaser is waiting for approval', 'Cobuildy reviews it before any investor sees it.', 'View', 'profile')
  const sent = v.deals.length
  if ((p.status === 'approved' || p.status === 'live') && sent === 0 && v.fit.length > 0) add('plan', `Send the teaser to ${plural(v.fit.length, 'matching investor')}`, 'Teaser approved. You confirm before anything goes out.', 'Open investors', 'investors')
  for (const d of v.deals) { const t = DEAL[d.stage]; if (t) add(t[0], `${who(d)} ${t[1]}`, t[2], t[3], t[4]) }
  for (const f of c.blockers.slice(0, 2)) add('warn', `Missing: ${f.label}`, `Blocks the ${['', 'teaser', 'outreach', 'data room'][f.gate] ?? 'next'} stage.`, 'Answer', 'profile')
  return out.sort(byTone)
}

export function nextStep(v: ProjView): string {
  const a = attention(v)[0]
  if (a) return a.title
  return v.c.stage >= 3 ? 'Everything is in place' : 'Answer a few more questions in the profile'
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
  if (!vs.length) return 'You have no projects yet. Use “New project” and I will help you build the profile.'
  if (/attention|todo|to do|urgent|next/.test(s)) return t.attn.length ? t.attn.slice(0, 4).map(a => `• ${a.project}: ${a.title}`).join('\n') : 'Nothing needs you right now.'
  if (/missing|blocker|need/.test(s)) {
    const v = vs.find(x => x.c.blockers.length) ?? vs[0]
    return v.c.blockers.length ? `${v.p.title} still needs: ${v.c.blockers.slice(0, 5).map(f => f.label.toLowerCase()).join(', ')}.` : `${v.p.title} has nothing blocking the next stage.`
  }
  if (/investor|fit|match/.test(s)) return `${plural(t.fit, 'investor')} fit at least one project, and ${t.poss} more are possible. ` + vs.map(v => `${v.p.title}: ${v.fit.length}`).join('; ') + '.'
  return `${plural(t.n, 'project')}, ${t.ready} ready for outreach or beyond. ${eur(t.ask)} sought. ` + vs.map(v => `${v.p.title}: ${v.c.score}% ready`).join('; ') + '.'
}
