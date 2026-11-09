import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase, rpc } from '../lib/supabase'
import { Checks, Empty, ErrorLine, Field, Pill, useAction, useLoad } from '../components/ui'
import { eur, fromNum, toNum } from '../lib/format'
import { readiness } from '../lib/readiness'
import { ASSET, GEO, INSTRUMENT, LICENSE, STAGE_LABEL, type DealMessage, type Match, type Project, type ProjectDeal, type ProjectDoc } from '../lib/types'

const DOC_KINDS = ['Planning permit', 'Budget & cost plan', 'Sales plan', 'Valuation', 'Corporate documents', 'Other']

interface Form {
  title: string; geo: string; city: string; asset: string; instrument: string[]; ask: string; cost: string; gdv: string; ltc: string; margin: string
  license: string; presales: string; units: string; build: string; term: string; ret: string
}
const toForm = (p: Project): Form => ({
  title: p.title, geo: p.geo ?? '', city: p.city ?? '', asset: p.asset ?? '', instrument: p.instrument ?? [],
  ask: fromNum(p.ask_eur, 1e6), cost: fromNum(p.cost_eur, 1e6), gdv: fromNum(p.gdv_eur, 1e6),
  ltc: fromNum(p.ltc == null ? null : p.ltc * 100), margin: fromNum(p.margin == null ? null : p.margin * 100),
  license: p.license ?? '', presales: fromNum(p.presales == null ? null : p.presales * 100), units: fromNum(p.units), build: fromNum(p.build_months),
  term: fromNum(p.term_months), ret: fromNum(p.expected_return == null ? null : p.expected_return * 100),
})
const frac = (s: string) => { const n = toNum(s); return n == null ? null : n / 100 }
const mil = (s: string) => { const n = toNum(s); return n == null ? null : Math.round(n * 1e6) }

function toRow(f: Form) {
  const ask = mil(f.ask), cost = mil(f.cost), gdv = mil(f.gdv)
  // Derived values are filled in only when left blank.
  const ltc = frac(f.ltc) ?? (ask && cost ? Math.round((ask / cost) * 1000) / 1000 : null)
  const margin = frac(f.margin) ?? (gdv && cost ? Math.round((gdv / cost - 1) * 1000) / 1000 : null)
  return {
    title: f.title.trim(), geo: f.geo || null, city: f.city.trim() || null, asset: f.asset || null, instrument: f.instrument,
    ask_eur: ask, cost_eur: cost, gdv_eur: gdv, ltc, margin, license: (f.license || null) as Project['license'], presales: frac(f.presales),
    units: toNum(f.units), build_months: toNum(f.build), term_months: toNum(f.term), expected_return: frac(f.ret),
  }
}

export function ProjectPage() {
  const { id = '' } = useParams()
  const proj = useLoad(async () => {
    const { data, error } = await supabase.from('projects').select('*').eq('id', id).single()
    if (error) throw error
    return data as Project
  }, [id])
  const docs = useLoad(async () => {
    const { data, error } = await supabase.from('project_docs').select('id,project_id,kind,title').eq('project_id', id).order('created_at')
    if (error) throw error
    return data as ProjectDoc[]
  }, [id])
  const [f, setF] = useState<Form | null>(null)
  const [saved, setSaved] = useState(false)
  useEffect(() => { if (proj.data) setF(toForm(proj.data)) }, [proj.data])

  const draftRow = useMemo(() => (f ? toRow(f) : null), [f])
  const r = useMemo(() => (draftRow ? readiness(draftRow, docs.data?.length ?? 0) : null), [draftRow, docs.data])
  const save = useAction(async () => { await proj.reload() })
  const submit = useAction(async () => { await proj.reload() })

  if (proj.loading) return <span className="muted">Loading…</span>
  if (!proj.data || !f || !r || !draftRow) return <><ErrorLine error={proj.error} /><Link to="/developer">← Projects</Link></>
  const p = proj.data
  const editable = p.status === 'draft'
  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setSaved(false); setF({ ...f, [k]: v }) }
  const inp = (k: keyof Form, label: string, hint?: string) => (
    <Field label={label + (hint ? ` (${hint})` : '')}><input disabled={!editable} inputMode="decimal" value={f[k] as string} onChange={e => set(k, e.target.value)} /></Field>
  )

  return (
    <>
      <div className="row"><Link to="/developer">← Projects</Link><span className="sp" /><Pill tone={p.status === 'draft' ? undefined : 'good'}>{p.status.replace('_', ' ')}</Pill></div>
      <h1>{p.code} · {p.title}</h1>

      <section className="card">
        <div className="row"><h2>Readiness</h2><span className="sp" /><span className="mono">Stage {r.stage} of 3 · {r.pct}%</span></div>
        <div className="bar"><i style={{ width: `${r.pct}%` }} /></div>
        {r.blockers.length > 0 ? (
          <div className="row">{r.blockers.slice(0, 8).map(b => <Pill key={b.label} tone="warn">{b.label}</Pill>)}</div>
        ) : <span className="ok">Everything is in place.</span>}
        {editable && (
          <div className="row">
            <button className="btn pri" disabled={submit.busy || r.stage < 1} onClick={() => void submit.run(() => rpc('submit_teaser', { p_project: p.id }))}>Submit teaser for review</button>
            {r.stage < 1 && <span className="muted">Complete the teaser details first (and save).</span>}
            {r.stage >= 1 && p.stage < 1 && <span className="muted">Save the project, then submit.</span>}
          </div>
        )}
        {p.status === 'teaser_review' && <span className="muted">Cobuildy is reviewing your teaser. Matching investors can be contacted once it is approved.</span>}
        <ErrorLine error={submit.error} />
      </section>

      <section className="card">
        <h2>Project details</h2>
        <div className="grid2">
          <Field label="Project name"><input disabled={!editable} value={f.title} onChange={e => set('title', e.target.value)} /></Field>
          <Field label="Region"><select disabled={!editable} value={f.geo} onChange={e => set('geo', e.target.value)}><option value="">Select…</option>{Object.entries(GEO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="City / town"><input disabled={!editable} value={f.city} onChange={e => set('city', e.target.value)} /></Field>
          <Field label="Asset type"><select disabled={!editable} value={f.asset} onChange={e => set('asset', e.target.value)}><option value="">Select…</option>{Object.entries(ASSET).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Permit"><select disabled={!editable} value={f.license} onChange={e => set('license', e.target.value)}><option value="">Select…</option>{Object.entries(LICENSE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        </div>
        <Field label="Capital instrument sought"><Checks options={INSTRUMENT} value={f.instrument} onChange={v => set('instrument', v)} /></Field>
        <div className="grid2">
          {inp('ask', 'Capital sought', '€M')}{inp('cost', 'Total cost', '€M')}{inp('gdv', 'Sales value (GDV)', '€M')}
          {inp('ltc', 'Loan to cost', '%, blank = ask ÷ cost')}{inp('margin', 'Developer margin', '%, blank = GDV ÷ cost − 1')}
          {inp('units', 'Units')}{inp('build', 'Build programme', 'months')}{inp('term', 'Loan term', 'months')}
          {inp('presales', 'Pre-sales', '%')}{inp('ret', 'Return offered', '%')}
        </div>
        <ErrorLine error={save.error} />
        {editable && <div className="row">
          <button className="btn pri" disabled={save.busy || !f.title.trim()} onClick={() => void save.run(async () => {
            const { error } = await supabase.from('projects').update(draftRow).eq('id', p.id)
            if (error) throw error
            setSaved(true)
          })}>Save</button>{saved && <span className="ok">Saved</span>}
        </div>}
      </section>

      <Docs projectId={p.id} docs={docs.data ?? []} reload={docs.reload} editable={editable || p.status !== 'discarded'} error={docs.error} />
      {(p.status === 'approved' || p.status === 'live') && <Wave project={p} />}
      {(p.status === 'live' || p.status === 'approved') && <Deals project={p} docs={docs.data ?? []} />}
    </>
  )
}

function Docs({ projectId, docs, reload, editable, error }: { projectId: string; docs: ProjectDoc[]; reload: () => void | Promise<void>; editable: boolean; error: string | null }) {
  const [kind, setKind] = useState(DOC_KINDS[0])
  const [title, setTitle] = useState('')
  const act = useAction(reload)
  return (
    <section className="card">
      <h2>Data room documents</h2>
      <p className="muted">Four documents unlock the data room. This version records each document; file upload comes next.</p>
      <ErrorLine error={act.error ?? error} />
      {docs.length === 0 ? <Empty>No documents recorded.</Empty> : docs.map(d => (
        <div className="row" key={d.id}><Pill>{d.kind}</Pill><span className="sp">{d.title}</span>
          {editable && <button className="btn sm" disabled={act.busy} onClick={() => void act.run(async () => { const { error: e } = await supabase.from('project_docs').delete().eq('id', d.id); if (e) throw e })}>Remove</button>}</div>
      ))}
      {editable && <form className="row" onSubmit={e => { e.preventDefault(); void act.run(async () => { const { error: er } = await supabase.from('project_docs').insert({ project_id: projectId, kind, title: title.trim() }); if (er) throw er; setTitle('') }) }}>
        <select value={kind} onChange={e => setKind(e.target.value)} style={{ width: 220 }}>{DOC_KINDS.map(k => <option key={k}>{k}</option>)}</select>
        <input className="sp" required value={title} onChange={e => setTitle(e.target.value)} placeholder="Document title" />
        <button className="btn" type="submit" disabled={act.busy}>Add</button>
      </form>}
    </section>
  )
}

function Wave({ project }: { project: Project }) {
  const m = useLoad(() => rpc<Match[]>('match_project', { p_project: project.id }), [project.id])
  const [sel, setSel] = useState<string[] | null>(null)
  const act = useAction(async () => { setSel(null); await m.reload() })
  const sendable = (m.data ?? []).filter(x => x.bucket === 'fit' || x.bucket === 'possible')
  const chosen = sel ?? sendable.filter(x => x.bucket === 'fit').map(x => x.investor_id)
  const tone = (b: Match['bucket']) => (b === 'fit' ? 'good' : b === 'possible' ? 'plan' : b === 'later' ? 'warn' : undefined)
  return (
    <section className="card">
      <h2>Investor matches</h2>
      <p className="muted">Hard criteria decide who can see the project; margin, return and track record only rank. Investors stay anonymous to you until the data room opens.</p>
      <ErrorLine error={act.error ?? m.error} />
      {m.data && m.data.length === 0 ? <Empty>No investors in the network yet.</Empty> : (
        <div className="scrollx"><table>
          <thead><tr><th /><th>Investor</th><th>Match</th><th>Score</th></tr></thead>
          <tbody>{m.data?.filter(x => x.bucket !== 'out').sort((a, b) => b.score - a.score).map(x => {
            const can = x.bucket === 'fit' || x.bucket === 'possible'
            return <tr key={x.investor_id}>
              <td><input type="checkbox" aria-label={`Select ${x.code}`} disabled={!can} checked={chosen.includes(x.investor_id)} onChange={e => setSel(e.target.checked ? [...chosen, x.investor_id] : chosen.filter(i => i !== x.investor_id))} /></td>
              <td>{x.code}</td><td><Pill tone={tone(x.bucket)}>{x.bucket}</Pill></td><td>{x.score}</td></tr>
          })}</tbody>
        </table></div>
      )}
      <div className="row"><button className="btn plan" disabled={act.busy || chosen.length === 0} onClick={() => void act.run(() => rpc('launch_wave', { p_project: project.id, p_wave: 1, p_investors: chosen }))}>Send teaser to {chosen.length} investor{chosen.length === 1 ? '' : 's'}</button></div>
    </section>
  )
}

function Deals({ project, docs }: { project: Project; docs: ProjectDoc[] }) {
  const deals = useLoad(() => rpc<ProjectDeal[]>('project_deals', { p_project: project.id }), [project.id])
  const msgs = useLoad(async () => {
    const ids = (deals.data ?? []).map(d => d.deal_id)
    if (!ids.length) return [] as DealMessage[]
    const { data, error } = await supabase.from('deal_messages').select('*').in('deal_id', ids).order('created_at')
    if (error) throw error
    return data as DealMessage[]
  }, [deals.data])
  const act = useAction(async () => { await deals.reload() })
  const [picked, setPicked] = useState<Record<string, string[]>>({})
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [slot, setSlot] = useState<Record<string, string>>({})
  const go = (id: string, action: string, payload: object = {}) => void act.run(() => rpc('deal_action', { p_deal: id, p_action: action, p_payload: payload }))

  return (
    <section className="card">
      <h2>Deals</h2>
      <ErrorLine error={act.error ?? deals.error ?? msgs.error} />
      {deals.data && deals.data.length === 0 ? <Empty>No investors contacted yet.</Empty> : deals.data?.map(d => {
        const ms = (msgs.data ?? []).filter(x => x.deal_id === d.deal_id)
        const open = ms.filter(x => x.kind === 'question')
        return (
          <div className="card soft" key={d.deal_id}>
            <div className="row"><b>{d.investor_name ?? d.investor_code}</b><span className="muted">{d.investor_kind}</span><span className="sp" />
              <Pill tone={d.stage === 'passed' ? 'bad' : d.stage === 'call' ? 'good' : 'plan'}>{STAGE_LABEL[d.stage]}</Pill></div>
            {d.reason && <div className="muted">Reason: {d.reason}</div>}
            {ms.map(x => <div key={x.id} className={`q ${x.kind === 'answer' ? 'a' : ''}`}><span className="mono">{x.kind}</span><div>{x.body}</div></div>)}
            <div className="row">
              {d.stage === 'interested' && <>
                <button className="btn sm pri" disabled={act.busy} onClick={() => go(d.deal_id, 'accept')}>Accept</button>
                <button className="btn sm" disabled={act.busy} onClick={() => go(d.deal_id, 'decline', { reason: 'Not a fit right now' })}>Decline</button></>}
              {d.stage === 'nda_sent' && <button className="btn sm pri" disabled={act.busy} onClick={() => go(d.deal_id, 'sign_nda')}>Sign NDA</button>}
            </div>
            {d.stage === 'room' && (docs.length === 0 ? <span className="muted">Add documents above, then choose what to share.</span> : <>
              <div className="chks">{docs.map(x => <label className="chk" key={x.id}><input type="checkbox" checked={(picked[d.deal_id] ?? []).includes(x.id)} onChange={e => { const cur = picked[d.deal_id] ?? []; setPicked({ ...picked, [d.deal_id]: e.target.checked ? [...cur, x.id] : cur.filter(i => i !== x.id) }) }} />{x.title}</label>)}</div>
              <div><button className="btn sm pri" disabled={act.busy || !(picked[d.deal_id] ?? []).length} onClick={() => go(d.deal_id, 'share_docs', { docs: picked[d.deal_id] })}>Share selected documents</button></div></>)}
            {d.stage === 'qa' && <>
              <Field label={`Answers, one per line (${open.length} question${open.length === 1 ? '' : 's'})`}><textarea rows={3} value={answers[d.deal_id] ?? ''} onChange={e => setAnswers({ ...answers, [d.deal_id]: e.target.value })} /></Field>
              <div><button className="btn sm pri" disabled={act.busy || !(answers[d.deal_id] ?? '').trim()} onClick={() => go(d.deal_id, 'answer', { answers: (answers[d.deal_id] ?? '').split('\n').map(s => s.trim()).filter(Boolean) })}>Send answers</button></div></>}
            {d.stage === 'ts' && <div className="row">
              <input style={{ maxWidth: 280 }} placeholder="Call slot, e.g. Tue 14:00 CET" value={slot[d.deal_id] ?? ''} onChange={e => setSlot({ ...slot, [d.deal_id]: e.target.value })} />
              <button className="btn sm pri" disabled={act.busy || !(slot[d.deal_id] ?? '').trim()} onClick={() => go(d.deal_id, 'confirm_call', { slot: slot[d.deal_id] })}>Confirm call</button></div>}
            {d.stage === 'call' && <span className="ok">Call: {d.call_slot}</span>}
          </div>
        )
      })}
      <span className="muted">Ask {eur(project.ask_eur)}</span>
    </section>
  )
}
