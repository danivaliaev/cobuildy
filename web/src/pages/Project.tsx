import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase, rpc } from '../lib/supabase'
import { Empty, ErrorLine, Field, Pill, useAction, useLoad } from '../components/ui'
import { ProfileChat } from '../components/ProfileChat'
import { ProfileView } from '../components/ProfileView'
import { ReadinessPanel } from '../components/ReadinessPanel'
import { DataRoom } from '../components/DataRoom'
import { FIELDS, blank, columnsFor, hydrate, keyChanges, patchFor, type FieldState, type Fields } from '../lib/profile'
import { kindLabel, countryName } from '../lib/investorKinds'
import { STAGE_LABEL, type DealMessage, type Match, type Project, type ProjectDeal, type ProjectDoc } from '../lib/types'

type Tab = 'profile' | 'investors' | 'room'

export function ProjectPage() {
  const { id = '' } = useParams()
  const proj = useLoad(async () => {
    const { data, error } = await supabase.from('projects').select('*').eq('id', id).single()
    if (error) throw error
    return data as Project
  }, [id])
  const docs = useLoad(async () => {
    const { data, error } = await supabase.from('project_docs').select('id,project_id,kind,title,storage_path,file_name,size_bytes,field_key').eq('project_id', id).order('created_at')
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

  const [confirm, setConfirm] = useState<{ lines: string[]; done: (ok: boolean) => void } | null>(null)
  const nav = useNavigate()
  const [del, setDel] = useState(false)
  const delAct = useAction()
  const commit = useCallback(async (next: Fields) => {
    if (!proj.data) return
    const prev = fields
    // Once the teaser is approved, a change to the key figures needs an explicit yes: investors and Cobuildy are told.
    if (prev && (proj.data.status === 'approved' || proj.data.status === 'live')) {
      const lines = keyChanges(prev, next)
      if (lines.length && !(await new Promise<boolean>(res => setConfirm({ lines, done: res })))) throw new Error('Change not saved.')
    }
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
  const hasAnswers = Object.values(fields).some(f => f.st !== 'empty')
  const editable = p.status !== 'discarded' && p.status !== 'closed_won' && p.status !== 'closed_lost'
  const ask = (key: string) => { setAskReq({ key, n: Date.now() }); document.getElementById('agent-chat')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }
  const fitCount = (matches.data ?? []).filter(m => m.bucket === 'fit').length
  const edit = (key: string, next: FieldState) => commit({ ...fields, [key]: { ...blank(), ...next } })

  return (
    <>
      <div className="row"><Link to="/developer">← Projects</Link><span className="sp" />
        {p.status === 'draft' && <button className="linkbtn" type="button" onClick={() => setDel(true)}>Delete project</button>}
        <Pill tone={p.status === 'draft' ? undefined : 'good'}>{p.status.replace('_', ' ')}</Pill></div>
      <h1>{p.code} · {p.title}</h1>
      {p.status === 'teaser_review' && <div className="ibanner" role="note"><span className="sp">Your teaser is waiting for Cobuildy approval. Matching investors can be contacted once it is approved.</span></div>}
      {del && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Delete project"><div className="card">
          <h2>Delete this project?</h2>
          <p className="muted">{hasAnswers ? 'It will be removed from your list together with everything you told the agent about it.' : 'It is empty, so nothing is lost. It will be removed from your list.'} No investor has seen it.</p>
          <ErrorLine error={delAct.error} />
          <div className="row"><button className="btn pri" type="button" disabled={delAct.busy} onClick={() => void delAct.run(async () => { await rpc('discard_project', { p_project: p.id }); nav('/developer') })}>Yes, delete it</button>
            <button className="btn" type="button" disabled={delAct.busy} onClick={() => setDel(false)}>Keep it</button></div>
        </div></div>)}
      {confirm && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Confirm change"><div className="card">
          <h2>Change the teaser figures?</h2>
          <p className="muted">Investors who already have this teaser will see the new values and get a notification. Cobuildy is notified too.</p>
          <ul className="chg">{confirm.lines.map(l => <li key={l}>{l}</li>)}</ul>
          <div className="row"><button className="btn pri" type="button" onClick={() => { confirm.done(true); setConfirm(null) }}>Save changes</button>
            <button className="btn" type="button" onClick={() => { confirm.done(false); setConfirm(null) }}>Cancel</button></div>
        </div></div>)}

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
            <Wave onFill={k => { setTab('profile'); ask(k) }} project={p} matches={matches} canSend={p.status === 'approved' || p.status === 'live'} onSent={async () => { await proj.reload(); setWave(w => w + 1) }} />
            {(p.status === 'live' || p.status === 'approved') && <Deals key={wave} project={p} docs={docs.data ?? []} />}
          </>}
          {tab === 'room' && <DataRoom projectId={p.id} docs={docs.data ?? []} reload={docs.reload} editable={editable} error={docs.error} />}
        </div>
        <ReadinessPanel fields={fields} status={p.status} dbStage={dbStage} onAsk={a => { setTab('profile'); ask(a) }} busy={submit.busy} error={submit.error}
          onSubmit={() => void submit.run(() => rpc('submit_teaser', { p_project: p.id }))} />
      </div>
    </>
  )
}

const BUCKETS: Array<{ k: Match['bucket']; label: string }> = [
  { k: 'fit', label: 'Fit' }, { k: 'possible', label: 'Needs info' }, { k: 'later', label: 'After actions' }, { k: 'out', label: 'Out' },
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

/** What stops an investor from being a sure fit: a fact of the project that their criteria need and the profile does not have yet. */
const MISSING: Record<string, { text: string; key: string }> = {
  geo: { text: 'Region not set', key: 'a_loc' }, asset: { text: 'Asset type not set', key: 'a_type' }, instrument: { text: 'Instrument not set', key: 'k_instr' },
  ticket: { text: 'Capital sought not set', key: 'k_ask' }, license: { text: 'Licence status not set', key: 'p_status' },
}
const BUCKET_LABEL: Record<Match['bucket'], string> = { fit: 'fit', possible: 'needs info', later: 'later', out: 'out' }

function Wave({ project, matches, canSend, onSent, onFill }: { onFill: (key: string) => void; project: Project; matches: { data: Match[] | null; error: string | null; reload: () => void | Promise<void> }; canSend: boolean; onSent: () => Promise<void> }) {
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
      <h2>Send your teaser</h2>
      <p className="muted">These are the investors whose criteria fit this project. Tick who should receive the teaser and press the button at the bottom. Investors who already have it are marked <b>Sent</b>, and their replies appear under <b>Deals</b> below.</p>
      <p className="muted small">Fit: all hard criteria confirmed. Needs info: a fact is missing in your profile, so it cannot be checked yet. Margin, return and track record only change the score. Investors stay anonymous to you until they express interest.</p>
      {!canSend && <p className="muted">This is a preview that follows your answers. You can send the teaser once Cobuildy has approved it.</p>}
      <ErrorLine error={act.error ?? m.error} />
      {m.data && shown.length === 0 ? <Empty>No investor fits yet. Answer more questions or widen the ask.</Empty> : (
        <div className="scrollx"><table>
          <thead><tr>{canSend && <th />}<th>Type</th><th>Country</th><th>Match</th><th>Score</th><th>To make it a fit</th>{canSend && <th>Teaser</th>}</tr></thead>
          <tbody>{shown.map(x => {
            const sent = done.has(x.code)
            const can = canSend && !sent && (x.bucket === 'fit' || x.bucket === 'possible')
            return <tr key={x.investor_id}>
              {canSend && <td><input type="checkbox" aria-label={`Select ${x.code}`} disabled={!can} checked={chosen.includes(x.investor_id)} onChange={e => setSel(e.target.checked ? [...chosen, x.investor_id] : chosen.filter(i => i !== x.investor_id))} /></td>}
              <td>{kindLabel(x.kind)}</td><td>{countryName(x.country)}</td><td><Pill tone={tone(x.bucket)}>{BUCKET_LABEL[x.bucket]}</Pill></td><td>{x.score}</td>
              <td>{x.bucket === 'possible' && (x.missing ?? []).length > 0 ? <span className="why">{(x.missing ?? []).filter(k => MISSING[k]).map(k => <span key={k}>{MISSING[k].text} · <button className="linkbtn" type="button" onClick={() => onFill(MISSING[k].key)}>Fill in</button></span>)}</span> : <span className="muted">—</span>}</td>
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

function Deals({ project, docs: all }: { project: Project; docs: ProjectDoc[] }) {
  const docs = all.filter(x => x.storage_path)
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
              {d.stage === 'nda_sent' && (d.nda_dev_signed
                ? <span className="ok">You signed the NDA. Waiting for {d.investor_name ?? 'the investor'} to sign.</span>
                : <button className="btn sm pri" disabled={act.busy} onClick={() => go(d.deal_id, 'sign_nda')}>Sign NDA</button>)}
              {d.stage === 'nda_sent' && <span className="muted">NDA: you {d.nda_dev_signed ? '✓' : 'not yet'} · investor {d.nda_inv_signed ? '✓' : 'not yet'}</span>}
            </div>
            {d.stage === 'room' && (docs.length === 0 ? <span className="muted">Upload documents in the Data room tab, then choose what to share.</span> : <>
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
    </section>
  )
}
