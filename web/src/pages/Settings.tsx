import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase, errText } from '../lib/supabase'
import { useAuth } from '../auth'
import { CompanyForm } from '../components/CompanyForm'
import { InvestorProfileForm } from '../components/InvestorProfileForm'
import { ErrorLine, Field, Pill, useAction, useLoad } from '../components/ui'
import type { Investor } from '../lib/types'
import { useT } from '../i18n'

type Tab = 'account' | 'profile' | 'privacy'

function Account() {
  const { profile, session, reload, signOut } = useAuth()
  const t = useT()
  const [name, setName] = useState(profile?.full_name ?? '')
  const [saved, setSaved] = useState(false)
  const act = useAction()
  const provider = String(session?.user.app_metadata?.provider ?? 'email')
  const save = (e: FormEvent) => { e.preventDefault(); void act.run(async () => {
    const { error } = await supabase.from('profiles').update({ full_name: name.trim() }).eq('id', profile!.id)
    if (error) throw error
    setSaved(true); reload()
  }) }
  return (
    <>
      <form className="card" onSubmit={save}>
        <h2>{t('Account', 'Cuenta')}</h2>
        <Field label={t('Your name', 'Tu nombre')}><input required maxLength={120} value={name} onChange={e => { setSaved(false); setName(e.target.value) }} autoComplete="name" /></Field>
        <Field label={t('Email', 'Correo electrónico')}><input value={session?.user.email ?? ''} readOnly aria-readonly="true" /></Field>
        <div className="row"><span className="muted">{t('Role', 'Rol')}</span><Pill>{profile?.role}</Pill><span className="muted">{t('Signed in with', 'Acceso con')}</span><Pill>{provider === 'google' ? 'Google' : t('Email link', 'Enlace por correo')}</Pill></div>
        <p className="muted small">{t('To change the email address, contact Cobuildy. Sign-in works through Google or an email link, so there is no password to manage.', 'Para cambiar el correo, contacta con Cobuildy. El acceso funciona con Google o con un enlace por correo, así que no hay contraseña que gestionar.')}</p>
        <ErrorLine error={act.error} />
        <div className="row"><button className="btn pri" type="submit" disabled={act.busy || !name.trim() || name.trim() === (profile?.full_name ?? '')}>{t('Save', 'Guardar')}</button>{saved && <span className="ok">{t('Saved', 'Guardado')}</span>}</div>
      </form>
      <section className="card">
        <h2>{t('Sessions', 'Sesiones')}</h2>
        <p className="muted">{t('Signed in on another device you no longer use? Sign out everywhere, this device included.', '¿Tienes la sesión abierta en un dispositivo que ya no usas? Ciérrala en todas partes, también en este.')}</p>
        <div className="row"><button className="btn" type="button" onClick={() => void signOut('global')}>{t('Sign out on all devices', 'Cerrar sesión en todos los dispositivos')}</button></div>
      </section>
    </>
  )
}

function InvestorProfile() {
  const { profile } = useAuth()
  const t = useT()
  const me = useLoad(async () => {
    const { data, error } = await supabase.from('investors').select('*').eq('user_id', profile!.id).maybeSingle()
    if (error) throw error
    return data as Investor | null
  })
  const act = useAction(me.reload)
  const [ok, setOk] = useState(false)
  if (me.loading) return <span className="muted">{t('Loading…', 'Cargando…')}</span>
  if (!me.data) return <section className="card"><ErrorLine error={me.error} /><p className="muted">{t('Your investor profile is not set up yet. Contact Cobuildy.', 'Tu perfil de inversor aún no está configurado. Contacta con Cobuildy.')}</p></section>
  const inv = me.data
  return (
    <section className="card">
      <h2>{t('Investor profile', 'Perfil de inversor')}</h2>
      <p className="muted">{t('Developers see your type and country. Your name and phone stay with Cobuildy.', 'Los promotores ven tu tipo y tu país. Tu nombre y tu teléfono se quedan en Cobuildy.')}</p>
      <InvestorProfileForm initial={{ kind: (inv.kind ?? '') as never, country: inv.country ?? '', name: inv.name, phone: inv.phone ?? '' }} submitLabel={t('Save', 'Guardar')} busy={act.busy} error={act.error}
        onSubmit={v => { setOk(false); void act.run(async () => {
          const { error } = await supabase.rpc('update_investor_profile', { p_name: v.name, p_kind: v.kind, p_country: v.country, p_phone: v.phone })
          if (error) throw new Error(errText(error.message))
          setOk(true)
        }) }} />
      {ok && <span className="ok">{t('Saved', 'Guardado')}</span>}
    </section>
  )
}

function Privacy() {
  const t = useT()
  const [sent, setSent] = useState<string | null>(null)
  const [sure, setSure] = useState(false)
  const act = useAction()
  const send = (kind: 'export' | 'deletion') => void act.run(async () => {
    const { error } = await supabase.rpc('request_account_action', { p_kind: kind })
    if (error) throw new Error(errText(error.message))
    setSent(kind === 'export' ? t('Request sent. Cobuildy will email you a copy of your data.', 'Solicitud enviada. Cobuildy te enviará por correo una copia de tus datos.') : t('Request sent. Cobuildy will contact you by email to confirm before anything is deleted.', 'Solicitud enviada. Cobuildy te escribirá por correo para confirmar antes de borrar nada.'))
    setSure(false)
  })
  return (
    <section className="card">
      <h2>{t('Data and privacy', 'Datos y privacidad')}</h2>
      <p className="muted">{t('You can ask for a copy of your data or for your account to be deleted. Cobuildy handles both by hand and confirms with you by email.', 'Puedes pedir una copia de tus datos o que se elimine tu cuenta. Cobuildy gestiona ambas cosas a mano y lo confirma contigo por correo.')}</p>
      <div className="row"><button className="btn" type="button" disabled={act.busy} onClick={() => send('export')}>{t('Request a copy of my data', 'Pedir una copia de mis datos')}</button></div>
      {!sure
        ? <div className="row"><button className="btn" type="button" onClick={() => setSure(true)}>{t('Request account deletion', 'Pedir la eliminación de mi cuenta')}</button></div>
        : <div className="ibanner" role="alert"><span className="sp"><b>{t('Delete your account?', '¿Eliminar tu cuenta?')}</b> {t('Your projects, deals and messages will be removed once Cobuildy confirms. This cannot be undone.', 'Tus proyectos, operaciones y mensajes se eliminarán cuando Cobuildy lo confirme. No se puede deshacer.')}</span>
            <button className="btn pri" type="button" disabled={act.busy} onClick={() => send('deletion')}>{t('Yes, request deletion', 'Sí, pedir la eliminación')}</button>
            <button className="btn" type="button" onClick={() => setSure(false)}>{t('Cancel', 'Cancelar')}</button></div>}
      <ErrorLine error={act.error} />
      {sent && <div className="ok" role="status">{sent}</div>}
    </section>
  )
}

export function Settings() {
  const { profile } = useAuth()
  const t = useT()
  const [sp, setSp] = useSearchParams()
  const hasProfile = profile?.role === 'developer' || profile?.role === 'investor'
  const tabs: Array<[Tab, string]> = [['account', t('Account', 'Cuenta')], ...(hasProfile ? [['profile', profile?.role === 'developer' ? t('Company', 'Empresa') : t('Investor profile', 'Perfil de inversor')] as [Tab, string]] : []), ['privacy', t('Data and privacy', 'Datos y privacidad')]]
  const tab = tabs.find(([k]) => k === sp.get('tab'))?.[0] ?? 'account'
  return (
    <>
      <h1>{t('Settings', 'Ajustes')}</h1>
      <div className="tabs" role="tablist">{tabs.map(([k, l]) => <button key={k} type="button" role="tab" className="tab" aria-selected={tab === k} onClick={() => setSp(k === 'account' ? {} : { tab: k }, { replace: true })}>{l}</button>)}</div>
      {tab === 'account' && <Account />}
      {tab === 'profile' && (profile?.role === 'developer' ? <CompanyForm /> : <InvestorProfile />)}
      {tab === 'privacy' && <Privacy />}
    </>
  )
}
