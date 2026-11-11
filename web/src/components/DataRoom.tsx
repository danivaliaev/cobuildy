import { useRef, useState } from 'react'
import { supabase, errText } from '../lib/supabase'
import { ACCEPT, checkFile, downloadDoc, mimeOf, sizeText } from '../lib/docs'
import { FIELDS } from '../lib/profile'
import { ErrorLine, Empty, Pill, useAction } from './ui'
import type { ProjectDoc } from '../lib/types'

const EARLY = 'Investors ask for this early'
const LATE = 'Needed for the data room'

/** One list of documents: the ones lenders ask for, each with its file, and any other documents below. */
export function DataRoom({ projectId, docs, reload, editable, error }: { projectId: string; docs: ProjectDoc[]; reload: () => void | Promise<void>; editable: boolean; error: string | null }) {
  const need = FIELDS.filter(d => d.doc)
  const act = useAction(reload)
  const pick = useRef<HTMLInputElement>(null)
  const target = useRef<{ key: string | null; doc: ProjectDoc | null; title: string } | null>(null)
  const [otherTitle, setOtherTitle] = useState('')
  const byKey = (k: string) => docs.find(x => x.field_key === k)
  const others = docs.filter(x => !x.field_key)
  const uploaded = need.filter(d => byKey(d.key)?.storage_path).length

  const choose = (key: string | null, doc: ProjectDoc | null, title: string) => { target.current = { key, doc, title }; pick.current?.click() }

  const onFile = (file: File | undefined) => {
    const t = target.current
    if (!file || !t) return
    void act.run(async () => {
      const bad = checkFile(file)
      if (bad) throw new Error(bad)
      const id = t.doc?.id ?? crypto.randomUUID()
      const path = `${projectId}/${id}`
      const facts = { storage_path: path, file_name: file.name.slice(0, 200), size_bytes: file.size, mime: mimeOf(file.name) }
      const up = await supabase.storage.from('data-room').upload(path, file, { upsert: true, contentType: facts.mime ?? undefined })
      if (up.error) throw new Error(errText(up.error.message))
      const res = t.doc
        ? await supabase.from('project_docs').update(facts).eq('id', t.doc.id)
        : await supabase.from('project_docs').insert({ id, project_id: projectId, kind: t.key ? 'Checklist' : 'Other', title: t.title, field_key: t.key, ...facts })
      if (res.error) { if (!t.doc) await supabase.storage.from('data-room').remove([path]); throw new Error(errText(res.error.message)) }
      if (!t.key) setOtherTitle('')
    })
    if (pick.current) pick.current.value = ''
  }

  const remove = (d: ProjectDoc) => void act.run(async () => {
    if (d.storage_path) { const r = await supabase.storage.from('data-room').remove([d.storage_path]); if (r.error) throw new Error(errText(r.error.message)) }
    const { error: e } = await supabase.from('project_docs').delete().eq('id', d.id)
    if (e) throw new Error(errText(e.message))
  })
  const get = (d: ProjectDoc) => void act.run(async () => { if (d.storage_path) await downloadDoc(d.storage_path, d.file_name) })

  const fileRow = (d: ProjectDoc) => <span className="muted small">{d.file_name} · {sizeText(d.size_bytes)}</span>

  return (
    <>
      <input ref={pick} type="file" accept={ACCEPT} hidden onChange={e => onFile(e.target.files?.[0])} aria-hidden="true" tabIndex={-1} />
      <section className="card">
        <div className="row"><h2>Documents</h2><span className="sp" /><span className="mono">{uploaded}/{need.length} uploaded</span></div>
        <p className="muted">Upload what lenders ask for. Investors never see a file until the NDA is signed by both sides and you share it with them. PDF, Word, Excel, JPG or PNG, up to 25 MB each.</p>
        <ErrorLine error={act.error ?? error} />
        {need.map(f => {
          const d = byKey(f.key); const has = Boolean(d?.storage_path)
          return (
            <div className="row docrow" key={f.key}>
              <Pill tone={has ? 'good' : undefined}>{has ? 'Uploaded' : 'Not uploaded'}</Pill>
              <span className="sp"><span>{f.doc}</span><span className="muted small dtag">{f.gate === 3 ? LATE : EARLY}{has && d ? <> · {d.file_name} · {sizeText(d.size_bytes)}</> : null}</span></span>
              {has && d && <button className="btn sm" type="button" disabled={act.busy} onClick={() => get(d)}>Download</button>}
              {editable && <button className="btn sm" type="button" disabled={act.busy} onClick={() => choose(f.key, d ?? null, f.doc!)}>{has ? 'Replace' : 'Upload'}</button>}
              {editable && d && has && <button className="btn sm" type="button" disabled={act.busy} onClick={() => remove(d)}>Remove</button>}
            </div>)
        })}
      </section>
      <section className="card">
        <h2>Other documents</h2>
        <p className="muted">Anything else you want to be able to share: valuation, corporate papers, plans.</p>
        {others.length === 0 ? <Empty>No other documents yet.</Empty> : others.map(d => (
          <div className="row docrow" key={d.id}>
            <Pill tone={d.storage_path ? 'good' : 'warn'}>{d.storage_path ? 'Uploaded' : 'No file'}</Pill>
            <span className="sp"><span>{d.title}</span>{d.storage_path ? fileRow(d) : <span className="muted small dtag">Recorded without a file. Attach one so you can share it.</span>}</span>
            {d.storage_path && <button className="btn sm" type="button" disabled={act.busy} onClick={() => get(d)}>Download</button>}
            {editable && <button className="btn sm" type="button" disabled={act.busy} onClick={() => choose(null, d, d.title)}>{d.storage_path ? 'Replace' : 'Attach file'}</button>}
            {editable && <button className="btn sm" type="button" disabled={act.busy} onClick={() => remove(d)}>Remove</button>}
          </div>))}
        {editable && (
          <form className="row" onSubmit={e => { e.preventDefault(); if (otherTitle.trim()) choose(null, null, otherTitle.trim()) }}>
            <input className="sp" required maxLength={120} value={otherTitle} onChange={e => setOtherTitle(e.target.value)} placeholder="Document title, for example Valuation report" aria-label="Document title" />
            <button className="btn" type="submit" disabled={act.busy || !otherTitle.trim()}>Choose file and upload</button>
          </form>)}
      </section>
    </>
  )
}
