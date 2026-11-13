import { Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { useAuth } from '../auth'
import { CountsProvider, useCounts } from './admin/counts'
import { Overview } from './admin/Overview'
import { Inbox } from './admin/Inbox'
import { Projects } from './admin/Projects'
import { Companies, Funnel, Invitations, Investors } from './admin/sections'
import { PageHead } from './admin/ui'

const ICON: Record<string, string> = {
  overview: 'M3 12 12 3l9 9M5 10v10h5v-6h4v6h5V10',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z',
  projects: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  investors: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  companies: 'M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M2 21h20M8 7h4M8 11h4M8 15h4',
  funnel: 'M3 4h18l-7 8.5V20l-4-2v-5.5z',
  access: 'M21 2l-2 2m-7.6 7.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4',
}
const Icon = ({ name }: { name: string }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICON[name]} /></svg>
)

function Nav() {
  const { counts } = useCounts()
  const todo = counts.teasers + counts.replies + counts.requests
  const groups: Array<{ title: string; items: Array<{ to: string; label: string; icon: string; n?: number; end?: boolean }> }> = [
    { title: 'Work', items: [{ to: '/admin', label: 'Overview', icon: 'overview', end: true }, { to: '/admin/inbox', label: 'Inbox', icon: 'inbox', n: todo }] },
    { title: 'Data', items: [
      { to: '/admin/projects', label: 'Projects', icon: 'projects' }, { to: '/admin/investors', label: 'Investors', icon: 'investors' },
      { to: '/admin/companies', label: 'Companies', icon: 'companies' }, { to: '/admin/funnel', label: 'Ad funnel', icon: 'funnel' }] },
    { title: 'Settings', items: [{ to: '/admin/access', label: 'Access', icon: 'access' }] },
  ]
  return (
    <nav className="adm-nav" aria-label="Admin">
      {groups.map(g => (
        <div key={g.title} className="adm-group">
          <span className="adm-gtitle">{g.title}</span>
          {g.items.map(i => (
            <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => (isActive ? 'on' : '')}>
              <Icon name={i.icon} /><span>{i.label}</span>{i.n ? <em className="adm-badge" aria-label={`${i.n} waiting`}>{i.n}</em> : null}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  )
}

export function Admin() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  return (
    <CountsProvider>
      <div className="adm">
        <aside className="adm-side"><Nav /></aside>
        <div className="adm-main">
          <Routes>
            <Route index element={<Overview />} />
            <Route path="inbox" element={<Inbox />} />
            <Route path="projects" element={<Projects />} />
            <Route path="investors" element={<><PageHead title="Investors" sub="What each investor looks for. An empty criterion means no restriction, so the investor fits any project on that point. Open a row to see the original CRM text." /><Investors /></>} />
            <Route path="companies" element={<><PageHead title="Companies" sub="Sponsor verification: four checks that only Cobuildy can set. Investors see the count on every teaser. A note is required, and every change is logged. The developer is notified when a check passes." /><Companies /></>} />
            <Route path="funnel" element={<><PageHead title="Ad funnel" sub="Everyone who opens the funnel page is counted, including your own tests. The steps show how many reached each question." /><Funnel /></>} />
            <Route path="access" element={<><PageHead title="Access" sub={isAdmin ? 'Developers and investors can sign up on their own. An approved invitation is how staff roles (admin, expert) are created, and it also pre-assigns a role to an address. Approving here only unlocks it; the invitation email is sent separately.' : 'Invitations. Only an admin can approve or revoke them.'} /><Invitations reloadKey={0} /></>} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </div>
      </div>
    </CountsProvider>
  )
}
