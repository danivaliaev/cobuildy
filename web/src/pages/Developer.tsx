import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, rpc } from '../lib/supabase'
import { useAuth } from '../auth'
import { ErrorLine, Field, Pill, useAction, useLoad } from '../components/ui'
import { eur } from '../lib/format'
import { GEO, type Project, type ProjectDeal } from '../lib/types'
import { activity, attention, nextStep, plural, reply, totals, view, type ProjView } from '../lib/dashboard'

const NAMES = ['Not ready', 'Teaser-ready', 'Ready for outreach', 'Data room complete']
const STEPS = ['Teaser', 'Outreach', 'Data room']
const CHIPS = ['What needs my attention?', 'What is missing?', 'Which investors fit?', 'Give me a summary']

function Assistant({ views }: { views: ProjView[] }) {
  const [msgs, setMsgs] = useState<Array<{ me: boolean; t: string }>>([{ me: false, t: 'Ask me about your projects: what needs you, what is missing, who fits.' }])
  const [text, setText] = useState('')
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [msgs])
  const send = (q: string) => { const t = q.trim(); if (!t) return; setMsgs(m => [...m, { me: true, t }, { me: false, t: reply(t, views) }]); setText('') }
  return (
    <section className="dcard dchat" aria-label="Ask Cobuildy">
      <div className="dhead"><h2>Ask Cobuildy</h2><span className="mono muted">All projects</span></div>
      <div className="dscroll"><div className="dmsgs" aria-live="polite">
        {msgs.map((m, i) => <div key={i} className={`dm ${m.me ? 'me' : ''}`}>{m.t}</div>)}<div ref={end} /></div></div>
      <div className="chipsrow">{CHIPS.map(c => <button key={c} type="button" className="chipbtn" onClick={() => send(c)}>{c}</button>)}</div>
      <form className="dinrow" onSubmit={e => { e.preventDefault(); send(text) }}>
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Ask about your projects" aria-label="Message" />
        <button className="btn pri" type="submit" disabled={!text.trim()} aria-label="Send">↑</button></form>
      <div className="muted small">Answers come from your project data</div>
    </section>
  )
}

export function Developer() {
  const nav = useNavigate()
  const { profile } = useAuth()
  const data = useLoad(async () => {
    const { data: ps, error } = await supabase.from('projects').select('*').eq('owner_id', profile!.id).order('created_at', { ascending: false })
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
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const act = useAction()
  const create = (e: FormEvent) => {
    e.preventDefault()
    void act.run(async () => {
      const { data: c } = await supabase.from('companies').select('id').eq('owner_id', profile!.id).maybeSingle()
      const { data: row, error } = await supabase.from('projects').insert({ title: title.trim(), owner_id: profile!.id, company_id: c?.id ?? null, status: 'draft' }).select('id').single()
      if (error) throw error
      nav(`/developer/projects/${row.id}`)
    })
  }
  const open = (id: string, tab = 'profile') => nav(`/developer/projects/${id}${tab === 'profile' ? '' : `?tab=${tab}`}`)
  const views = data.data?.views ?? []
  const t = totals(views)
  const h = new Date().getHours()
  const greet = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
  const first = (profile?.full_name ?? '').split(' ')[0]
  const acts = activity(views)
  const kpi: Array<[string, string, string]> = [
    [eur(t.ask), 'Capital sought', `across ${plural(t.n, 'project')}`],
    [`${t.ready} of ${t.n}`, 'Ready for outreach', views.length ? `readiness ${Math.min(...views.map(v => v.c.score))}–${Math.max(...views.map(v => v.c.score))}%` : ''],
    [String(t.fit), 'Investors that fit', `unique · +${t.poss} need info`],
    [t.sentAny ? String(t.interested) : '—', 'Showing interest', t.sentAny ? 'replied or moved on' : 'no teaser sent yet'],
    [String(t.attn.length), 'Open actions', t.attn.filter(a => a.tone === 'good').length + ' waiting for you'],
  ]
  const tone = (s: Project['status']) => (s === 'live' || s === 'approved' ? 'good' : s === 'teaser_review' ? 'warn' : undefined)
  return (
    <div className="dash">
      <div className="dgreet">
        <span className="mono muted">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        <div className="row"><h1>{greet}{first ? `, ${first}` : ''}</h1><span className="sp" />
          {data.data?.company && <Pill>{data.data.company}</Pill>}
          <button className="btn pri" type="button" onClick={() => setCreating(true)}>+ New project</button></div>
        {data.data && <p className="muted">{plural(t.n, 'project')}, {t.ready} ready for outreach or beyond. {plural(t.fit, 'investor')} fit at least one of them.</p>}
      </div>
      <ErrorLine error={data.error ?? act.error} />
      {data.loading ? <span className="muted">Loading…</span> : <>
        <div className="kpis dk">{kpi.map(([v, l, s]) => <div className="kpi" key={l}><span className="mono muted">{l}</span><b>{v}</b><small>{s}</small></div>)}</div>
        <div className="dgrid">
          <div className="dcol">
            <section className="dcard" aria-label="Needs your attention">
              <div className="dhead"><h2>Needs your attention</h2><span className="mono muted">{plural(t.attn.length, 'item')}</span></div>
              <div className="att">{t.attn.length ? t.attn.slice(0, 7).map((a, i) => (
                <button key={i} type="button" onClick={() => open(a.projectId, a.tab)}><i className={a.tone} />
                  <span><span className="pt">{a.project}</span><b>{a.title}</b><span className="s">{a.sub}</span></span><em>{a.go} →</em></button>
              )) : <p className="muted">Nothing needs you right now.</p>}</div>
            </section>
            <div className="dhead" style={{ padding: '6px 4px 0' }}><h2>Your projects</h2><span className="mono muted">{plural(t.n, 'project')}</span></div>
            {creating && (
              <form className="dcard" onSubmit={create}>
                <Field label="Project name"><input autoFocus required value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Marbella Hills, 24 villas" /></Field>
                <div className="row"><button className="btn pri" disabled={act.busy || !title.trim()} type="submit">Create and open</button>
                  <button className="btn" type="button" onClick={() => setCreating(false)}>Cancel</button></div>
                <span className="muted small">You then tell the agent about it in your own words and the profile builds as you talk.</span>
              </form>)}
            {views.map(v => {
              const { p, c } = v
              return (
                <button key={p.id} className="pc" type="button" onClick={() => open(p.id)}>
                  <div className="row1"><div><span className="mono muted">{[...new Set([p.city, GEO[p.geo ?? ''] ?? 'Location not set'].filter(Boolean))].join(', ')}</span><h3>{p.title}</h3></div>
                    <Pill tone={c.stage >= 2 ? 'good' : c.stage === 1 ? 'warn' : 'bad'}>{p.status === 'draft' || p.status === 'approved' || p.status === 'live' ? NAMES[c.stage] : p.status.replace('_', ' ')}</Pill></div>
                  <div className="meta"><div><b>{p.ask_eur ? eur(p.ask_eur) : '—'}</b><small>sought</small></div><div><b>{c.score}%</b><small>readiness</small></div><div><b>{v.fit.length}</b><small>investors fit</small></div></div>
                  <div className="pbar" role="img" aria-label={`Readiness ${c.score}%`}><i style={{ width: `${c.score}%` }} /></div>
                  <div className="lad">{STEPS.map((n, i) => <span key={n} className={c.stage > i ? 'done' : c.stage === i ? 'now' : ''}><i /><em>{n}</em></span>)}</div>
                  <div className="next"><b>Next:</b> {nextStep(v)} · {plural(c.blockers.length, 'open question')} for the next stage <span className="muted">· {p.code}</span> {attention(v).length === 0 && <Pill tone={tone(p.status)}>{p.status}</Pill>}</div>
                </button>)
            })}
            <button className="pc newp" type="button" onClick={() => setCreating(true)}><b>+ New project</b><span className="muted">Tell the agent about it in your own words. The profile builds as you talk.</span></button>
          </div>
          <div className="dcol">
            <Assistant views={views} />
            <section className="dcard" aria-label="Investor activity">
              <div className="dhead"><h2>Investor activity</h2></div>
              <div className="afeed">{acts.length ? acts.map(a => <div key={a.key}><span className="pt">{a.project}</span><b>{a.who}</b><small>{a.s}</small></div>)
                : <p className="muted">No investor activity yet. It appears here once you send a teaser.</p>}</div>
            </section>
          </div>
        </div>
      </>}
    </div>
  )
}
