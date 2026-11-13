import { useSearchParams } from 'react-router-dom'
import { Replies, Requests, Teasers } from './sections'
import { PageHead } from './ui'
import { notifyChanged, useCounts } from './counts'

const TABS = [
  { k: 'teasers', label: 'Teasers to review', sub: 'A developer submitted a teaser. Approve it to let them send it to investors.' },
  { k: 'replies', label: 'Investor replies', sub: 'Investors loaded from the CRM have no login. When one answers a teaser by email, phone or message, record the answer here. The deal moves as if they had answered, the developer is notified, and the entry is logged with your name and the channel.' },
  { k: 'requests', label: 'Website requests', sub: 'People who asked for access on the website. Create an invitation or dismiss the request.' },
] as const
type Tab = (typeof TABS)[number]['k']

export function Inbox() {
  const [q, setQ] = useSearchParams()
  const { counts } = useCounts()
  const tab: Tab = TABS.find(t => t.k === q.get('tab'))?.k ?? 'teasers'
  const n: Record<Tab, number> = { teasers: counts.teasers, replies: counts.replies, requests: counts.requests }
  const cur = TABS.find(t => t.k === tab)!
  return (
    <>
      <PageHead title="Inbox" sub={cur.sub} />
      <div className="adm-tabs" role="tablist" aria-label="Inbox">
        {TABS.map(t => (
          <button key={t.k} role="tab" aria-selected={tab === t.k} className={tab === t.k ? 'on' : ''} onClick={() => setQ({ tab: t.k }, { replace: true })}>
            {t.label}{n[t.k] > 0 && <em className="adm-badge">{n[t.k]}</em>}
          </button>
        ))}
      </div>
      {tab === 'teasers' && <Teasers />}
      {tab === 'replies' && <Replies />}
      {tab === 'requests' && <Requests onInvited={notifyChanged} />}
    </>
  )
}
