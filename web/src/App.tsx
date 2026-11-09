import { Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import { configured } from './lib/supabase'
import { Login } from './pages/Login'
import { Admin } from './pages/Admin'
import { Developer } from './pages/Developer'
import { ProjectPage } from './pages/Project'
import { Investor } from './pages/Investor'
import type { Role } from './lib/types'

const HOME: Record<Role, string> = { admin: '/admin', expert: '/admin', developer: '/developer', investor: '/investor' }

function Shell({ children }: { children: React.ReactNode }) {
  const { profile, session, signOut } = useAuth()
  const staff = profile?.role === 'admin' || profile?.role === 'expert'
  return (
    <>
      <header className="top">
        <a className="logo" href="/" aria-label="Cobuildy">Cobuildy</a>
        <nav className="nav">
          {staff && <NavLink to="/admin" className={({ isActive }) => (isActive ? 'on' : '')}>Admin</NavLink>}
          {profile?.role === 'developer' && <NavLink to="/developer" className={({ isActive }) => (isActive ? 'on' : '')}>My projects</NavLink>}
          {profile?.role === 'investor' && <NavLink to="/investor" className={({ isActive }) => (isActive ? 'on' : '')}>Investor workspace</NavLink>}
        </nav>
        <span className="mono">{profile?.role}</span>
        <span className="muted">{session?.user.email}</span>
        <button className="btn sm" type="button" onClick={() => void signOut()}>Sign out</button>
      </header>
      <main className="wrap">{children}</main>
    </>
  )
}

export function App() {
  const { loading, session, profile } = useAuth()
  if (!configured) return <div className="login"><div className="card"><h2>Configuration missing</h2><p className="muted">Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY. See web/.env.example.</p></div></div>
  if (loading) return <div className="login"><span className="muted">Loading…</span></div>
  if (!session) return <Login />
  if (!profile) return <div className="login"><div className="card"><h2>No access yet</h2><p className="muted">Your account has no role. Ask Cobuildy to check your invitation.</p></div></div>
  const home = HOME[profile.role]
  return (
    <Shell>
      <Routes>
        <Route path="/admin/*" element={profile.role === 'admin' || profile.role === 'expert' ? <Admin /> : <Navigate to={home} replace />} />
        <Route path="/developer" element={profile.role === 'developer' ? <Developer /> : <Navigate to={home} replace />} />
        <Route path="/developer/projects/:id" element={profile.role === 'developer' ? <ProjectPage /> : <Navigate to={home} replace />} />
        <Route path="/investor" element={profile.role === 'investor' ? <Investor /> : <Navigate to={home} replace />} />
        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes>
    </Shell>
  )
}
