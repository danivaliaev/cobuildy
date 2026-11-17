import { useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase, errText } from '../lib/supabase'
import { ErrorLine } from '../components/ui'
import { hasFunnelCarry } from '../lib/carry'
import { useT } from '../i18n'

export function Login() {
  const t = useT()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const role = new URLSearchParams(window.location.search).get('role')
  const fromFunnel = hasFunnelCarry()
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
        <h1>{fromFunnel ? t('Your assessment is ready', 'Tu evaluación está lista') : t('Sign in or create an account', 'Accede o crea una cuenta')}</h1>
        {fromFunnel && !sent && <p className="muted" style={{ margin: 0 }}>{t('Create your free account to unlock your investor matches. Your answers are saved and will be waiting for you.', 'Crea tu cuenta gratuita para desbloquear tus coincidencias con inversores. Tus respuestas están guardadas y te estarán esperando.')}</p>}
        {sent ? (
          <p>{t('We sent a sign-in link to', 'Hemos enviado un enlace de acceso a')} <b>{email}</b>. {t('Open it on this device.', 'Ábrelo en este dispositivo.')}</p>
        ) : (
          <>
            <button className="btn pri" type="button" disabled={busy} onClick={() => void google()}>{t('Continue with Google', 'Continuar con Google')}</button>
            <span className="muted" style={{ textAlign: 'center' }}>{t('or use an email link', 'o usa un enlace por correo')}</span>
            <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
              <label className="f"><span>{t('Email', 'Correo electrónico')}</span><input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" /></label>
              <button className="btn" disabled={busy || !email} type="submit">{busy ? t('Sending…', 'Enviando…') : t('Send sign-in link', 'Enviar enlace de acceso')}</button>
            </form>
            <ErrorLine error={error} />
            <p className="muted">{fromFunnel ? t('It takes one click. No password to remember.', 'Solo un clic. Sin contraseña que recordar.') : t('New here? The same buttons create your account. You choose your role on the next screen.', '¿Eres nuevo? Los mismos botones crean tu cuenta. Elegirás tu rol en la siguiente pantalla.')}</p>
          </>
        )}
      </div>
    </div>
  )
}
