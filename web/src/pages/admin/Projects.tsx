import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { eur, when } from '../../lib/format'
import { Empty, ErrorLine, Pill, useLoad } from '../../components/ui'
import { GEO, ASSET, type ProjectStatus } from '../../lib/types'
import { PageHead } from './ui'

interface Row { id: string; code: string; title: string; status: ProjectStatus; geo: string | null; asset: string | null; ask_eur: number | null; readiness: number | null; updated_at: string; companies: { name: string } | null }
const LABEL: Record<ProjectStatus, string> = { draft: 'Draft', teaser_review: 'Teaser in review', approved: 'Approved', live: 'Live', closed_won: 'Closed, funded', closed_lost: 'Closed, lost', discarded: 'Discarded' }
const TONE: Partial<Record<ProjectStatus, 'good' | 'warn' | 'plan' | 'bad'>> = { live: 'good', approved: 'good', teaser_review: 'warn', closed_won: 'plan', closed_lost: 'bad' }

export function Projects() {
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const status = params.get('status') ?? ''
  const list = useLoad(async () => {
    const { data, error } = await supabase.from('projects').select('id,code,title,status,geo,asset,ask_eur,readiness,updated_at,companies(name)').order('updated_at', { ascending: false }).limit(500)
    if (error) throw error
    return data as unknown as Row[]
  })
  const all = list.data ?? []
  const rows = all.filter(p => (!status || p.status === status) && (status === 'discarded' || status || p.status !== 'discarded')
    && (!q.trim() || `${p.code} ${p.title} ${p.companies?.name ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())))
  return (
    <>
      <PageHead title="Projects" sub="Every project on the platform. Discarded drafts are hidden unless you pick that status." />
      <section className="adm-card">
        <div className="row">
          <input style={{ maxWidth: 260 }} placeholder="Search code, title or company" aria-label="Search projects" value={q} onChange={e => setQ(e.target.value)} />
          <select aria-label="Status" value={status} onChange={e => setParams(e.target.value ? { status: e.target.value } : {}, { replace: true })}>
            <option value="">All except discarded</option>{(Object.keys(LABEL) as ProjectStatus[]).map(k => <option key={k} value={k}>{LABEL[k]}</option>)}
          </select>
          <span className="sp muted">{rows.length} of {all.length}</span>
        </div>
        <ErrorLine error={list.error} />
        {list.data && rows.length === 0 ? <Empty>No projects match.</Empty> : (
          <div className="scrollx"><table>
            <thead><tr><th>Project</th><th>Company</th><th>Status</th><th>Region</th><th>Asset</th><th>Ask</th><th>Readiness</th><th>Updated</th></tr></thead>
            <tbody>{rows.map(p => (
              <tr key={p.id}>
                <td><b>{p.title}</b><div className="muted mono">{p.code}</div></td><td>{p.companies?.name ?? '—'}</td>
                <td><Pill tone={TONE[p.status]}>{LABEL[p.status]}</Pill></td>
                <td>{GEO[p.geo ?? ''] ?? '—'}</td><td>{ASSET[p.asset ?? ''] ?? '—'}</td><td>{eur(p.ask_eur)}</td>
                <td><div className="adm-ready"><div className="bar"><i style={{ width: `${p.readiness ?? 0}%` }} /></div><span>{p.readiness ?? 0}%</span></div></td>
                <td>{when(p.updated_at)}</td>
              </tr>))}</tbody>
          </table></div>
        )}
      </section>
    </>
  )
}
