import { useState, type FormEvent } from 'react'
import { supabase, errText } from '../lib/supabase'
import { useAuth } from '../auth'
import { carryRole } from '../lib/carry'
import { ErrorLine } from '../components/ui'

type Pick = 'developer' | 'investor'

/** First sign-in without an invitation: the person says who they are. Staff roles are never offered here. */
export function Onboarding() {
  const { session, signOut, reload } = useAuth()
  const meta = (session?.user.user_metadata ?? {}) as Record<string, unknown>
  const hinted = new URLSearchParams(window.location.search).get('role')
  const [role, setRole] = useState<Pick>(hinted === 'investor' ? 'investor' : hinted === 'developer' ? 'developer' : carryRole() ?? 'developer')
  const [name, setName] = useState(String(meta.full_name ?? meta.name ?? ''))
  const [company, setCompany] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(null)
    const { error: err } = await supabase.rpc('complete_signup', { p_role: role, p_name: name.trim(), p_company: company.trim() || null })
    if (err) { setBusy(false); setError(errText(err.message)); return }
    reload()
  }

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
        <label className="f"><span>{role === 'developer' ? 'Company (optional)' : 'Fund or firm (optional)'}</span><input maxLength={160} value={company} onChange={e => setCompany(e.target.value)} autoComplete="organization" /></label>
        <ErrorLine error={error} />
        <button className="btn pri" type="submit" disabled={busy || !name.trim()}>{busy ? 'Saving…' : 'Open my workspace'}</button>
        <button className="linkbtn" type="button" onClick={() => void signOut()}>Use another account</button>
      </form>
    </div>
  )
}
