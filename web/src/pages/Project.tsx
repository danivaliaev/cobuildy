import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { supabase, rpc } from '../lib/supabase'
import { Empty, ErrorLine, Field, Pill, useAction, useLoad } from '../components/ui'
import { eur } from '../lib/format'
import { ProfileChat } from '../components/ProfileChat'
import { ProfileView } from '../components/ProfileView'
import { ReadinessPanel } from '../components/ReadinessPanel'
import { FIELDS, GATE_NAMES, blank, columnsFor, hydrate, isDone, patchFor, type FieldState, type Fields } from '../lib/profile'
import { kindLabel, countryName } from '../lib/investorKinds'
import { STAGE_LABEL, type DealMessage, type Match, type Project, type ProjectDeal, type ProjectDoc } from '../lib/types'

type Tab = 'profile' | 'investors' | 'room'
const DOC_KINDS = ['Planning permit', 'Budget & cost plan', 'Sales plan', 'Valuation', 'Corporate documents', 'Other']

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
  const [fields, setFields] = useState<Fields | null>(null)
  const [dbStage, setDbStage] = useState(0)
  const [flash, setFlash] = useState<string[]>([])
  const [askReq, setAskReq] = useState<{ key: string; n: number } | null>(null)
  const submit = useAction(async () => { await proj.reload() })
  const [sp, setSp] = useSearchParams()
  const tab: Tab = (['profile', 'investors', 'room'] as const).find(t => t === sp.get('tab')) ?? 'profile'
  const setTab = (t: Tab) => setSp(t === 'profile' ? {} : { tab: t }, { replace: true })
  // Investor matches are recalculated shortly after the profile changes, so the numbers on this page follow the answers.
  const [wave, setWave] = useState(0)
  const [mk, setMk] = useState('')
  const cols = fields ? JSON.stringify(columnsFor(fields)) : ''
  useEffect(() => { const t = setTimeout(() => setMk(cols), 900); return () => clearTimeout(t) }, [cols])
  const matches = useLoad(() => rpc<Match[]>('match_project_info', { p_project: id }), [id, mk])

  // The profile is loaded once; after that this page is the source of truth and every change is saved straight away.
  useEffect(() => { if (proj.data && !fields) { setFields(hydrate(proj.data)); setDbStage(proj.data.stage) } }, [proj.data, fields])

  const commit = useCallback(async (next: Fields) => {
    if (!proj.data) return
    const prev = fields
    setFields(next)
    const patch = patchFor(proj.data, next)
    const { error } = await supabase.from('projects').update(patch).eq('id', id)
    if (error) { setFields(prev); throw new Error(error.message) }
    setDbStage(patch.stage)
    const changed = FIELDS.map(d => d.key).filter(k => prev?.[k]?.v !== next[k]?.v || prev?.[k]?.st !== next[k]?.st)
    setFlash(changed)
    setTimeout(() => setFlash([]), 2400)
  }, [proj.data, fields, id])

  if (proj.loading) return <span className="muted">Loading…</span>
  if (!proj.data || !fields) return <><ErrorLine error={proj.error} /><Link to="/developer">← Projects</Link></>
  const p = proj.data
  const editable = p.status === 'draft'
  const ask = (key: string) => { setAskReq({ key, n: Date.now() }); document.getElementById('agent-chat')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }
  const fitCount = (matches.data ?? []).filter(m => m.bucket === 'fit').length
  const edit = (key: string, next: FieldState) => commit({ ...fields, [key]: { ...blank(), ...next } })

  return (
    <>
      <div className="row"><Link to="/developer">← Projects</Link><span className="sp" /><Pill tone={p.status === 'draft' ? undefined : 'good'}>{p.status.replace('_', ' ')}</Pill></div>
      <h1>{p.code} · {p.title}</h1>
      {p.status === 'teaser_review' && <span className="muted">Cobuildy is reviewing your teaser. Matching investors can be contacted once it is approved.</span>}

      <MatchBar matches={matches.data} />

      <div className="pgrid">
        <div id="agent-chat" className="pcol"><ProfileChat projectId={p.id} fields={fields} commit={commit} editable={editable} askReq={askReq} /></div>
        <div className="pmain">
          <div className="tabs" role="tablist">
            <button type="button" role="tab" className="tab" aria-selected={tab === 'profile'} onClick={() => setTab('profile')}>Project profile</button>
            <button type="button" role="tab" className="tab" aria-selected={tab === 'investors'} onClick={() => setTab('investors')}>Investors{fitCount > 0 && <em>{fitCount}</em>}</button>
            <button type="button" role="tab" className="tab" aria-selected={tab === 'room'} onClick={() => setTab('room')}>Data room{(docs.data?.length ?? 0) > 0 && <em>{docs.data?.length}</em>}</button>
          </div>
          {tab === 'profile' && <ProfileView fields={fields} flash={flash} editable={editable} onAsk={ask} onEdit={edit} />}
          {tab === 'investors' && <>
            <Wave project={p} matches={matches} canSend={p.status === 'approved' || p.status === 'live'} onSent={async () => { await proj.reload(); setWave(w => w + 1) }} />
            {(p.status === 'live' || p.status === 'approved') && <Deals key={wave} project={p} docs={docs.data ?? []} />}
          </>}
          {tab === 'room' && <DataRoom projectId={p.id} fields={fields} docs={docs.data ?? []} reload={docs.reload} editable={editable || p.status !== 'discarded'} error={docs.error} />}
        </div>
        <ReadinessPanel fields={fields} status={p.status} dbStage={dbStage} onAsk={a => { setTab('profile'); ask(a) }} busy={submit.busy} error={submit.error}
          onSubmit={() => void submit.run(() => rpc('submit_teaser', { p_project: p.id }))} />
      </div>
    </>
  )
}

const BUCKETS: Array<{ k: Match['bucket']; label: string }> = [
  { k: 'fit', label: 'Fit' }, { k: 'possible', label: 'Possible' }, { k: 'later', label: 'After actions' }, { k: 'out', label: 'Out' },
]

/** Where the investor network stands for this project, recalculated as the profile changes. */
function MatchBar({ matches }: { matches: Match[] | null }) {
  if (!matches) return null
  const n = (k: Match['bucket']) => matches.filter(m => m.bucket === k).length
  const total = matches.length || 1
  return (
    <div className="mbar" aria-label="Investor matches">
      <div className="mbar-t">{BUCKETS.map(b => <i key={b.k} className={`b-${b.k}`} style={{ width: `${(n(b.k) / total) * 100}%` }} />)}</div>
      <div className="mbar-l">{BUCKETS.map(b => <span key={b.k}><i className={`b-${b.k}`} />{b.label} {n(b.k)}</span>)}<span className="muted">Unknown data never excludes an investor</span></div>
    </div>
  )
}

/** The documents lenders ask for, taken from the profile model, and the documents recorded for this project. */
function DataRoom({ projectId, fields, docs, reload, editable, error }: { projectId: string; fields: Fields; docs: ProjectDoc[]; reload: () => void | Promise<void>; editable: boolean; error: string | null }) {
  const need = FIELDS.filter(d => d.doc)
  const ready = need.filter(d => fields[d.key]?.st === 'filled').length
  return (
    <>
      <section className="card">
        <div className="row"><h2>Documents lenders ask for</h2><span className="sp" /><span className="mono">{ready}/{need.length} backed by an answer</span></div>
        <p className="muted">Each document supports a profile answer. A document is marked ready once its answer is recorded; file upload comes next.</p>
        {need.map(d => {
          const st = fields[d.key]?.st
          return (
            <div className="row" key={d.key}>
              <Pill tone={st === 'filled' ? 'good' : isDone(fields[d.key]) ? 'warn' : undefined}>{st === 'filled' ? 'Answer recorded' : isDone(fields[d.key]) ? 'Partly' : 'Not yet'}</Pill>
              <span className="sp">{d.doc}</span>
              <span className="muted">needed for {GATE_NAMES[d.gate].toLowerCase()}</span>
            </div>
          )
        })}
      </section>
      <Docs projectId={projectId} docs={docs} reload={reload} editable={editable} error={error} />
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

function Wave({ project, matches, canSend, onSent }: { project: Project; matches: { data: Match[] | null; error: string | null; reload: () => void | Promise<void> }; canSend: boolean; onSent: () => Promise<void> }) {
  const m = matches
  const contacted = useLoad(async () => (canSend ? await rpc<ProjectDeal[]>('project_deals', { p_project: project.id }) : []), [project.id, canSend])
  const done = new Set((contacted.data ?? []).map(d => d.investor_code))
  const [sel, setSel] = useState<string[] | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const act = useAction(async () => { setSel(null); await Promise.all([m.reload(), contacted.reload(), onSent()]) })
  const fresh = (x: Match) => !done.has(x.code)
  const sendable = (m.data ?? []).filter(x => (x.bucket === 'fit' || x.bucket === 'possible') && fresh(x))
  const chosen = (sel ?? sendable.filter(x => x.bucket === 'fit').map(x => x.investor_id)).filter(id => sendable.some(x => x.investor_id === id))
  const tone = (b: Match['bucket']) => (b === 'fit' ? 'good' : b === 'possible' ? 'plan' : b === 'later' ? 'warn' : undefined)
  const shown = (m.data ?? []).filter(x => x.bucket !== 'out').sort((a, b) => b.score - a.score)
  const send = () => void act.run(async () => {
    const n = await rpc<number>('launch_wave', { p_project: project.id, p_wave: 1, p_investors: chosen })
    setNotice(n > 0 ? `Teaser sent to ${n} investor${n === 1 ? '' : 's'}. Replies appear under Deals below.` : 'Nothing new was sent: these investors already have the teaser.')
  })
  return (
    <section className="card">
      <h2>Investor matches</h2>
      <p className="muted">Hard criteria decide who can see the project; margin, return and track record only rank. Investors stay anonymous to you until they express interest.</p>
      {!canSend && <p className="muted">This is a preview that follows your answers. You can send the teaser once Cobuildy has approved it.</p>}
      <ErrorLine error={act.error ?? m.error} />
      {m.data && shown.length === 0 ? <Empty>No investor fits yet. Answer more questions or widen the ask.</Empty> : (
        <div className="scrollx"><table>
          <thead><tr>{canSend && <th />}<th>Type</th><th>Country</th><th>Match</th><th>Score</th>{canSend && <th>Teaser</th>}</tr></thead>
          <tbody>{shown.map(x => {
            const sent = done.has(x.code)
            const can = canSend && !sent && (x.bucket === 'fit' || x.bucket === 'possible')
            return <tr key={x.investor_id}>
              {canSend && <td><input type="checkbox" aria-label={`Select ${x.code}`} disabled={!can} checked={chosen.includes(x.investor_id)} onChange={e => setSel(e.target.checked ? [...chosen, x.investor_id] : chosen.filter(i => i !== x.investor_id))} /></td>}
              <td>{kindLabel(x.kind)}</td><td>{countryName(x.country)}</td><td><Pill tone={tone(x.bucket)}>{x.bucket}</Pill></td><td>{x.score}</td>
              {canSend && <td>{sent ? <Pill tone="good">Sent</Pill> : <span className="muted">—</span>}</td>}</tr>
          })}</tbody>
        </table></div>
      )}
      {notice && <div className="ok" role="status">{notice}</div>}
      {canSend && <div className="row"><button className="btn plan" disabled={act.busy || chosen.length === 0} onClick={send}>
        {act.busy ? 'Sending…' : chosen.length === 0 ? (done.size > 0 ? 'Teaser sent' : 'No investor selected') : `Send teaser to ${chosen.length} investor${chosen.length === 1 ? '' : 's'}`}</button></div>}
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
            <div className="row"><b>{d.investor_name ?? d.investor_code}</b><span className="muted">{kindLabel(d.investor_kind)}</span><span className="sp" />
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
