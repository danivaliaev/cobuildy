import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth'
import { ErrorLine, Field, Pill, useAction, useLoad } from './ui'
import { toNum } from '../lib/format'
import type { Company } from '../lib/types'

export function CompanyForm() {
  const { profile } = useAuth()
  const co = useLoad(async () => {
    const { data, error } = await supabase.from('companies').select('*').eq('owner_id', profile!.id).maybeSingle()
    if (error) throw error
    return data as Company | null
  })
  const [f, setF] = useState({ name: '', website: '', founded: '', delivered: '', volume_m: '', units: '', active: '', team: '', refs: '' })
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    const c = co.data
    if (c) setF({ name: c.name, website: c.website ?? '', founded: c.founded?.toString() ?? '', delivered: String(c.delivered), volume_m: String(c.volume_m), units: String(c.units), active: String(c.active), team: String(c.team), refs: String(c.refs) })
  }, [co.data])
  const act = useAction(co.reload)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setSaved(false); setF({ ...f, [k]: e.target.value }) }
  const save = (e: FormEvent) => {
    e.preventDefault()
    void act.run(async () => {
      const row = { name: f.name.trim(), website: f.website.trim() || null, founded: toNum(f.founded), delivered: toNum(f.delivered) ?? 0, volume_m: toNum(f.volume_m) ?? 0, units: toNum(f.units) ?? 0, active: toNum(f.active) ?? 0, team: toNum(f.team) ?? 0, refs: toNum(f.refs) ?? 0 }
      const { error } = co.data ? await supabase.from('companies').update(row).eq('id', co.data.id) : await supabase.from('companies').insert({ ...row, owner_id: profile!.id })
      if (error) throw error
      setSaved(true)
    })
  }
  const num = (k: keyof typeof f, label: string) => <Field label={label}><input inputMode="decimal" value={f[k]} onChange={set(k)} /></Field>
  return (
    <form className="card" onSubmit={save}>
      <h2>Company</h2>
      <p className="muted">Investors see these facts about you. Verification badges are set by Cobuildy.</p>
      <div className="grid2">
        <Field label="Company name"><input required value={f.name} onChange={set('name')} /></Field>
        <Field label="Website"><input value={f.website} onChange={set('website')} placeholder="https://" /></Field>
        {num('founded', 'Founded (year)')}{num('delivered', 'Projects delivered')}{num('volume_m', 'Volume delivered (€M)')}
        {num('units', 'Units delivered')}{num('active', 'Active projects')}{num('team', 'Team size')}{num('refs', 'References available')}
      </div>
      {co.data && <div className="row">
        <Pill tone={co.data.ver_registry ? 'good' : undefined}>Registry</Pill><Pill tone={co.data.ver_web ? 'good' : undefined}>Website</Pill>
        <Pill tone={co.data.ver_fin ? 'good' : undefined}>Financials</Pill><Pill tone={co.data.ver_refs ? 'good' : undefined}>References</Pill>
      </div>}
      <ErrorLine error={act.error ?? co.error} />
      <div className="row"><button className="btn pri" disabled={act.busy || !f.name.trim()} type="submit">Save company</button>{saved && <span className="ok">Saved</span>}</div>
    </form>
  )
}
