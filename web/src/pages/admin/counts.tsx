import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase, rpc } from '../../lib/supabase'
import type { InvestorReply } from '../../lib/types'

/** What is waiting for staff, shown as badges in the menu and on the overview. */
export interface Counts { teasers: number; requests: number; replies: number; loaded: boolean }
const none: Counts = { teasers: 0, requests: 0, replies: 0, loaded: false }
const Ctx = createContext<{ counts: Counts; refresh: () => void }>({ counts: none, refresh: () => {} })
export const useCounts = () => useContext(Ctx)

/** Sections call this after they change something, so the badges follow at once. */
export const notifyChanged = (): void => { window.dispatchEvent(new Event('adm:changed')) }

export function CountsProvider({ children }: { children: ReactNode }) {
  const [counts, setCounts] = useState<Counts>(none)
  const load = useCallback(async () => {
    const [t, r, rep] = await Promise.allSettled([
      supabase.from('projects').select('id', { count: 'exact', head: true }).eq('status', 'teaser_review'),
      supabase.from('access_requests').select('id', { count: 'exact', head: true }).eq('status', 'new'),
      rpc<InvestorReply[]>('admin_investor_replies'),
    ])
    setCounts({
      teasers: t.status === 'fulfilled' ? t.value.count ?? 0 : 0,
      requests: r.status === 'fulfilled' ? r.value.count ?? 0 : 0,
      replies: rep.status === 'fulfilled' ? rep.value.filter(x => x.stage === 'sent').length : 0,
      loaded: true,
    })
  }, [])
  useEffect(() => {
    void load()
    const t = window.setInterval(() => void load(), 60_000)
    window.addEventListener('adm:changed', load)
    return () => { window.clearInterval(t); window.removeEventListener('adm:changed', load) }
  }, [load])
  return <Ctx.Provider value={{ counts, refresh: () => void load() }}>{children}</Ctx.Provider>
}
