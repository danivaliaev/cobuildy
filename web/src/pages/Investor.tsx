import { useCallback, useMemo, useState } from 'react'
import { getLang, tr, useT } from '../i18n'
import { useSearchParams } from 'react-router-dom'
import { supabase, rpc, errText } from '../lib/supabase'
import { useAuth } from '../auth'
import { Empty, ErrorLine, Field, Pill, useAction, useLoad } from '../components/ui'
import { MandateChat } from '../components/MandateChat'
import { eur, pct, when } from '../lib/format'
import { downloadDoc, sizeText } from '../lib/docs'
import { InvestorProfileForm } from '../components/InvestorProfileForm'
import { needsProfile, kindLabel, countryName } from '../lib/investorKinds'
import { ASSET, GEO, INSTRUMENT, LICENSE, STAGE_LABEL, type DealMessage, type DealStage, type Investor as Inv, type Teaser } from '../lib/types'
import { FIELDS, FK, SECS, clarity, columnsFor, evalTeaser, fmt, hydrate, unlocks, type Fit, type MKey, type Mandate } from '../lib/mandate'

const kycText = (s: string | null) => (getLang() === 'es' ? ({ passed: 'superada', failed: 'fallida', pending: 'pendiente', none: 'pendiente' } as Record<string, string>)[s ?? ''] ?? s : s)
type Tab = 'feed' | 'deal' | 'pipe' | 'mandate'
interface DealDoc { deal_id: string; doc_id: string; kind: string; title: string; file_name: string | null; size_bytes: number | null; storage_path: string | null }

const FLOW = () => [tr('Interest', 'Interés'), 'NDA', tr('Data room', 'Data room'), tr('Questions', 'Preguntas'), tr('Answers', 'Respuestas'), tr('Term sheet', 'Term sheet')]
const NOW: Partial<Record<DealStage, number>> = { interested: 0, nda_sent: 1, room: 2, shared: 3, qa: 3, answered: 4, ts: 5, call: 5 }
const PIPE = (): Array<[string, string, DealStage[]]> => [['int', tr('Interest', 'Interés'), ['interested', 'nda_sent']], ['dil', tr('Diligence', 'Diligencia'), ['room', 'shared', 'qa', 'answered']], ['dec', tr('Decision', 'Decisión'), ['ts', 'call']], ['off', tr('Passed', 'Descartados'), ['passed']]]
const title = (t: Teaser) => `${ASSET[t.asset ?? ''] ?? t.asset ?? tr('Project', 'Proyecto')} · ${GEO[t.geo ?? ''] ?? t.geo ?? ''}`
const active = (t: Teaser) => t.stage !== 'passed'
/** The sponsor corrected key figures after this investor received the teaser. */
const upd = (t: Teaser) => Boolean(t.changed_at && t.sent_at && t.changed_at > t.sent_at && t.stage !== 'passed')

function FlowBar({ stage }: { stage: DealStage }) {
  const t0 = useT()
  if (stage === 'passed') return <Pill>{t0('Passed', 'Descartado')}</Pill>
  const now = NOW[stage] ?? -1
  return <div className="flow">{FLOW().map((n, i) => <span key={n} className={i < now ? 'd' : i === now ? 'n' : ''}><i />{n}</span>)}</div>
}

function Strip({ fits, inv, m }: { fits: Fit[]; inv: Inv; m: Mandate }) {
  const t0 = useT()
  const live = fits.filter(f => active(f.t))
  const n = (b: Fit['bucket']) => live.filter(f => f.bucket === b).length
  const top = unlocks(live)[0]
  const total = live.length || 1
  const lvl = clarity(m).level
  return (
    <div className="mbar" aria-live="polite">
      <div className="mstat">
        <div className="mnum">{n('match')}<small>/ {live.length}</small></div>
        <div><b>{n('match') === 1 ? t0('project sent to you matches', 'proyecto enviado coincide con') : t0('projects sent to you match', 'proyectos enviados coinciden con')} {t0('your mandate', 'tu mandato')}</b>
          <div className="muted">{lvl === 0 ? t0('Answer a few questions so the right projects reach you', 'Responde unas preguntas para que te lleguen los proyectos adecuados') : t0('Updates with every answer. Open criteria never exclude a project.', 'Se actualiza con cada respuesta. Un criterio abierto nunca excluye un proyecto.')}</div></div>
        {top && <div className="mhint"><b>+{top[1]} {t0('if you relax', 'si lo flexibilizas')}</b><div className="muted">{FK[top[0]].l}</div></div>}
      </div>
      {live.length > 0 && <>
        <div className="mbar-t"><i className="b-fit" style={{ width: `${(n('match') / total) * 100}%` }} /><i className="b-later" style={{ width: `${(n('near') / total) * 100}%` }} /><i className="b-out" style={{ width: `${(n('out') / total) * 100}%` }} /></div>
        <div className="mbar-l"><span><i className="b-fit" />{n('match')} {t0('match', 'coinciden')}</span><span><i className="b-later" />{n('near')} {t0('close, miss one soft criterion', 'cercanos, fallan un criterio blando')}</span><span><i className="b-out" />{n('out')} {t0('outside', 'fuera')}</span></div>
      </>}
      <span className="muted">{inv.name} · {t0('code', 'código')} {inv.code}</span>
    </div>
  )
}

function Card({ f, busy, onOpen, onGo }: { f: Fit; busy: boolean; onOpen: () => void; onGo: (a: string, p?: object) => void }) {
  const t0 = useT()
  const t = f.t
  const good = f.c.filter(c => c.r === 'pass').slice(0, 3); const bad = f.c.filter(c => c.r === 'fail'); const unk = f.c.filter(c => c.r === 'unk')
  const ltc = t.ask_eur != null && t.cost_eur ? t.ask_eur / t.cost_eur : null
  return (
    <article className="pj">
      <button type="button" className="pj-h" onClick={onOpen}>
        <b>{title(t)} <span className="muted">· {t.project_code}</span></b>
        {upd(f.t) && <Pill tone="warn">{t0('Data updated', 'Datos actualizados')}</Pill>}<Pill tone={f.bucket === 'match' ? 'good' : 'plan'}>{t0('Fit', 'Encaje')} {f.fit}%</Pill>
        <span className="meta">{t.instrument.map(i => INSTRUMENT[i] ?? i).join(' / ') || '—'} {eur(t.ask_eur)} · {ltc != null ? `LTC ${pct(ltc)}` : ''} · {t0('margin', 'margen')} {pct(t.margin)} · {LICENSE[t.license ?? ''] ?? t0('permit unknown', 'licencia desconocida')}</span>
      </button>
      <div className="why">
        {good.map(c => <span key={c.k} className="okc">{c.l}</span>)}{bad.map(c => <span key={c.k} className="noc">{c.d}</span>)}{unk.length > 0 && <span className="qc">{unk.length} {t0('criteria open', 'criterios abiertos')}</span>}
      </div>
      <div className="row">
        {t.stage === 'sent' ? <><button className="btn sm pri" disabled={busy} onClick={() => onGo('interest')}>{t0('Express interest', 'Mostrar interés')}</button><button className="btn sm" disabled={busy} onClick={() => onGo('pass', { reason: 'Not for us' })}>{t0('Pass', 'Descartar')}</button></>
          : <Pill tone={t.stage === 'passed' ? 'bad' : 'plan'}>{STAGE_LABEL[t.stage]}</Pill>}
        <span className="sp" /><button className="btn sm" onClick={onOpen}>{t0('Open review →', 'Abrir análisis →')}</button>
      </div>
    </article>
  )
}

function Review({ f, inv, docs, msgs, busy, go, reloadInv }: { f: Fit; inv: Inv; docs: DealDoc[]; msgs: DealMessage[]; busy: boolean; go: (id: string, a: string, p?: object) => void; reloadInv: () => void | Promise<void> }) {
  const t0 = useT()
  const t = f.t
  const [qs, setQs] = useState('')
  const decl = useAction(reloadInv)
  const dl = useAction()
  const getDoc = (d: DealDoc) => dl.run(() => downloadDoc(d.storage_path!, d.file_name, d.doc_id))
  const access = Boolean(inv.declared_qualified_at) && inv.kyc_status === 'passed'
  const ltc = t.ask_eur != null && t.cost_eur ? t.ask_eur / t.cost_eur : null
  const room = ['room', 'shared', 'qa', 'answered', 'ts', 'call'].includes(t.stage)
  const strengths = f.c.filter(c => c.r === 'pass').slice(0, 2).map(c => c.d)
  const concerns = f.c.filter(c => c.r === 'fail').map(c => c.d.toLowerCase())
  const read = [
    strengths.length ? `${t0('Strengths', 'Puntos fuertes')}: ${strengths.join('; ')}.` : '',
    t0(`Sponsor: ${t.sponsor_years ?? '—'} years on the market, ${t.sponsor_delivered ?? 0} projects delivered, ${t.sponsor_checks ?? 0} of 4 checks passed.`, `Promotor: ${t.sponsor_years ?? '—'} años en el mercado, ${t.sponsor_delivered ?? 0} proyectos entregados, ${t.sponsor_checks ?? 0} de 4 verificaciones superadas.`),
    concerns.length ? `${t0('Concerns', 'Reservas')}: ${concerns.join('; ')}.` : t0('Nothing in the teaser goes against your mandate.', 'Nada en el teaser va en contra de tu mandato.'),
    t.margin != null && t.margin < 0.1 ? t0('The developer margin on cost is thin, so ask how costs are fixed.', 'El margen del promotor sobre coste es estrecho: pregunta cómo se fijan los costes.') : '',
  ].filter(Boolean)
  const kv: Array<[string, string]> = [
    [t0('Instrument', 'Instrumento'), t.instrument.map(i => INSTRUMENT[i] ?? i).join(', ') || '—'], [t0('Capital sought', 'Capital solicitado'), eur(t.ask_eur)], [t0('Loan to cost', 'Préstamo sobre coste'), pct(ltc)],
    [t0('Total cost', 'Coste total'), eur(t.cost_eur)], [t0('Sales value (GDV)', 'Valor de venta (GDV)'), eur(t.gdv_eur)], [t0('Developer margin', 'Margen del promotor'), pct(t.margin)],
    [t0('Permit', 'Licencia'), LICENSE[t.license ?? ''] ?? '—'], [t0('Units', 'Viviendas'), t.units != null ? `${t.units}${t.presales != null ? ` · ${pct(t.presales)} ${t0('pre-sold', 'preventa')}` : ''}` : '—'], [t0('Build', 'Obra'), t.build_months ? `${t.build_months} ${t0('months', 'meses')}` : '—'],
  ]
  return (
    <>
      <section className="card">
        <div className="row"><span className="mono">{t.project_code} · {title(t)}</span><span className="sp" />{upd(t) && <Pill tone="warn">{t0('Data updated', 'Datos actualizados')}</Pill>}<Pill tone={f.bucket === 'match' ? 'good' : 'plan'}>{t0('Fit', 'Encaje')} {f.fit}%</Pill></div>
        <h3>{title(t)}, {t.instrument.map(i => (INSTRUMENT[i] ?? i).toLowerCase()).join(' / ')} {eur(t.ask_eur)}</h3>
        <FlowBar stage={t.stage} />
        <div className="kv">{kv.map(([k, v]) => <div key={k}><span>{k}</span><span>{v}</span></div>)}</div>
        <div className="row">
          {t.stage === 'sent' && <><button className="btn sm pri" disabled={busy} onClick={() => go(t.deal_id, 'interest')}>{t0('Express interest', 'Mostrar interés')}</button><button className="btn sm" disabled={busy} onClick={() => go(t.deal_id, 'pass', { reason: 'Not for us' })}>{t0('Pass', 'Descartar')}</button></>}
          {t.stage === 'interested' && <span className="muted">{t0('Interest registered. The developer decides whether to open an NDA.', 'Interés registrado. El promotor decide si abre un NDA.')}</span>}
          {t.stage === 'nda_sent' && (t.nda_inv_signed
            ? <span className="muted">{t0('You signed the NDA. Waiting for the developer to sign, then the data room opens.', 'Has firmado el NDA. Esperamos la firma del promotor y luego se abre el data room.')}</span>
            : <button className="btn sm plan" disabled={busy || !access} onClick={() => go(t.deal_id, 'sign_nda')}>{t0('Sign NDA and open the data room', 'Firmar el NDA y abrir el data room')}</button>)}
          {t.stage === 'nda_sent' && !t.nda_inv_signed && t.nda_dev_signed && <span className="muted">{t0('The developer has signed.', 'El promotor ya ha firmado.')}</span>}
          {t.stage === 'room' && <span className="muted">{t0('NDA signed. The developer is choosing which documents to share.', 'NDA firmado. El promotor elige qué documentos compartir.')}</span>}
          {t.stage === 'answered' && <button className="btn sm plan" disabled={busy} onClick={() => go(t.deal_id, 'request_ts')}>{t0('Request a term sheet discussion', 'Solicitar conversación sobre el term sheet')}</button>}
          {t.stage === 'ts' && <span className="muted">{t0('Term sheet discussion requested. The developer confirms a call slot.', 'Conversación sobre el term sheet solicitada. El promotor confirma una hora de llamada.')}</span>}
          {t.stage === 'call' && <Pill tone="good">{t0('Call confirmed', 'Llamada confirmada')}</Pill>}
          {['interested', 'nda_sent', 'room', 'shared', 'qa', 'answered'].includes(t.stage) && <button className="btn sm" disabled={busy} onClick={() => go(t.deal_id, 'pass', { reason: 'Not for us' })}>{t0('Pass', 'Descartar')}</button>}
        </div>
        {t.stage === 'nda_sent' && !t.nda_inv_signed && !access && (
          <div className="accbox">
            <b>{t0('Before you sign the NDA, two quick steps', 'Antes de firmar el NDA, dos pasos rápidos')}</b>
            <div className="row"><Pill tone={inv.declared_qualified_at ? 'good' : 'warn'}>{inv.declared_qualified_at ? '✓ ' : '1 '}{t0('Qualified investor declaration', 'Declaración de inversor cualificado')}</Pill>
              {!inv.declared_qualified_at && <button className="btn sm pri" disabled={decl.busy} onClick={() => void decl.run(() => rpc('investor_declare'))}>{t0('I declare I am a qualified investor', 'Declaro que soy inversor cualificado')}</button>}</div>
            <div className="row"><Pill tone={inv.kyc_status === 'passed' ? 'good' : inv.kyc_status === 'failed' ? 'bad' : 'warn'}>{inv.kyc_status === 'passed' ? '✓ ' : '2 '}{t0('Identity check', 'Verificación de identidad')}: {kycText(inv.kyc_status)}</Pill>
              {inv.kyc_status !== 'passed' && <span className="muted">{t0('Completed by the Cobuildy team after your declaration.', 'La completa el equipo de Cobuildy tras tu declaración.')}</span>}</div>
            <ErrorLine error={decl.error} />
          </div>
        )}
      </section>

      <div className="cols2">
        <section className="card">
          <h3>{t0('Fit with your mandate', 'Encaje con tu mandato')}</h3>
          {f.c.length ? f.c.map(c => <div className="ck" key={c.k}><i className={c.r}>{c.r === 'pass' ? '✓' : c.r === 'fail' ? '✕' : '?'}</i><span>{c.l} <em>· {c.d}</em></span></div>) : <span className="muted">{t0('Set your mandate to see the check.', 'Define tu mandato para ver la comprobación.')}</span>}
        </section>
        <section className="card">
          <h3>{t0('Agent’s read', 'Lectura del agente')}</h3>
          <ul className="readlist">{read.map(r => <li key={r}>{r}</li>)}</ul>
        </section>
      </div>

      <section className="card">
        <div className="row"><h3>{t0('Sponsor', 'Promotor')}</h3><span className="sp" /><span className="mono">{room ? t0('Identity revealed under the NDA', 'Identidad revelada bajo NDA') : t0('Anonymous until the NDA', 'Anónimo hasta el NDA')}</span></div>
        <div className="kv">
          <div><span>{t0('Years on the market', 'Años en el mercado')}</span><span>{t.sponsor_years ?? '—'}</span></div><div><span>{t0('Projects delivered', 'Proyectos entregados')}</span><span>{t.sponsor_delivered ?? 0}</span></div>
          <div><span>{t0('Volume delivered', 'Volumen entregado')}</span><span>{getLang() === 'es' ? `${t.sponsor_volume_m ?? 0} M€` : `€${t.sponsor_volume_m ?? 0}M`}</span></div><div><span>{t0('Verified by Cobuildy', 'Verificado por Cobuildy')}</span><span>{t.sponsor_checks ?? 0} {t0('of', 'de')} 4</span></div>
        </div>
      </section>

      <section className="card">
        <div className="row"><h3>Data room</h3><span className="sp" /><span className="mono">{docs.length ? `${docs.length} ${t0('shared', 'compartidos')}` : room ? t0('Open', 'Abierto') : t0('Locked until you sign the NDA', 'Bloqueado hasta firmar el NDA')}</span></div>
        <ErrorLine error={dl.error} />
        {docs.length ? docs.map(d => <div className="row" key={d.doc_id}><Pill>{d.kind === 'Checklist' ? t0('Document', 'Documento') : d.kind}</Pill><span className="sp"><span>{d.title}</span>{d.file_name && <span className="muted small dtag">{d.file_name} · {sizeText(d.size_bytes)}</span>}</span>
          {d.storage_path ? <button className="btn sm" type="button" disabled={busy} onClick={() => void getDoc(d)}>{t0('Download', 'Descargar')}</button> : <span className="muted">{t0('No file', 'Sin archivo')}</span>}</div>)
          : <span className="muted">{room ? t0('The developer has not shared documents yet.', 'El promotor aún no ha compartido documentos.') : t0('Documents appear here after the NDA is signed by both sides and the developer shares them.', 'Los documentos aparecen aquí cuando ambas partes firman el NDA y el promotor los comparte.')}</span>}
      </section>

      <section className="card">
        <div className="row"><h3>{t0('Questions for the sponsor', 'Preguntas para el promotor')}</h3><span className="sp" /><span className="mono">{t0('You send them, the developer answers', 'Tú las envías, el promotor responde')}</span></div>
        {msgs.length > 0 ? msgs.map(m => <div key={m.id} className={`q ${m.kind === 'answer' ? 'a' : ''}`}><span className="mono">{m.kind === 'answer' ? t0('Sponsor', 'Promotor') : t0('You', 'Tú')} · {when(m.created_at)}</span><div>{m.body}</div></div>) : null}
        {t.stage === 'shared' ? <>
          <Field label={t0('Questions, one per line', 'Preguntas, una por línea')}><textarea rows={3} value={qs} onChange={e => setQs(e.target.value)} placeholder={t0('For example: What is the exit route if sales slow by six months?', 'Por ejemplo: ¿Cuál es la vía de salida si las ventas se retrasan seis meses?')} /></Field>
          <div><button className="btn sm pri" disabled={busy || !qs.trim()} onClick={() => { go(t.deal_id, 'ask', { questions: qs.split('\n').map(s => s.trim()).filter(Boolean) }); setQs('') }}>{t0('Send questions', 'Enviar preguntas')}</button></div>
        </> : msgs.length === 0 && <span className="muted">{t.stage === 'qa' ? t0('Sent. Waiting for the sponsor.', 'Enviadas. Esperamos al promotor.') : t0('Questions unlock once the developer shares the data room documents.', 'Las preguntas se habilitan cuando el promotor comparte los documentos del data room.')}</span>}
      </section>
    </>
  )
}

function Board({ fits, onOpen }: { fits: Fit[]; onOpen: (id: string) => void }) {
  const t0 = useT()
  const items = fits.filter(f => f.t.stage !== 'sent')
  if (!items.length) return <section className="card"><Empty>{t0('Your pipeline is empty. Express interest in a project under Matches to start.', 'Tu pipeline está vacío. Muestra interés en un proyecto en Coincidencias para empezar.')}</Empty></section>
  return (
    <section className="card">
      <p className="muted">{t0('Every move is yours. The developer moves their side, and the agent prepares what is next.', 'Cada paso es tuyo. El promotor mueve su parte y el agente prepara lo siguiente.')}</p>
      <div className="board">{PIPE().map(([id, n, ss]) => {
        const l = items.filter(f => ss.includes(f.t.stage))
        return (
          <div className={`bcol${id === 'off' ? ' off' : ''}`} key={id}>
            <h4>{n}<span>{l.length}</span></h4>
            {l.length === 0 && <div className="none">{t0('No deals', 'Sin operaciones')}</div>}
            {l.map(f => <button key={f.t.deal_id} type="button" className="bcard" onClick={() => onOpen(f.t.deal_id)}><b>{title(f.t)}</b><span>{eur(f.t.ask_eur)}</span><span className="st">{STAGE_LABEL[f.t.stage]}</span></button>)}
          </div>
        )
      })}</div>
    </section>
  )
}

function ProfileBox({ inv, reload, banner }: { inv: Inv; reload: () => void | Promise<void>; banner?: boolean }) {
  const t0 = useT()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hidden, setHidden] = useState(() => { try { return sessionStorage.getItem('cb.ipf.skip') === '1' } catch { return false } })
  const need = needsProfile(inv)
  if (banner && (!need || hidden) && !open) return null
  const save = async (v: { kind: string; country: string; name: string; phone: string }) => {
    setBusy(true); setError(null)
    const { error: err } = await supabase.rpc('update_investor_profile', { p_name: v.name, p_kind: v.kind, p_country: v.country, p_phone: v.phone })
    setBusy(false)
    if (err) { setError(errText(err.message)); return }
    setOpen(false); await reload()
  }
  const form = <InvestorProfileForm initial={{ kind: (inv.kind ?? '') as never, country: inv.country ?? '', name: inv.name, phone: inv.phone ?? '' }} submitLabel={t0('Save', 'Guardar')} busy={busy} error={error} onSubmit={save} onCancel={() => setOpen(false)} />
  if (open) return <section className="card"><h2>{t0('Your investor profile', 'Tu perfil de inversor')}</h2>{form}</section>
  if (banner) return (
    <div className="ibanner" role="status"><span className="sp"><b>{t0('Complete your profile.', 'Completa tu perfil.')}</b> {t0('Tell us your investor type, country and phone so developers know who they are talking to.', 'Cuéntanos tu tipo de inversor, país y teléfono para que los promotores sepan con quién hablan.')}</span>
      <button className="btn pri" type="button" onClick={() => setOpen(true)}>{t0('Complete profile', 'Completar perfil')}</button>
      <button className="btn" type="button" onClick={() => { setHidden(true); try { sessionStorage.setItem('cb.ipf.skip', '1') } catch { /* ignore */ } }}>{t0('Later', 'Más tarde')}</button></div>)
  return (
    <section className="card">
      <div className="row"><h2>{t0('Your investor profile', 'Tu perfil de inversor')}</h2><span className="sp" /><button className="chipbtn" type="button" onClick={() => setOpen(true)}>{t0('Edit', 'Editar')}</button></div>
      <div className="prow"><span className="pic f" aria-hidden="true">✓</span><span className="plab">{t0('Type', 'Tipo')}</span><span className="pval">{kindLabel(inv.kind)}</span><span /></div>
      <div className="prow"><span className="pic f" aria-hidden="true">✓</span><span className="plab">{t0('Country', 'País')}</span><span className="pval">{countryName(inv.country)}</span><span /></div>
      <div className="prow"><span className="pic f" aria-hidden="true">✓</span><span className="plab">{t0('Name', 'Nombre')}</span><span className="pval">{inv.name}</span><span /></div>
      <div className="prow"><span className="pic f" aria-hidden="true">✓</span><span className="plab">{t0('Phone', 'Teléfono')}</span><span className="pval">{inv.phone ?? '—'}</span><span /></div>
    </section>
  )
}

function MandateTab({ m, fits, onAsk }: { m: Mandate; fits: Fit[]; onAsk: (k: MKey) => void }) {
  const t0 = useT()
  const un = Object.fromEntries(unlocks(fits.filter(f => active(f.t)))) as Partial<Record<MKey, number>>
  return (
    <section className="card profilecard">
      <div className="row"><h2>{t0('Your mandate', 'Tu mandato')}</h2><span className="sp" /><span className="pill plan">{t0('Fills as you talk', 'Se completa mientras hablas')}</span></div>
      <p className="muted">{t0('Region, asset type, instrument, ticket size and earliest stage are hard filters: a project outside them never reaches you. The rest only changes the ranking.', 'Zona, tipo de activo, instrumento, tamaño de ticket y fase más temprana son filtros duros: un proyecto fuera de ellos nunca te llega. El resto solo cambia el orden.')}</p>
      {SECS.map(([id, name]) => {
        const fs = FIELDS.filter(f => f.s === id)
        const done = fs.filter(f => m.st[f.k] === 'filled' || m.st[f.k] === 'na').length
        return (
          <section className="psec" key={id}>
            <div className="psec-h"><h3>{name}</h3><span className="bar sm"><i style={{ width: `${(done / fs.length) * 100}%` }} /></span><span className="mono">{done}/{fs.length}</span></div>
            {fs.map(f => {
              const st = m.st[f.k]; const v = fmt(m, f.k)
              return (
                <div className="prow" key={f.k}>
                  <span className={`pic ${st === 'filled' ? 'f' : st === 'unknown' ? 'u' : ''}`} aria-hidden="true">{st === 'filled' ? '✓' : st === 'unknown' ? '!' : ''}</span>
                  <span className="plab">{f.l}</span>
                  <span className="pval">{v ? v : <span className="muted">{st === 'unknown' ? t0('Not sure yet', 'Aún no lo sé') : t0('Not answered', 'Sin responder')}</span>}
                    {un[f.k] ? <span className="pgap">{t0(`Relaxing this adds ${un[f.k]} project${un[f.k] === 1 ? '' : 's'}`, `Flexibilizarlo suma ${un[f.k]} proyecto${un[f.k] === 1 ? '' : 's'}`)}</span> : null}</span>
                  {st === 'na' ? <span /> : <span className="pact"><button className="chipbtn" type="button" onClick={() => onAsk(f.k)}>{st === 'filled' ? t0('Change', 'Cambiar') : t0('Answer', 'Responder')}</button></span>}
                </div>
              )
            })}
          </section>
        )
      })}
    </section>
  )
}

interface Prop { id: string; h: string; d: string; deal: string }
function Status({ m, inv, fits, props, onOpen, onDismiss, onAsk, reloadInv }: {
  m: Mandate; inv: Inv; fits: Fit[]; props: Prop[]; onOpen: (id: string) => void; onDismiss: (id: string) => void; onAsk: (k: MKey) => void; reloadInv: () => void | Promise<void>
}) {
  const t0 = useT()
  const c = clarity(m)
  const act = useAction(reloadInv)
  const hints = unlocks(fits.filter(f => active(f.t))).slice(0, 2)
  const open = FIELDS.filter(f => m.st[f.k] === undefined).length
  const C = 2 * Math.PI * 40
  const level = [t0('Mandate not set', 'Mandato sin definir'), t0('Screening is on', 'Filtrado activo'), t0('Sharp mandate', 'Mandato preciso')][c.level]
  const access = Boolean(inv.declared_qualified_at) && inv.kyc_status === 'passed'
  const signed = fits.filter(f => ['room', 'shared', 'qa', 'answered', 'ts', 'call'].includes(f.t.stage)).length
  return (
    <aside className="card readycard" aria-label={t0('Status', 'Estado')}>
      <div className="vtop">
        <div className="ring"><svg viewBox="0 0 92 92" aria-hidden="true"><circle cx="46" cy="46" r="40" fill="none" stroke="var(--line)" strokeWidth="7" /><circle cx="46" cy="46" r="40" fill="none" stroke="var(--plan)" strokeWidth="7" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - c.score / 100)} transform="rotate(-90 46 46)" /></svg><div className="n">{c.score}</div></div>
        <div><span className="mono">{t0('Mandate clarity', 'Claridad del mandato')}</span><h2>{level}</h2><span className="muted">{t0('Draft index, not a rating', 'Índice orientativo, no una calificación')}</span></div>
      </div>
      <div className="ladder four">{[t0('Mandate', 'Mandato'), t0('Screening', 'Filtrado'), t0('Sharp', 'Preciso'), t0('Access', 'Acceso')].map((n, i) => <div key={i} className={(i === 0 && c.score > 0) || (i === 1 && c.level >= 1) || (i === 2 && c.level >= 2) || (i === 3 && access) ? 'on' : ''}><i />{n}</div>)}</div>

      <div className="blk">
        <span className="mono">{t0('Waiting for you', 'Esperando tu respuesta')} · {props.length}</span>
        {props.length ? props.map(x => (
          <div className="item todo" key={x.id}>
            <b>{x.h}</b><span className="muted">{x.d}</span>
            <div className="row"><button className="btn sm pri" onClick={() => onOpen(x.deal)}>{t0('Open', 'Abrir')}</button><button className="btn sm" onClick={() => onDismiss(x.id)}>{t0('Not now', 'Ahora no')}</button></div>
          </div>
        )) : <span className="muted">{t0('Nothing waiting. I will propose the next step when there is one.', 'Nada pendiente. Te propondré el siguiente paso cuando lo haya.')}</span>}
      </div>

      <div className="blk">
        <span className="mono">{t0('Sharpen your mandate', 'Afina tu mandato')}</span>
        {hints.map(([k, n]) => <button key={k} type="button" className="item" onClick={() => onAsk(k)}><b>{t0('Relax', 'Flexibiliza')} “{FK[k].l}” <Pill tone="plan">+{n}</Pill></b><span className="muted">{t0(`${n} project${n === 1 ? ' misses' : 's miss'} only on this criterion.`, `${n} proyecto${n === 1 ? ' falla' : 's fallan'} solo en este criterio.`)}</span></button>)}
        {open > 0 ? <span className="muted">{t0(`${open} open ${open === 1 ? 'criterion' : 'criteria'}. Open criteria never exclude a project.`, `${open} ${open === 1 ? 'criterio abierto' : 'criterios abiertos'}. Un criterio abierto nunca excluye un proyecto.`)}</span> : !hints.length && <span className="muted">{t0('Nothing to sharpen right now.', 'Nada que afinar ahora mismo.')}</span>}
      </div>

      <div className="blk">
        <span className="mono">{t0('Access', 'Acceso')}</span>
        <div className="acc"><Pill tone={inv.declared_qualified_at ? 'good' : 'warn'}>{inv.declared_qualified_at ? '✓' : '1'} {t0('Qualified investor declaration', 'Declaración de inversor cualificado')}</Pill>
          {inv.declared_qualified_at ? <span className="muted">{when(inv.declared_qualified_at)}</span> : <button className="btn sm pri" disabled={act.busy} onClick={() => void act.run(() => rpc('investor_declare'))}>{t0('Declare', 'Declarar')}</button>}</div>
        <div className="acc"><Pill tone={inv.kyc_status === 'passed' ? 'good' : inv.kyc_status === 'failed' ? 'bad' : 'warn'}>{inv.kyc_status === 'passed' ? '✓' : '2'} {t0('Identity check', 'Verificación de identidad')}: {kycText(inv.kyc_status)}</Pill>
          {inv.kyc_status !== 'passed' && <span className="muted">{t0('Done by the Cobuildy team after your declaration.', 'La realiza el equipo de Cobuildy tras tu declaración.')}</span>}</div>
        <div className="acc"><Pill>3 {t0('NDA for each project', 'NDA por cada proyecto')}</Pill><span className="muted">{signed} {t0('signed', 'firmados')}</span></div>
        <ErrorLine error={act.error} />
      </div>
      <p className="muted">{t0('The agent recommends and prepares. You confirm every step. Cobuildy is an introducer and does not give investment advice.', 'El agente recomienda y prepara. Tú confirmas cada paso. Cobuildy es un introductor y no presta asesoramiento de inversión.')}</p>
    </aside>
  )
}

function Workspace({ inv, reload }: { inv: Inv; reload: () => void | Promise<void> }) {
  const t0 = useT()
  const [sp, setSp] = useSearchParams()
  const [m, setM] = useState(() => hydrate(inv))
  const [askReq, setAskReq] = useState<{ key: MKey; n: number } | null>(null)
  const [dismissed, setDismissed] = useState<string[]>([])
  const [filter, setFilter] = useState<'all' | 'new' | 'progress' | 'near' | 'passed'>('all')
  const teasers = useLoad(() => rpc<Teaser[]>('list_teasers'))
  const docs = useLoad(() => rpc<DealDoc[]>('my_deal_docs'))
  const msgs = useLoad(async () => {
    const ids = (teasers.data ?? []).map(x => x.deal_id)
    if (!ids.length) return [] as DealMessage[]
    const { data, error } = await supabase.from('deal_messages').select('*').in('deal_id', ids).order('created_at')
    if (error) throw error
    return data as DealMessage[]
  }, [teasers.data])
  const act = useAction(async () => { await Promise.all([teasers.reload(), docs.reload()]) })

  const tab = (['feed', 'deal', 'pipe', 'mandate'] as const).find(t => t === sp.get('tab')) ?? 'feed'
  const sel = sp.get('deal')
  const setTab = (t: Tab, deal?: string | null) => { const n = new URLSearchParams(); if (t !== 'feed') n.set('tab', t); if (deal) n.set('deal', deal); setSp(n, { replace: true }) }
  const openDeal = (id: string) => { setTab('deal', id); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  const commit = useCallback(async (next: Mandate) => {
    const prev = m
    setM(next)
    const { error } = await supabase.from('investors').update(columnsFor(next)).eq('id', inv.id)
    if (error) { setM(prev); throw new Error(error.message) }
  }, [m, inv.id])

  const fits = useMemo(() => (teasers.data ?? []).map(t => evalTeaser(m, t)), [m, teasers.data])
  const go = (id: string, action: string, payload: object = {}) => void act.run(() => rpc('deal_action', { p_deal: id, p_action: action, p_payload: payload }))
  const ask = (key: MKey) => { setAskReq({ key, n: Date.now() }); document.getElementById('agent-chat')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }

  const props: Prop[] = fits.flatMap<Prop>(f => {
    const t = f.t; const o: Prop[] = []
    if (t.stage === 'sent' && f.bucket === 'match' && f.fit >= 80) o.push({ id: `rv:${t.deal_id}`, deal: t.deal_id, h: t0(`Review ${t.project_code} · ${title(t)}`, `Revisa ${t.project_code} · ${title(t)}`), d: t0(`Fit ${f.fit}% and nothing outside your mandate.`, `Encaje del ${f.fit} % y nada fuera de tu mandato.`) })
    if (t.stage === 'nda_sent' && !t.nda_inv_signed) o.push({ id: `nda:${t.deal_id}`, deal: t.deal_id, h: t0(`Sign the NDA for ${t.project_code}`, `Firma el NDA de ${t.project_code}`), d: t0('Opens the data room. Needs your declaration and identity check.', 'Abre el data room. Requiere tu declaración y la verificación de identidad.') })
    if (t.stage === 'shared') o.push({ id: `qa:${t.deal_id}`, deal: t.deal_id, h: t0(`Documents shared for ${t.project_code}`, `Documentos compartidos de ${t.project_code}`), d: t0('Read them and send your questions to the sponsor.', 'Léelos y envía tus preguntas al promotor.') })
    if (t.stage === 'answered') o.push({ id: `ts:${t.deal_id}`, deal: t.deal_id, h: t0(`Request a term sheet discussion for ${t.project_code}`, `Solicita hablar del term sheet de ${t.project_code}`), d: t0('The sponsor answered. I recommend a call.', 'El promotor ha respondido. Recomiendo una llamada.') })
    return o
  }).filter(x => !dismissed.includes(x.id)).slice(0, 4)

  const live = fits.filter(f => active(f.t))
  const kpi: Array<[number, string, string]> = [
    [live.filter(f => f.bucket === 'match').length, t0('Matching', 'Coinciden'), t0(`of ${live.length} sent to you`, `de ${live.length} enviados`)], [live.filter(f => f.t.stage === 'sent').length, t0('New', 'Nuevos'), t0('not reviewed', 'sin revisar')],
    [live.filter(f => ['interested', 'nda_sent', 'room', 'shared', 'qa', 'answered'].includes(f.t.stage)).length, t0('In diligence', 'En diligencia'), ''], [live.filter(f => ['ts', 'call'].includes(f.t.stage)).length, t0('Decision', 'Decisión'), t0('term sheet talk', 'term sheet')], [props.length, t0('Awaiting you', 'Esperan tu respuesta'), t0('agent proposals', 'propuestas del agente')],
  ]
  const sets = {
    all: fits.filter(f => active(f.t) && f.bucket === 'match'), new: fits.filter(f => f.t.stage === 'sent'),
    progress: fits.filter(f => f.t.stage !== 'sent' && active(f.t)), near: fits.filter(f => active(f.t) && f.bucket !== 'match'), passed: fits.filter(f => !active(f.t)),
  }
  const labels: Array<[keyof typeof sets, string]> = [['all', t0('Matching', 'Coinciden')], ['new', t0('New', 'Nuevos')], ['progress', t0('In progress', 'En curso')], ['near', t0('Close or outside', 'Cercanos o fuera')], ['passed', t0('Passed', 'Descartados')]]
  const list = sets[filter]
  const lvl = clarity(m).level
  const selFit = fits.find(f => f.t.deal_id === sel)

  return (
    <>
      <ProfileBox inv={inv} reload={reload} banner />
      <Strip fits={fits} inv={inv} m={m} />
      <div className="pgrid">
        <div id="agent-chat" className="pcol"><MandateChat mandate={m} commit={commit} askReq={askReq} /></div>
        <div className="pmain">
          <div className="tabs" role="tablist">
            {([['feed', t0('Matches', 'Coincidencias')], ['deal', t0('Deal review', 'Análisis')], ['pipe', 'Pipeline'], ['mandate', t0('Mandate', 'Mandato')]] as Array<[Tab, string]>).map(([k, l]) =>
              <button key={k} type="button" role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k, k === 'deal' ? sel : null)}>{l}{k === 'feed' && sets.all.length > 0 && <em>{sets.all.length}</em>}</button>)}
          </div>
          <div className="kpis">{kpi.map(([v, l, s]) => <div className="kpi" key={l}><div className="v">{v}</div><div className="l">{l}</div><div className="s">{s || ' '}</div></div>)}</div>
          <ErrorLine error={act.error ?? teasers.error ?? msgs.error ?? docs.error} />

          {tab === 'feed' && (
            <section className="card">
              {lvl === 0 && fits.length === 0 ? <Empty>{t0('Screening has not started. Tell the agent where, what and how much you invest. Developers send teasers to investors whose mandate fits.', 'El filtrado aún no ha empezado. Cuéntale al agente dónde, en qué y cuánto inviertes. Los promotores envían teasers a los inversores cuyo mandato encaja.')}</Empty> : <>
                <p className="muted">{t0('Ranked by fit with your mandate. I recommend, you decide. Nothing goes further without your confirmation.', 'Ordenados por encaje con tu mandato. Yo recomiendo, tú decides. Nada avanza sin tu confirmación.')}</p>
                <div className="fseg">{labels.map(([k, l]) => <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l} <b>{sets[k].length}</b></button>)}</div>
                {list.length ? [...list].sort((a, b) => b.fit - a.fit).map(f => <Card key={f.t.deal_id} f={f} busy={act.busy} onOpen={() => openDeal(f.t.deal_id)} onGo={(a, p) => go(f.t.deal_id, a, p)} />)
                  : <Empty>{teasers.loading ? t0('Loading…', 'Cargando…') : filter === 'all' ? t0('No project sent to you matches yet. New teasers appear here as developers send them.', 'Ningún proyecto enviado coincide todavía. Los nuevos teasers aparecen aquí cuando los promotores los envían.') : t0('Nothing here yet.', 'Aún no hay nada aquí.')}</Empty>}
              </>}
            </section>
          )}
          {tab === 'deal' && (selFit
            ? <Review f={selFit} inv={inv} docs={(docs.data ?? []).filter(d => d.deal_id === selFit.t.deal_id)} msgs={(msgs.data ?? []).filter(x => x.deal_id === selFit.t.deal_id)} busy={act.busy} go={go} reloadInv={reload} />
            : <section className="card"><Empty>{t0('Pick a project under Matches to review it here: fit with your mandate, numbers, sponsor, data room and questions.', 'Elige un proyecto en Coincidencias para analizarlo aquí: encaje con tu mandato, cifras, promotor, data room y preguntas.')}</Empty></section>)}
          {tab === 'pipe' && <Board fits={fits} onOpen={openDeal} />}
          {tab === 'mandate' && <><ProfileBox inv={inv} reload={reload} /><MandateTab m={m} fits={fits} onAsk={k => { ask(k) }} /></>}
        </div>
        <Status m={m} inv={inv} fits={fits} props={props} onOpen={openDeal} onDismiss={id => setDismissed(d => [...d, id])} onAsk={ask} reloadInv={reload} />
      </div>
    </>
  )
}

export function Investor() {
  const t0 = useT()
  const { profile } = useAuth()
  const me = useLoad(async () => {
    const { data, error } = await supabase.from('investors').select('*').eq('user_id', profile!.id).maybeSingle()
    if (error) throw error
    return data as Inv | null
  })
  if (me.loading) return <span className="muted">{t0('Loading…', 'Cargando…')}</span>
  if (!me.data) return <><ErrorLine error={me.error} /><Empty>{t0('Your investor profile is not set up yet. Contact Cobuildy.', 'Tu perfil de inversor aún no está configurado. Contacta con Cobuildy.')}</Empty></>
  return <><h1>{t0('Investor workspace', 'Espacio del inversor')}</h1><Workspace inv={me.data} reload={me.reload} /></>
}
