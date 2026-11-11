import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase, errText } from '../lib/supabase'
import { useAuth } from '../auth'
import { CompanyForm } from '../components/CompanyForm'
import { InvestorProfileForm } from '../components/InvestorProfileForm'
import { ErrorLine, Field, Pill, useAction, useLoad } from '../components/ui'
import type { Investor } from '../lib/types'

type Tab = 'account' | 'profile' | 'privacy'

function Account() {
  const { profile, session, reload, signOut } = useAuth()
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
        <h2>Account</h2>
        <Field label="Your name"><input required maxLength={120} value={name} onChange={e => { setSaved(false); setName(e.target.value) }} autoComplete="name" /></Field>
        <Field label="Email"><input value={session?.user.email ?? ''} readOnly aria-readonly="true" /></Field>
        <div className="row"><span className="muted">Role</span><Pill>{profile?.role}</Pill><span className="muted">Signed in with</span><Pill>{provider === 'google' ? 'Google' : 'Email link'}</Pill></div>
        <p className="muted small">To change the email address, contact Cobuildy. Sign-in works through Google or an email link, so there is no password to manage.</p>
        <ErrorLine error={act.error} />
        <div className="row"><button className="btn pri" type="submit" disabled={act.busy || !name.trim() || name.trim() === (profile?.full_name ?? '')}>Save</button>{saved && <span className="ok">Saved</span>}</div>
      </form>
      <section className="card">
        <h2>Sessions</h2>
        <p className="muted">Signed in on another device you no longer use? Sign out everywhere, this device included.</p>
        <div className="row"><button className="btn" type="button" onClick={() => void signOut('global')}>Sign out on all devices</button></div>
      </section>
    </>
  )
}

function InvestorProfile() {
  const { profile } = useAuth()
  const me = useLoad(async () => {
    const { data, error } = await supabase.from('investors').select('*').eq('user_id', profile!.id).maybeSingle()
    if (error) throw error
    return data as Investor | null
  })
  const act = useAction(me.reload)
  const [ok, setOk] = useState(false)
  if (me.loading) return <span className="muted">Loading…</span>
  if (!me.data) return <section className="card"><ErrorLine error={me.error} /><p className="muted">Your investor profile is not set up yet. Contact Cobuildy.</p></section>
  const inv = me.data
  return (
    <section className="card">
      <h2>Investor profile</h2>
      <p className="muted">Developers see your type and country. Your name and phone stay with Cobuildy.</p>
      <InvestorProfileForm initial={{ kind: (inv.kind ?? '') as never, country: inv.country ?? '', name: inv.name, phone: inv.phone ?? '' }} submitLabel="Save" busy={act.busy} error={act.error}
        onSubmit={v => { setOk(false); void act.run(async () => {
          const { error } = await supabase.rpc('update_investor_profile', { p_name: v.name, p_kind: v.kind, p_country: v.country, p_phone: v.phone })
          if (error) throw new Error(errText(error.message))
          setOk(true)
        }) }} />
      {ok && <span className="ok">Saved</span>}
    </section>
  )
}

function Privacy() {
  const [sent, setSent] = useState<string | null>(null)
  const [sure, setSure] = useState(false)
  const act = useAction()
  const send = (kind: 'export' | 'deletion') => void act.run(async () => {
    const { error } = await supabase.rpc('request_account_action', { p_kind: kind })
    if (error) throw new Error(errText(error.message))
    setSent(kind === 'export' ? 'Request sent. Cobuildy will email you a copy of your data.' : 'Request sent. Cobuildy will contact you by email to confirm before anything is deleted.')
    setSure(false)
  })
  return (
    <section className="card">
      <h2>Data and privacy</h2>
      <p className="muted">You can ask for a copy of your data or for your account to be deleted. Cobuildy handles both by hand and confirms with you by email.</p>
      <div className="row"><button className="btn" type="button" disabled={act.busy} onClick={() => send('export')}>Request a copy of my data</button></div>
      {!sure
        ? <div className="row"><button className="btn" type="button" onClick={() => setSure(true)}>Request account deletion</button></div>
        : <div className="ibanner" role="alert"><span className="sp"><b>Delete your account?</b> Your projects, deals and messages will be removed once Cobuildy confirms. This cannot be undone.</span>
            <button className="btn pri" type="button" disabled={act.busy} onClick={() => send('deletion')}>Yes, request deletion</button>
            <button className="btn" type="button" onClick={() => setSure(false)}>Cancel</button></div>}
      <ErrorLine error={act.error} />
      {sent && <div className="ok" role="status">{sent}</div>}
    </section>
  )
}

export function Settings() {
  const { profile } = useAuth()
  const [sp, setSp] = useSearchParams()
  const hasProfile = profile?.role === 'developer' || profile?.role === 'investor'
  const tabs: Array<[Tab, string]> = [['account', 'Account'], ...(hasProfile ? [['profile', profile?.role === 'developer' ? 'Company' : 'Investor profile'] as [Tab, string]] : []), ['privacy', 'Data and privacy']]
  const tab = tabs.find(([k]) => k === sp.get('tab'))?.[0] ?? 'account'
  return (
    <>
      <h1>Settings</h1>
      <div className="tabs" role="tablist">{tabs.map(([k, l]) => <button key={k} type="button" role="tab" className="tab" aria-selected={tab === k} onClick={() => setSp(k === 'account' ? {} : { tab: k }, { replace: true })}>{l}</button>)}</div>
      {tab === 'account' && <Account />}
      {tab === 'profile' && (profile?.role === 'developer' ? <CompanyForm /> : <InvestorProfile />)}
      {tab === 'privacy' && <Privacy />}
    </>
  )
}
