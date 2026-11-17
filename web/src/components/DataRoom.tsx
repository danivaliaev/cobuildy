import { useRef, useState } from 'react'
import { supabase, errText } from '../lib/supabase'
import { ACCEPT, downloadDoc, sizeText } from '../lib/docs'
import { FIELDS } from '../lib/profile'
import { isStale, type DocRead } from '../lib/ingest'
import { ErrorLine, Empty, Pill, useAction } from './ui'
import { JobList } from './DropCard'
import type { Ingest, Target } from './useIngest'
import type { ProjectDoc } from '../lib/types'
import { tr, useT } from '../i18n'

const GATE_HEAD = (): Record<number, string> => ({ 1: tr('For your teaser', 'Para tu teaser'), 2: tr('For lender outreach', 'Para el contacto con prestamistas'), 3: tr('For the data room', 'Para el data room') })

/** What the agent made of a file, in one line, with the action that goes with it. */
function ReadState({ read, onReview, onRetry, editable, busy }: { read: DocRead | undefined; onReview: () => void; onRetry: () => void; editable: boolean; busy: boolean }) {
  if (!read) return null
  if (read.status === 'reading' && !isStale(read)) return <Pill tone="plan">{tr('Reading…', 'Leyendo…')}</Pill>
  if (read.status === 'ready') return <button type="button" className="linkbtn" onClick={onReview}>{tr('Review what I found', 'Revisar lo que he encontrado')}</button>
  if (read.status === 'applied') return <span className="muted small">{tr('Read', 'Leído')} ✓</span>
  if (read.status === 'dismissed') return null
  return <span className="muted small" title={read.error ?? ''}>{tr('Could not read', 'No se ha podido leer')}{editable && <> · <button type="button" className="linkbtn" disabled={busy} onClick={onRetry}>{tr('Try again', 'Reintentar')}</button></>}</span>
}

/** The documents lenders ask for, grouped by the stage that needs them, and any other documents below. A file can be dropped on any row. */
export function DataRoom({ docs, reload, editable, error, ingest, reads, onAdd, onReview, onRetry }: {
  projectId?: string; docs: ProjectDoc[]; reload: () => void | Promise<void>; editable: boolean; error: string | null
  ingest: Ingest; reads: DocRead[]; onAdd: (files: File[], target?: Target) => void; onReview: () => void; onRetry: (docId: string) => void
}) {
  const t0 = useT()
  const need = FIELDS.filter(d => d.doc)
  const act = useAction(reload)
  const pick = useRef<HTMLInputElement>(null)
  const target = useRef<Target | null>(null)
  const [otherTitle, setOtherTitle] = useState('')
  const [over, setOver] = useState<string | null>(null)
  const byKey = (k: string) => docs.find(x => x.field_key === k)
  const readOf = (id: string) => reads.find(r => r.doc_id === id)
  const others = docs.filter(x => !x.field_key)
  const uploaded = need.filter(d => byKey(d.key)?.storage_path).length

  const choose = (key: string | null, doc: ProjectDoc | null, title: string) => { target.current = { key, doc, title }; pick.current?.click() }
  const onFile = (file: File | undefined) => {
    const t = target.current
    if (file && t) { onAdd([file], t); if (!t.key) setOtherTitle('') }
    if (pick.current) pick.current.value = ''
  }
  const drop = (e: React.DragEvent, t: Target) => { e.preventDefault(); setOver(null); const f = e.dataTransfer.files; if (f.length && editable) onAdd(Array.from(f).slice(0, t.key ? 1 : 10), t) }
  const rowProps = (id: string, t: Target) => editable
    ? { onDragOver: (e: React.DragEvent) => { e.preventDefault(); setOver(id) }, onDragLeave: () => setOver(null), onDrop: (e: React.DragEvent) => drop(e, t) }
    : {}

  const remove = (d: ProjectDoc) => void act.run(async () => {
    if (d.storage_path) { const r = await supabase.storage.from('data-room').remove([d.storage_path]); if (r.error) throw new Error(errText(r.error.message)) }
    const { error: e } = await supabase.from('project_docs').delete().eq('id', d.id)
    if (e) throw new Error(errText(e.message))
  })
  const get = (d: ProjectDoc) => void act.run(async () => { if (d.storage_path) await downloadDoc(d.storage_path, d.file_name) })
  const fileRow = (d: ProjectDoc) => <span className="muted small">{d.file_name} · {sizeText(d.size_bytes)}</span>
  const busy = act.busy || ingest.busy

  return (
    <>
      <input ref={pick} type="file" accept={ACCEPT} hidden onChange={e => onFile(e.target.files?.[0])} aria-hidden="true" tabIndex={-1} />
      <section className="card">
        <div className="row"><h2>{t0('Documents', 'Documentos')}</h2><span className="sp" /><span className="mono">{uploaded}/{need.length} {t0('uploaded', 'subidos')}</span></div>
        <p className="muted">{t0('Upload what lenders ask for, or drop a file on its row. I read every file and offer what I find for your profile. Investors never see a file until the NDA is signed by both sides and you share it with them. PDF, Word, Excel, JPG or PNG, up to 25 MB each.', 'Sube lo que piden los prestamistas o suelta un archivo en su fila. Leo cada archivo y te ofrezco lo que encuentro para tu perfil. Los inversores nunca ven un archivo hasta que ambas partes firman el NDA y tú se lo compartes. PDF, Word, Excel, JPG o PNG, hasta 25 MB cada uno.')}</p>
        <ErrorLine error={act.error ?? error} />
        <JobList jobs={ingest.jobs} onClear={ingest.clear} />
        {[1, 2, 3].map(g => {
          const slots = need.filter(f => f.gate === g)
          if (!slots.length) return null
          return (
            <div key={g} className="slotgroup">
              <h3 className="slothead">{GATE_HEAD()[g]}</h3>
              {slots.map(f => {
                const d = byKey(f.key); const has = Boolean(d?.storage_path)
                const t: Target = { key: f.key, doc: d ?? null, title: f.doc }
                return (
                  <div className={`row docrow${over === f.key ? ' over' : ''}`} key={f.key} {...rowProps(f.key, t)}>
                    <Pill tone={has ? 'good' : undefined}>{has ? t0('Uploaded', 'Subido') : t0('Not uploaded', 'Sin subir')}</Pill>
                    <span className="sp"><span>{f.doc}</span><span className="muted small dtag">{has && d ? <>{d.file_name} · {sizeText(d.size_bytes)}</> : t0('Drop a file here', 'Suelta aquí un archivo')}</span></span>
                    {has && d && <ReadState read={readOf(d.id)} onReview={onReview} onRetry={() => onRetry(d.id)} editable={editable} busy={busy} />}
                    {has && d && <button className="btn sm" type="button" disabled={busy} onClick={() => get(d)}>{t0('Download', 'Descargar')}</button>}
                    {editable && <button className="btn sm" type="button" disabled={busy} onClick={() => choose(f.key, d ?? null, f.doc!)}>{has ? t0('Replace', 'Reemplazar') : t0('Upload', 'Subir')}</button>}
                    {editable && d && has && <button className="btn sm" type="button" disabled={busy} onClick={() => remove(d)}>{t0('Remove', 'Quitar')}</button>}
                  </div>)
              })}
            </div>)
        })}
      </section>
      <section className="card">
        <h2>{t0('Other documents', 'Otros documentos')}</h2>
        <p className="muted">{t0('Anything else you want to be able to share: valuation, corporate papers, plans. Drop files here, or name one and choose its file.', 'Cualquier otra cosa que quieras poder compartir: tasación, documentos societarios, planos. Suelta archivos aquí o ponle nombre a uno y elige su archivo.')}</p>
        <div className={`dropzone${over === 'other' ? ' over' : ''}`} {...rowProps('other', { key: null, doc: null })}>
          {others.length === 0 ? <Empty>{t0('No other documents yet.', 'Aún no hay otros documentos.')}</Empty> : others.map(d => (
            <div className="row docrow" key={d.id}>
              <Pill tone={d.storage_path ? 'good' : 'warn'}>{d.storage_path ? t0('Uploaded', 'Subido') : t0('No file', 'Sin archivo')}</Pill>
              <span className="sp"><span>{d.title}</span>{d.storage_path ? fileRow(d) : <span className="muted small dtag">{t0('Recorded without a file. Attach one so you can share it.', 'Registrado sin archivo. Adjunta uno para poder compartirlo.')}</span>}</span>
              {d.storage_path && <ReadState read={readOf(d.id)} onReview={onReview} onRetry={() => onRetry(d.id)} editable={editable} busy={busy} />}
              {d.storage_path && <button className="btn sm" type="button" disabled={busy} onClick={() => get(d)}>{t0('Download', 'Descargar')}</button>}
              {editable && <button className="btn sm" type="button" disabled={busy} onClick={() => choose(null, d, d.title)}>{d.storage_path ? t0('Replace', 'Reemplazar') : t0('Attach file', 'Adjuntar archivo')}</button>}
              {editable && <button className="btn sm" type="button" disabled={busy} onClick={() => remove(d)}>{t0('Remove', 'Quitar')}</button>}
            </div>))}
        </div>
        {editable && (
          <form className="row" onSubmit={e => { e.preventDefault(); if (otherTitle.trim()) choose(null, null, otherTitle.trim()) }}>
            <input className="sp" required maxLength={120} value={otherTitle} onChange={e => setOtherTitle(e.target.value)} placeholder={t0('Document title, for example Valuation report', 'Título del documento, por ejemplo Informe de tasación')} aria-label={t0('Document title', 'Título del documento')} />
            <button className="btn" type="submit" disabled={busy || !otherTitle.trim()}>{t0('Choose file and upload', 'Elegir archivo y subir')}</button>
          </form>)}
      </section>
    </>
  )
}
