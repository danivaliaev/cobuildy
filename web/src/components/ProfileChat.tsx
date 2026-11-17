import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase, errText } from '../lib/supabase'
import { ErrorLine } from './ui'
import { ACCEPT } from '../lib/docs'
import type { Job } from './useIngest'
import { eurFor } from '../lib/format'
import { getLang, tr, useT } from '../i18n'
import { FK, MILESTONES, SECTIONS, applyUpdates, calc, chipsFor, firstInt, nextField, parseMoney, type Chip, type FieldState, type Fields, type Update } from '../lib/profile'

interface Saved { key: string; st: FieldState['st'] }
interface Msg { r: 'a' | 'u'; t: string; saved?: Saved[]; undo?: Record<string, FieldState>; undone?: boolean; review?: boolean }

const eur = (n: number | null | undefined) => eurFor(n, getLang())
const UNKNOWN_REPLY = () => tr('No problem, I marked it as a gap. Missing data is not counted against you, it just stays on the list.', 'Sin problema, lo he marcado como pendiente. Los datos que faltan no cuentan en tu contra, solo se quedan en la lista.')
const INTRO = () => tr('Hi, I am the Cobuildy agent. I will ask about your project one question at a time. Pick a suggested answer, write in your own words, or tell me several facts at once. Everything is saved as we go and you can undo any answer.', 'Hola, soy el agente de Cobuildy. Te preguntaré por tu proyecto de una en una. Elige una respuesta sugerida, escribe con tus palabras o cuéntame varios datos a la vez. Todo se guarda sobre la marcha y puedes deshacer cualquier respuesta.')
const UNKNOWN_CHIP = (): Chip => ({ label: tr('I don’t have this yet', 'Aún no lo tengo'), value: '', partial: false, unknown: true })
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/** The agent reads the text on the server. If it is unreachable, the current question is answered from the raw text. */
function localAnswer(text: string, cur: string | null): { updates: Update[]; reply: string } {
  const d = cur ? FK[cur] : undefined
  if (!d) return { updates: [], reply: tr('Tell me which part of the profile you want to change.', 'Dime qué parte del perfil quieres cambiar.') }
  if (/(don'?t have|do not have|no idea|not yet|unknown|skip|no lo tengo|no s[eé]|todav[ií]a no|a[uú]n no|не знаю|пока нет)/i.test(text)) return { updates: [{ key: d.key, status: 'unknown' }], reply: UNKNOWN_REPLY() }
  if (d.kind === 'money') {
    const n = parseMoney(text)
    return n == null ? { updates: [], reply: tr('I could not read an amount. Try €5.4M or 5,400,000.', 'No he podido leer un importe. Prueba con 5,4 millones o 5.400.000.') } : { updates: [{ key: d.key, status: 'filled', display: eur(n), amount: n }], reply: tr('Saved.', 'Guardado.') }
  }
  if (d.kind === 'number') {
    const n = firstInt(text)
    return n == null ? { updates: [], reply: tr('I could not read a number. Try 18.', 'No he podido leer un número. Prueba con 18.') } : { updates: [{ key: d.key, status: 'filled', display: `${n} months`, amount: n }], reply: tr('Saved.', 'Guardado.') }
  }
  // Free text cannot be understood without the agent, so nothing is saved rather than guessing which field it belongs to.
  return { updates: [], reply: tr('The agent is offline right now, so I could not read that. Pick one of the suggested answers, or try again in a minute.', 'El agente no está disponible ahora mismo, así que no he podido leer eso. Elige una de las respuestas sugeridas o inténtalo de nuevo en un minuto.') }
}

export function ProfileChat({ projectId, fields, commit, editable, askReq, onCurrent, onAttach, onReview }: {
  onCurrent?: (key: string | null) => void; projectId: string; fields: Fields; commit: (next: Fields) => Promise<void>; editable: boolean; askReq: { key: string; n: number } | null
  onAttach?: (files: File[]) => Promise<Job[]>; onReview?: () => void
}) {
  const t0 = useT()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [cur, setCur] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [typing, setTyping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const end = useRef<HTMLDivElement>(null)
  const attach = useRef<HTMLInputElement>(null)
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
    if (!key) { await say((pre ? pre + '\n\n' : '') + tr('The profile has no open fields. Review it on the right, then submit the teaser for review.', 'El perfil no tiene campos abiertos. Revísalo a la derecha y envía el teaser a revisión.')); return }
    await say((pre ? pre + '\n\n' : '') + FK[key].question)
  }, [say])

  // First message: greeting and the first open question.
  useEffect(() => {
    if (started.current) return
    started.current = true
    const k = nextField(live.current)
    setCur(k)
    const fromSite = Object.values(live.current).filter(f => f.src === 'site' && f.st !== 'empty').length
    const welcome = fromSite ? tr(`I saved ${fromSite} ${fromSite === 1 ? 'answer' : 'answers'} from our conversation on the website, you can see them on the right. `, `He guardado ${fromSite} ${fromSite === 1 ? 'respuesta' : 'respuestas'} de nuestra conversación en la web; las ves a la derecha. `) : ''
    setMsgs([{ r: 'a', t: welcome + INTRO() + '\n\n' + (k ? FK[k].question : tr('Your profile has no open fields. Review it on the right.', 'Tu perfil no tiene campos abiertos. Revísalo a la derecha.')) }])
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
    if (c.unknown) return record([{ key: cur, status: 'unknown' }], UNKNOWN_REPLY(), c.label)
    return record([{ key: cur, status: c.partial ? 'partial' : 'filled', display: c.value, amount: c.amount ?? null }], c.note ?? tr('Saved.', 'Guardado.'), c.label)
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
        const { data, error: err } = await supabase.functions.invoke('agent-chat', { body: { project_id: projectId, text: t, current_key: cur, lang: getLang() } })
        if (err) {
          const ctx = (err as { context?: Response }).context
          let m = errText(err)
          if (ctx && typeof ctx.json === 'function') { try { const b = await ctx.json(); if (b?.error) m = String(b.error) } catch { /* keep m */ } }
          if (/not configured|temporarily unavailable|failed to send|fetch/i.test(m)) res = localAnswer(t, cur)
          else throw new Error(m)
        } else res = { updates: (data?.updates ?? []) as Update[], reply: String(data?.reply ?? '') }
      } finally { setTyping(false) }
      await record(res.updates, res.reply || tr('Saved.', 'Guardado.'), t)
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

  /** Files attached in the chat are uploaded and read like any others; the agent then says what it found and offers the review. */
  const attachFiles = (list: FileList | null) => {
    const files = list ? Array.from(list) : []
    if (!files.length || !onAttach) return
    void run(async () => {
      push({ r: 'u', t: `${tr('Attached', 'Adjunto')}: ${files.map(f => f.name).join(', ')}` })
      setTyping(true)
      let jobs: Job[]
      try { jobs = await onAttach(files) } finally { setTyping(false) }
      const ok = jobs.filter(j => j.phase === 'done')
      const bad = jobs.filter(j => j.phase === 'failed')
      const parts: string[] = []
      for (const j of ok) parts.push(tr(`I read ${j.name}: ${j.facts ?? 0} ${j.facts === 1 ? 'fact' : 'facts'}${j.lines ? ` and ${j.lines} budget lines` : ''}.`, `He leído ${j.name}: ${j.facts ?? 0} ${j.facts === 1 ? 'dato' : 'datos'}${j.lines ? ` y ${j.lines} partidas de presupuesto` : ''}.`))
      for (const j of bad) parts.push(tr(`I could not read ${j.name}: ${j.error ?? 'unknown error'}`, `No he podido leer ${j.name}: ${j.error ?? 'error desconocido'}`))
      if (ok.length) parts.push(tr('Check what I found before anything is saved.', 'Revisa lo que he encontrado antes de guardar nada.'))
      await say(parts.join('\n') || tr('I could not read those files.', 'No he podido leer esos archivos.'), { review: ok.length > 0 }, 200)
    })
  }

  const chips: Chip[] = cur && editable ? [...chipsFor(FK[cur], live.current), UNKNOWN_CHIP()] : []
  const label = (k: string) => `${SECTIONS.find(s => s.id === FK[k].section)?.title} › ${FK[k].label}`
  const mark = (s: FieldState['st']) => (s === 'unknown' ? '!' : s === 'partial' ? '~' : '✓')

  return (
    <section className="card chatcard" aria-label={t0('Agent conversation', 'Conversación con el agente')}>
      <div className="row"><h2>{t0('Agent', 'Agente')}</h2><span className="sp" />{cur && <span className="mono">{t0('Asking about', 'Preguntando por')} · {FK[cur].label}</span>}</div>
      <div className="chat" aria-live="polite">
        {msgs.map((m, i) => (
          <div key={i} className={`bub ${m.r === 'u' ? 'user' : 'assistant'}`}>
            <div>{m.t}</div>
            {m.review && onReview && <div className="savedrow"><button type="button" className="btn sm pri" onClick={onReview}>{t0('Review what I found', 'Revisar lo que he encontrado')}</button></div>}
            {m.saved && m.saved.length > 0 && (
              <div className="savedrow">
                {m.saved.map(s => <span key={s.key} className="savedchip"><b>{mark(s.st)}</b>{label(s.key)}</span>)}
                {m.undo && (m.undone ? <span className="muted">{t0('Undone', 'Deshecho')}</span> : <button type="button" className="linkbtn" disabled={busy} onClick={() => void undo(i)}>{t0('Undo', 'Deshacer')}</button>)}
              </div>
            )}
          </div>
        ))}
        {typing && <div className="bub assistant muted">{t0('Thinking…', 'Pensando…')}</div>}
        <div ref={end} />
      </div>
      {!busy && chips.length > 0 && <div className="chipsrow">{chips.map(c => <button key={c.label} type="button" className={`chipbtn ${c.unknown ? 'un' : ''}`} onClick={() => void pick(c)}>{c.label}</button>)}</div>}
      <ErrorLine error={error} />
      {editable ? (
        <form className="composer" onSubmit={send}>
          <textarea value={text} maxLength={1500} rows={2} disabled={busy} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (text.trim() && !busy) e.currentTarget.form?.requestSubmit() } }}
            placeholder={t0('Type an answer, or tell me about the project in your own words', 'Escribe una respuesta o cuéntame el proyecto con tus palabras')} aria-label={t0('Message to the agent', 'Mensaje al agente')} />
          <div className="composer-bar">
            {onAttach && <>
              <input ref={attach} type="file" multiple accept={ACCEPT} hidden aria-hidden="true" tabIndex={-1} onChange={e => { attachFiles(e.target.files); e.target.value = '' }} />
              <button className="attachbtn" type="button" disabled={busy} title={t0('Attach budget, nota simple, licence or other files', 'Adjunta presupuesto, nota simple, licencia u otros archivos')} aria-label={t0('Attach documents', 'Adjuntar documentos')} onClick={() => attach.current?.click()}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" /></svg>
                {t0('Attach files', 'Adjuntar archivos')}
              </button></>}
            {!onAttach && <span />}
            <button className="btn pri" type="submit" disabled={busy || !text.trim()}>{t0('Send', 'Enviar')}</button>
          </div>
        </form>
      ) : <span className="muted">{t0('This project is no longer a draft, so the profile is locked.', 'Este proyecto ya no es un borrador, así que el perfil está bloqueado.')}</span>}
    </section>
  )
}
