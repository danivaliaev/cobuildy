import { useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase, errText } from '../lib/supabase'
import { useAuth } from '../auth'
import { carryName, carryRole, hasFunnelCarry } from '../lib/carry'
import { ErrorLine } from '../components/ui'
import { InvestorProfileForm, type InvestorProfileValue } from '../components/InvestorProfileForm'

type Pick = 'developer' | 'investor'

/** First sign-in without an invitation: the person says who they are. Staff roles are never offered here. */
export function Onboarding() {
  const { session, signOut, reload } = useAuth()
  const meta = (session?.user.user_metadata ?? {}) as Record<string, unknown>
  const hinted = new URLSearchParams(window.location.search).get('role')
  const [role, setRole] = useState<Pick>(hinted === 'investor' ? 'investor' : hinted === 'developer' ? 'developer' : carryRole() ?? 'developer')
  const [name, setName] = useState(String(meta.full_name ?? meta.name ?? '') || carryName())
  const [company, setCompany] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<1 | 2>(1)

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
    setBusy(true)
    const { error: err } = await supabase.rpc('complete_signup', { p_role: role, p_name: name.trim(), p_company: company.trim() || null })
    if (err) { setBusy(false); setError(errText(err.message)); return }
    reload()
  }

  if (hasFunnelCarry() && !autoFailed && role === 'developer' && name.trim().length > 1 && hinted !== 'investor') return (
    <div className="login"><div className="card"><span className="mono">Cobuildy</span><h2>Setting up your workspace…</h2><p className="muted">Your answers are being added to your project.</p></div></div>
  )

  if (role === 'investor' && step === 2) return (
    <div className="login">
      <div className="card">
        <span className="mono">Cobuildy · step 2 of 2</span>
        <h1>About your investing</h1>
        <p className="muted">Pick what describes you best. This tells developers who they are talking to.</p>
        <InvestorProfileForm submitLabel="Open my workspace" busy={busy} error={error} onSubmit={finishInvestor} onCancel={() => setStep(1)} />
      </div>
    </div>
  )

  return (
    <div className="login">
      <form className="card" onSubmit={submit}>
        <span className="mono">Cobuildy</span>
        <h1>Welcome</h1>
        <p className="muted">Signed in as <b>{session?.user.email}</b>. Tell us who you are to open your workspace.</p>
        <div className="row" role="radiogroup" aria-label="I am">
          <button type="button" role="radio" aria-checked={role === 'developer'} className={`btn ${role === 'developer' ? 'pri' : ''}`} onClick={() => setRole('developer')}>I develop projects</button>
          <button type="button" role="radio" aria-checked={role === 'investor'} className={`btn ${role === 'investor' ? 'pri' : ''}`} onClick={() => setRole('investor')}>I invest or lend</button>
        </div>
        <label className="f"><span>Your name</span><input required maxLength={120} value={name} onChange={e => setName(e.target.value)} autoComplete="name" /></label>
        {role === 'developer' && <label className="f"><span>Company (optional)</span><input maxLength={160} value={company} onChange={e => setCompany(e.target.value)} autoComplete="organization" /></label>}
        <ErrorLine error={error} />
        <button className="btn pri" type="submit" disabled={busy || !name.trim()}>{busy ? 'Saving…' : role === 'investor' ? 'Continue' : 'Open my workspace'}</button>
        <button className="linkbtn" type="button" onClick={() => void signOut()}>Use another account</button>
      </form>
    </div>
  )
}
