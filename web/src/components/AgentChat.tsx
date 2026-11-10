import { useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase, errText } from '../lib/supabase'
import { ErrorLine } from './ui'

interface Proposal { update: Record<string, unknown>; lines: string[] }
interface Msg { role: 'user' | 'assistant'; content: string; proposals?: Proposal[]; done?: boolean[] }

const START = 'Hi, I am the Cobuildy agent. Tell me about the project in your own words: where it is, what you build, what it costs and how much capital you are looking for. I will fill in the profile, and you confirm every change before it is saved.'

/** Pulls the readable message out of a failed function call. */
async function failure(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response })?.context
  if (ctx && typeof ctx.json === 'function') {
    try { const b = await ctx.json(); if (b?.error) return String(b.error) } catch { /* fall through */ }
  }
  return errText(error)
}

export function AgentChat({ projectId, onApplied, readOnly }: { projectId: string; onApplied: () => void | Promise<void>; readOnly?: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>([{ role: 'assistant', content: START }])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [msgs, busy])

  const send = async (e: FormEvent) => {
    e.preventDefault()
    const t = text.trim()
    if (!t || busy) return
    const next: Msg[] = [...msgs, { role: 'user', content: t }]
    setMsgs(next); setText(''); setBusy(true); setError(null)
    try {
      // The first greeting is local; the model gets the conversation from the person's first message.
      const history = next.slice(1).map(m => ({ role: m.role, content: m.content }))
      const { data, error: err } = await supabase.functions.invoke('agent-chat', { body: { project_id: projectId, messages: history } })
      if (err) throw new Error(await failure(err))
      const proposals = (data?.proposals ?? []) as Proposal[]
      setMsgs([...next, { role: 'assistant', content: String(data?.reply ?? ''), proposals, done: proposals.map(() => false) }])
    } catch (ex) {
      setError(errText(ex))
    } finally { setBusy(false) }
  }

  const apply = async (mi: number, pi: number) => {
    const p = msgs[mi].proposals?.[pi]
    if (!p) return
    setBusy(true); setError(null)
    try {
      const { error: err } = await supabase.from('projects').update(p.update).eq('id', projectId)
      if (err) throw new Error(err.message)
      setMsgs(msgs.map((m, i) => (i === mi ? { ...m, done: (m.done ?? []).map((d, j) => (j === pi ? true : d)) } : m)))
      await onApplied()
    } catch (ex) { setError(errText(ex)) } finally { setBusy(false) }
  }
  const dismiss = (mi: number, pi: number) =>
    setMsgs(msgs.map((m, i) => (i === mi ? { ...m, proposals: (m.proposals ?? []).filter((_, j) => j !== pi), done: (m.done ?? []).filter((_, j) => j !== pi) } : m)))

  return (
    <section className="card">
      <h2>Agent</h2>
      <p className="muted">{readOnly ? 'This project is no longer a draft. The agent can answer questions but cannot change it.' : 'Describe the project and the agent fills in the profile. Nothing is saved until you confirm it.'}</p>
      <div className="chat" aria-live="polite">
        {msgs.map((m, mi) => (
          <div key={mi} className={`bub ${m.role}`}>
            <div>{m.content}</div>
            {(m.proposals ?? []).map((p, pi) => (
              <div className="prop" key={pi}>
                <span className="mono">Proposed changes</span>
                <ul>{p.lines.map(l => <li key={l}>{l}</li>)}</ul>
                {m.done?.[pi] ? <span className="ok">Saved to the project</span> : (
                  <div className="row">
                    <button className="btn sm pri" disabled={busy} onClick={() => void apply(mi, pi)}>Confirm and save</button>
                    <button className="btn sm" disabled={busy} onClick={() => dismiss(mi, pi)}>Dismiss</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
        {busy && <div className="bub assistant muted">Thinking…</div>}
        <div ref={end} />
      </div>
      <ErrorLine error={error} />
      <form className="row" onSubmit={e => void send(e)}>
        <input className="sp" value={text} maxLength={2000} onChange={e => setText(e.target.value)} placeholder="Type here, e.g. 36 apartments in Marbella, cost €6M, raising €3M mezzanine" aria-label="Message to the agent" />
        <button className="btn pri" type="submit" disabled={busy || !text.trim()}>Send</button>
      </form>
    </section>
  )
}
