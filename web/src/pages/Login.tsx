import { useState, type FormEvent } from 'react'
import { supabase, errText } from '../lib/supabase'
import { ErrorLine } from '../components/ui'

export function Login() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(null)
    const { error: err } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { emailRedirectTo: window.location.origin, shouldCreateUser: true } })
    setBusy(false)
    if (!err) return setSent(true)
    const m = errText(err.message)
    setError(/database error|invitation/i.test(m) ? 'This address has no approved invitation yet. Registration is by invitation only.' : m)
  }

  return (
    <div className="login">
      <form className="card" onSubmit={submit}>
        <span className="mono">Cobuildy</span>
        <h1>Sign in</h1>
        {sent ? (
          <p>We sent a sign-in link to <b>{email}</b>. Open it on this device.</p>
        ) : (
          <>
            <p className="muted">Registration is by invitation only. Enter the address your invitation was sent to.</p>
            <label className="f"><span>Email</span><input type="email" required autoFocus value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" /></label>
            <ErrorLine error={error} />
            <button className="btn pri" disabled={busy || !email} type="submit">{busy ? 'Sending…' : 'Send sign-in link'}</button>
          </>
        )}
      </form>
    </div>
  )
}
