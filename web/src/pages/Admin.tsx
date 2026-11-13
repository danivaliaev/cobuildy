import { kindLabel, countryName } from '../lib/investorKinds'
import { Fragment, useState, type FormEvent } from 'react'
import { supabase, rpc } from '../lib/supabase'
import { useAuth } from '../auth'
import { eur, when } from '../lib/format'
import { Empty, ErrorLine, Field, Pill, useAction, useLoad } from '../components/ui'
import { STRATEGY } from '../lib/funnel'
import { GEO, ASSET, INV_GEO, INV_ASSET, INSTRUMENT, CHANNEL, STAGE_LABEL, type InvestorReply, type Invitation, type Investor, type Project, type Role } from '../lib/types'


function Invitations({ reloadKey }: { reloadKey: number }) {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const list = useLoad(async () => {
    const { data, error } = await supabase.from('invitations').select('*').order('created_at', { ascending: false })
    if (error) throw error
    return data as Invitation[]
  }, [reloadKey])
  const act = useAction(list.reload)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('developer')
  const [company, setCompany] = useState('')

  const add = (e: FormEvent) => {
    e.preventDefault()
    void act.run(async () => {
      const { error } = await supabase.from('invitations').insert({ email: email.trim().toLowerCase(), role, company_name: company.trim() || null, invited_by: profile!.id, status: 'pending' })
      if (error) throw error
      setEmail(''); setCompany('')
    })
  }
  const tone = (s: Invitation['status']) => (s === 'accepted' ? 'good' : s === 'approved' || s === 'sent' ? 'plan' : s === 'revoked' ? 'bad' : 'warn')

  return (
    <section className="card">
      <h2>Invitations</h2>
      <p className="muted">Developers and investors can sign up on their own. An approved invitation is how staff roles (admin, expert) are created, and it also pre-assigns a role to an address. Approving here only unlocks it; the invitation email is sent separately.</p>
      <form className="row" onSubmit={add}>
        <div style={{ flex: 2, minWidth: 200 }}><Field label="Email"><input type="email" required value={email} onChange={e => setEmail(e.target.value)} /></Field></div>
        <div style={{ flex: 1, minWidth: 140 }}><Field label="Role"><select value={role} onChange={e => setRole(e.target.value as Role)}><option value="developer">Developer</option><option value="investor">Investor</option><option value="expert">Expert</option></select></Field></div>
        <div style={{ flex: 2, minWidth: 180 }}><Field label="Company"><input value={company} onChange={e => setCompany(e.target.value)} /></Field></div>
        <button className="btn pri" disabled={act.busy} type="submit" style={{ alignSelf: 'end' }}>Add</button>
      </form>
      <ErrorLine error={act.error ?? list.error} />
      {list.data && list.data.length === 0 ? <Empty>No invitations yet.</Empty> : (
        <div className="scrollx"><table>
          <thead><tr><th>Email</th><th>Role</th><th>Company</th><th>Status</th><th>Added</th><th /></tr></thead>
          <tbody>{list.data?.map(i => (
            <tr key={i.id}>
              <td>{i.email}</td><td>{i.role}</td><td>{i.company_name ?? '—'}</td>
              <td><Pill tone={tone(i.status)}>{i.status}</Pill></td><td>{when(i.created_at)}</td>
              <td className="row">
                {isAdmin && i.status === 'pending' && <button className="btn sm pri" disabled={act.busy} onClick={() => void act.run(() => rpc('approve_invite', { p_id: i.id }))}>Approve</button>}
                {isAdmin && ['pending', 'approved', 'sent'].includes(i.status) && <button className="btn sm" disabled={act.busy} onClick={() => void act.run(() => rpc('revoke_invite', { p_id: i.id }))}>Revoke</button>}
              </td>
            </tr>))}</tbody>
        </table></div>
      )}
    </section>
  )
}


interface Req { id: string; name: string; email: string; role: 'developer' | 'investor'; context: string | null; created_at: string }
function Requests({ onInvited }: { onInvited: () => void | Promise<void> }) {
  const { profile } = useAuth()
  const list = useLoad(async () => {
    const { data, error } = await supabase.from('access_requests').select('*').eq('status', 'new').order('created_at')
    if (error) throw error
    return data as Req[]
  })
  const act = useAction(async () => { await list.reload(); await onInvited() })
  const invite = (r: Req) => void act.run(async () => {
    const { error } = await supabase.from('invitations').insert({ email: r.email, role: r.role, company_name: r.name, invited_by: profile!.id, status: 'pending' })
    if (error && !/duplicate|unique/i.test(error.message)) throw error
    const { error: e2 } = await supabase.from('access_requests').update({ status: 'invited' }).eq('id', r.id)
    if (e2) throw e2
  })
  const dismiss = (r: Req) => void act.run(async () => { const { error } = await supabase.from('access_requests').update({ status: 'dismissed' }).eq('id', r.id); if (error) throw error })
  return (
    <section className="card">
      <h2>Requests from the website</h2>
      <ErrorLine error={act.error ?? list.error} />
      {list.data && list.data.length === 0 ? <Empty>No new requests.</Empty> : list.data?.map(r => (
        <div className="row card soft" key={r.id}>
          <div className="sp"><b>{r.name}</b> · {r.email} <Pill>{r.role}</Pill><div className="muted">{r.context ?? ''} · {when(r.created_at)}</div></div>
          <button className="btn sm pri" disabled={act.busy} onClick={() => invite(r)}>Create invitation</button>
          <button className="btn sm" disabled={act.busy} onClick={() => dismiss(r)}>Dismiss</button>
        </div>
      ))}
    </section>
  )
}

function Teasers() {
  const list = useLoad(async () => {
    const { data, error } = await supabase.from('projects').select('*').eq('status', 'teaser_review').order('updated_at')
    if (error) throw error
    return data as Project[]
  })
  const act = useAction(list.reload)
  return (
    <section className="card">
      <h2>Teasers to review</h2>
      <ErrorLine error={act.error ?? list.error} />
      {list.data && list.data.length === 0 ? <Empty>Nothing waiting for review.</Empty> : list.data?.map(p => (
        <div className="row card soft" key={p.id}>
          <div className="sp">
            <b>{p.code} · {p.title}</b>
            <div className="muted">{GEO[p.geo ?? ''] ?? p.geo} · {ASSET[p.asset ?? ''] ?? p.asset} · ask {eur(p.ask_eur)} · cost {eur(p.cost_eur)} · GDV {eur(p.gdv_eur)} · margin {p.margin == null ? '—' : Math.round(p.margin * 100) + '%'}</div>
          </div>
          <button className="btn pri" disabled={act.busy} onClick={() => void act.run(() => rpc('approve_teaser', { p_project: p.id }))}>Approve teaser</button>
        </div>
      ))}
    </section>
  )
}

function Investors() {
  const list = useLoad(async () => {
    const { data, error } = await supabase.from('investors').select('*').order('created_at', { ascending: false }).limit(500)
    if (error) throw error
    return data as Investor[]
  })
  const act = useAction(list.reload)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [state, setState] = useState<'active' | 'inactive' | 'all'>('active')
  const [open, setOpen] = useState<string | null>(null)
  const all = list.data ?? []
  const cats = [...new Set(all.map(i => i.category).filter(Boolean))] as string[]
  const rows = all.filter(i => (state === 'all' || (state === 'active') === (i.active !== false)) && (!cat || i.category === cat)
    && (!q.trim() || `${i.name} ${i.code} ${i.crm_id ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())))
  const list2 = (xs: string[] | null, dict: Record<string, string>) => (xs?.length ? xs.map(x => dict[x] ?? x).join(', ') : 'any')
  const ticket = (i: Investor) => (i.ticket_min == null && i.ticket_max == null ? 'any' : `${i.ticket_min == null ? '…' : eur(i.ticket_min)} – ${i.ticket_max == null ? '…' : eur(i.ticket_max)}`)
  return (
    <section className="card">
      <h2>Investors</h2>
      <p className="muted">What each investor looks for. An empty criterion means no restriction, so the investor fits any project on that point. Open a row to see the original CRM text.</p>
      <ErrorLine error={act.error ?? list.error} />
      <div className="row">
        <input style={{ maxWidth: 240 }} placeholder="Search name or code" aria-label="Search investors" value={q} onChange={e => setQ(e.target.value)} />
        <select aria-label="Category" value={cat} onChange={e => setCat(e.target.value)}><option value="">All categories</option>{cats.map(c => <option key={c}>{c}</option>)}</select>
        <select aria-label="Status" value={state} onChange={e => setState(e.target.value as typeof state)}><option value="active">Active</option><option value="inactive">No criteria yet</option><option value="all">All</option></select>
        <span className="sp muted">{rows.length} of {all.length}</span>
      </div>
      {list.data && all.length === 0 ? <Empty>No investors yet. They appear when an invited investor signs in.</Empty> : (
        <div className="scrollx"><table>
          <thead><tr><th>Investor</th><th>Category</th><th>Instruments</th><th>Regions</th><th>Assets</th><th>Ticket</th><th>KYC</th></tr></thead>
          <tbody>{rows.map(i => (<Fragment key={i.id}>
            <tr onClick={() => setOpen(open === i.id ? null : i.id)} style={{ cursor: 'pointer' }}>
              <td><b>{i.name}</b><div className="muted mono">{i.code} · {kindLabel(i.kind)}{i.user_id ? '' : ' · no login'}</div></td>
              <td>{i.category ?? '—'}</td>
              <td>{list2(i.instruments, INSTRUMENT)}</td><td>{list2(i.geos, INV_GEO)}</td><td>{list2(i.assets, INV_ASSET)}</td><td>{ticket(i)}</td>
              <td onClick={e => e.stopPropagation()}><select aria-label="Set KYC status" value={i.kyc_status} disabled={act.busy} onChange={e => void act.run(() => rpc('set_kyc', { p_investor: i.id, p_status: e.target.value }))}>
                {['none', 'pending', 'passed', 'failed'].map(s => <option key={s}>{s}</option>)}</select></td>
            </tr>
            {open === i.id && <tr><td colSpan={7}>
              <div className="muted">{i.crm ? <>
                <div><b>CRM:</b> {i.crm_id} · {i.crm.type ?? 'platform'} · instrument “{i.crm.instrument}” · ticket “{i.crm.ticket}”</div>
                <div>Geographies: {i.crm.geographies}</div><div>Assets: {i.crm.assets}</div></> : <div>Created on the platform, no CRM record.</div>}
                <div>Email {i.email ?? '—'} · phone {i.phone ?? '—'} · country {countryName(i.country)} · declared {i.declared_qualified_at ? when(i.declared_qualified_at) : 'no'}</div></div>
            </td></tr>}</Fragment>))}</tbody>
        </table></div>
      )}
    </section>
  )
}

type CompanyRow = {
  company_id: string; name: string; website: string | null; founded: number | null; delivered: number; volume_m: number; refs: number
  owner_email: string | null; projects: number
  ver_registry: boolean; ver_web: boolean; ver_fin: boolean; ver_refs: boolean
  notes: Record<string, { note: string | null; at: string }>
}
const CHECKS: Array<{ key: 'registry' | 'web' | 'fin' | 'refs'; flag: 'ver_registry' | 'ver_web' | 'ver_fin' | 'ver_refs'; label: string; hint: string }> = [
  { key: 'registry', flag: 'ver_registry', label: 'Registry', hint: 'The company exists in the commercial registry; founding year and directors match.' },
  { key: 'web', flag: 'ver_web', label: 'Website', hint: 'The site exists, belongs to the company and matches what they declared.' },
  { key: 'fin', flag: 'ver_fin', label: 'Financials', hint: 'Accounts or bank statements were reviewed.' },
  { key: 'refs', flag: 'ver_refs', label: 'References', hint: 'At least one past partner or buyer was contacted and confirmed.' },
]

function CompanyCard({ c, reload }: { c: CompanyRow; reload: () => void | Promise<void> }) {
  const [notes, setNotes] = useState<Record<string, string>>(() => Object.fromEntries(CHECKS.map(k => [k.key, c.notes[k.key]?.note ?? ''])))
  const act = useAction(reload)
  const set = (key: string, passed: boolean) => void act.run(() => rpc('set_company_check', { p_company: c.company_id, p_check: key, p_passed: passed, p_note: notes[key] ?? '' }))
  const passed = CHECKS.filter(k => c[k.flag]).length
  return (
    <div className="card soft">
      <div className="row">
        <b>{c.name}</b><Pill tone={passed === 4 ? 'good' : passed > 0 ? 'plan' : undefined}>{passed} of 4 verified</Pill><span className="sp" />
        <span className="muted">{c.owner_email ?? '—'} · {c.projects} {c.projects === 1 ? 'project' : 'projects'}</span>
      </div>
      <div className="muted">
        Founded {c.founded ?? '—'} · {c.delivered} delivered · €{c.volume_m}M volume · {c.refs} references
        {c.website && <> · <a href={/^https?:/.test(c.website) ? c.website : `https://${c.website}`} target="_blank" rel="noreferrer">{c.website}</a></>}
      </div>
      {CHECKS.map(k => {
        const done = c[k.flag]; const info = c.notes[k.key]
        return (
          <div className="grid2" key={k.key} style={{ alignItems: 'end' }}>
            <div><div className="row"><b>{k.label}</b>{done ? <Pill tone="good">Verified</Pill> : <Pill>Not verified</Pill>}</div>
              <div className="muted">{k.hint}{info && <> Last updated {when(info.at)}.</>}</div></div>
            <div className="row">
              <input className="sp" placeholder="What was checked, and where" value={notes[k.key] ?? ''} onChange={e => setNotes({ ...notes, [k.key]: e.target.value })} />
              {done
                ? <><button className="btn sm" disabled={act.busy || !(notes[k.key] ?? '').trim()} onClick={() => set(k.key, true)}>Save note</button><button className="btn sm" disabled={act.busy} onClick={() => set(k.key, false)}>Revoke</button></>
                : <button className="btn sm pri" disabled={act.busy || !(notes[k.key] ?? '').trim()} onClick={() => set(k.key, true)}>Mark verified</button>}
            </div>
          </div>
        )
      })}
      <ErrorLine error={act.error} />
    </div>
  )
}

function Companies() {
  const list = useLoad(async () => rpc<CompanyRow[]>('admin_companies'))
  return (
    <section className="card">
      <h2>Sponsor verification</h2>
      <p className="muted">Four checks that only Cobuildy can set. Investors see the count on every teaser. A note is required, and every change is logged. The developer is notified when a check passes.</p>
      <ErrorLine error={list.error} />
      {list.data && list.data.length === 0 ? <Empty>No companies yet.</Empty> : list.data?.map(c => <CompanyCard key={c.company_id} c={c} reload={list.reload} />)}
    </section>
  )
}

function Replies() {
  const list = useLoad(() => rpc<InvestorReply[]>('admin_investor_replies'))
  const act = useAction(list.reload)
  const [form, setForm] = useState<Record<string, { channel: string; note: string }>>({})
  const f = (id: string) => form[id] ?? { channel: 'email', note: '' }
  const set = (id: string, v: Partial<{ channel: string; note: string }>) => setForm({ ...form, [id]: { ...f(id), ...v } })
  const rec = (id: string, reply: 'interest' | 'pass') => void act.run(() => rpc('record_investor_reply', { p_deal: id, p_reply: reply, p_channel: f(id).channel, p_note: f(id).note || null }))
  const waiting = (list.data ?? []).filter(r => r.stage === 'sent')
  const done = (list.data ?? []).filter(r => r.reply)
  return (
    <section className="card">
      <h2>Investor replies</h2>
      <p className="muted">Investors loaded from the CRM have no login. When one answers a teaser by email, phone or message, record the answer here. The deal moves as if they had answered, the developer is notified, and the entry is logged with your name and the channel.</p>
      <ErrorLine error={act.error ?? list.error} />
      {waiting.length === 0 ? <Empty>No teasers waiting for an answer.</Empty> : waiting.map(r => (
        <div className="card soft" key={r.deal_id}>
          <div className="row"><b>{r.investor_name}</b><span className="muted">{r.investor_code} · {r.investor_category}</span><span className="sp" /><span className="muted">{r.project_code} · sent {when(r.sent_at)}</span></div>
          <div className="row">
            <select style={{ maxWidth: 160 }} value={f(r.deal_id).channel} onChange={e => set(r.deal_id, { channel: e.target.value })}>{Object.entries(CHANNEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <input className="sp" placeholder="Note, e.g. replied to our email, wants the NDA (if passing: the reason, the developer will see it)" value={f(r.deal_id).note} onChange={e => set(r.deal_id, { note: e.target.value })} />
            <button className="btn sm pri" disabled={act.busy} onClick={() => rec(r.deal_id, 'interest')}>Record interest</button>
            <button className="btn sm" disabled={act.busy} onClick={() => rec(r.deal_id, 'pass')}>Record pass</button>
          </div>
        </div>
      ))}
      {done.length > 0 && <>
        <h3>Recorded</h3>
        {done.map(r => <div className="muted" key={r.deal_id}>{r.investor_name} · {r.project_code}: {r.reply === 'interest' ? 'interest' : 'pass'} recorded by {r.recorded_by ?? 'staff'} via {CHANNEL[r.channel ?? ''] ?? r.channel}, {when(r.recorded_at ?? '')} · now {STAGE_LABEL[r.stage]}{r.note ? ` · ${r.note}` : ''}</div>)}
      </>}
    </section>
  )
}

type FunnelReport = {
  steps: number[]; completed: number; cta: number; registered: number
  campaigns: Array<{ campaign: string; started: number; contacts: number; completed: number; registered: number }>
  leads: Array<{ id: string; at: string; name: string | null; phone: string | null; step: number; score: number | null; completed: boolean; cta: boolean; registered: boolean
    strategy: string | null; city: string | null; geo: string | null; ask: number | null; campaign: string }>
}
const FUNNEL_STEPS = ['Opened the page', 'Project type', 'Location', 'Project stage', 'GDV', 'Capital needed', 'Own equity', 'Permits', 'Left name and phone']
const pct = (n: number, of: number) => (of > 0 ? `${Math.round((100 * n) / of)}%` : '—')

function Funnel() {
  const [days, setDays] = useState(30)
  const rep = useLoad(() => rpc<FunnelReport>('admin_funnel_report', { p_days: days }), [days])
  const r = rep.data
  const opened = r?.steps[0] ?? 0
  const rows: Array<[string, number]> = r ? [
    ...FUNNEL_STEPS.map((l, k) => [k === 0 || k === 8 ? l : `Answered: ${l}`, r.steps[k] ?? 0] as [string, number]),
    ['Saw the result', r.completed], ['Pressed “Unlock your investor matches”', r.cta], ['Registered', r.registered],
  ] : []
  return (
    <section className="card">
      <h2>Ad funnel</h2>
      <p className="muted">Everyone who opens the funnel page is counted, including your own tests. The steps show how many reached each question.</p>
      <div className="row"><select aria-label="Period" value={days} onChange={e => setDays(+e.target.value)}>
        <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={0}>All time</option></select></div>
      <ErrorLine error={rep.error} />
      {r && (opened === 0 ? <Empty>Nobody opened the funnel in this period.</Empty> : <>
        <div className="scrollx"><table>
          <thead><tr><th>Step</th><th>People</th><th>Of those who opened</th><th>Lost since the previous step</th></tr></thead>
          <tbody>{rows.map(([l, n], k) => (
            <tr key={l}><td>{l}</td><td>{n}</td><td>{pct(n, opened)}</td><td>{k === 0 ? '' : rows[k - 1][1] - n > 0 ? `−${rows[k - 1][1] - n}` : '0'}</td></tr>))}</tbody>
        </table></div>
        <h3>Campaigns</h3>
        <div className="scrollx"><table>
          <thead><tr><th>Campaign</th><th>Opened</th><th>Left contacts</th><th>Saw result</th><th>Registered</th></tr></thead>
          <tbody>{r.campaigns.map(c => <tr key={c.campaign}><td>{c.campaign}</td><td>{c.started}</td><td>{c.contacts} ({pct(c.contacts, c.started)})</td><td>{c.completed}</td><td>{c.registered} ({pct(c.registered, c.started)})</td></tr>)}</tbody>
        </table></div>
        <h3>Leads</h3>
        {r.leads.length === 0 ? <Empty>No leads yet.</Empty> : <div className="scrollx"><table>
          <thead><tr><th>When</th><th>Name</th><th>Phone</th><th>Project</th><th>Score</th><th>Got to</th><th>Campaign</th><th>Account</th></tr></thead>
          <tbody>{r.leads.map(l => (
            <tr key={l.id}>
              <td>{when(l.at)}</td><td>{l.name ?? '—'}</td><td>{l.phone ? <a href={`tel:${l.phone.replace(/[^+0-9]/g, '')}`}>{l.phone}</a> : '—'}</td>
              <td>{[STRATEGY.find(x => x.v === l.strategy)?.label, l.city ?? GEO[l.geo ?? ''], l.ask ? `ask ${eur(l.ask)}` : null].filter(Boolean).join(' · ') || '—'}</td>
              <td>{l.score ?? '—'}</td>
              <td>{l.cta ? 'Pressed Unlock' : l.completed ? 'Saw result' : l.step >= 8 ? 'Left contacts' : `Question ${l.step}`}</td>
              <td>{l.campaign}</td><td>{l.registered ? <Pill tone="good">yes</Pill> : <Pill>no</Pill>}</td>
            </tr>))}</tbody>
        </table></div>}
      </>)}
    </section>
  )
}

export function Admin() {
  const [k, setK] = useState(0)
  return <><h1>Admin</h1><Requests onInvited={() => setK(k + 1)} /><Invitations reloadKey={k} /><Teasers /><Replies /><Funnel /><Companies /><Investors /></>
}
