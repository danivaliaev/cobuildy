import { useEffect, useState } from 'react'
import { supabase, rpc } from '../lib/supabase'
import { useAuth } from '../auth'
import { Checks, Empty, ErrorLine, Field, Pill, useAction, useLoad } from '../components/ui'
import { eur, fromNum, pct, toNum, when } from '../lib/format'
import { ASSET, GEO, INSTRUMENT, LICENSE, STAGE_LABEL, type DealMessage, type Investor as Inv, type Teaser } from '../lib/types'

function Mandate({ inv, reload }: { inv: Inv; reload: () => void | Promise<void> }) {
  const [f, setF] = useState({ name: '', instruments: [] as string[], geos: [] as string[], assets: [] as string[], tmin: '', tmax: '', lic: '', ltc: '', ret: '', term: '', track: '', margin: '', pre: '' })
  const [saved, setSaved] = useState(false)
  useEffect(() => setF({
    name: inv.name, instruments: inv.instruments, geos: inv.geos, assets: inv.assets, tmin: fromNum(inv.ticket_min, 1e6), tmax: fromNum(inv.ticket_max, 1e6),
    lic: inv.min_license ?? '', ltc: fromNum(inv.max_ltc == null ? null : inv.max_ltc * 100), ret: fromNum(inv.min_return == null ? null : inv.min_return * 100),
    term: fromNum(inv.max_term), track: fromNum(inv.min_track), margin: fromNum(inv.min_margin == null ? null : inv.min_margin * 100), pre: fromNum(inv.min_presales == null ? null : inv.min_presales * 100),
  }), [inv])
  const act = useAction(reload)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => { setSaved(false); setF({ ...f, [k]: v }) }
  const fr = (s: string) => { const n = toNum(s); return n == null ? null : n / 100 }
  const mil = (s: string) => { const n = toNum(s); return n == null ? null : Math.round(n * 1e6) }
  const num = (k: 'tmin' | 'tmax' | 'ltc' | 'ret' | 'term' | 'track' | 'margin' | 'pre', label: string) => <Field label={label}><input inputMode="decimal" value={f[k]} onChange={e => set(k, e.target.value)} /></Field>
  return (
    <section className="card">
      <h2>Your mandate</h2>
      <p className="muted">Region, asset, instrument, ticket and permit are hard filters: a project outside them never reaches you. The rest only changes ranking.</p>
      <Field label="Name"><input value={f.name} onChange={e => set('name', e.target.value)} /></Field>
      <Field label="Instruments"><Checks options={INSTRUMENT} value={f.instruments} onChange={v => set('instruments', v)} /></Field>
      <Field label="Regions"><Checks options={GEO} value={f.geos} onChange={v => set('geos', v)} /></Field>
      <Field label="Asset types"><Checks options={ASSET} value={f.assets} onChange={v => set('assets', v)} /></Field>
      <div className="grid2">
        {num('tmin', 'Minimum ticket (€M)')}{num('tmax', 'Maximum ticket (€M)')}
        <Field label="Permit required at least"><select value={f.lic} onChange={e => set('lic', e.target.value)}><option value="">Any</option>{Object.entries(LICENSE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        {num('ltc', 'Max loan to cost (%)')}{num('ret', 'Min return (%)')}{num('term', 'Max term (months)')}{num('track', 'Min developer track (years)')}{num('margin', 'Min developer margin (%)')}{num('pre', 'Min pre-sales (%)')}
      </div>
      <ErrorLine error={act.error} />
      <div className="row"><button className="btn pri" disabled={act.busy || !f.name.trim()} onClick={() => void act.run(async () => {
        const { error } = await supabase.from('investors').update({
          name: f.name.trim(), instruments: f.instruments, geos: f.geos, assets: f.assets, ticket_min: mil(f.tmin), ticket_max: mil(f.tmax), min_license: f.lic || null,
          max_ltc: fr(f.ltc), min_return: fr(f.ret), max_term: toNum(f.term), min_track: toNum(f.track), min_margin: fr(f.margin), min_presales: fr(f.pre),
        }).eq('id', inv.id)
        if (error) throw error
        setSaved(true)
      })}>Save mandate</button>{saved && <span className="ok">Saved</span>}</div>
    </section>
  )
}

function Access({ inv, reload }: { inv: Inv; reload: () => void | Promise<void> }) {
  const act = useAction(reload)
  return (
    <section className="card">
      <h2>Access</h2>
      <p className="muted">Two steps unlock the NDA and the data room.</p>
      <div className="row">
        <Pill tone={inv.declared_qualified_at ? 'good' : 'warn'}>1 · Qualified investor declaration {inv.declared_qualified_at ? `(${when(inv.declared_qualified_at)})` : ''}</Pill>
        <Pill tone={inv.kyc_status === 'passed' ? 'good' : inv.kyc_status === 'failed' ? 'bad' : 'warn'}>2 · KYC {inv.kyc_status}</Pill>
      </div>
      <ErrorLine error={act.error} />
      {!inv.declared_qualified_at && <div><button className="btn pri" disabled={act.busy} onClick={() => void act.run(() => rpc('investor_declare'))}>I declare I am a qualified investor</button></div>}
      {inv.kyc_status !== 'passed' && <span className="muted">KYC is completed by the Cobuildy team after your declaration. You will see the status here.</span>}
    </section>
  )
}

function Feed() {
  const t = useLoad(() => rpc<Teaser[]>('list_teasers'))
  const msgs = useLoad(async () => {
    const ids = (t.data ?? []).map(x => x.deal_id)
    if (!ids.length) return [] as DealMessage[]
    const { data, error } = await supabase.from('deal_messages').select('*').in('deal_id', ids).order('created_at')
    if (error) throw error
    return data as DealMessage[]
  }, [t.data])
  const act = useAction(async () => { await t.reload() })
  const [qs, setQs] = useState<Record<string, string>>({})
  const go = (id: string, action: string, payload: object = {}) => void act.run(() => rpc('deal_action', { p_deal: id, p_action: action, p_payload: payload }))
  return (
    <section className="card">
      <h2>Projects for you</h2>
      <ErrorLine error={act.error ?? t.error ?? msgs.error} />
      {t.data && t.data.length === 0 ? <Empty>No projects yet. Projects matching your mandate will appear here.</Empty> : t.data?.map(x => {
        const ms = (msgs.data ?? []).filter(m => m.deal_id === x.deal_id)
        return (
          <div className="card soft" key={x.deal_id}>
            <div className="row"><b>{x.project_code}</b><span>{GEO[x.geo ?? ''] ?? x.geo} · {ASSET[x.asset ?? ''] ?? x.asset}</span><span className="sp" />
              <Pill tone={x.stage === 'passed' ? 'bad' : 'plan'}>{STAGE_LABEL[x.stage]}</Pill></div>
            <div className="kv">
              <div><span>Instrument</span><span>{x.instrument.map(i => INSTRUMENT[i] ?? i).join(', ') || '—'}</span></div>
              <div><span>Capital sought</span><span>{eur(x.ask_eur)}</span></div><div><span>Total cost</span><span>{eur(x.cost_eur)}</span></div>
              <div><span>Sales value</span><span>{eur(x.gdv_eur)}</span></div><div><span>Margin</span><span>{pct(x.margin)}</span></div>
              <div><span>Permit</span><span>{LICENSE[x.license ?? ''] ?? '—'}</span></div><div><span>Units</span><span>{x.units ?? '—'}</span></div>
              <div><span>Build</span><span>{x.build_months ? `${x.build_months} mo` : '—'}</span></div><div><span>Pre-sales</span><span>{pct(x.presales)}</span></div>
              <div><span>Sponsor track</span><span>{x.sponsor_years ?? '—'} yrs · {x.sponsor_delivered ?? 0} delivered · €{x.sponsor_volume_m ?? 0}M</span></div>
              <div><span>Verified</span><span>{x.sponsor_checks ?? 0} of 4</span></div>
            </div>
            {ms.map(m => <div key={m.id} className={`q ${m.kind === 'answer' ? 'a' : ''}`}><span className="mono">{m.kind}</span><div>{m.body}</div></div>)}
            <div className="row">
              {x.stage === 'sent' && <><button className="btn sm pri" disabled={act.busy} onClick={() => go(x.deal_id, 'interest')}>Express interest</button>
                <button className="btn sm" disabled={act.busy} onClick={() => go(x.deal_id, 'pass', { reason: 'Not for us' })}>Pass</button></>}
              {x.stage === 'nda_sent' && <button className="btn sm pri" disabled={act.busy} onClick={() => go(x.deal_id, 'sign_nda')}>Sign NDA</button>}
              {x.stage === 'shared' && <button className="btn sm" disabled={act.busy} onClick={() => go(x.deal_id, 'pass', { reason: 'Not for us' })}>Pass</button>}
              {x.stage === 'answered' && <button className="btn sm pri" disabled={act.busy} onClick={() => go(x.deal_id, 'request_ts')}>Request term sheet</button>}
            </div>
            {x.stage === 'shared' && <>
              <Field label="Questions, one per line"><textarea rows={3} value={qs[x.deal_id] ?? ''} onChange={e => setQs({ ...qs, [x.deal_id]: e.target.value })} /></Field>
              <div><button className="btn sm pri" disabled={act.busy || !(qs[x.deal_id] ?? '').trim()} onClick={() => go(x.deal_id, 'ask', { questions: (qs[x.deal_id] ?? '').split('\n').map(s => s.trim()).filter(Boolean) })}>Send questions</button></div></>}
          </div>
        )
      })}
    </section>
  )
}

export function Investor() {
  const { profile } = useAuth()
  const me = useLoad(async () => {
    const { data, error } = await supabase.from('investors').select('*').eq('user_id', profile!.id).maybeSingle()
    if (error) throw error
    return data as Inv | null
  })
  if (me.loading) return <span className="muted">Loading…</span>
  if (!me.data) return <><ErrorLine error={me.error} /><Empty>Your investor profile is not set up yet. Contact Cobuildy.</Empty></>
  return <><h1>Investor workspace</h1><Access inv={me.data} reload={me.reload} /><Feed /><Mandate inv={me.data} reload={me.reload} /></>
}
