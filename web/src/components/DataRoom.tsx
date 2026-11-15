import { useRef, useState } from 'react'
import { supabase, errText } from '../lib/supabase'
import { ACCEPT, downloadDoc, sizeText } from '../lib/docs'
import { FIELDS } from '../lib/profile'
import { isStale, type DocRead } from '../lib/ingest'
import { ErrorLine, Empty, Pill, useAction } from './ui'
import { JobList } from './DropCard'
import type { Ingest, Target } from './useIngest'
import type { ProjectDoc } from '../lib/types'

const GATE_HEAD: Record<number, string> = { 1: 'For your teaser', 2: 'For lender outreach', 3: 'For the data room' }

/** What the agent made of a file, in one line, with the action that goes with it. */
function ReadState({ read, onReview, onRetry, editable, busy }: { read: DocRead | undefined; onReview: () => void; onRetry: () => void; editable: boolean; busy: boolean }) {
  if (!read) return null
  if (read.status === 'reading' && !isStale(read)) return <Pill tone="plan">Reading…</Pill>
  if (read.status === 'ready') return <button type="button" className="linkbtn" onClick={onReview}>Review what I found</button>
  if (read.status === 'applied') return <span className="muted small">Read ✓</span>
  if (read.status === 'dismissed') return null
  return <span className="muted small" title={read.error ?? ''}>Could not read{editable && <> · <button type="button" className="linkbtn" disabled={busy} onClick={onRetry}>Try again</button></>}</span>
}

/** The documents lenders ask for, grouped by the stage that needs them, and any other documents below. A file can be dropped on any row. */
export function DataRoom({ docs, reload, editable, error, ingest, reads, onAdd, onReview, onRetry }: {
  projectId?: string; docs: ProjectDoc[]; reload: () => void | Promise<void>; editable: boolean; error: string | null
  ingest: Ingest; reads: DocRead[]; onAdd: (files: File[], target?: Target) => void; onReview: () => void; onRetry: (docId: string) => void
}) {
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
        <div className="row"><h2>Documents</h2><span className="sp" /><span className="mono">{uploaded}/{need.length} uploaded</span></div>
        <p className="muted">Upload what lenders ask for, or drop a file on its row. I read every file and offer what I find for your profile. Investors never see a file until the NDA is signed by both sides and you share it with them. PDF, Word, Excel, JPG or PNG, up to 25 MB each.</p>
        <ErrorLine error={act.error ?? error} />
        <JobList jobs={ingest.jobs} onClear={ingest.clear} />
        {[1, 2, 3].map(g => {
          const slots = need.filter(f => f.gate === g)
          if (!slots.length) return null
          return (
            <div key={g} className="slotgroup">
              <h3 className="slothead">{GATE_HEAD[g]}</h3>
              {slots.map(f => {
                const d = byKey(f.key); const has = Boolean(d?.storage_path)
                const t: Target = { key: f.key, doc: d ?? null, title: f.doc }
                return (
                  <div className={`row docrow${over === f.key ? ' over' : ''}`} key={f.key} {...rowProps(f.key, t)}>
                    <Pill tone={has ? 'good' : undefined}>{has ? 'Uploaded' : 'Not uploaded'}</Pill>
                    <span className="sp"><span>{f.doc}</span><span className="muted small dtag">{has && d ? <>{d.file_name} · {sizeText(d.size_bytes)}</> : 'Drop a file here'}</span></span>
                    {has && d && <ReadState read={readOf(d.id)} onReview={onReview} onRetry={() => onRetry(d.id)} editable={editable} busy={busy} />}
                    {has && d && <button className="btn sm" type="button" disabled={busy} onClick={() => get(d)}>Download</button>}
                    {editable && <button className="btn sm" type="button" disabled={busy} onClick={() => choose(f.key, d ?? null, f.doc!)}>{has ? 'Replace' : 'Upload'}</button>}
                    {editable && d && has && <button className="btn sm" type="button" disabled={busy} onClick={() => remove(d)}>Remove</button>}
                  </div>)
              })}
            </div>)
        })}
      </section>
      <section className="card">
        <h2>Other documents</h2>
        <p className="muted">Anything else you want to be able to share: valuation, corporate papers, plans. Drop files here, or name one and choose its file.</p>
        <div className={`dropzone${over === 'other' ? ' over' : ''}`} {...rowProps('other', { key: null, doc: null })}>
          {others.length === 0 ? <Empty>No other documents yet.</Empty> : others.map(d => (
            <div className="row docrow" key={d.id}>
              <Pill tone={d.storage_path ? 'good' : 'warn'}>{d.storage_path ? 'Uploaded' : 'No file'}</Pill>
              <span className="sp"><span>{d.title}</span>{d.storage_path ? fileRow(d) : <span className="muted small dtag">Recorded without a file. Attach one so you can share it.</span>}</span>
              {d.storage_path && <ReadState read={readOf(d.id)} onReview={onReview} onRetry={() => onRetry(d.id)} editable={editable} busy={busy} />}
              {d.storage_path && <button className="btn sm" type="button" disabled={busy} onClick={() => get(d)}>Download</button>}
              {editable && <button className="btn sm" type="button" disabled={busy} onClick={() => choose(null, d, d.title)}>{d.storage_path ? 'Replace' : 'Attach file'}</button>}
              {editable && <button className="btn sm" type="button" disabled={busy} onClick={() => remove(d)}>Remove</button>}
            </div>))}
        </div>
        {editable && (
          <form className="row" onSubmit={e => { e.preventDefault(); if (otherTitle.trim()) choose(null, null, otherTitle.trim()) }}>
            <input className="sp" required maxLength={120} value={otherTitle} onChange={e => setOtherTitle(e.target.value)} placeholder="Document title, for example Valuation report" aria-label="Document title" />
            <button className="btn" type="submit" disabled={busy || !otherTitle.trim()}>Choose file and upload</button>
          </form>)}
      </section>
    </>
  )
}
