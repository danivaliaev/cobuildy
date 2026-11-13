import { supabase } from './supabase'
import type { Answers } from './funnel'

/** One id per visitor browser. It is made here, so the database never hands out a guessable one. */
const KEY = 'cb.funnel.sid'
export function sessionId(): string {
  try {
    const old = localStorage.getItem(KEY)
    if (old && /^[0-9a-f-]{36}$/.test(old)) return old
  } catch { /* storage blocked: the id lasts for this page only */ }
  const id = crypto.randomUUID()
  try { localStorage.setItem(KEY, id) } catch { /* ignore */ }
  return id
}
/** A fresh id for the next visit once the visitor has registered with this one. */
export function forgetSession(): void { try { localStorage.removeItem(KEY) } catch { /* ignore */ } }

/** Where the visitor came from: the ad's utm tags, whether Meta's click id was present, and the referring site. */
export function trafficSource(search = window.location.search, referrer = document.referrer, host = window.location.hostname): Record<string, string> {
  const q = new URLSearchParams(search)
  const out: Record<string, string> = {}
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) { const v = q.get(k); if (v) out[k] = v.slice(0, 120) }
  if (q.get('fbclid')) out.fbclid = '1'
  try { const h = referrer ? new URL(referrer).hostname : ''; if (h && h !== host) out.referrer = h.slice(0, 120) } catch { /* ignore */ }
  return out
}

export interface Patch { step?: number; answers?: Answers; source?: Record<string, string>; name?: string; phone?: string; result?: { score: number; matches: unknown }; cta?: boolean }
/** Saves without ever getting in the visitor's way: a failure is not shown and does not stop the funnel. */
export function save(id: string, p: Patch): Promise<void> {
  return Promise.resolve(supabase.rpc('funnel_save', {
    p_id: id, p_step: p.step ?? null, p_answers: p.answers ?? null, p_source: p.source ?? null, p_name: p.name ?? null, p_phone: p.phone ?? null,
    p_result: p.result ?? null, p_cta: p.cta ?? false,
  })).then(() => undefined, () => undefined)
}

export const validName = (t: string) => { const n = t.replace(/\s+/g, ' ').trim(); return n.length >= 2 && n.length <= 120 ? n : null }
export const validPhone = (t: string) => { const p = t.trim(); return /^\+?[0-9 ()./-]{7,24}$/.test(p) && p.replace(/\D/g, '').length >= 7 ? p : null }
