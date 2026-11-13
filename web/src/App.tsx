import { useEffect } from 'react'
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './auth'
import { configured } from './lib/supabase'
import { Login } from './pages/Login'
import { Funnel } from './pages/Funnel'
import { Onboarding } from './pages/Onboarding'
import { Admin } from './pages/Admin'
import { Developer } from './pages/Developer'
import { ProjectPage } from './pages/Project'
import { Investor } from './pages/Investor'
import { Bell } from './components/Bell'
import { AccountMenu } from './components/AccountMenu'
import { Settings } from './pages/Settings'
import type { Role } from './lib/types'

const HOME: Record<Role, string> = { admin: '/admin', expert: '/admin', developer: '/developer', investor: '/investor' }

function Shell({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth()
  const path = useLocation().pathname
  const wide = path.startsWith('/developer') || path.startsWith('/investor')
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
        <Bell />
        <AccountMenu />
      </header>
      <main className={`wrap${wide ? ' wide' : ''}`}>{children}</main>
    </>
  )
}

/** Signed-out visitors see the landing page; /login is the sign-in form. A returning magic link keeps its parameters and is not redirected. */
function SignedOut() {
  const { pathname, search, hash } = useLocation()
  const returning = /[?&#](code|access_token|error)=/.test(search + hash)
  const toLanding = pathname !== '/login' && !returning
  useEffect(() => { if (toLanding) window.location.replace('/landing.html') }, [toLanding])
  return toLanding ? <div className="login"><span className="muted">Loading…</span></div> : <Login />
}

export function App() {
  const { loading, session, profile } = useAuth()
  if (!configured) return <div className="login"><div className="card"><h2>Configuration missing</h2><p className="muted">Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY. See web/.env.example.</p></div></div>
  // The ad funnel is public and has no menu, so nothing pulls the visitor away from the questions.
  if (window.location.pathname === '/start') return <Funnel />
  if (loading) return <div className="login"><span className="muted">Loading…</span></div>
  if (!session) return <SignedOut />
  if (!profile) return <Onboarding />
  const home = HOME[profile.role]
  return (
    <Shell>
      <Routes>
        <Route path="/admin/*" element={profile.role === 'admin' || profile.role === 'expert' ? <Admin /> : <Navigate to={home} replace />} />
        <Route path="/developer" element={profile.role === 'developer' ? <Developer /> : <Navigate to={home} replace />} />
        <Route path="/developer/projects/:id" element={profile.role === 'developer' ? <ProjectPage /> : <Navigate to={home} replace />} />
        <Route path="/investor" element={profile.role === 'investor' ? <Investor /> : <Navigate to={home} replace />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes>
    </Shell>
  )
}
