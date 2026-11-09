import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { errText } from '../lib/supabase'

export function Pill({ tone, children }: { tone?: 'good' | 'warn' | 'plan' | 'bad'; children: ReactNode }) {
  return <span className={`pill ${tone ?? ''}`}>{children}</span>
}
export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>
export const ErrorLine = ({ error }: { error: string | null }) => (error ? <div className="err" role="alert">{error}</div> : null)

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="f"><span>{label}</span>{children}</label>
}

export function Checks<T extends string>({ options, value, onChange }: { options: Record<T, string>; value: T[]; onChange: (v: T[]) => void }) {
  return (
    <div className="chks">
      {(Object.keys(options) as T[]).map(k => (
        <label className="chk" key={k}>
          <input type="checkbox" checked={value.includes(k)} onChange={e => onChange(e.target.checked ? [...value, k] : value.filter(x => x !== k))} />
          {options[k]}
        </label>
      ))}
    </div>
  )
}

/** Loads data once and again on demand. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(async () => { try { setError(null); setData(await fn()) } catch (e) { setError(errText(e)) } finally { setLoading(false) } }, deps)
  useEffect(() => { void run() }, [run])
  return { data, error, loading, reload: run }
}

/** Runs an action, shows its error and reloads afterwards. */
export function useAction(after?: () => void | Promise<void>) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null)
    try { await fn(); if (after) await after() } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }
  return { busy, error, run }
}
