import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase, rpc } from '../lib/supabase'
import { Empty, ErrorLine, Field, Pill, useAction, useLoad } from '../components/ui'
import { ProfileChat } from '../components/ProfileChat'
import { ProfileView } from '../components/ProfileView'
import { ReadinessPanel } from '../components/ReadinessPanel'
import { Welcome } from '../components/Welcome'
import { clearWelcome } from '../lib/carry'
import { useAuth } from '../auth'
import { DataRoom } from '../components/DataRoom'
import { DropCard } from '../components/DropCard'
import { ReviewDialog } from '../components/ReviewDialog'
import { BudgetCard } from '../components/BudgetCard'
import { useIngest, type Job, type Target } from '../components/useIngest'
import { downloadDoc } from '../lib/docs'
import { budgetUpdates, hydrateEcon, type BudgetLine, type Econ } from '../lib/budget'
import type { Applied, DocRead, ReadItem } from '../lib/ingest'
import { FIELDS, applyUpdates, blank, calc, columnsFor, isDone, nextField, hydrate, keyChanges, patchFor, strategyCode, type FieldState, type Fields } from '../lib/profile'
import { kindLabel, countryName } from '../lib/investorKinds'
import { useT, tr } from '../i18n'
import { CHANNEL, STAGE_LABEL, type DealMessage, type Match, type Project, type ProjectDeal, type ProjectDoc } from '../lib/types'

type Tab = 'profile' | 'investors' | 'room'

export function ProjectPage() {
  const t0 = useT()
  const { id = '' } = useParams()
  const proj = useLoad(async () => {
    const { data, error } = await supabase.from('projects').select('*').eq('id', id).single()
    if (error) throw error
    return data as Project
  }, [id])
  const docs = useLoad(async () => {
    const { data, error } = await supabase.from('project_docs').select('id,project_id,kind,title,storage_path,file_name,size_bytes,field_key').eq('project_id', id).order('created_at')
    if (error) throw error
    return data as ProjectDoc[]
  }, [id])
  const reads = useLoad(async () => {
    const { data, error } = await supabase.from('doc_reads').select('*').eq('project_id', id)
    if (error) throw error
    return data as DocRead[]
  }, [id])
  const canEdit = proj.data ? !['discarded', 'closed_won', 'closed_lost'].includes(proj.data.status) : false
  const ingest = useIngest(id, async () => { await Promise.all([docs.reload(), reads.reload()]) }, canEdit)
  const [econ, setEcon] = useState<Econ | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [fields, setFields] = useState<Fields | null>(null)
  const [dbStage, setDbStage] = useState(0)
  const [flash, setFlash] = useState<string[]>([])
  const [askReq, setAskReq] = useState<{ key: string; n: number } | null>(null)
  const submit = useAction(async () => { await proj.reload() })
  const [sp, setSp] = useSearchParams()
  const tab: Tab = (['profile', 'investors', 'room'] as const).find(t => t === sp.get('tab')) ?? 'profile'
  const { profile } = useAuth()
  const [welcome, setWelcome] = useState(() => sp.has('welcome'))
  useEffect(() => { if (sp.has('welcome')) { clearWelcome(); setSp(t => { const n = new URLSearchParams(t); n.delete('welcome'); return n }, { replace: true }) } }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const setTab = (t: Tab) => setSp(t === 'profile' ? {} : { tab: t }, { replace: true })
  // Investor matches are recalculated shortly after the profile changes, so the numbers on this page follow the answers.
  const [wave, setWave] = useState(0)
  const [mk, setMk] = useState('')
  const cols = fields ? JSON.stringify(columnsFor(fields)) : ''
  useEffect(() => { const t = setTimeout(() => setMk(cols), 900); return () => clearTimeout(t) }, [cols])
  const matches = useLoad(() => rpc<Match[]>('match_project_info', { p_project: id }), [id, mk])

  // The profile is loaded once; after that this page is the source of truth and every change is saved straight away.
  useEffect(() => { if (proj.data && !fields) { setFields(hydrate(proj.data)); setEcon(hydrateEcon(proj.data.profile)); setDbStage(proj.data.stage) } }, [proj.data, fields])

  // Keep the saved stage in step with the answers. The rules for a stage can change after a profile was saved,
  // and the teaser can only be submitted once the saved stage says it is ready.
  const calcStage = fields ? calc(fields).stage : null
  const projStatus = proj.data?.status
  useEffect(() => {
    if (calcStage === null || projStatus !== 'draft' || !fields || calcStage === dbStage) return
    const score = calc(fields).score
    void supabase.from('projects').update({ stage: calcStage, readiness: score }).eq('id', id).then(({ error }) => { if (!error) setDbStage(calcStage) })
  }, [calcStage, projStatus, dbStage, id]) // eslint-disable-line react-hooks/exhaustive-deps

  const [confirm, setConfirm] = useState<{ lines: string[]; done: (ok: boolean) => void } | null>(null)
  const nav = useNavigate()
  const [del, setDel] = useState(false)
  const [asking, setAsking] = useState<string | null>(null)
  const [hintSeen, setHintSeen] = useState(() => { try { return localStorage.getItem('cb_start_hint') === '1' } catch { return false } })
  const dismissHint = () => { setHintSeen(true); try { localStorage.setItem('cb_start_hint', '1') } catch { /* private mode */ } }
  const delAct = useAction()
  const commit = useCallback(async (next: Fields, nextEcon?: Econ) => {
    if (!proj.data) return
    const prev = fields
    const prevEcon = econ
    // Once the teaser is approved, a change to the key figures needs an explicit yes: investors and Cobuildy are told.
    if (prev && (proj.data.status === 'approved' || proj.data.status === 'live')) {
      const lines = keyChanges(prev, next)
      if (lines.length && !(await new Promise<boolean>(res => setConfirm({ lines, done: res })))) throw new Error(tr('Change not saved.', 'Cambio no guardado.'))
    }
    setFields(next)
    if (nextEcon) setEcon(nextEcon)
    const patch = patchFor(proj.data, next, nextEcon ?? econ ?? undefined)
    const { error } = await supabase.from('projects').update(patch).eq('id', id)
    if (error) { setFields(prev); setEcon(prevEcon); throw new Error(error.message) }
    setDbStage(patch.stage)
    const changed = FIELDS.map(d => d.key).filter(k => prev?.[k]?.v !== next[k]?.v || prev?.[k]?.st !== next[k]?.st)
    setFlash(changed)
    setTimeout(() => setFlash([]), 2400)
  }, [proj.data, fields, econ, id])

  // Files the agent has read and the developer has not reviewed yet.
  const readyItems = useMemo<ReadItem[]>(() => (reads.data ?? []).filter(r => r.status === 'ready' && r.result).map(r => {
    const d = (docs.data ?? []).find(x => x.id === r.doc_id)
    return { docId: r.doc_id, docName: d?.file_name ?? d?.title ?? 'document', path: d?.storage_path ?? null, ex: r.result! }
  }), [reads.data, docs.data])

  if (proj.loading) return <span className="muted">{t0('Loading…', 'Cargando…')}</span>
  if (!proj.data || !fields || !econ) return <><ErrorLine error={proj.error} /><Link to="/developer">{t0('← Projects', '← Proyectos')}</Link></>
  const p = proj.data
  const hasAnswers = Object.values(fields).some(f => f.st !== 'empty')
  const startHere = p.status === 'draft' && !hasAnswers
  const editable = p.status !== 'discarded' && p.status !== 'closed_won' && p.status !== 'closed_lost'
  const ask = (key: string) => { setAskReq({ key, n: Date.now() }); document.getElementById('agent-chat')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }
  const fitCount = (matches.data ?? []).filter(m => m.bucket === 'fit').length
  const edit = (key: string, next: FieldState) => commit({ ...fields, [key]: { ...blank(), ...next } })

  const strategy = isDone(fields.a_strategy ?? blank()) ? strategyCode(fields.a_strategy.v) : null
  const stamp = () => new Date().toISOString()
  const addFiles = async (files: File[], target?: Target): Promise<Job[]> => {
    const jobs = await ingest.add(files, target)
    if (jobs.some(j => j.phase === 'done')) setReviewOpen(true)
    return jobs
  }
  const retryRead = async (docId: string) => { const jobs = await ingest.retry(docId); if (jobs.some(j => j.phase === 'done')) setReviewOpen(true) }
  const saveReview = async (applied: Applied, docIds: string[]) => {
    await commit(applied.next, applied.budget ? { ...econ, budget: applied.budget } : undefined)
    const { error } = await supabase.from('doc_reads').update({ status: 'applied', updated_at: stamp() }).in('doc_id', docIds)
    if (error) throw new Error(error.message)
    await reads.reload()
    setReviewOpen(false)
  }
  const ignoreRead = async (docId: string) => {
    const { error } = await supabase.from('doc_reads').update({ status: 'dismissed', updated_at: stamp() }).eq('doc_id', docId)
    if (error) throw new Error(error.message)
    await reads.reload()
  }
  const openDoc = (docId: string) => { const d = docs.data?.find(x => x.id === docId); if (d?.storage_path) void downloadDoc(d.storage_path, d.file_name).catch(() => undefined) }
  const budgetFrom = { doc: 'budget', name: 'Development budget', ref: 'sum of lines' } // stored markers, not shown text
  // The total cost on the profile follows the budget while it came from the budget; a figure the developer typed is never overwritten silently.
  const commitBudget = async (lines: BudgetLine[]) => {
    const cur = fields.f_cost
    const follows = !cur || cur.st === 'empty' || cur.from?.ref === 'budget lines' || cur.from?.ref === 'sum of lines'
    const next = lines.length && follows ? applyUpdates(fields, budgetUpdates(lines, strategy, budgetFrom), 'doc').next : fields
    await commit(next, { ...econ, budget: lines })
  }
  const useBudgetTotal = async () => { await commit(applyUpdates(fields, budgetUpdates(econ.budget, strategy, budgetFrom), 'doc').next) }

  return (
    <>
      <div className="row"><Link to="/developer">{t0('← Projects', '← Proyectos')}</Link><span className="sp" />
        {p.status === 'draft' && <button className="linkbtn" type="button" onClick={() => setDel(true)}>{t0('Delete project', 'Eliminar proyecto')}</button>}
        <Pill tone={p.status === 'draft' ? undefined : 'good'}>{statusText(p.status)}</Pill></div>
      <h1>{p.code} · {p.title}</h1>
      {welcome && p.status === 'draft' && (
        <Welcome name={(profile?.full_name ?? '').split(' ')[0]} fields={fields} matches={matches.data}
          completeness={calc(fields).score} openToTeaser={calc(fields).blockers.length}
          onContinue={() => { setWelcome(false); ask(nextField(fields) ?? '') }} onInvestors={() => { setWelcome(false); setTab('investors') }} onClose={() => setWelcome(false)} />
      )}
      {del && (
        <div className="modal" role="dialog" aria-modal="true" aria-label={t0('Delete project', 'Eliminar proyecto')}><div className="card">
          <h2>{t0('Delete this project?', '¿Eliminar este proyecto?')}</h2>
          <p className="muted">{hasAnswers ? t0('It will be removed from your list together with everything you told the agent about it.', 'Se quitará de tu lista junto con todo lo que le contaste al agente sobre él.') : t0('It is empty, so nothing is lost. It will be removed from your list.', 'Está vacío, así que no se pierde nada. Se quitará de tu lista.')} {t0('No investor has seen it.', 'Ningún inversor lo ha visto.')}</p>
          <ErrorLine error={delAct.error} />
          <div className="row"><button className="btn pri" type="button" disabled={delAct.busy} onClick={() => void delAct.run(async () => { await rpc('discard_project', { p_project: p.id }); nav('/developer') })}>{t0('Yes, delete it', 'Sí, eliminarlo')}</button>
            <button className="btn" type="button" disabled={delAct.busy} onClick={() => setDel(false)}>{t0('Keep it', 'Conservarlo')}</button></div>
        </div></div>)}
      {reviewOpen && readyItems.length > 0 && <ReviewDialog items={readyItems} fields={fields} strategy={strategy} existingLines={econ.budget.length} onSave={saveReview} onIgnore={ignoreRead} onClose={() => setReviewOpen(false)} />}
      {confirm && (
        <div className="modal" role="dialog" aria-modal="true" aria-label={t0('Confirm change', 'Confirmar el cambio')}><div className="card">
          <h2>{t0('Change the teaser figures?', '¿Cambiar las cifras del teaser?')}</h2>
          <p className="muted">{t0('Investors who already have this teaser will see the new values and get a notification. Cobuildy is notified too.', 'Los inversores que ya tienen este teaser verán los nuevos valores y recibirán una notificación. Cobuildy también será avisado.')}</p>
          <ul className="chg">{confirm.lines.map(l => <li key={l}>{l}</li>)}</ul>
          <div className="row"><button className="btn pri" type="button" onClick={() => { confirm.done(true); setConfirm(null) }}>{t0('Save changes', 'Guardar cambios')}</button>
            <button className="btn" type="button" onClick={() => { confirm.done(false); setConfirm(null) }}>{t0('Cancel', 'Cancelar')}</button></div>
        </div></div>)}

      <div className="pgrid">
        {startHere && !hintSeen && <div className="spot-veil" aria-hidden="true" onClick={dismissHint} />}
        <div id="agent-chat" className={`pcol${startHere ? ' start-here' : ''}${startHere && !hintSeen ? ' spot' : ''}`}>
          {startHere && !hintSeen && (
            <div className="spot-tip" role="note">
              <b>{t0('Start here', 'Empieza aquí')}</b>
              <span>{t0('Tap an answer, or type in your own words. I fill in your project as we talk.', 'Toca una respuesta o escribe con tus palabras. Voy rellenando tu proyecto mientras hablamos.')}</span>
              <button className="btn pri" type="button" onClick={dismissHint}>{t0('Got it', 'Entendido')}</button>
            </div>)}
          <ProfileChat projectId={p.id} fields={fields} commit={commit} editable={editable} askReq={askReq} onCurrent={setAsking} onAttach={files => ingest.add(files)} onReview={() => setReviewOpen(true)} />
        </div>
        <div className="pmain">
          <div className="tabs" role="tablist">
            <button type="button" role="tab" className="tab" aria-selected={tab === 'profile'} onClick={() => setTab('profile')}>{t0('Project profile', 'Perfil del proyecto')}</button>
            <button type="button" role="tab" className="tab" aria-selected={tab === 'investors'} onClick={() => setTab('investors')}>{t0('Investors', 'Inversores')}{fitCount > 0 && <em>{fitCount}</em>}</button>
            <button type="button" role="tab" className="tab" aria-selected={tab === 'room'} onClick={() => setTab('room')}>{t0('Data room', 'Data room')}{(docs.data?.length ?? 0) > 0 && <em>{docs.data?.length}</em>}</button>
          </div>
          {tab === 'profile' && <>
            <DropCard ingest={ingest} onFiles={files => void addFiles(files)} readyCount={readyItems.length} onReview={() => setReviewOpen(true)} editable={editable} />
            <ProfileView fields={fields} flash={flash} editable={editable} onAsk={ask} onEdit={edit} onOpenDoc={openDoc} />
            <BudgetCard strategy={strategy} lines={econ.budget} fields={fields} editable={editable} onChange={commitBudget} onUseTotal={useBudgetTotal} onOpenDoc={openDoc} />
          </>}
          {tab === 'investors' && <>
            <MatchBar matches={matches.data} />
            <Wave onFill={k => { setTab('profile'); ask(k) }} project={p} matches={matches} canSend={p.status === 'approved' || p.status === 'live'} onSent={async () => { await proj.reload(); setWave(w => w + 1) }} />
            {(p.status === 'live' || p.status === 'approved') && <Deals key={wave} project={p} docs={docs.data ?? []} />}
          </>}
          {tab === 'room' && <DataRoom projectId={p.id} docs={docs.data ?? []} reload={docs.reload} editable={editable} error={docs.error} ingest={ingest} reads={reads.data ?? []} onAdd={(f, t) => void addFiles(f, t)} onReview={() => setReviewOpen(true)} onRetry={d => void retryRead(d)} />}
        </div>
        <ReadinessPanel asking={asking} fields={fields} status={p.status} dbStage={dbStage} onAsk={a => { setTab('profile'); ask(a) }} busy={submit.busy} error={submit.error}
          onSubmit={() => void submit.run(() => rpc('submit_teaser', { p_project: p.id }))} />
      </div>
    </>
  )
}

const BUCKETS = (): Array<{ k: Match['bucket']; label: string }> => [
  { k: 'fit', label: tr('Fit', 'Encajan') }, { k: 'possible', label: tr('Needs info', 'Necesitan información') }, { k: 'later', label: tr('After actions', 'Tras acciones') }, { k: 'out', label: tr('Out', 'Descartados') },
]
const STATUS_ES: Record<string, string> = { draft: 'borrador', teaser_review: 'teaser en revisión', approved: 'aprobado', live: 'activo', closed_won: 'cerrado con éxito', closed_lost: 'cerrado sin éxito', discarded: 'descartado' }
const statusText = (s: string) => (tr('en', 'es') === 'es' ? STATUS_ES[s] ?? s : s.replace('_', ' '))

/** Where the investor network stands for this project, recalculated as the profile changes. */
function MatchBar({ matches }: { matches: Match[] | null }) {
  const t0 = useT()
  if (!matches) return null
  const n = (k: Match['bucket']) => matches.filter(m => m.bucket === k).length
  const total = matches.length || 1
  return (
    <div className="mbar" aria-label={t0('Investor matches', 'Coincidencias con inversores')}>
      <div className="muted">{t0('How the investors on file match this project, out of', 'Cómo encajan con este proyecto los inversores registrados, de')} {matches.length}</div>
      <div className="mbar-t">{BUCKETS().map(b => <i key={b.k} className={`b-${b.k}`} style={{ width: `${(n(b.k) / total) * 100}%` }} />)}</div>
      <div className="mbar-l">{BUCKETS().map(b => <span key={b.k}><i className={`b-${b.k}`} />{b.label} {n(b.k)}</span>)}<span className="muted">{t0('Missing data never rules an investor out', 'Los datos que faltan nunca descartan a un inversor')}</span></div>
    </div>
  )
}

/** What stops an investor from being a sure fit: a fact of the project that their criteria need and the profile does not have yet. */
const MISSING = (): Record<string, { text: string; key: string }> => ({
  geo: { text: tr('Region not set', 'Zona sin indicar'), key: 'a_loc' }, asset: { text: tr('Asset type not set', 'Tipo de activo sin indicar'), key: 'a_type' }, instrument: { text: tr('Instrument not set', 'Instrumento sin indicar'), key: 'k_instr' },
  ticket: { text: tr('Capital sought not set', 'Capital buscado sin indicar'), key: 'k_ask' }, license: { text: tr('Licence status not set', 'Estado de la licencia sin indicar'), key: 'p_status' },
})
const BUCKET_LABEL = (): Record<Match['bucket'], string> => ({ fit: tr('fit', 'encaja'), possible: tr('needs info', 'necesita información'), later: tr('later', 'más adelante'), out: tr('out', 'descartado') })

function Wave({ project, matches, canSend, onSent, onFill }: { onFill: (key: string) => void; project: Project; matches: { data: Match[] | null; error: string | null; reload: () => void | Promise<void> }; canSend: boolean; onSent: () => Promise<void> }) {
  const t0 = useT()
  const m = matches
  const contacted = useLoad(async () => (canSend ? await rpc<ProjectDeal[]>('project_deals', { p_project: project.id }) : []), [project.id, canSend])
  const done = new Set((contacted.data ?? []).map(d => d.investor_code))
  const [sel, setSel] = useState<string[] | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const act = useAction(async () => { setSel(null); await Promise.all([m.reload(), contacted.reload(), onSent()]) })
  const fresh = (x: Match) => !done.has(x.code)
  const sendable = (m.data ?? []).filter(x => (x.bucket === 'fit' || x.bucket === 'possible') && fresh(x))
  const chosen = (sel ?? sendable.filter(x => x.bucket === 'fit').map(x => x.investor_id)).filter(id => sendable.some(x => x.investor_id === id))
  const tone = (b: Match['bucket']) => (b === 'fit' ? 'good' : b === 'possible' ? 'plan' : b === 'later' ? 'warn' : undefined)
  const shown = (m.data ?? []).filter(x => x.bucket !== 'out').sort((a, b) => b.score - a.score)
  const send = () => void act.run(async () => {
    const n = await rpc<number>('launch_wave', { p_project: project.id, p_wave: 1, p_investors: chosen })
    setNotice(n > 0 ? t0(`Teaser sent to ${n} investor${n === 1 ? '' : 's'}. Replies appear under Deals below.`, `Teaser enviado a ${n} ${n === 1 ? 'inversor' : 'inversores'}. Las respuestas aparecen abajo, en Operaciones.`) : t0('Nothing new was sent: these investors already have the teaser.', 'No se ha enviado nada nuevo: estos inversores ya tienen el teaser.'))
  })
  return (
    <section className="card">
      <h2>{t0('Send your teaser', 'Envía tu teaser')}</h2>
      <p className="muted">{t0('These are the investors whose criteria fit this project. Tick who should receive the teaser and press the button at the bottom. Investors who already have it are marked', 'Estos son los inversores cuyos criterios encajan con este proyecto. Marca quién debe recibir el teaser y pulsa el botón de abajo. Los que ya lo tienen aparecen como')} <b>{t0('Sent', 'Enviado')}</b>{t0(', and their replies appear under ', ', y sus respuestas aparecen abajo, en ')}<b>{t0('Deals', 'Operaciones')}</b>{t0(' below.', '.')}</p>
      <p className="muted small">{t0("Fit: all hard criteria confirmed. Needs info: a fact is missing in your profile, so it cannot be checked yet. Score is the share of this investor's criteria your project meets; a missing fact counts as half. Investors stay anonymous to you until they express interest.", 'Encajan: todos los criterios firmes confirmados. Necesitan información: falta un dato en tu perfil, así que aún no se puede comprobar. La puntuación es la parte de los criterios de este inversor que cumple tu proyecto; un dato que falta cuenta como la mitad. Los inversores permanecen anónimos para ti hasta que muestran interés.')}</p>
      {!canSend && <p className="muted">{t0('This is a preview that follows your answers. You can send the teaser once Cobuildy has approved it.', 'Esto es una vista previa que sigue tus respuestas. Podrás enviar el teaser cuando Cobuildy lo haya aprobado.')}</p>}
      <ErrorLine error={act.error ?? m.error} />
      {m.data && shown.length === 0 ? <Empty>{t0('No investor fits yet. Answer more questions or widen the ask.', 'Todavía no encaja ningún inversor. Responde más preguntas o amplía la petición.')}</Empty> : (
        <div className="scrollx"><table>
          <thead><tr>{canSend && <th />}<th>{t0('Type', 'Tipo')}</th><th>{t0('Country', 'País')}</th><th>{t0('Match', 'Encaje')}</th><th>{t0('Score', 'Puntuación')}</th><th>{t0('To make it a fit', 'Para que encaje')}</th>{canSend && <th>Teaser</th>}</tr></thead>
          <tbody>{shown.map(x => {
            const sent = done.has(x.code)
            const can = canSend && !sent && (x.bucket === 'fit' || x.bucket === 'possible')
            return <tr key={x.investor_id}>
              {canSend && <td><input type="checkbox" aria-label={t0(`Select ${x.code}`, `Seleccionar ${x.code}`)} disabled={!can} checked={chosen.includes(x.investor_id)} onChange={e => setSel(e.target.checked ? [...chosen, x.investor_id] : chosen.filter(i => i !== x.investor_id))} /></td>}
              <td>{kindLabel(x.kind)}</td><td>{countryName(x.country)}</td><td><Pill tone={tone(x.bucket)}>{BUCKET_LABEL()[x.bucket]}</Pill></td><td>{x.score}</td>
              <td>{x.bucket === 'possible' && (x.missing ?? []).length > 0 ? <span className="why">{(x.missing ?? []).filter(k => MISSING()[k]).map(k => <span key={k}>{MISSING()[k].text} · <button className="linkbtn" type="button" onClick={() => onFill(MISSING()[k].key)}>{t0('Fill in', 'Rellenar')}</button></span>)}</span> : <span className="muted">—</span>}</td>
              {canSend && <td>{sent ? <Pill tone="good">{t0('Sent', 'Enviado')}</Pill> : <span className="muted">—</span>}</td>}</tr>
          })}</tbody>
        </table></div>
      )}
      {notice && <div className="ok" role="status">{notice}</div>}
      {canSend && <div className="row"><button className="btn plan" disabled={act.busy || chosen.length === 0} onClick={send}>
        {act.busy ? t0('Sending…', 'Enviando…') : chosen.length === 0 ? (done.size > 0 ? t0('Teaser sent', 'Teaser enviado') : t0('No investor selected', 'Ningún inversor seleccionado')) : t0(`Send teaser to ${chosen.length} investor${chosen.length === 1 ? '' : 's'}`, `Enviar el teaser a ${chosen.length} ${chosen.length === 1 ? 'inversor' : 'inversores'}`)}</button></div>}
    </section>
  )
}

function Deals({ project, docs: all }: { project: Project; docs: ProjectDoc[] }) {
  const t0 = useT()
  const docs = all.filter(x => x.storage_path)
  const deals = useLoad(() => rpc<ProjectDeal[]>('project_deals', { p_project: project.id }), [project.id])
  const msgs = useLoad(async () => {
    const ids = (deals.data ?? []).map(d => d.deal_id)
    if (!ids.length) return [] as DealMessage[]
    const { data, error } = await supabase.from('deal_messages').select('*').in('deal_id', ids).order('created_at')
    if (error) throw error
    return data as DealMessage[]
  }, [deals.data])
  const act = useAction(async () => { await deals.reload() })
  const [picked, setPicked] = useState<Record<string, string[]>>({})
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [slot, setSlot] = useState<Record<string, string>>({})
  const go = (id: string, action: string, payload: object = {}) => void act.run(() => rpc('deal_action', { p_deal: id, p_action: action, p_payload: payload }))

  return (
    <section className="card">
      <h2>{t0('Deals', 'Operaciones')}</h2>
      <ErrorLine error={act.error ?? deals.error ?? msgs.error} />
      {deals.data && deals.data.length === 0 ? <Empty>{t0('No investors contacted yet.', 'Aún no se ha contactado con ningún inversor.')}</Empty> : deals.data?.map(d => {
        const ms = (msgs.data ?? []).filter(x => x.deal_id === d.deal_id)
        const open = ms.filter(x => x.kind === 'question')
        return (
          <div className="card soft" key={d.deal_id}>
            <div className="row"><b>{d.investor_name ?? d.investor_code}</b><span className="muted">{kindLabel(d.investor_kind)}</span><span className="sp" />
              <Pill tone={d.stage === 'passed' ? 'bad' : d.stage === 'call' ? 'good' : 'plan'}>{STAGE_LABEL[d.stage]}</Pill></div>
            {d.reason && <div className="muted">{t0('Reason', 'Motivo')}: {d.reason}</div>}
            {d.recorded_channel && <div className="muted">{t0('Reply recorded by the Cobuildy team', 'Respuesta registrada por el equipo de Cobuildy')} ({CHANNEL[d.recorded_channel] ?? d.recorded_channel})</div>}
            {ms.map(x => <div key={x.id} className={`q ${x.kind === 'answer' ? 'a' : ''}`}><span className="mono">{x.kind === 'question' ? t0('question', 'pregunta') : x.kind === 'answer' ? t0('answer', 'respuesta') : t0('note', 'nota')}</span><div>{x.body}</div></div>)}
            <div className="row">
              {d.stage === 'interested' && <>
                <button className="btn sm pri" disabled={act.busy} onClick={() => go(d.deal_id, 'accept')}>{t0('Accept', 'Aceptar')}</button>
                <button className="btn sm" disabled={act.busy} onClick={() => go(d.deal_id, 'decline', { reason: 'Not a fit right now' })}>{t0('Decline', 'Rechazar')}</button></>}
              {d.stage === 'nda_sent' && (d.nda_dev_signed
                ? <span className="ok">{t0('You signed the NDA. Waiting for', 'Has firmado el NDA. Esperando a que firme')} {d.investor_name ?? t0('the investor', 'el inversor')}{t0(' to sign.', '.')}</span>
                : <button className="btn sm pri" disabled={act.busy} onClick={() => go(d.deal_id, 'sign_nda')}>{t0('Sign NDA', 'Firmar NDA')}</button>)}
              {d.stage === 'nda_sent' && <span className="muted">NDA: {t0('you', 'tú')} {d.nda_dev_signed ? '✓' : t0('not yet', 'aún no')} · {t0('investor', 'inversor')} {d.nda_inv_signed ? '✓' : t0('not yet', 'aún no')}</span>}
            </div>
            {d.stage === 'room' && (docs.length === 0 ? <span className="muted">{t0('Upload documents in the Data room tab, then choose what to share.', 'Sube documentos en la pestaña Data room y elige después qué compartir.')}</span> : <>
              <div className="chks">{docs.map(x => <label className="chk" key={x.id}><input type="checkbox" checked={(picked[d.deal_id] ?? []).includes(x.id)} onChange={e => { const cur = picked[d.deal_id] ?? []; setPicked({ ...picked, [d.deal_id]: e.target.checked ? [...cur, x.id] : cur.filter(i => i !== x.id) }) }} />{x.title}</label>)}</div>
              <div><button className="btn sm pri" disabled={act.busy || !(picked[d.deal_id] ?? []).length} onClick={() => go(d.deal_id, 'share_docs', { docs: picked[d.deal_id] })}>{t0('Share selected documents', 'Compartir los documentos seleccionados')}</button></div></>)}
            {d.stage === 'qa' && <>
              <Field label={t0(`Answers, one per line (${open.length} question${open.length === 1 ? '' : 's'})`, `Respuestas, una por línea (${open.length} ${open.length === 1 ? 'pregunta' : 'preguntas'})`)}><textarea rows={3} value={answers[d.deal_id] ?? ''} onChange={e => setAnswers({ ...answers, [d.deal_id]: e.target.value })} /></Field>
              <div><button className="btn sm pri" disabled={act.busy || !(answers[d.deal_id] ?? '').trim()} onClick={() => go(d.deal_id, 'answer', { answers: (answers[d.deal_id] ?? '').split('\n').map(s => s.trim()).filter(Boolean) })}>{t0('Send answers', 'Enviar respuestas')}</button></div></>}
            {d.stage === 'ts' && <div className="row">
              <input style={{ maxWidth: 280 }} placeholder={t0('Call slot, e.g. Tue 14:00 CET', 'Franja de la llamada, p. ej. mar 14:00 CET')} value={slot[d.deal_id] ?? ''} onChange={e => setSlot({ ...slot, [d.deal_id]: e.target.value })} />
              <button className="btn sm pri" disabled={act.busy || !(slot[d.deal_id] ?? '').trim()} onClick={() => go(d.deal_id, 'confirm_call', { slot: slot[d.deal_id] })}>{t0('Confirm call', 'Confirmar llamada')}</button></div>}
            {d.stage === 'call' && <span className="ok">{t0('Call', 'Llamada')}: {d.call_slot}</span>}
          </div>
        )
      })}
    </section>
  )
}
