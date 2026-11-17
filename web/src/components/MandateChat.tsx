import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase, errText } from '../lib/supabase'
import { ErrorLine } from './ui'
import { getLang, tr, useT } from '../i18n'
import { FIELDS, FK, SECS, applyUpdates, chipText, clarity, fmt, nextKey, type Chip, type MKey, type Mandate, type Update } from '../lib/mandate'

interface Msg { r: 'a' | 'u'; t: string; saved?: MKey[]; undo?: Mandate; undone?: boolean }
const INTRO = () => tr('Hi, I am your Cobuildy agent. Tell me what you invest in, or answer one question at a time. I check every project sent to you against your mandate as we go. Everything is saved straight away and you can undo any answer.', 'Hola, soy tu agente de Cobuildy. Cuéntame en qué inviertes o responde una pregunta cada vez. Compruebo cada proyecto que te envían con tu mandato sobre la marcha. Todo se guarda al instante y puedes deshacer cualquier respuesta.')
const NS = (): Chip => ({ l: chipText('Not sure yet'), u: true })
const NOPREF = (): Chip => ({ l: chipText('No preference'), v: null })
const DONE_MSG = () => tr('Your mandate is complete. Open the Matches tab to review the projects sent to you. I recommend, you decide: nothing is sent to a sponsor without your approval.', 'Tu mandato está completo. Abre la pestaña Coincidencias para revisar los proyectos que te envían. Yo recomiendo, tú decides: no se envía nada a un promotor sin tu aprobación.')
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export function MandateChat({ mandate, commit, askReq }: { mandate: Mandate; commit: (next: Mandate) => Promise<void>; askReq: { key: MKey; n: number } | null }) {
  const t0 = useT()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [cur, setCur] = useState<MKey | null>(null)
  const [tmp, setTmp] = useState<string[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [typing, setTyping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const end = useRef<HTMLDivElement>(null)
  const started = useRef(false)
  const lastAsk = useRef(0)
  const live = useRef(mandate)
  live.current = mandate
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [msgs, typing])

  const say = useCallback(async (t: string, extra: Partial<Msg> = {}, ms = 450) => {
    setTyping(true); await sleep(ms); setTyping(false)
    setMsgs(a => [...a, { r: 'a', t, ...extra }])
  }, [])
  const ask = useCallback(async (key: MKey | null, pre?: string) => {
    setCur(key); setTmp([])
    const head = pre ? pre + '\n\n' : ''
    await say(head + (key ? FK[key].q : DONE_MSG()))
  }, [say])

  useEffect(() => {
    if (started.current) return
    started.current = true
    const k = nextKey(live.current)
    setCur(k)
    setMsgs([{ r: 'a', t: INTRO() + '\n\n' + (k ? FK[k].q : tr('Your mandate is complete. Review it on the right, or tell me what to change.', 'Tu mandato está completo. Revísalo a la derecha o dime qué cambiar.')) }])
  }, [])

  useEffect(() => {
    if (!askReq || askReq.n === lastAsk.current) return
    lastAsk.current = askReq.n
    if (busy || !started.current) return
    setBusy(true); void ask(askReq.key).finally(() => setBusy(false))
  }, [askReq, busy, ask])

  /** Saves the answer straight away, reports it, then asks the next open question. */
  const record = async (updates: Update[], reply: string) => {
    const before = live.current
    const lvl0 = clarity(before).level
    const { next, keys } = applyUpdates(before, updates)
    if (!keys.length) { await say(reply); return }
    await commit(next)
    live.current = next
    await say(reply, { saved: keys, undo: before }, 350)
    const lvl1 = clarity(next).level
    const note = lvl1 > lvl0 ? (lvl1 === 1 ? tr('Screening is on: the five filters that decide which projects reach you are set.', 'El filtrado está activo: los cinco filtros que deciden qué proyectos te llegan están definidos.') : tr('Your mandate is sharp: every criterion is answered.', 'Tu mandato es preciso: todos los criterios están respondidos.')) : ''
    await ask(nextKey(next), note)
  }

  const run = async (fn: () => Promise<void>) => {
    if (busy) return
    setBusy(true); setError(null)
    try { await fn() } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }

  const pick = (c: Chip) => run(async () => {
    if (!cur) return
    setMsgs(a => [...a, { r: 'u', t: c.l }])
    if (c.u) return record([{ key: cur, status: 'unknown' }], tr('No problem, I marked it as open. An open criterion never excludes a project.', 'Sin problema, lo he dejado abierto. Un criterio abierto nunca excluye un proyecto.'))
    return record([{ key: cur, status: 'filled', value: c.v ?? null }], tr('Saved.', 'Guardado.'))
  })

  const confirmMulti = () => run(async () => {
    if (!cur || !tmp.length) return
    const labels = FK[cur].chips(live.current).filter(c => typeof c.v === 'string' && tmp.includes(c.v)).map(c => c.l)
    setMsgs(a => [...a, { r: 'u', t: labels.join(', ') }])
    return record([{ key: cur, status: 'filled', value: tmp }], tr('Saved.', 'Guardado.'))
  })

  const send = (e: FormEvent) => {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    setText('')
    void run(async () => {
      setMsgs(a => [...a, { r: 'u', t }])
      let res: { updates: Update[]; reply: string }
      setTyping(true)
      try {
        const { data, error: err } = await supabase.functions.invoke('agent-chat', { body: { mode: 'mandate', text: t, current_key: cur, lang: getLang() } })
        if (err) {
          const ctx = (err as { context?: Response }).context
          let m = errText(err)
          if (ctx && typeof ctx.json === 'function') { try { const b = await ctx.json(); if (b?.error) m = String(b.error) } catch { /* keep m */ } }
          if (/not configured|temporarily unavailable|failed to send|fetch/i.test(m)) res = { updates: [], reply: tr('I cannot read free text right now. Please use the suggested answers below.', 'Ahora mismo no puedo leer texto libre. Usa las respuestas sugeridas de abajo.') }
          else throw new Error(m)
        } else res = { updates: (data?.updates ?? []) as Update[], reply: String(data?.reply ?? '') }
      } finally { setTyping(false) }
      await record(res.updates, res.reply || tr('Saved.', 'Guardado.'))
    })
  }

  const undo = (i: number) => run(async () => {
    const m = msgs[i]
    if (!m.undo || m.undone) return
    await commit(m.undo)
    live.current = m.undo
    setMsgs(a => a.map((x, j) => (j === i ? { ...x, undone: true } : x)))
    await ask(m.saved?.[0] ?? null)
  })

  const def = cur ? FK[cur] : null
  const base: Chip[] = def ? def.chips(mandate) : []
  const chips: Chip[] = def ? (def.multi ? [...base, NOPREF(), NS()] : base.some(c => c.u) ? base : [...base, NS()]) : []
  const label = (k: MKey) => `${SECS.find(s => s[0] === FK[k].s)?.[1]} › ${FK[k].l}`
  const mark = (k: MKey) => (mandate.st[k] === 'unknown' ? '!' : '✓')

  return (
    <section className="card chatcard" aria-label={t0('Agent conversation', 'Conversación con el agente')}>
      <div className="row"><h2>{t0('Agent', 'Agente')}</h2><span className="sp" />{def ? <span className="mono">{t0('Asking about', 'Preguntando por')} · {def.l}</span> : <span className="mono">{t0('Mandate complete', 'Mandato completo')}</span>}</div>
      <div className="chat" aria-live="polite">
        {msgs.map((m, i) => (
          <div key={i} className={`bub ${m.r === 'u' ? 'user' : 'assistant'}`}>
            <div>{m.t}</div>
            {m.saved && m.saved.length > 0 && (
              <div className="savedrow">
                {m.saved.map(k => <span key={k} className="savedchip"><b>{mark(k)}</b>{label(k)} · {fmt(mandate, k) || t0('open', 'abierto')}</span>)}
                {m.undo && (m.undone ? <span className="muted">{t0('Undone', 'Deshecho')}</span> : <button type="button" className="linkbtn" disabled={busy} onClick={() => void undo(i)}>{t0('Undo', 'Deshacer')}</button>)}
              </div>
            )}
          </div>
        ))}
        {typing && <div className="bub assistant muted">{t0('Thinking…', 'Pensando…')}</div>}
        <div ref={end} />
      </div>
      {!busy && chips.length > 0 && (
        <div className="chipsrow">
          {chips.map(c => {
            const multiVal = def?.multi && typeof c.v === 'string'
            const on = multiVal && tmp.includes(c.v as string)
            return <button key={c.l} type="button" className={`chipbtn ${c.u ? 'un' : ''} ${on ? 'on' : ''}`} aria-pressed={multiVal ? on : undefined}
              onClick={() => (multiVal ? setTmp(t => (t.includes(c.v as string) ? t.filter(x => x !== c.v) : [...t, c.v as string])) : void pick(c))}>{c.l}</button>
          })}
          {def?.multi && <button type="button" className="chipbtn go" disabled={!tmp.length} onClick={() => void confirmMulti()}>{t0('Continue →', 'Continuar →')}</button>}
        </div>
      )}
      <ErrorLine error={error} />
      <form className="row" onSubmit={send}>
        <input className="sp" value={text} maxLength={1500} disabled={busy} onChange={e => setText(e.target.value)} placeholder={t0('Type an answer, or describe your mandate in your own words', 'Escribe una respuesta o describe tu mandato con tus palabras')} aria-label={t0('Message to the agent', 'Mensaje al agente')} />
        <button className="btn pri" type="submit" disabled={busy || !text.trim()}>{t0('Send', 'Enviar')}</button>
      </form>
    </section>
  )
}

export const ALL_KEYS: MKey[] = FIELDS.map(f => f.k)
