import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth'
import { ErrorLine, Field, Pill, useAction, useLoad } from './ui'
import { toNum } from '../lib/format'
import type { Company } from '../lib/types'
import { useT } from '../i18n'

export function CompanyForm() {
  const { profile } = useAuth()
  const t = useT()
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
      <h2>{t('Company', 'Empresa')}</h2>
      <p className="muted">{t('Investors see these facts about you. Verification badges are set by Cobuildy.', 'Los inversores ven estos datos sobre ti. Las insignias de verificación las asigna Cobuildy.')}</p>
      <div className="grid2">
        <Field label={t('Company name', 'Nombre de la empresa')}><input required value={f.name} onChange={set('name')} /></Field>
        <Field label={t('Website', 'Sitio web')}><input value={f.website} onChange={set('website')} placeholder="https://" /></Field>
        {num('founded', t('Founded (year)', 'Fundada (año)'))}{num('delivered', t('Projects delivered', 'Proyectos entregados'))}{num('volume_m', t('Volume delivered (€M)', 'Volumen entregado (M€)'))}
        {num('units', t('Units delivered', 'Viviendas entregadas'))}{num('active', t('Active projects', 'Proyectos activos'))}{num('team', t('Team size', 'Tamaño del equipo'))}{num('refs', t('References available', 'Referencias disponibles'))}
      </div>
      {co.data && <div className="row">
        <Pill tone={co.data.ver_registry ? 'good' : undefined}>{t('Registry', 'Registro')}</Pill><Pill tone={co.data.ver_web ? 'good' : undefined}>{t('Website', 'Web')}</Pill>
        <Pill tone={co.data.ver_fin ? 'good' : undefined}>{t('Financials', 'Cuentas')}</Pill><Pill tone={co.data.ver_refs ? 'good' : undefined}>{t('References', 'Referencias')}</Pill>
      </div>}
      <ErrorLine error={act.error ?? co.error} />
      <div className="row"><button className="btn pri" disabled={act.busy || !f.name.trim()} type="submit">{t('Save company', 'Guardar empresa')}</button>{saved && <span className="ok">{t('Saved', 'Guardado')}</span>}</div>
    </form>
  )
}
