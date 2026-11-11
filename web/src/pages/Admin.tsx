import { kindLabel, countryName } from '../lib/investorKinds'
import { useState, type FormEvent } from 'react'
import { supabase, rpc } from '../lib/supabase'
import { useAuth } from '../auth'
import { eur, when } from '../lib/format'
import { Empty, ErrorLine, Field, Pill, useAction, useLoad } from '../components/ui'
import { GEO, ASSET, type Invitation, type Investor, type Project, type Role } from '../lib/types'


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
      <p className="muted">Nobody can register without an approved invitation. Approving here only unlocks sign-in; the invitation email is sent separately.</p>
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
    const { data, error } = await supabase.from('investors').select('*').order('created_at', { ascending: false }).limit(200)
    if (error) throw error
    return data as Investor[]
  })
  const act = useAction(list.reload)
  return (
    <section className="card">
      <h2>Investors</h2>
      <ErrorLine error={act.error ?? list.error} />
      {list.data && list.data.length === 0 ? <Empty>No investors yet. They appear when an invited investor signs in.</Empty> : (
        <div className="scrollx"><table>
          <thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Country</th><th>Email</th><th>Phone</th><th>Declared</th><th>KYC</th><th /></tr></thead>
          <tbody>{list.data?.map(i => (
            <tr key={i.id}>
              <td>{i.code}</td><td>{i.name}</td><td>{kindLabel(i.kind)}</td><td>{countryName(i.country)}</td><td>{i.email ?? '—'}</td><td>{i.phone ?? '—'}</td>
              <td>{i.declared_qualified_at ? <Pill tone="good">{when(i.declared_qualified_at)}</Pill> : <Pill>no</Pill>}</td>
              <td><Pill tone={i.kyc_status === 'passed' ? 'good' : i.kyc_status === 'failed' ? 'bad' : i.kyc_status === 'pending' ? 'warn' : undefined}>{i.kyc_status}</Pill></td>
              <td><select aria-label="Set KYC status" value={i.kyc_status} disabled={act.busy} onChange={e => void act.run(() => rpc('set_kyc', { p_investor: i.id, p_status: e.target.value }))}>
                {['none', 'pending', 'passed', 'failed'].map(s => <option key={s}>{s}</option>)}</select></td>
            </tr>))}</tbody>
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

export function Admin() {
  const [k, setK] = useState(0)
  return <><h1>Admin</h1><Requests onInvited={() => setK(k + 1)} /><Invitations reloadKey={k} /><Teasers /><Companies /><Investors /></>
}
