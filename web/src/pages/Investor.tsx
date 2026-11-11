import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase, rpc } from '../lib/supabase'
import { useAuth } from '../auth'
import { Empty, ErrorLine, Field, Pill, useAction, useLoad } from '../components/ui'
import { MandateChat } from '../components/MandateChat'
import { eur, pct, when } from '../lib/format'
import { ASSET, GEO, INSTRUMENT, LICENSE, STAGE_LABEL, type DealMessage, type DealStage, type Investor as Inv, type Teaser } from '../lib/types'
import { FIELDS, FK, SECS, clarity, columnsFor, evalTeaser, fmt, hydrate, unlocks, type Fit, type MKey, type Mandate } from '../lib/mandate'

type Tab = 'feed' | 'deal' | 'pipe' | 'mandate'
interface DealDoc { deal_id: string; doc_id: string; kind: string; title: string }

const FLOW = ['Interest', 'NDA', 'Data room', 'Questions', 'Answers', 'Term sheet']
const NOW: Partial<Record<DealStage, number>> = { interested: 0, nda_sent: 1, room: 2, shared: 3, qa: 3, answered: 4, ts: 5, call: 5 }
const PIPE: Array<[string, DealStage[]]> = [['Interest', ['interested', 'nda_sent']], ['Diligence', ['room', 'shared', 'qa', 'answered']], ['Decision', ['ts', 'call']], ['Passed', ['passed']]]
const title = (t: Teaser) => `${ASSET[t.asset ?? ''] ?? t.asset ?? 'Project'} · ${GEO[t.geo ?? ''] ?? t.geo ?? ''}`
const active = (t: Teaser) => t.stage !== 'passed'

function FlowBar({ stage }: { stage: DealStage }) {
  if (stage === 'passed') return <Pill>Passed</Pill>
  const now = NOW[stage] ?? -1
  return <div className="flow">{FLOW.map((n, i) => <span key={n} className={i < now ? 'd' : i === now ? 'n' : ''}><i />{n}</span>)}</div>
}

function Strip({ fits, inv, m }: { fits: Fit[]; inv: Inv; m: Mandate }) {
  const live = fits.filter(f => active(f.t))
  const n = (b: Fit['bucket']) => live.filter(f => f.bucket === b).length
  const top = unlocks(live)[0]
  const total = live.length || 1
  const lvl = clarity(m).level
  return (
    <div className="mbar" aria-live="polite">
      <div className="mstat">
        <div className="mnum">{n('match')}<small>/ {live.length}</small></div>
        <div><b>{n('match') === 1 ? 'project sent to you matches' : 'projects sent to you match'} your mandate</b>
          <div className="muted">{lvl === 0 ? 'Answer a few questions so the right projects reach you' : 'Updates with every answer. Open criteria never exclude a project.'}</div></div>
        {top && <div className="mhint"><b>+{top[1]} if you relax</b><div className="muted">{FK[top[0]].l}</div></div>}
      </div>
      {live.length > 0 && <>
        <div className="mbar-t"><i className="b-fit" style={{ width: `${(n('match') / total) * 100}%` }} /><i className="b-later" style={{ width: `${(n('near') / total) * 100}%` }} /><i className="b-out" style={{ width: `${(n('out') / total) * 100}%` }} /></div>
        <div className="mbar-l"><span><i className="b-fit" />{n('match')} match</span><span><i className="b-later" />{n('near')} close, miss one soft criterion</span><span><i className="b-out" />{n('out')} outside</span></div>
      </>}
      <span className="muted">{inv.name} · code {inv.code}</span>
    </div>
  )
}

function Card({ f, busy, onOpen, onGo }: { f: Fit; busy: boolean; onOpen: () => void; onGo: (a: string, p?: object) => void }) {
  const t = f.t
  const good = f.c.filter(c => c.r === 'pass').slice(0, 3); const bad = f.c.filter(c => c.r === 'fail'); const unk = f.c.filter(c => c.r === 'unk')
  const ltc = t.ask_eur != null && t.cost_eur ? t.ask_eur / t.cost_eur : null
  return (
    <article className="pj">
      <button type="button" className="pj-h" onClick={onOpen}>
        <b>{title(t)} <span className="muted">· {t.project_code}</span></b>
        <Pill tone={f.bucket === 'match' ? 'good' : 'plan'}>Fit {f.fit}%</Pill>
        <span className="meta">{t.instrument.map(i => INSTRUMENT[i] ?? i).join(' / ') || '—'} {eur(t.ask_eur)} · {ltc != null ? `LTC ${pct(ltc)}` : ''} · margin {pct(t.margin)} · {LICENSE[t.license ?? ''] ?? 'permit unknown'}</span>
      </button>
      <div className="why">
        {good.map(c => <span key={c.k} className="okc">{c.l}</span>)}{bad.map(c => <span key={c.k} className="noc">{c.d}</span>)}{unk.length > 0 && <span className="qc">{unk.length} criteria open</span>}
      </div>
      <div className="row">
        {t.stage === 'sent' ? <><button className="btn sm pri" disabled={busy} onClick={() => onGo('interest')}>Express interest</button><button className="btn sm" disabled={busy} onClick={() => onGo('pass', { reason: 'Not for us' })}>Pass</button></>
          : <Pill tone={t.stage === 'passed' ? 'bad' : 'plan'}>{STAGE_LABEL[t.stage]}</Pill>}
        <span className="sp" /><button className="btn sm" onClick={onOpen}>Open review →</button>
      </div>
    </article>
  )
}

function Review({ f, inv, docs, msgs, busy, go, reloadInv }: { f: Fit; inv: Inv; docs: DealDoc[]; msgs: DealMessage[]; busy: boolean; go: (id: string, a: string, p?: object) => void; reloadInv: () => void | Promise<void> }) {
  const t = f.t
  const [qs, setQs] = useState('')
  const decl = useAction(reloadInv)
  const access = Boolean(inv.declared_qualified_at) && inv.kyc_status === 'passed'
  const ltc = t.ask_eur != null && t.cost_eur ? t.ask_eur / t.cost_eur : null
  const room = ['room', 'shared', 'qa', 'answered', 'ts', 'call'].includes(t.stage)
  const strengths = f.c.filter(c => c.r === 'pass').slice(0, 2).map(c => c.d)
  const concerns = f.c.filter(c => c.r === 'fail').map(c => c.d.toLowerCase())
  const read = [
    strengths.length ? `Strengths: ${strengths.join('; ')}.` : '',
    `Sponsor: ${t.sponsor_years ?? '—'} years on the market, ${t.sponsor_delivered ?? 0} projects delivered, ${t.sponsor_checks ?? 0} of 4 checks passed.`,
    concerns.length ? `Concerns: ${concerns.join('; ')}.` : 'Nothing in the teaser goes against your mandate.',
    t.margin != null && t.margin < 0.1 ? 'The developer margin on cost is thin, so ask how costs are fixed.' : '',
  ].filter(Boolean)
  const kv: Array<[string, string]> = [
    ['Instrument', t.instrument.map(i => INSTRUMENT[i] ?? i).join(', ') || '—'], ['Capital sought', eur(t.ask_eur)], ['Loan to cost', pct(ltc)],
    ['Total cost', eur(t.cost_eur)], ['Sales value (GDV)', eur(t.gdv_eur)], ['Developer margin', pct(t.margin)],
    ['Permit', LICENSE[t.license ?? ''] ?? '—'], ['Units', t.units != null ? `${t.units}${t.presales != null ? ` · ${pct(t.presales)} pre-sold` : ''}` : '—'], ['Build', t.build_months ? `${t.build_months} months` : '—'],
  ]
  return (
    <>
      <section className="card">
        <div className="row"><span className="mono">{t.project_code} · {title(t)}</span><span className="sp" /><Pill tone={f.bucket === 'match' ? 'good' : 'plan'}>Fit {f.fit}%</Pill></div>
        <h3>{title(t)}, {t.instrument.map(i => (INSTRUMENT[i] ?? i).toLowerCase()).join(' / ')} {eur(t.ask_eur)}</h3>
        <FlowBar stage={t.stage} />
        <div className="kv">{kv.map(([k, v]) => <div key={k}><span>{k}</span><span>{v}</span></div>)}</div>
        <div className="row">
          {t.stage === 'sent' && <><button className="btn sm pri" disabled={busy} onClick={() => go(t.deal_id, 'interest')}>Express interest</button><button className="btn sm" disabled={busy} onClick={() => go(t.deal_id, 'pass', { reason: 'Not for us' })}>Pass</button></>}
          {t.stage === 'interested' && <span className="muted">Interest registered. The developer decides whether to open an NDA.</span>}
          {t.stage === 'nda_sent' && <button className="btn sm plan" disabled={busy || !access} onClick={() => go(t.deal_id, 'sign_nda')}>Sign NDA and open the data room</button>}
          {t.stage === 'room' && <span className="muted">NDA signed. The developer is choosing which documents to share.</span>}
          {t.stage === 'answered' && <button className="btn sm plan" disabled={busy} onClick={() => go(t.deal_id, 'request_ts')}>Request a term sheet discussion</button>}
          {t.stage === 'ts' && <span className="muted">Term sheet discussion requested. The developer confirms a call slot.</span>}
          {t.stage === 'call' && <Pill tone="good">Call confirmed</Pill>}
          {['interested', 'nda_sent', 'room', 'shared', 'qa', 'answered'].includes(t.stage) && <button className="btn sm" disabled={busy} onClick={() => go(t.deal_id, 'pass', { reason: 'Not for us' })}>Pass</button>}
        </div>
        {t.stage === 'nda_sent' && !access && (
          <div className="accbox">
            <b>Before you sign the NDA, two quick steps</b>
            <div className="row"><Pill tone={inv.declared_qualified_at ? 'good' : 'warn'}>{inv.declared_qualified_at ? '✓ ' : '1 '}Qualified investor declaration</Pill>
              {!inv.declared_qualified_at && <button className="btn sm pri" disabled={decl.busy} onClick={() => void decl.run(() => rpc('investor_declare'))}>I declare I am a qualified investor</button>}</div>
            <div className="row"><Pill tone={inv.kyc_status === 'passed' ? 'good' : inv.kyc_status === 'failed' ? 'bad' : 'warn'}>{inv.kyc_status === 'passed' ? '✓ ' : '2 '}Identity check: {inv.kyc_status}</Pill>
              {inv.kyc_status !== 'passed' && <span className="muted">Completed by the Cobuildy team after your declaration.</span>}</div>
            <ErrorLine error={decl.error} />
          </div>
        )}
      </section>

      <div className="cols2">
        <section className="card">
          <h3>Fit with your mandate</h3>
          {f.c.length ? f.c.map(c => <div className="ck" key={c.k}><i className={c.r}>{c.r === 'pass' ? '✓' : c.r === 'fail' ? '✕' : '?'}</i><span>{c.l} <em>· {c.d}</em></span></div>) : <span className="muted">Set your mandate to see the check.</span>}
        </section>
        <section className="card">
          <h3>Agent’s read</h3>
          <ul className="readlist">{read.map(r => <li key={r}>{r}</li>)}</ul>
        </section>
      </div>

      <section className="card">
        <div className="row"><h3>Sponsor</h3><span className="sp" /><span className="mono">{room ? 'Identity revealed under the NDA' : 'Anonymous until the NDA'}</span></div>
        <div className="kv">
          <div><span>Years on the market</span><span>{t.sponsor_years ?? '—'}</span></div><div><span>Projects delivered</span><span>{t.sponsor_delivered ?? 0}</span></div>
          <div><span>Volume delivered</span><span>€{t.sponsor_volume_m ?? 0}M</span></div><div><span>Verified by Cobuildy</span><span>{t.sponsor_checks ?? 0} of 4</span></div>
        </div>
      </section>

      <section className="card">
        <div className="row"><h3>Data room</h3><span className="sp" /><span className="mono">{docs.length ? `${docs.length} shared` : room ? 'Open' : 'Locked until you sign the NDA'}</span></div>
        {docs.length ? docs.map(d => <div className="row" key={d.doc_id}><Pill>{d.kind}</Pill><span className="sp">{d.title}</span><span className="muted">Shared</span></div>)
          : <span className="muted">{room ? 'The developer has not shared documents yet.' : 'Documents appear here after the NDA is signed by both sides and the developer shares them.'}</span>}
      </section>

      <section className="card">
        <div className="row"><h3>Questions for the sponsor</h3><span className="sp" /><span className="mono">You send them, the developer answers</span></div>
        {msgs.length > 0 ? msgs.map(m => <div key={m.id} className={`q ${m.kind === 'answer' ? 'a' : ''}`}><span className="mono">{m.kind === 'answer' ? 'Sponsor' : 'You'} · {when(m.created_at)}</span><div>{m.body}</div></div>) : null}
        {t.stage === 'shared' ? <>
          <Field label="Questions, one per line"><textarea rows={3} value={qs} onChange={e => setQs(e.target.value)} placeholder="For example: What is the exit route if sales slow by six months?" /></Field>
          <div><button className="btn sm pri" disabled={busy || !qs.trim()} onClick={() => { go(t.deal_id, 'ask', { questions: qs.split('\n').map(s => s.trim()).filter(Boolean) }); setQs('') }}>Send questions</button></div>
        </> : msgs.length === 0 && <span className="muted">{t.stage === 'qa' ? 'Sent. Waiting for the sponsor.' : 'Questions unlock once the developer shares the data room documents.'}</span>}
      </section>
    </>
  )
}

function Board({ fits, onOpen }: { fits: Fit[]; onOpen: (id: string) => void }) {
  const items = fits.filter(f => f.t.stage !== 'sent')
  if (!items.length) return <section className="card"><Empty>Your pipeline is empty. Express interest in a project under Matches to start.</Empty></section>
  return (
    <section className="card">
      <p className="muted">Every move is yours. The developer moves their side, and the agent prepares what is next.</p>
      <div className="board">{PIPE.map(([n, ss]) => {
        const l = items.filter(f => ss.includes(f.t.stage))
        return <div className="bcol" key={n}><h4>{n}<span>{l.length}</span></h4>{l.map(f => <button key={f.t.deal_id} type="button" className="bcard" onClick={() => onOpen(f.t.deal_id)}><b>{title(f.t)}</b><span>{eur(f.t.ask_eur)} · {STAGE_LABEL[f.t.stage]}</span></button>)}</div>
      })}</div>
    </section>
  )
}

function MandateTab({ m, fits, onAsk }: { m: Mandate; fits: Fit[]; onAsk: (k: MKey) => void }) {
  const un = Object.fromEntries(unlocks(fits.filter(f => active(f.t)))) as Partial<Record<MKey, number>>
  return (
    <section className="card profilecard">
      <div className="row"><h2>Your mandate</h2><span className="sp" /><span className="pill plan">Fills as you talk</span></div>
      <p className="muted">Region, asset type, instrument, ticket size and earliest stage are hard filters: a project outside them never reaches you. The rest only changes the ranking.</p>
      {SECS.map(([id, name]) => {
        const fs = FIELDS.filter(f => f.s === id)
        const done = fs.filter(f => m.st[f.k] === 'filled' || m.st[f.k] === 'na').length
        return (
          <section className="psec" key={id}>
            <div className="psec-h"><h3>{name}</h3><span className="bar sm"><i style={{ width: `${(done / fs.length) * 100}%` }} /></span><span className="mono">{done}/{fs.length}</span></div>
            {fs.map(f => {
              const st = m.st[f.k]; const v = fmt(m, f.k)
              return (
                <div className="prow" key={f.k}>
                  <span className={`pic ${st === 'filled' ? 'f' : st === 'unknown' ? 'u' : ''}`} aria-hidden="true">{st === 'filled' ? '✓' : st === 'unknown' ? '!' : ''}</span>
                  <span className="plab">{f.l}</span>
                  <span className="pval">{v ? v : <span className="muted">{st === 'unknown' ? 'Not sure yet' : 'Not answered'}</span>}
                    {un[f.k] ? <span className="pgap">Relaxing this adds {un[f.k]} project{un[f.k] === 1 ? '' : 's'}</span> : null}</span>
                  {st === 'na' ? <span /> : <span className="pact"><button className="chipbtn" type="button" onClick={() => onAsk(f.k)}>{st === 'filled' ? 'Change' : 'Answer'}</button></span>}
                </div>
              )
            })}
          </section>
        )
      })}
    </section>
  )
}

interface Prop { id: string; h: string; d: string; deal: string }
function Status({ m, inv, fits, props, onOpen, onDismiss, onAsk, reloadInv }: {
  m: Mandate; inv: Inv; fits: Fit[]; props: Prop[]; onOpen: (id: string) => void; onDismiss: (id: string) => void; onAsk: (k: MKey) => void; reloadInv: () => void | Promise<void>
}) {
  const c = clarity(m)
  const act = useAction(reloadInv)
  const hints = unlocks(fits.filter(f => active(f.t))).slice(0, 2)
  const open = FIELDS.filter(f => m.st[f.k] === undefined).length
  const C = 2 * Math.PI * 40
  const level = ['Mandate not set', 'Screening is on', 'Sharp mandate'][c.level]
  const access = Boolean(inv.declared_qualified_at) && inv.kyc_status === 'passed'
  const signed = fits.filter(f => ['room', 'shared', 'qa', 'answered', 'ts', 'call'].includes(f.t.stage)).length
  return (
    <aside className="card readycard" aria-label="Status">
      <div className="vtop">
        <div className="ring"><svg viewBox="0 0 92 92" aria-hidden="true"><circle cx="46" cy="46" r="40" fill="none" stroke="var(--line)" strokeWidth="7" /><circle cx="46" cy="46" r="40" fill="none" stroke="var(--plan)" strokeWidth="7" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - c.score / 100)} transform="rotate(-90 46 46)" /></svg><div className="n">{c.score}</div></div>
        <div><span className="mono">Mandate clarity</span><h2>{level}</h2><span className="muted">Draft index, not a rating</span></div>
      </div>
      <div className="ladder four">{['Mandate', 'Screening', 'Sharp', 'Access'].map((n, i) => <div key={n} className={(i === 0 && c.score > 0) || (i === 1 && c.level >= 1) || (i === 2 && c.level >= 2) || (i === 3 && access) ? 'on' : ''}><i />{n}</div>)}</div>

      <div className="blk">
        <span className="mono">Waiting for you · {props.length}</span>
        {props.length ? props.map(x => (
          <div className="item todo" key={x.id}>
            <b>{x.h}</b><span className="muted">{x.d}</span>
            <div className="row"><button className="btn sm pri" onClick={() => onOpen(x.deal)}>Open</button><button className="btn sm" onClick={() => onDismiss(x.id)}>Not now</button></div>
          </div>
        )) : <span className="muted">Nothing waiting. I will propose the next step when there is one.</span>}
      </div>

      <div className="blk">
        <span className="mono">Sharpen your mandate</span>
        {hints.map(([k, n]) => <button key={k} type="button" className="item" onClick={() => onAsk(k)}><b>Relax “{FK[k].l}” <Pill tone="plan">+{n}</Pill></b><span className="muted">{n} project{n === 1 ? ' misses' : 's miss'} only on this criterion.</span></button>)}
        {open > 0 ? <span className="muted">{open} open {open === 1 ? 'criterion' : 'criteria'}. Open criteria never exclude a project.</span> : !hints.length && <span className="muted">Nothing to sharpen right now.</span>}
      </div>

      <div className="blk">
        <span className="mono">Access</span>
        <div className="acc"><Pill tone={inv.declared_qualified_at ? 'good' : 'warn'}>{inv.declared_qualified_at ? '✓' : '1'} Qualified investor declaration</Pill>
          {inv.declared_qualified_at ? <span className="muted">{when(inv.declared_qualified_at)}</span> : <button className="btn sm pri" disabled={act.busy} onClick={() => void act.run(() => rpc('investor_declare'))}>Declare</button>}</div>
        <div className="acc"><Pill tone={inv.kyc_status === 'passed' ? 'good' : inv.kyc_status === 'failed' ? 'bad' : 'warn'}>{inv.kyc_status === 'passed' ? '✓' : '2'} Identity check: {inv.kyc_status}</Pill>
          {inv.kyc_status !== 'passed' && <span className="muted">Done by the Cobuildy team after your declaration.</span>}</div>
        <div className="acc"><Pill>3 NDA for each project</Pill><span className="muted">{signed} signed</span></div>
        <ErrorLine error={act.error} />
      </div>
      <p className="muted">The agent recommends and prepares. You confirm every step. Cobuildy is an introducer and does not give investment advice.</p>
    </aside>
  )
}

function Workspace({ inv, reload }: { inv: Inv; reload: () => void | Promise<void> }) {
  const [sp, setSp] = useSearchParams()
  const [m, setM] = useState(() => hydrate(inv))
  const [askReq, setAskReq] = useState<{ key: MKey; n: number } | null>(null)
  const [dismissed, setDismissed] = useState<string[]>([])
  const [filter, setFilter] = useState<'all' | 'new' | 'progress' | 'near' | 'passed'>('all')
  const teasers = useLoad(() => rpc<Teaser[]>('list_teasers'))
  const docs = useLoad(() => rpc<DealDoc[]>('my_deal_docs'))
  const msgs = useLoad(async () => {
    const ids = (teasers.data ?? []).map(x => x.deal_id)
    if (!ids.length) return [] as DealMessage[]
    const { data, error } = await supabase.from('deal_messages').select('*').in('deal_id', ids).order('created_at')
    if (error) throw error
    return data as DealMessage[]
  }, [teasers.data])
  const act = useAction(async () => { await Promise.all([teasers.reload(), docs.reload()]) })

  const tab = (['feed', 'deal', 'pipe', 'mandate'] as const).find(t => t === sp.get('tab')) ?? 'feed'
  const sel = sp.get('deal')
  const setTab = (t: Tab, deal?: string | null) => { const n = new URLSearchParams(); if (t !== 'feed') n.set('tab', t); if (deal) n.set('deal', deal); setSp(n, { replace: true }) }
  const openDeal = (id: string) => { setTab('deal', id); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  const commit = useCallback(async (next: Mandate) => {
    const prev = m
    setM(next)
    const { error } = await supabase.from('investors').update(columnsFor(next)).eq('id', inv.id)
    if (error) { setM(prev); throw new Error(error.message) }
  }, [m, inv.id])

  const fits = useMemo(() => (teasers.data ?? []).map(t => evalTeaser(m, t)), [m, teasers.data])
  const go = (id: string, action: string, payload: object = {}) => void act.run(() => rpc('deal_action', { p_deal: id, p_action: action, p_payload: payload }))
  const ask = (key: MKey) => { setAskReq({ key, n: Date.now() }); document.getElementById('agent-chat')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }

  const props: Prop[] = fits.flatMap<Prop>(f => {
    const t = f.t; const o: Prop[] = []
    if (t.stage === 'sent' && f.bucket === 'match' && f.fit >= 80) o.push({ id: `rv:${t.deal_id}`, deal: t.deal_id, h: `Review ${t.project_code} · ${title(t)}`, d: `Fit ${f.fit}% and nothing outside your mandate.` })
    if (t.stage === 'nda_sent') o.push({ id: `nda:${t.deal_id}`, deal: t.deal_id, h: `Sign the NDA for ${t.project_code}`, d: 'Opens the data room. Needs your declaration and identity check.' })
    if (t.stage === 'shared') o.push({ id: `qa:${t.deal_id}`, deal: t.deal_id, h: `Documents shared for ${t.project_code}`, d: 'Read them and send your questions to the sponsor.' })
    if (t.stage === 'answered') o.push({ id: `ts:${t.deal_id}`, deal: t.deal_id, h: `Request a term sheet discussion for ${t.project_code}`, d: 'The sponsor answered. I recommend a call.' })
    return o
  }).filter(x => !dismissed.includes(x.id)).slice(0, 4)

  const live = fits.filter(f => active(f.t))
  const kpi: Array<[number, string, string]> = [
    [live.filter(f => f.bucket === 'match').length, 'Matching', `of ${live.length} sent to you`], [live.filter(f => f.t.stage === 'sent').length, 'New', 'not reviewed'],
    [live.filter(f => ['interested', 'nda_sent', 'room', 'shared', 'qa', 'answered'].includes(f.t.stage)).length, 'In diligence', ''], [live.filter(f => ['ts', 'call'].includes(f.t.stage)).length, 'Decision', 'term sheet talk'], [props.length, 'Awaiting you', 'agent proposals'],
  ]
  const sets = {
    all: fits.filter(f => active(f.t) && f.bucket === 'match'), new: fits.filter(f => f.t.stage === 'sent'),
    progress: fits.filter(f => f.t.stage !== 'sent' && active(f.t)), near: fits.filter(f => active(f.t) && f.bucket !== 'match'), passed: fits.filter(f => !active(f.t)),
  }
  const labels: Array<[keyof typeof sets, string]> = [['all', 'Matching'], ['new', 'New'], ['progress', 'In progress'], ['near', 'Close or outside'], ['passed', 'Passed']]
  const list = sets[filter]
  const lvl = clarity(m).level
  const selFit = fits.find(f => f.t.deal_id === sel)

  return (
    <>
      <Strip fits={fits} inv={inv} m={m} />
      <div className="pgrid">
        <div id="agent-chat" className="pcol"><MandateChat mandate={m} commit={commit} askReq={askReq} /></div>
        <div className="pmain">
          <div className="tabs" role="tablist">
            {([['feed', 'Matches'], ['deal', 'Deal review'], ['pipe', 'Pipeline'], ['mandate', 'Mandate']] as Array<[Tab, string]>).map(([k, l]) =>
              <button key={k} type="button" role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k, k === 'deal' ? sel : null)}>{l}{k === 'feed' && sets.all.length > 0 && <em>{sets.all.length}</em>}</button>)}
          </div>
          <div className="kpis">{kpi.map(([v, l, s]) => <div className="kpi" key={l}><div className="v">{v}</div><div className="l">{l}</div><div className="s">{s || ' '}</div></div>)}</div>
          <ErrorLine error={act.error ?? teasers.error ?? msgs.error ?? docs.error} />

          {tab === 'feed' && (
            <section className="card">
              {lvl === 0 && fits.length === 0 ? <Empty>Screening has not started. Tell the agent where, what and how much you invest. Developers send teasers to investors whose mandate fits.</Empty> : <>
                <p className="muted">Ranked by fit with your mandate. I recommend, you decide. Nothing goes further without your confirmation.</p>
                <div className="fseg">{labels.map(([k, l]) => <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l} <b>{sets[k].length}</b></button>)}</div>
                {list.length ? [...list].sort((a, b) => b.fit - a.fit).map(f => <Card key={f.t.deal_id} f={f} busy={act.busy} onOpen={() => openDeal(f.t.deal_id)} onGo={(a, p) => go(f.t.deal_id, a, p)} />)
                  : <Empty>{teasers.loading ? 'Loading…' : filter === 'all' ? 'No project sent to you matches yet. New teasers appear here as developers send them.' : 'Nothing here yet.'}</Empty>}
              </>}
            </section>
          )}
          {tab === 'deal' && (selFit
            ? <Review f={selFit} inv={inv} docs={(docs.data ?? []).filter(d => d.deal_id === selFit.t.deal_id)} msgs={(msgs.data ?? []).filter(x => x.deal_id === selFit.t.deal_id)} busy={act.busy} go={go} reloadInv={reload} />
            : <section className="card"><Empty>Pick a project under Matches to review it here: fit with your mandate, numbers, sponsor, data room and questions.</Empty></section>)}
          {tab === 'pipe' && <Board fits={fits} onOpen={openDeal} />}
          {tab === 'mandate' && <MandateTab m={m} fits={fits} onAsk={k => { ask(k) }} />}
        </div>
        <Status m={m} inv={inv} fits={fits} props={props} onOpen={openDeal} onDismiss={id => setDismissed(d => [...d, id])} onAsk={ask} reloadInv={reload} />
      </div>
    </>
  )
}

export function Investor() {
  const { profile } = useAuth()
  const me = useLoad(async () => {
    const { data, error } = await supabase.from('investors').select('*').eq('user_id', profile!.id).maybeSingle()
    if (error) throw error
    return data as Inv | null
  })
  if (me.loading) return <span className="muted">Loading…</span>
  if (!me.data) return <><ErrorLine error={me.error} /><Empty>Your investor profile is not set up yet. Contact Cobuildy.</Empty></>
  return <><h1>Investor workspace</h1><Workspace inv={me.data} reload={me.reload} /></>
}
