import { Link } from 'react-router-dom'
import { supabase, rpc } from '../../lib/supabase'
import { eur, when } from '../../lib/format'
import { Empty, ErrorLine, Pill, useLoad } from '../../components/ui'
import { STAGE_LABEL, type DealStage, type ProjectStatus } from '../../lib/types'
import { STRATEGY } from '../../lib/funnel'
import { Kpi, PageHead, num } from './ui'
import { useCounts } from './counts'

type Report = { steps: number[]; registered: number; completed: number; leads: Array<{ id: string; at: string; name: string | null; phone: string | null; registered: boolean; step: number; strategy: string | null; city: string | null; ask: number | null; campaign: string }> }
const STATUS: Record<ProjectStatus, string> = { draft: 'Draft', teaser_review: 'Teaser in review', approved: 'Approved', live: 'Live', closed_won: 'Closed, funded', closed_lost: 'Closed, lost', discarded: 'Discarded' }

export function Overview() {
  const { counts } = useCounts()
  const data = useLoad(async () => {
    const [inv, act, projects, deals, funnel] = await Promise.allSettled([
      supabase.from('investors').select('id', { count: 'exact', head: true }),
      supabase.from('investors').select('id', { count: 'exact', head: true }).eq('active', true),
      supabase.from('projects').select('status').limit(2000),
      supabase.from('deals').select('stage').limit(5000),
      rpc<Report>('admin_funnel_report', { p_days: 7 }),
    ])
    const tally = <K extends string>(rows: Array<Record<string, unknown>> | null, key: string) => {
      const o: Partial<Record<K, number>> = {}
      for (const r of rows ?? []) { const k = r[key] as K; o[k] = (o[k] ?? 0) + 1 }
      return o
    }
    return {
      investors: inv.status === 'fulfilled' ? inv.value.count ?? 0 : 0,
      active: act.status === 'fulfilled' ? act.value.count ?? 0 : 0,
      projects: tally<ProjectStatus>(projects.status === 'fulfilled' ? (projects.value.data as Array<Record<string, unknown>> | null) : null, 'status'),
      deals: tally<DealStage>(deals.status === 'fulfilled' ? (deals.value.data as Array<Record<string, unknown>> | null) : null, 'stage'),
      funnel: funnel.status === 'fulfilled' ? funnel.value : null,
    }
  })
  const d = data.data
  const todo = counts.teasers + counts.replies + counts.requests
  const opened = d?.funnel?.steps[0] ?? 0
  const newLeads = (d?.funnel?.leads ?? []).filter(l => l.phone && !l.registered)
  const live = (d?.projects.live ?? 0) + (d?.projects.approved ?? 0)
  const dealTotal = Object.values(d?.deals ?? {}).reduce((a, b) => a + (b ?? 0), 0)
  const maxDeal = Math.max(1, ...Object.values(d?.deals ?? {}).map(x => x ?? 0))

  return (
    <>
      <PageHead title="Overview" sub="What needs you today and how the platform is doing." />
      <ErrorLine error={data.error} />
      <div className="kpis">
        <Kpi label="Needs your action" value={counts.loaded ? todo : '…'} hint={todo === 0 && counts.loaded ? 'Nothing is waiting' : 'Teasers, replies, requests'} to="/admin/inbox" tone={todo > 0 ? 'warn' : 'good'} />
        <Kpi label="Active investors" value={d ? num(d.active) : '…'} hint={d ? `of ${num(d.investors)} in the database` : ''} to="/admin/investors" />
        <Kpi label="Projects on the market" value={d ? num(live) : '…'} hint={d ? `${num(Object.entries(d.projects).filter(([k]) => k !== 'discarded').reduce((a, [, n]) => a + (n ?? 0), 0))} projects in total` : ''} to="/admin/projects" />
        <Kpi label="Funnel, 7 days" value={d?.funnel ? num(opened) : '…'} hint={d?.funnel ? `opened · ${d.funnel.registered} registered${opened ? ` (${Math.round((100 * d.funnel.registered) / opened)}%)` : ''}` : ''} to="/admin/funnel" />
        <Kpi label="New leads, 7 days" value={d?.funnel ? newLeads.length : '…'} hint="left a phone, no account yet" to="/admin/funnel" tone={newLeads.length > 0 ? 'warn' : undefined} />
      </div>

      <div className="adm-cols">
        <section className="adm-card">
          <h2>Waiting for you</h2>
          {counts.loaded && todo === 0 ? <Empty>All clear.</Empty> : (
            <ul className="adm-list">
              <li><Link to="/admin/inbox?tab=teasers">Teasers to review</Link><Pill tone={counts.teasers ? 'warn' : undefined}>{counts.teasers}</Pill></li>
              <li><Link to="/admin/inbox?tab=replies">Investor replies to record</Link><Pill tone={counts.replies ? 'warn' : undefined}>{counts.replies}</Pill></li>
              <li><Link to="/admin/inbox?tab=requests">Requests from the website</Link><Pill tone={counts.requests ? 'warn' : undefined}>{counts.requests}</Pill></li>
            </ul>
          )}
        </section>

        <section className="adm-card">
          <h2>Deals by stage</h2>
          {dealTotal === 0 ? <Empty>No deals yet.</Empty> : (
            <div className="adm-bars">
              {(Object.keys(STAGE_LABEL) as DealStage[]).filter(k => d?.deals[k]).map(k => (
                <div key={k} className="adm-bar"><span>{STAGE_LABEL[k]}</span><div className="bar"><i style={{ width: `${(100 * (d?.deals[k] ?? 0)) / maxDeal}%` }} /></div><b>{d?.deals[k]}</b></div>
              ))}
            </div>
          )}
        </section>

        <section className="adm-card">
          <h2>Projects by status</h2>
          {d && Object.keys(d.projects).length === 0 ? <Empty>No projects yet.</Empty> : (
            <ul className="adm-list">
              {(Object.keys(STATUS) as ProjectStatus[]).filter(k => d?.projects[k]).map(k => <li key={k}><Link to={`/admin/projects?status=${k}`}>{STATUS[k]}</Link><b>{d?.projects[k]}</b></li>)}
            </ul>
          )}
        </section>

        <section className="adm-card adm-wide">
          <div className="row"><h2 className="sp">Latest leads</h2><Link to="/admin/funnel">All leads →</Link></div>
          {!d?.funnel || d.funnel.leads.length === 0 ? <Empty>No leads in the last 7 days.</Empty> : (
            <div className="scrollx"><table>
              <thead><tr><th>When</th><th>Name</th><th>Phone</th><th>Project</th><th>Campaign</th><th>Account</th></tr></thead>
              <tbody>{d.funnel.leads.slice(0, 6).map(l => (
                <tr key={l.id}><td>{when(l.at)}</td><td>{l.name ?? '—'}</td><td>{l.phone ? <a href={`tel:${l.phone.replace(/[^+0-9]/g, '')}`}>{l.phone}</a> : '—'}</td>
                  <td>{[STRATEGY.find(x => x.v === l.strategy)?.label, l.city, l.ask ? `ask ${eur(l.ask)}` : null].filter(Boolean).join(' · ') || '—'}</td>
                  <td>{l.campaign}</td><td>{l.registered ? <Pill tone="good">yes</Pill> : <Pill>no</Pill>}</td></tr>))}</tbody>
            </table></div>
          )}
        </section>
      </div>
    </>
  )
}
