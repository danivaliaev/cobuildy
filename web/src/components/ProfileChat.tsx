import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase, errText } from '../lib/supabase'
import { ErrorLine } from './ui'
import { eur } from '../lib/format'
import { FK, MILESTONES, SECTIONS, applyUpdates, calc, chipsFor, firstInt, nextField, parseMoney, type Chip, type FieldState, type Fields, type Update } from '../lib/profile'

interface Saved { key: string; st: FieldState['st'] }
interface Msg { r: 'a' | 'u'; t: string; saved?: Saved[]; undo?: Record<string, FieldState>; undone?: boolean }

const UNKNOWN_REPLY = 'No problem, I marked it as a gap. Missing data is not counted against you, it just stays on the list.'
const INTRO = 'Hi, I am the Cobuildy agent. I will ask about your project one question at a time. Pick a suggested answer, write in your own words, or tell me several facts at once. Everything is saved as we go and you can undo any answer.'
const UNKNOWN_CHIP: Chip = { label: 'I don’t have this yet', value: '', partial: false, unknown: true }
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/** The agent reads the text on the server. If it is unreachable, the current question is answered from the raw text. */
function localAnswer(text: string, cur: string | null): { updates: Update[]; reply: string } {
  const d = cur ? FK[cur] : undefined
  if (!d) return { updates: [], reply: 'Tell me which part of the profile you want to change.' }
  if (/(don'?t have|do not have|no idea|not yet|unknown|skip|не знаю|пока нет)/i.test(text)) return { updates: [{ key: d.key, status: 'unknown' }], reply: UNKNOWN_REPLY }
  if (d.kind === 'money') {
    const n = parseMoney(text)
    return n == null ? { updates: [], reply: 'I could not read an amount. Try €5.4M or 5,400,000.' } : { updates: [{ key: d.key, status: 'filled', display: eur(n), amount: n }], reply: 'Saved.' }
  }
  if (d.kind === 'number') {
    const n = firstInt(text)
    return n == null ? { updates: [], reply: 'I could not read a number. Try 18.' } : { updates: [{ key: d.key, status: 'filled', display: `${n} months`, amount: n }], reply: 'Saved.' }
  }
  // Free text cannot be understood without the agent, so nothing is saved rather than guessing which field it belongs to.
  return { updates: [], reply: 'The agent is offline right now, so I could not read that. Pick one of the suggested answers, or try again in a minute.' }
}

export function ProfileChat({ projectId, fields, commit, editable, askReq, onCurrent }: {
  onCurrent?: (key: string | null) => void; projectId: string; fields: Fields; commit: (next: Fields) => Promise<void>; editable: boolean; askReq: { key: string; n: number } | null
}) {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [cur, setCur] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [typing, setTyping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const end = useRef<HTMLDivElement>(null)
  const started = useRef(false)
  const lastAsk = useRef(0)
  const live = useRef(fields)
  live.current = fields
  useEffect(() => { onCurrent?.(cur) }, [cur]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [msgs, typing])

  const push = (m: Msg) => setMsgs(a => [...a, m])
  const say = useCallback(async (t: string, extra: Partial<Msg> = {}, ms = 450) => {
    setTyping(true); await sleep(ms); setTyping(false)
    setMsgs(a => [...a, { r: 'a', t, ...extra }])
  }, [])
  const ask = useCallback(async (key: string | null, pre?: string) => {
    setCur(key)
    if (!key) { await say((pre ? pre + '\n\n' : '') + 'The profile has no open fields. Review it on the right, then submit the teaser for review.'); return }
    await say((pre ? pre + '\n\n' : '') + FK[key].question)
  }, [say])

  // First message: greeting and the first open question.
  useEffect(() => {
    if (started.current) return
    started.current = true
    const k = nextField(live.current)
    setCur(k)
    const fromSite = Object.values(live.current).filter(f => f.src === 'site' && f.st !== 'empty').length
    const welcome = fromSite ? `I saved ${fromSite} ${fromSite === 1 ? 'answer' : 'answers'} from our conversation on the website, you can see them on the right. ` : ''
    setMsgs([{ r: 'a', t: welcome + INTRO + '\n\n' + (k ? FK[k].question : 'Your profile has no open fields. Review it on the right.') }])
  }, [])

  // "Ask agent" on a profile row.
  useEffect(() => {
    if (!askReq || askReq.n === lastAsk.current) return
    lastAsk.current = askReq.n
    if (busy || !started.current) return
    setBusy(true); void ask(askReq.key).finally(() => setBusy(false))
  }, [askReq, busy, ask])

  /** Saves an answer straight away, then reports it and asks the next question. */
  const record = async (updates: Update[], reply: string, userText: string) => {
    const before = live.current
    const stage0 = calc(before).stage
    const { next, keys } = applyUpdates(before, updates)
    if (!keys.length) { await say(reply); return }
    await commit(next)
    live.current = next
    const undo: Record<string, FieldState> = Object.fromEntries(keys.map(k => [k, before[k]]))
    const stage1 = calc(next).stage
    await say(reply, { saved: keys.map(k => ({ key: k, st: next[k].st })), undo }, 350)
    const mile = stage1 > stage0 ? MILESTONES[stage1] : ''
    void userText
    await ask(nextField(next), mile)
  }

  const run = async (fn: () => Promise<void>) => {
    if (busy || !editable) return
    setBusy(true); setError(null)
    try { await fn() } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }

  const pick = (c: Chip) => run(async () => {
    if (!cur) return
    push({ r: 'u', t: c.label })
    if (c.unknown) return record([{ key: cur, status: 'unknown' }], UNKNOWN_REPLY, c.label)
    return record([{ key: cur, status: c.partial ? 'partial' : 'filled', display: c.value, amount: c.amount ?? null }], c.note ?? 'Saved.', c.label)
  })

  const send = (e: FormEvent) => {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    setText('')
    void run(async () => {
      push({ r: 'u', t })
      let res: { updates: Update[]; reply: string }
      setTyping(true)
      try {
        const { data, error: err } = await supabase.functions.invoke('agent-chat', { body: { project_id: projectId, text: t, current_key: cur } })
        if (err) {
          const ctx = (err as { context?: Response }).context
          let m = errText(err)
          if (ctx && typeof ctx.json === 'function') { try { const b = await ctx.json(); if (b?.error) m = String(b.error) } catch { /* keep m */ } }
          if (/not configured|temporarily unavailable|failed to send|fetch/i.test(m)) res = localAnswer(t, cur)
          else throw new Error(m)
        } else res = { updates: (data?.updates ?? []) as Update[], reply: String(data?.reply ?? '') }
      } finally { setTyping(false) }
      await record(res.updates, res.reply || 'Saved.', t)
    })
  }

  const undo = (i: number) => run(async () => {
    const m = msgs[i]
    if (!m.undo || m.undone) return
    await commit({ ...live.current, ...m.undo })
    live.current = { ...live.current, ...m.undo }
    setMsgs(a => a.map((x, j) => (j === i ? { ...x, undone: true } : x)))
    await ask(Object.keys(m.undo)[0])
  })

  const chips: Chip[] = cur && editable ? [...chipsFor(FK[cur], live.current), UNKNOWN_CHIP] : []
  const label = (k: string) => `${SECTIONS.find(s => s.id === FK[k].section)?.title} › ${FK[k].label}`
  const mark = (s: FieldState['st']) => (s === 'unknown' ? '!' : s === 'partial' ? '~' : '✓')

  return (
    <section className="card chatcard" aria-label="Agent conversation">
      <div className="row"><h2>Agent</h2><span className="sp" />{cur && <span className="mono">Asking about · {FK[cur].label}</span>}</div>
      <div className="chat" aria-live="polite">
        {msgs.map((m, i) => (
          <div key={i} className={`bub ${m.r === 'u' ? 'user' : 'assistant'}`}>
            <div>{m.t}</div>
            {m.saved && m.saved.length > 0 && (
              <div className="savedrow">
                {m.saved.map(s => <span key={s.key} className="savedchip"><b>{mark(s.st)}</b>{label(s.key)}</span>)}
                {m.undo && (m.undone ? <span className="muted">Undone</span> : <button type="button" className="linkbtn" disabled={busy} onClick={() => void undo(i)}>Undo</button>)}
              </div>
            )}
          </div>
        ))}
        {typing && <div className="bub assistant muted">Thinking…</div>}
        <div ref={end} />
      </div>
      {!busy && chips.length > 0 && <div className="chipsrow">{chips.map(c => <button key={c.label} type="button" className={`chipbtn ${c.unknown ? 'un' : ''}`} onClick={() => void pick(c)}>{c.label}</button>)}</div>}
      <ErrorLine error={error} />
      {editable ? (
        <form className="row" onSubmit={send}>
          <input className="sp" value={text} maxLength={1500} disabled={busy} onChange={e => setText(e.target.value)} placeholder="Type an answer, or tell me about the project in your own words" aria-label="Message to the agent" />
          <button className="btn pri" type="submit" disabled={busy || !text.trim()}>Send</button>
        </form>
      ) : <span className="muted">This project is no longer a draft, so the profile is locked.</span>}
    </section>
  )
}
