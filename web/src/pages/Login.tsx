import { useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase, errText } from '../lib/supabase'
import { ErrorLine } from '../components/ui'

export function Login() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const role = new URLSearchParams(window.location.search).get('role')
  const back = window.location.origin + (role === 'investor' || role === 'developer' ? `/?role=${role}` : '')

  // The landing sends people here with ?auto=google so that one click starts Google sign-in.
  const auto = useRef(new URLSearchParams(window.location.search).get('auto') === 'google')
  useEffect(() => {
    if (!auto.current) return
    auto.current = false
    window.history.replaceState(null, '', window.location.pathname + (role ? `?role=${role}` : ''))
    void google()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function google() {
    setBusy(true); setError(null)
    const { error: err } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: back } })
    if (err) { setBusy(false); setError(errText(err.message)) }
  }

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(null)
    const { error: err } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { emailRedirectTo: back, shouldCreateUser: true } })
    setBusy(false)
    if (!err) return setSent(true)
    setError(errText(err.message))
  }

  return (
    <div className="login">
      <div className="card" style={{ display: 'grid', gap: 14 }}>
        <span className="mono">Cobuildy</span>
        <h1>Sign in or create an account</h1>
        {sent ? (
          <p>We sent a sign-in link to <b>{email}</b>. Open it on this device.</p>
        ) : (
          <>
            <button className="btn pri" type="button" disabled={busy} onClick={() => void google()}>Continue with Google</button>
            <span className="muted" style={{ textAlign: 'center' }}>or use an email link</span>
            <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
              <label className="f"><span>Email</span><input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" /></label>
              <button className="btn" disabled={busy || !email} type="submit">{busy ? 'Sending…' : 'Send sign-in link'}</button>
            </form>
            <ErrorLine error={error} />
            <p className="muted">New here? The same buttons create your account. You choose your role on the next screen.</p>
          </>
        )}
      </div>
    </div>
  )
}
