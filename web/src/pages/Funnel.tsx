import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { CARRY_KEY } from '../lib/carry'
import { eur } from '../lib/format'
import { geoCode } from '../lib/profile'
import {
  COUNTRIES, PERMITS, REGIONS, STAGES, cleanCity, STRATEGY, compatibility, complete, initPixel, numbers, parseMoney, score, toCarry, track, verdict,
  type Answers, type Complete, type Matches, type Strategy, type Unit,
} from '../lib/funnel'

type Step = 'strategy' | 'geo' | 'stage' | 'gdv' | 'ask' | 'equity' | 'permit'
const STEPS: Step[] = ['strategy', 'geo', 'stage', 'gdv', 'ask', 'equity', 'permit']
const MONEY_HINT = 'For example 4.5 or 750'
const CHECKS = ['Evaluating project stage', 'Checking financing readiness', 'Assessing capital structure', 'Identifying potential funding options']

const QUESTION: Record<Step, string> = {
  strategy: 'What type of project are you developing?',
  geo: 'Where is your project located?',
  stage: 'What is the current project stage?',
  gdv: 'What is the estimated Gross Development Value (GDV)?',
  ask: 'How much capital do you need?',
  equity: 'How much equity can you contribute?',
  permit: 'Do you have the necessary permits?',
}

export function Funnel() {
  const [a, setA] = useState<Answers>({})
  const [i, setI] = useState(0)
  const [text, setText] = useState('')
  const [bad, setBad] = useState(false)
  const [unit, setUnit] = useState<Unit>('m')
  const [pending, setPending] = useState<string | null>(null) // a typed place we could not place in a region yet
  const [phase, setPhase] = useState<'ask' | 'think' | 'result'>('ask')
  const [shown, setShown] = useState(0)
  const [matches, setMatches] = useState<Matches | null>(null)
  const [investors, setInvestors] = useState<number | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const step = STEPS[i]

  useEffect(() => {
    document.title = 'Is your project ready for financing? · Cobuildy'
    const m = document.createElement('meta'); m.name = 'robots'; m.content = 'noindex'; document.head.appendChild(m)
    initPixel()
    void supabase.rpc('funnel_stats').then(({ data }) => { const n = (data as { investors?: number } | null)?.investors; if (typeof n === 'number' && n > 0) setInvestors(n) })
    return () => { m.remove() }
  }, [])
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }) }, [i, phase, shown, matches])

  const stages = a.strategy ? STAGES[a.strategy] : []
  const label = (s: Step): string | null => {
    switch (s) {
      case 'strategy': return STRATEGY.find(x => x.v === a.strategy)?.label ?? null
      case 'geo': return a.city ?? (a.geo ? REGIONS.find(x => x.v === a.geo)?.label ?? null : null)
      case 'stage': return stages.find(x => x.v === a.stage)?.label ?? null
      case 'gdv': return a.gdv ? eur(a.gdv) : null
      case 'ask': return a.ask ? eur(a.ask) : null
      case 'equity': return a.equity == null ? null : a.equity === 0 ? 'No own equity' : eur(a.equity)
      case 'permit': return PERMITS.find(x => x.v === a.permit)?.label ?? null
    }
  }

  function next(patch: Partial<Answers>) {
    const merged = { ...a, ...patch }
    // a different project type has different stages, so the old stage no longer applies
    if (patch.strategy && patch.strategy !== a.strategy) delete merged.stage
    setA(merged); setText(''); setBad(false); setUnit('m'); setPending(null)
    track('FunnelAnswered', true, { step: step, n: i + 1 })
    if (i < STEPS.length - 1) { setI(i + 1); return }
    if (complete(merged)) finish(merged)
  }
  function back() { if (i > 0 && phase === 'ask') { setI(i - 1); setText(''); setBad(false) } }

  function finish(done: Complete) {
    const n = numbers(done)
    const sc = score(done)
    const lic = PERMITS.find(p => p.v === done.permit)!.license
    try { localStorage.setItem(CARRY_KEY, JSON.stringify(toCarry(done, sc.total))) } catch { /* private mode: the answers are simply not carried over */ }
    setPhase('think'); setShown(0)
    const timer = window.setInterval(() => setShown(s => Math.min(CHECKS.length, s + 1)), 750)
    const wait = new Promise(r => window.setTimeout(r, 750 * CHECKS.length + 500))
    const call = supabase.rpc('funnel_match', { p_geo: done.geo, p_ask: done.ask, p_license: lic, p_ltc: Math.round(n.ltc * 1000) / 1000, p_margin: Math.round(n.margin * 1000) / 1000 })
      .then(({ data }) => (data as Matches | null) ?? null, () => null)
    void Promise.all([wait, call]).then(([, m]) => { window.clearInterval(timer); setMatches(m); setPhase('result'); track('FunnelCompleted', true, { score: sc.total }) })
  }

  function submitCity(e: FormEvent) {
    e.preventDefault()
    const city = cleanCity(text)
    if (city.length < 2) return setBad(true)
    const geo = geoCode(city)
    if (geo) next({ geo, city })
    else setPending(city)
  }
  function submitMoney(e: FormEvent) {
    e.preventDefault()
    const v = parseMoney(text, step === 'equity', unit)
    if (v == null) return setBad(true)
    next(step === 'gdv' ? { gdv: v } : step === 'ask' ? { ask: v } : { equity: v })
  }

  const typed = parseMoney(text, true, unit)
  const result = useMemo(() => (phase === 'result' && complete(a) ? score(a) : null), [phase, a])
  const heading = investors ? `${investors} investors are waiting.` : 'Investors are waiting.'

  async function unlock() {
    track('Lead')
    const { data } = await supabase.auth.getSession()
    window.location.assign(data.session ? '/' : '/login?role=developer')
  }

  return (
    <div className="fn">
      <header className="fn-top"><span className="fn-logo">Cobuildy</span></header>
      <main className="fn-main">
        {phase === 'ask' && i === 0 && (
          <div className="fn-intro">
            <h1>Find out if your project is ready for financing</h1>
            <p>Answer 7 questions and get an initial assessment of your project’s funding readiness. {heading}</p>
          </div>
        )}
        <div className="fn-chat" aria-live="polite">
          {STEPS.slice(0, Math.min(i, STEPS.length - 1) + 1).map((s, k) => {
            const answered = k < i || phase !== 'ask'
            return (
              <div key={s} className="fn-turn">
                <div className="fn-q"><span className="fn-n">{k + 1} / 7</span>{QUESTION[s]}</div>
                {answered && <div className="fn-a">{label(s)}</div>}
              </div>
            )
          })}

          {phase === 'ask' && (
            <div className="fn-input">
              {(step === 'strategy' || (step === 'geo' && !pending) || step === 'stage' || step === 'permit') && (
                <div className="fn-chips" role="group" aria-label={QUESTION[step]}>
                  {step === 'strategy' && STRATEGY.map(o => <button key={o.v} className="fn-chip" onClick={() => next({ strategy: o.v as Strategy })}>{o.label}</button>)}
                  {step === 'geo' && REGIONS.map(o => <button key={o.v} className="fn-chip" onClick={() => next({ geo: o.v, city: undefined })}>{o.label}</button>)}
                  {step === 'stage' && stages.map(o => <button key={o.v} className="fn-chip" onClick={() => next({ stage: o.v })}>{o.label}</button>)}
                  {step === 'permit' && PERMITS.map(o => <button key={o.v} className="fn-chip" onClick={() => next({ permit: o.v })}>{o.label}</button>)}
                </div>
              )}
              {step === 'geo' && !pending && (
                <form className="fn-money" onSubmit={submitCity}>
                  <input autoComplete="off" autoCapitalize="words" aria-label="Type your city or town" placeholder="Or type the city or town" maxLength={80} value={text}
                    onChange={e => { setText(e.target.value); setBad(false) }} aria-invalid={bad} />
                  <button className="fn-go" type="submit" disabled={cleanCity(text).length < 2}>Next</button>
                  {bad && <span className="fn-bad" role="alert">Enter the name of the city or town.</span>}
                </form>
              )}
              {step === 'geo' && pending && (
                <div className="fn-input">
                  <div className="fn-q">Which country is {pending} in?</div>
                  <div className="fn-chips" role="group" aria-label="Country">
                    {COUNTRIES.map(c => <button key={c.v} className="fn-chip" onClick={() => next({ geo: c.v, city: c.v === 'XX' ? `${pending}, other country` : `${pending}, ${c.label}` })}>{c.label}</button>)}
                  </div>
                  <button type="button" className="fn-link" onClick={() => { setPending(null); setText(pending) }}>← Change the place</button>
                </div>
              )}
              {(step === 'gdv' || step === 'ask' || step === 'equity') && (
                <form className="fn-money" onSubmit={submitMoney}>
                  <input autoFocus inputMode="decimal" autoComplete="off" aria-label={QUESTION[step]} placeholder={MONEY_HINT} value={text}
                    onChange={e => { setText(e.target.value); setBad(false) }} aria-invalid={bad} />
                  <button className="fn-go" type="submit" disabled={!text.trim()}>Next</button>
                  <div className="fn-units" role="group" aria-label="Unit">
                    <button type="button" className={`fn-chip${unit === 'k' ? ' on' : ''}`} aria-pressed={unit === 'k'} onClick={() => setUnit('k')}>thousand</button>
                    <button type="button" className={`fn-chip${unit === 'm' ? ' on' : ''}`} aria-pressed={unit === 'm'} onClick={() => setUnit('m')}>million</button>
                    {text.trim() && typed != null && <span className="fn-pre" aria-live="polite">= {typed === 0 ? '€0' : eur(typed)}</span>}
                  </div>
                  {bad && <span className="fn-bad" role="alert">{step === 'equity' ? 'Enter an amount, or 0 if you have none. ' : 'Enter an amount in euros. '}{MONEY_HINT}.</span>}
                  {step === 'equity' && <button type="button" className="fn-link" onClick={() => next({ equity: 0 })}>I have no equity to contribute</button>}
                </form>
              )}
              {i > 0 && <button type="button" className="fn-link" onClick={back}>← Back</button>}
            </div>
          )}

          {phase === 'think' && (
            <div className="fn-think" role="status">
              <b>Analysing your project…</b>
              <ul>{CHECKS.map((c, k) => <li key={c} className={k < shown ? 'on' : ''}><span aria-hidden="true">{k < shown ? '✓' : '·'}</span>{c}</li>)}</ul>
            </div>
          )}

          {phase === 'result' && result && (
            <section className="fn-result" aria-label="Your Project Funding Assessment">
              <h2>Your Project Funding Assessment</h2>
              <div className="fn-score"><span className="fn-big">{result.total}</span><span className="fn-of">/100</span><span className="fn-lbl">Project Readiness</span></div>
              <div className="fn-bar" aria-hidden="true"><i style={{ width: `${result.total}%` }} /></div>
              <p>{verdict(result.total)}</p>
              {matches && <>
                <h3>Investor Compatibility</h3>
                <p>{compatibility(matches)}</p>
                <h3>Potential Investor Matches</h3>
                <ul className="fn-matches">
                  <li><b>{matches.high}</b> investors potentially matching your project with high compatibility</li>
                  <li><b>{matches.medium}</b> investors potentially matching your project with medium compatibility</li>
                  <li><b>{matches.low}</b> investors potentially matching your project with low compatibility</li>
                </ul>
              </>}
              <button className="fn-cta" onClick={() => void unlock()}>Unlock Your Investor Matches</button>
              <p className="fn-fine">Free. Your answers are saved to your new account.</p>
            </section>
          )}
          <div ref={endRef} />
        </div>
      </main>
    </div>
  )
}
