import { useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase, errText } from '../lib/supabase'
import { useAuth } from '../auth'
import { carryName, carryPhone, carryRole, hasFunnelCarry, markFirstRun } from '../lib/carry'
import { validPhone } from '../lib/funnelTrack'
import { ErrorLine } from '../components/ui'
import { useT } from '../i18n'
import { InvestorProfileForm, type InvestorProfileValue } from '../components/InvestorProfileForm'

type Pick = 'developer' | 'investor'

/** First sign-in without an invitation: the person says who they are. Staff roles are never offered here. */
export function Onboarding() {
  const { session, signOut, reload } = useAuth()
  const t = useT()
  const meta = (session?.user.user_metadata ?? {}) as Record<string, unknown>
  const hinted = new URLSearchParams(window.location.search).get('role')
  const [role, setRole] = useState<Pick>(hinted === 'investor' ? 'investor' : hinted === 'developer' ? 'developer' : carryRole() ?? 'developer')
  const [name, setName] = useState(String(meta.full_name ?? meta.name ?? '') || carryName())
  const [company, setCompany] = useState('')
  const [phone, setPhone] = useState('')
  // Someone who left a phone in the chat or the funnel is not asked again.
  const needPhone = !carryPhone()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<1 | 2>(1)
  // The landing, the funnel or the sign-in link already say what the person is. Only someone who arrives with no hint is asked.
  const roleKnown = hinted === 'investor' || hinted === 'developer' || carryRole() !== null

  // Someone who answered the ad funnel already said they develop a project and left their name: open the workspace straight away.
  const auto = useRef(hasFunnelCarry() && hinted !== 'investor' && carryRole() === 'developer' && name.trim().length > 1)
  const [autoFailed, setAutoFailed] = useState(false)
  useEffect(() => {
    if (!auto.current) return
    auto.current = false
    void (async () => {
      const { error: err } = await supabase.rpc('complete_signup', { p_role: 'developer', p_name: name.trim(), p_company: null })
      if (err) { setAutoFailed(true); setError(errText(err.message)); return }
      reload()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function finishInvestor(v: InvestorProfileValue) {
    setBusy(true); setError(null)
    const { error: err } = await supabase.rpc('complete_investor_signup', { p_name: name.trim(), p_firm: v.name, p_kind: v.kind, p_country: v.country, p_phone: v.phone })
    if (err) { setBusy(false); setError(errText(err.message)); return }
    reload()
  }

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null)
    if (role === 'investor') { setStep(2); return }
    const ph = needPhone ? validPhone(phone) : null
    if (needPhone && !ph) { setError(t('Enter a phone number with the country code, for example +34 600 123 456.', 'Introduce un teléfono con el prefijo del país, por ejemplo +34 600 123 456.')); return }
    setBusy(true)
    const { error: err } = await supabase.rpc('complete_signup', { p_role: role, p_name: name.trim(), p_company: company.trim() || null, p_phone: ph })
    if (err) { setBusy(false); setError(errText(err.message)); return }
    markFirstRun() // the project from carried answers, if there is one, replaces this marker
    reload()
  }

  if (hasFunnelCarry() && !autoFailed && role === 'developer' && name.trim().length > 1 && hinted !== 'investor') return (
    <div className="login"><div className="card"><span className="mono">Cobuildy</span><h2>{t('Setting up your workspace…', 'Preparando tu espacio de trabajo…')}</h2><p className="muted">{t('Your answers are being added to your project.', 'Tus respuestas se están añadiendo a tu proyecto.')}</p></div></div>
  )

  if (role === 'investor' && step === 2) return (
    <div className="login">
      <div className="card">
        <span className="mono">Cobuildy · {t('step 2 of 2', 'paso 2 de 2')}</span>
        <h1>{t('About your investing', 'Sobre tu actividad inversora')}</h1>
        <p className="muted">{t('Pick what describes you best. This tells developers who they are talking to.', 'Elige lo que mejor te describe. Así los promotores saben con quién hablan.')}</p>
        <InvestorProfileForm submitLabel={t('Open my workspace', 'Abrir mi espacio de trabajo')} busy={busy} error={error} onSubmit={finishInvestor} onCancel={() => setStep(1)} />
      </div>
    </div>
  )

  return (
    <div className="login">
      <form className="card" onSubmit={submit}>
        <span className="mono">Cobuildy</span>
        <h1>{t('Welcome', 'Te damos la bienvenida')}</h1>
        <p className="muted">{t('Signed in as', 'Has accedido como')} <b>{session?.user.email}</b>. {roleKnown ? t('Tell us your name to open your workspace.', 'Dinos tu nombre para abrir tu espacio de trabajo.') : t('Tell us who you are to open your workspace.', 'Dinos quién eres para abrir tu espacio de trabajo.')}</p>
        {!roleKnown && <div className="row" role="radiogroup" aria-label={t('I am', 'Soy')}>
          <button type="button" role="radio" aria-checked={role === 'developer'} className={`btn ${role === 'developer' ? 'pri' : ''}`} onClick={() => setRole('developer')}>{t('I develop projects', 'Soy promotor')}</button>
          <button type="button" role="radio" aria-checked={role === 'investor'} className={`btn ${role === 'investor' ? 'pri' : ''}`} onClick={() => setRole('investor')}>{t('I invest or lend', 'Invierto o presto')}</button>
        </div>}
        <label className="f"><span>{t('Your name', 'Tu nombre')}</span><input required maxLength={120} value={name} onChange={e => setName(e.target.value)} autoComplete="name" /></label>
        {role === 'developer' && needPhone && <label className="f"><span>{t('Phone', 'Teléfono')}</span><input required type="tel" inputMode="tel" maxLength={24} placeholder="+34 600 123 456" value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" /></label>}
        {role === 'developer' && <label className="f"><span>{t('Company (optional)', 'Empresa (opcional)')}</span><input maxLength={160} value={company} onChange={e => setCompany(e.target.value)} autoComplete="organization" /></label>}
        <ErrorLine error={error} />
        <button className="btn pri" type="submit" disabled={busy || !name.trim() || (role === 'developer' && needPhone && !phone.trim())}>{busy ? t('Saving…', 'Guardando…') : role === 'investor' ? t('Continue', 'Continuar') : t('Open my workspace', 'Abrir mi espacio de trabajo')}</button>
        <button className="linkbtn" type="button" onClick={() => void signOut()}>{t('Use another account', 'Usar otra cuenta')}</button>
      </form>
    </div>
  )
}
