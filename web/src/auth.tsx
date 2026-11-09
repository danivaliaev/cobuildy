import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import type { Profile } from './lib/types'

interface AuthState { loading: boolean; session: Session | null; profile: Profile | null; signOut: () => Promise<void> }
const Ctx = createContext<AuthState>({ loading: true, session: null, profile: null, signOut: async () => {} })
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); if (!data.session) setLoading(false) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); if (!s) { setProfile(null); setLoading(false) } })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    let live = true
    supabase.from('profiles').select('id, role, full_name').eq('id', session.user.id).maybeSingle().then(({ data }) => {
      if (live) { setProfile((data as Profile | null) ?? null); setLoading(false) }
    })
    return () => { live = false }
  }, [session])

  return <Ctx.Provider value={{ loading, session, profile, signOut: async () => { await supabase.auth.signOut() } }}>{children}</Ctx.Provider>
}
