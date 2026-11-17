import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, rpc } from '../lib/supabase'
import { useAuth } from '../auth'
import { ErrorLine, Pill, useAction, useLoad } from '../components/ui'
import { eurFor } from '../lib/format'
import { getLang, useT } from '../i18n'
import { GEO, type Project, type ProjectDeal } from '../lib/types'
import { FirstRun } from '../components/Welcome'
import { clearWelcome } from '../lib/carry'
import { tr } from '../i18n'
import { activity, attention, nextStep, plural, reply, totals, view, type ProjView } from '../lib/dashboard'

const NAMES = () => [tr('Not ready', 'No está listo'), tr('Teaser-ready', 'Teaser listo'), tr('Ready for outreach', 'Listo para el contacto'), tr('Data room complete', 'Data room completo')]
const STEPS = () => [tr('Teaser', 'Teaser'), tr('Outreach', 'Contacto'), tr('Data room', 'Data room')]
const CHIPS = () => [tr('What needs my attention?', '¿Qué necesita mi atención?'), tr('What is missing?', '¿Qué falta?'), tr('Which investors fit?', '¿Qué inversores encajan?'), tr('Give me a summary', 'Dame un resumen')]
const STATUS_ES: Record<string, string> = { draft: 'borrador', teaser_review: 'teaser en revisión', approved: 'aprobado', live: 'activo', closed_won: 'cerrado con éxito', closed_lost: 'cerrado sin éxito', discarded: 'descartado' }
const statusText = (s: string) => (getLang() === 'es' ? STATUS_ES[s] ?? s : s.replace('_', ' '))
const eur = (n: number | null | undefined) => eurFor(n, getLang())

function Assistant({ views }: { views: ProjView[] }) {
  const tt = useT()
  const [msgs, setMsgs] = useState<Array<{ me: boolean; t: string }>>([{ me: false, t: tt('Ask me about your projects: what needs you, what is missing, who fits.', 'Pregúntame por tus proyectos: qué te necesita, qué falta, quién encaja.') }])
  const [text, setText] = useState('')
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [msgs])
  const send = (q: string) => { const t = q.trim(); if (!t) return; setMsgs(m => [...m, { me: true, t }, { me: false, t: reply(t, views) }]); setText('') }
  return (
    <section className="dcard dchat" aria-label={tt('Ask Cobuildy', 'Pregunta a Cobuildy')}>
      <div className="dhead"><h2>{tt('Ask Cobuildy', 'Pregunta a Cobuildy')}</h2><span className="mono muted">{tt('All projects', 'Todos los proyectos')}</span></div>
      <div className="dscroll"><div className="dmsgs" aria-live="polite">
        {msgs.map((m, i) => <div key={i} className={`dm ${m.me ? 'me' : ''}`}>{m.t}</div>)}<div ref={end} /></div></div>
      <div className="chipsrow">{CHIPS().map(c => <button key={c} type="button" className="chipbtn" onClick={() => send(c)}>{c}</button>)}</div>
      <form className="dinrow" onSubmit={e => { e.preventDefault(); send(text) }}>
        <input value={text} onChange={e => setText(e.target.value)} placeholder={tt('Ask about your projects', 'Pregunta por tus proyectos')} aria-label={tt('Message', 'Mensaje')} />
        <button className="btn pri" type="submit" disabled={!text.trim()} aria-label={tt('Send', 'Enviar')}>↑</button></form>
      <div className="muted small">{tt('Answers come from your project data', 'Las respuestas salen de los datos de tus proyectos')}</div>
    </section>
  )
}

export function Developer({ firstRun = false }: { firstRun?: boolean }) {
  const tt = useT()
  const nav = useNavigate()
  const [showFirst, setShowFirst] = useState(firstRun)
  const closeFirst = () => { clearWelcome(); setShowFirst(false) }
  const { profile } = useAuth()
  const data = useLoad(async () => {
    const { data: ps, error } = await supabase.from('projects').select('*').eq('owner_id', profile!.id).neq('status', 'discarded').order('created_at', { ascending: false })
    if (error) throw error
    const { data: co } = await supabase.from('companies').select('name').eq('owner_id', profile!.id).maybeSingle()
    const views = await Promise.all((ps as Project[]).map(async p => {
      const [m, d] = await Promise.all([
        rpc<Array<{ code: string; bucket: string }>>('match_project_info', { p_project: p.id }).catch(() => []),
        rpc<ProjectDeal[]>('project_deals', { p_project: p.id }).catch(() => []),
      ])
      return view(p, m, d)
    }))
    return { views, company: (co as { name: string } | null)?.name ?? null }
  })
  const act = useAction()
  // No naming step: a project is created straight away (or an untouched draft is reused) and the agent starts asking.
  const create = () => {
    void act.run(async () => {
      const id = await rpc<string>('create_project')
      nav(`/developer/projects/${id}`)
    })
  }
  const open = (id: string, tab = 'profile') => nav(`/developer/projects/${id}${tab === 'profile' ? '' : `?tab=${tab}`}`)
  const views = data.data?.views ?? []
  const t = totals(views)
  const h = new Date().getHours()
  const greet = h < 5 ? tt('Good night', 'Buenas noches') : h < 12 ? tt('Good morning', 'Buenos días') : h < 18 ? tt('Good afternoon', 'Buenas tardes') : tt('Good evening', 'Buenas noches')
  const first = (profile?.full_name ?? '').split(' ')[0]
  const acts = activity(views)
  const kpi: Array<[string, string, string]> = [
    [eur(t.ask), tt('Capital sought', 'Capital buscado'), tt(`across ${plural(t.n, 'project')}`, `en ${plural(t.n, 'project')}`)],
    [`${t.ready} ${tt('of', 'de')} ${t.n}`, tt('Ready for outreach', 'Listos para el contacto'), views.length ? tt(`readiness ${Math.min(...views.map(v => v.c.score))}–${Math.max(...views.map(v => v.c.score))}%`, `preparación ${Math.min(...views.map(v => v.c.score))}–${Math.max(...views.map(v => v.c.score))} %`) : ''],
    [String(t.fit), tt('Investors that fit', 'Inversores que encajan'), tt(`unique · +${t.poss} need info`, `únicos · +${t.poss} necesitan información`)],
    [t.sentAny ? String(t.interested) : '—', tt('Showing interest', 'Con interés'), t.sentAny ? tt('replied or moved on', 'han respondido o avanzado') : tt('no teaser sent yet', 'aún no se ha enviado ningún teaser')],
    [String(t.attn.length), tt('Open actions', 'Acciones abiertas'), t.attn.filter(a => a.tone === 'good').length + tt(' waiting for you', ' esperan por ti')],
  ]
  const tone = (s: Project['status']) => (s === 'live' || s === 'approved' ? 'good' : s === 'teaser_review' ? 'warn' : undefined)
  return (
    <div className="dash">
      {showFirst && <FirstRun name={(profile?.full_name ?? '').split(' ')[0]} busy={act.busy} onStart={() => { clearWelcome(); create() }} onClose={closeFirst} />}
      <div className="dgreet">
        <span className="mono muted">{new Date().toLocaleDateString(tt('en-GB', 'es-ES'), { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        <div className="row"><h1>{greet}{first ? `, ${first}` : ''}</h1><span className="sp" />
          {data.data?.company && <Pill>{data.data.company}</Pill>}
          <button className="btn pri" type="button" disabled={act.busy} onClick={create}>{tt('+ New project', '+ Nuevo proyecto')}</button></div>
        {data.data && <p className="muted">{tt(`${plural(t.n, 'project')}, ${t.ready} ready for outreach or beyond. ${plural(t.fit, 'investor')} fit at least one of them.`, `${plural(t.n, 'project')}, ${t.ready} listos para el contacto o más. ${plural(t.fit, 'investor')} encajan con al menos uno.`)}</p>}
      </div>
      <ErrorLine error={data.error ?? act.error} />
      {data.loading ? <span className="muted">{tt('Loading…', 'Cargando…')}</span> : <>
        <div className="kpis dk">{kpi.map(([v, l, s]) => <div className="kpi" key={l}><span className="mono muted">{l}</span><b>{v}</b><small>{s}</small></div>)}</div>
        <div className="dgrid">
          <div className="dcol">
            <section className="dcard" aria-label={tt('Needs your attention', 'Necesita tu atención')}>
              <div className="dhead"><h2>{tt('Needs your attention', 'Necesita tu atención')}</h2><span className="mono muted">{plural(t.attn.length, 'item')}</span></div>
              <div className="att">{t.attn.length ? t.attn.slice(0, 7).map((a, i) => (
                <button key={i} type="button" onClick={() => open(a.projectId, a.tab)}><i className={a.tone} />
                  <span><span className="pt">{a.project}</span><b>{a.title}</b><span className="s">{a.sub}</span></span><em>{a.go} →</em></button>
              )) : <p className="muted">{tt('Nothing needs you right now.', 'Ahora mismo nada te necesita.')}</p>}</div>
            </section>
            <div className="dhead" style={{ padding: '6px 4px 0' }}><h2>{tt('Your projects', 'Tus proyectos')}</h2><span className="mono muted">{plural(t.n, 'project')}</span></div>
            {views.map(v => {
              const { p, c } = v
              return (
                <button key={p.id} className="pc" type="button" onClick={() => open(p.id)}>
                  <div className="row1"><div><span className="mono muted">{[...new Set([p.city, GEO[p.geo ?? ''] ?? tt('Location not set', 'Ubicación sin indicar')].filter(Boolean))].join(', ')}</span><h3>{p.title}</h3></div>
                    <Pill tone={c.stage >= 2 ? 'good' : c.stage === 1 ? 'warn' : 'bad'}>{p.status === 'draft' || p.status === 'approved' || p.status === 'live' ? NAMES()[c.stage] : statusText(p.status)}</Pill></div>
                  <div className="meta"><div><b>{p.ask_eur ? eur(p.ask_eur) : '—'}</b><small>{tt('sought', 'buscado')}</small></div><div><b>{c.score}%</b><small>{tt('readiness', 'preparación')}</small></div><div><b>{v.fit.length}</b><small>{tt('investors fit', 'inversores encajan')}</small></div></div>
                  <div className="pbar" role="img" aria-label={tt(`Readiness ${c.score}%`, `Preparación ${c.score} %`)}><i style={{ width: `${c.score}%` }} /></div>
                  <div className="lad">{STEPS().map((n, i) => <span key={n} className={c.stage > i ? 'done' : c.stage === i ? 'now' : ''}><i /><em>{n}</em></span>)}</div>
                  <div className="next"><b>{tt('Next', 'Siguiente')}:</b> {nextStep(v)} · {plural(c.blockers.length, 'open question')} {tt('for the next stage', 'para la siguiente fase')} <span className="muted">· {p.code}</span> {attention(v).length === 0 && <Pill tone={tone(p.status)}>{statusText(p.status)}</Pill>}</div>
                </button>)
            })}
            <button className="pc newp" type="button" disabled={act.busy} onClick={create}><b>{tt('+ New project', '+ Nuevo proyecto')}</b><span className="muted">{tt('Tell the agent about it in your own words. The profile builds as you talk.', 'Cuéntaselo al agente con tus palabras. El perfil se construye mientras hablas.')}</span></button>
          </div>
          <div className="dcol">
            <Assistant views={views} />
            <section className="dcard" aria-label={tt('Investor activity', 'Actividad de inversores')}>
              <div className="dhead"><h2>{tt('Investor activity', 'Actividad de inversores')}</h2></div>
              <div className="afeed">{acts.length ? acts.map(a => <div key={a.key}><span className="pt">{a.project}</span><b>{a.who}</b><small>{a.s}</small></div>)
                : <p className="muted">{tt('No investor activity yet. It appears here once you send a teaser.', 'Aún no hay actividad de inversores. Aparecerá aquí cuando envíes un teaser.')}</p>}</div>
            </section>
          </div>
        </div>
      </>}
    </div>
  )
}
