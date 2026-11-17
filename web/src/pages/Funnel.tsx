import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { CARRY_KEY } from '../lib/carry'
import { eurFor } from '../lib/format'
import { FUNNEL } from '../i18n/funnel'
import { otherLangHref, useLang } from '../i18n'
import { geoCode } from '../lib/profile'
import { loadPlaces, type Place, type Places } from '../lib/places'
import { ConsentBanner } from '../components/ConsentBanner'
import { getConsent } from '../lib/consent'
import { save, sessionId, trafficSource, validName, validPhone } from '../lib/funnelTrack'
import {
  COUNTRIES, PERMITS, REGIONS, STAGES, cleanCity, STRATEGY, complete, initPixel, numbers, parseMoney, score, toCarry, track, verdictKey,
  type Answers, type Complete, type Matches, type Strategy, type Unit,
} from '../lib/funnel'

type Step = 'strategy' | 'geo' | 'stage' | 'gdv' | 'ask' | 'equity' | 'permit'
const STEPS: Step[] = ['strategy', 'geo', 'stage', 'gdv', 'ask', 'equity', 'permit']
export function Funnel() {
  const lang = useLang()
  const L = FUNNEL[lang]
  const eur = (n: number) => eurFor(n, lang)
  const regionLabel = (v: string, city?: string) => (city && L.island[city]) || L.region[v] || REGIONS.find(r => r.v === v)?.label || v
  const [a, setA] = useState<Answers>({})
  const [i, setI] = useState(0)
  const [text, setText] = useState('')
  const [bad, setBad] = useState(false)
  const [unit, setUnit] = useState<Unit>('m')
  const [places, setPlaces] = useState<Places | null>(null)
  const [pending, setPending] = useState<string | null>(null) // a typed place we could not place in a region yet
  const [phase, setPhase] = useState<'ask' | 'contact' | 'think' | 'result'>('ask')
  const sid = useMemo(() => sessionId(), [])
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [contactBad, setContactBad] = useState<'name' | 'phone' | null>(null)
  const [who, setWho] = useState<{ name: string; phone: string } | null>(null)
  const [shown, setShown] = useState(0)
  const [matches, setMatches] = useState<Matches | null>(null)
  const [investors, setInvestors] = useState<number | null>(null)
  const [asked, setAsked] = useState(() => getConsent() !== null)
  const endRef = useRef<HTMLDivElement>(null)
  const step = STEPS[i]
  const suggestions = step === 'geo' && !pending && places ? places.suggest(text) : []

  useEffect(() => {
    document.title = L.title
    const m = document.createElement('meta'); m.name = 'robots'; m.content = 'noindex'; document.head.appendChild(m)
    if (getConsent() === 'granted') { initPixel(); track('ViewContent') }
    void save(sid, { step: 0, source: { ...trafficSource(), entry: 'meta', lang } })
    void loadPlaces().then(setPlaces, () => setPlaces(null))
    void supabase.rpc('funnel_stats').then(({ data }) => { const n = (data as { investors?: number } | null)?.investors; if (typeof n === 'number' && n > 0) setInvestors(n) })
    return () => { m.remove() }
  }, [lang])
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }) }, [i, phase, shown, matches, suggestions.length])

  const stages = a.strategy ? STAGES[a.strategy] : []
  const label = (s: Step): string | null => {
    switch (s) {
      case 'strategy': return a.strategy ? L.strategy[a.strategy] ?? null : null
      case 'geo': return a.city ? (L.island[a.city] ?? a.city) : (a.geo ? regionLabel(a.geo) : null)
      case 'stage': return a.strategy && a.stage ? L.stages[a.strategy]?.[a.stage] ?? null : null
      case 'gdv': return a.gdv ? eur(a.gdv) : null
      case 'ask': return a.ask ? eur(a.ask) : null
      case 'equity': return a.equity == null ? null : a.equity === 0 ? L.noEquity : eur(a.equity)
      case 'permit': return a.permit ? L.permits[a.permit] ?? null : null
    }
  }

  function next(patch: Partial<Answers>) {
    const merged = { ...a, ...patch }
    // a different project type has different stages, so the old stage no longer applies
    if (patch.strategy && patch.strategy !== a.strategy) delete merged.stage
    setA(merged); setText(''); setBad(false); setUnit('m'); setPending(null)
    track('FunnelAnswered', true, { step: step, n: i + 1 })
    void save(sid, { step: i + 1, answers: merged })
    if (i < STEPS.length - 1) { setI(i + 1); return }
    if (complete(merged)) setPhase('contact')
  }
  function back() {
    if (phase === 'contact') { setPhase('ask'); setContactBad(null); return }
    if (i > 0 && phase === 'ask') { setI(i - 1); setText(''); setBad(false) }
  }

  function submitContact(e: FormEvent) {
    e.preventDefault()
    const n = validName(name), ph = validPhone(phone)
    if (!n) return setContactBad('name')
    if (!ph) return setContactBad('phone')
    if (!complete(a)) return
    setContactBad(null); setWho({ name: n, phone: ph })
    void save(sid, { step: 8, answers: a, name: n, phone: ph })
    track('Lead')
    finish(a, { name: n, phone: ph })
  }

  function finish(done: Complete, contact: { name: string; phone: string }) {
    const n = numbers(done)
    const sc = score(done)
    const lic = PERMITS.find(p => p.v === done.permit)!.license
    try { localStorage.setItem(CARRY_KEY, JSON.stringify(toCarry(done, sc.total, { sid, ...contact }))) } catch { /* private mode: the answers are simply not carried over */ }
    setPhase('think'); setShown(0)
    const timer = window.setInterval(() => setShown(s => Math.min(L.checks.length, s + 1)), 750)
    const wait = new Promise(r => window.setTimeout(r, 750 * L.checks.length + 500))
    const call = supabase.rpc('funnel_match', { p_geo: done.geo, p_ask: done.ask, p_license: lic, p_ltc: Math.round(n.ltc * 1000) / 1000, p_margin: Math.round(n.margin * 1000) / 1000 })
      .then(({ data }) => (data as Matches | null) ?? null, () => null)
    void Promise.all([wait, call]).then(([, m]) => { window.clearInterval(timer); setMatches(m); setPhase('result'); track('FunnelCompleted', true, { score: sc.total }); void save(sid, { result: { score: sc.total, matches: m } }) })
  }

  const pick = (p: Place) => next({ geo: p.geo, city: p.label })
  function submitCity(e: FormEvent) {
    e.preventDefault()
    const city = cleanCity(text)
    if (city.length < 2) return setBad(true)
    const hit = places?.find(city) ?? places?.suggest(city, 1).filter(p => p.name.toLowerCase() === city.toLowerCase())[0]
    if (hit) return pick(hit)
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
  
  async function unlock() {
    track('UnlockClicked', true)
    await Promise.race([save(sid, { cta: true }), new Promise(r => window.setTimeout(r, 800))])
    const { data } = await supabase.auth.getSession()
    window.location.assign(data.session ? '/' : '/login?role=developer')
  }

  return (
    <div className="fn">
      <header className="fn-top"><span className="fn-logo">Cobuildy</span>
        <nav className="fn-lang" aria-label="Language">
          {(['en', 'es'] as const).map(l => l === lang ? <b key={l} aria-current="true">{l.toUpperCase()}</b> : <a key={l} href={otherLangHref(l)} hrefLang={l}>{l.toUpperCase()}</a>)}
        </nav></header>
      <main className="fn-main">
        <div className={`fn-intro${phase === 'ask' && i === 0 ? '' : ' later'}`}>
          <h1>{L.h1}</h1>
          <p>{L.sub(investors)}</p>
          <ul className="fn-trust">
            {L.trust.map(x => <li key={x}>{x}</li>)}
          </ul>
        </div>
        <div className="fn-col">
        <div className="fn-chat" aria-live="polite">
          {STEPS.slice(0, Math.min(i, STEPS.length - 1) + 1).map((s, k) => {
            const answered = k < i || phase !== 'ask'
            return (
              <div key={s} className="fn-turn">
                <div className="fn-q"><span className="fn-n">{k + 1} / 7</span>{L.q[s]}</div>
                {answered && <div className="fn-a">{label(s)}</div>}
              </div>
            )
          })}

          {phase === 'ask' && (
            <div className="fn-input">
              {(step === 'strategy' || (step === 'geo' && !pending && !text.trim()) || step === 'stage' || step === 'permit') && (
                <div className="fn-chips" role="group" aria-label={L.q[step]}>
                  {step === 'strategy' && STRATEGY.map(o => <button key={o.v} className="fn-chip" onClick={() => next({ strategy: o.v as Strategy })}>{L.strategy[o.v]}</button>)}
                  {step === 'geo' && REGIONS.map(o => <button key={o.label} className="fn-chip" onClick={() => next({ geo: o.v, city: o.city })}>{regionLabel(o.v, o.city)}</button>)}
                  {step === 'stage' && stages.map(o => <button key={o.v} className="fn-chip" onClick={() => next({ stage: o.v })}>{L.stages[a.strategy!]?.[o.v] ?? o.label}</button>)}
                  {step === 'permit' && PERMITS.map(o => <button key={o.v} className="fn-chip" onClick={() => next({ permit: o.v })}>{L.permits[o.v]}</button>)}
                </div>
              )}
              {step === 'geo' && !pending && (
                <form className="fn-money" onSubmit={submitCity}>
                  <input autoComplete="off" autoCapitalize="words" aria-label={L.cityAria} placeholder={L.cityPlaceholder} maxLength={80} value={text}
                    onChange={e => { setText(e.target.value); setBad(false) }} aria-invalid={bad} />
                  <button className="fn-go" type="submit" disabled={cleanCity(text).length < 2}>{L.next}</button>
                  {bad && <span className="fn-bad" role="alert">{L.cityBad}</span>}
                  {suggestions.length > 0 && <div className="fn-units" role="listbox" aria-label={L.suggestions}>
                    {suggestions.map(p => <button key={p.label} type="button" role="option" aria-selected={false} className="fn-chip" onClick={() => pick(p)}>{p.label}</button>)}
                  </div>}
                </form>
              )}
              {step === 'geo' && pending && (
                <div className="fn-input">
                  <div className="fn-q">{L.country(pending)}</div>
                  <div className="fn-chips" role="group" aria-label={L.countryAria}>
                    {COUNTRIES.map(c => <button key={c.v} className="fn-chip" onClick={() => next({ geo: c.v, city: c.v === 'XX' ? `${pending}, other country` : `${pending}, ${c.label}` })}>{L.countries[c.v]}</button>)}
                  </div>
                  <button type="button" className="fn-link" onClick={() => { setPending(null); setText(pending) }}>{L.changePlace}</button>
                </div>
              )}
              {(step === 'gdv' || step === 'ask' || step === 'equity') && (
                <form className="fn-money" onSubmit={submitMoney}>
                  <input autoFocus inputMode="decimal" autoComplete="off" aria-label={L.q[step]} placeholder={L.moneyHint} value={text}
                    onChange={e => { setText(e.target.value); setBad(false) }} aria-invalid={bad} />
                  <button className="fn-go" type="submit" disabled={!text.trim()}>{L.next}</button>
                  <div className="fn-units" role="group" aria-label={L.unitAria}>
                    <button type="button" className={`fn-chip${unit === 'k' ? ' on' : ''}`} aria-pressed={unit === 'k'} onClick={() => setUnit('k')}>{L.thousand}</button>
                    <button type="button" className={`fn-chip${unit === 'm' ? ' on' : ''}`} aria-pressed={unit === 'm'} onClick={() => setUnit('m')}>{L.million}</button>
                    {text.trim() && typed != null && <span className="fn-pre" aria-live="polite">= {typed === 0 ? (lang === 'es' ? '0 €' : '€0') : eur(typed)}</span>}
                  </div>
                  {bad && <span className="fn-bad" role="alert">{step === 'equity' ? L.moneyBadEquity : L.moneyBad}{L.moneyHint}.</span>}
                  {step === 'equity' && <button type="button" className="fn-link" onClick={() => next({ equity: 0 })}>{L.noEquityBtn}</button>}
                </form>
              )}
              {i > 0 && <button type="button" className="fn-link" onClick={back}>{L.back}</button>}
            </div>
          )}

          {phase === 'contact' && (
            <div className="fn-input">
              <div className="fn-q"><span className="fn-n">{L.lastStep}</span>{L.lastStepBody}</div>
              <form className="fn-contact" onSubmit={submitContact}>
                <input autoFocus autoComplete="name" autoCapitalize="words" aria-label={L.nameAria} placeholder={L.namePh} maxLength={120} value={name}
                  onChange={e => { setName(e.target.value); setContactBad(null) }} aria-invalid={contactBad === 'name'} />
                <input type="tel" inputMode="tel" autoComplete="tel" aria-label={L.phoneAria} placeholder={L.phonePh} maxLength={24} value={phone}
                  onChange={e => { setPhone(e.target.value); setContactBad(null) }} aria-invalid={contactBad === 'phone'} />
                {contactBad && <span className="fn-bad" role="alert">{contactBad === 'name' ? L.nameBad : L.phoneBad}</span>}
                <button className="fn-cta" type="submit">{L.showAssessment}</button>
                <span className="fn-fine">{L.fine} <a href={lang === 'es' ? '/es/privacy' : '/privacy'}>{L.privacy}</a></span>
              </form>
              <button type="button" className="fn-link" onClick={back}>{L.back}</button>
            </div>
          )}

          {who && phase !== 'ask' && phase !== 'contact' && <div className="fn-a">{who.name} · {who.phone}</div>}

          {phase === 'think' && (
            <div className="fn-think" role="status">
              <b>{L.thinking}</b>
              <ul>{L.checks.map((c, k) => <li key={c} className={k < shown ? 'on' : ''}><span aria-hidden="true">{k < shown ? '✓' : '·'}</span>{c}</li>)}</ul>
            </div>
          )}

          {phase === 'result' && result && (
            <section className="fn-result" aria-label={L.resultTitle}>
              <h2>{L.resultTitle}</h2>
              <div className="fn-score"><span className="fn-big">{result.total}</span><span className="fn-of">/100</span><span className="fn-lbl">{L.readiness}</span></div>
              <div className="fn-bar" aria-hidden="true"><i style={{ width: `${result.total}%` }} /></div>
              <p>{L.verdict[verdictKey(result.total)]}</p>
              {matches && <>
                <h3>{L.matchesTitle}</h3>
                <ul className="fn-matches">
                  <li><b>{matches.high}</b> {L.strong}</li>
                  <li><b>{matches.medium}</b> {L.possible}</li>
                  <li><b>{matches.low}</b> {L.within}</li>
                </ul>
              </>}
              <button className="fn-cta" onClick={() => void unlock()}>{L.unlock}</button>
              <p className="fn-fine">{L.unlockFine}</p>
            </section>
          )}
          <div ref={endRef} />
        </div>
        </div>
      </main>
      <footer className="fn-foot">
        <span>{L.footer}</span>
        <a href={lang === 'es' ? '/es/privacy' : '/privacy'}>{L.footerLink}</a>
      </footer>
      {!asked && <ConsentBanner lang={lang} onChoose={granted => { setAsked(true); if (granted) { initPixel(); track('ViewContent') } }} />}
    </div>
  )
}
