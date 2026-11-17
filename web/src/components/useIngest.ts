import { getLang } from '../i18n'
import { useRef, useState } from 'react'
import { supabase, errText } from '../lib/supabase'
import { checkFile, mimeOf } from '../lib/docs'
import { FK } from '../lib/profile'
import type { Extraction } from '../lib/ingest'
import type { ProjectDoc } from '../lib/types'

export interface Job { id: string; name: string; phase: 'uploading' | 'reading' | 'done' | 'failed'; error?: string; facts?: number; lines?: number; docId?: string }
/** Where an uploaded file goes: a slot of the document checklist, a replacement of a file, or a new document. */
export interface Target { key: string | null; doc: ProjectDoc | null; title?: string }
export interface Ingest { jobs: Job[]; busy: boolean; add: (files: File[], target?: Target) => Promise<Job[]>; retry: (docId: string) => Promise<Job[]>; clear: () => void }

const stripExt = (n: string) => n.replace(/\.[^.]+$/, '').slice(0, 120)
const POOL = 3

/** The message the server sent with an error, falling back to the generic one. */
async function fnError(err: unknown): Promise<string> {
  const ctx = (err as { context?: Response }).context
  let m = errText(err)
  if (ctx && typeof ctx.json === 'function') { try { const b = await ctx.json(); if (b?.error) m = String(b.error) } catch { /* keep m */ } }
  return m
}

/**
 * Uploads documents to the data room and has the agent read each one. A file that cannot be read is still uploaded:
 * reading is a bonus on top of the data room, never a reason to lose the file.
 */
export function useIngest(projectId: string, refresh: () => Promise<void>, editable: boolean): Ingest {
  const [jobs, setJobs] = useState<Job[]>([])
  const [busy, setBusy] = useState(false)
  const live = useRef<Job[]>([])
  const set = (id: string, p: Partial<Job>) => { live.current = live.current.map(j => (j.id === id ? { ...j, ...p } : j)); setJobs(live.current) }
  const push = (j: Job) => { live.current = [...live.current, j]; setJobs(live.current) }

  const store = async (file: File, t: Target): Promise<string> => {
    const bad = checkFile(file)
    if (bad) throw new Error(bad)
    const id = t.doc?.id ?? crypto.randomUUID()
    const path = `${projectId}/${id}`
    const facts = { storage_path: path, file_name: file.name.slice(0, 200), size_bytes: file.size, mime: mimeOf(file.name) }
    const up = await supabase.storage.from('data-room').upload(path, file, { upsert: true, contentType: facts.mime ?? undefined })
    if (up.error) throw new Error(errText(up.error.message))
    const title = t.title ?? (t.key ? (FK[t.key]?.doc ?? file.name) : stripExt(file.name))
    const res = t.doc
      ? await supabase.from('project_docs').update(facts).eq('id', t.doc.id)
      : await supabase.from('project_docs').insert({ id, project_id: projectId, kind: t.key ? 'Checklist' : 'Other', title, field_key: t.key, ...facts })
    if (res.error) { if (!t.doc) await supabase.storage.from('data-room').remove([path]); throw new Error(errText(res.error.message)) }
    return id
  }

  const read = async (docId: string, jobId: string) => {
    set(jobId, { phase: 'reading' })
    const now = () => new Date().toISOString()
    await supabase.from('doc_reads').upsert({ doc_id: docId, project_id: projectId, status: 'reading', doc_type: null, result: null, error: null, updated_at: now() })
    const { data, error } = await supabase.functions.invoke('ingest-doc', { body: { project_id: projectId, doc_id: docId, lang: getLang() } })
    if (error || !data || data.error) {
      const msg = error ? await fnError(error) : String(data?.error ?? 'The document could not be read.')
      await supabase.from('doc_reads').upsert({ doc_id: docId, project_id: projectId, status: 'failed', error: msg.slice(0, 300), updated_at: now() })
      set(jobId, { phase: 'failed', error: msg })
      return
    }
    const ex = data as Extraction
    await supabase.from('doc_reads').upsert({ doc_id: docId, project_id: projectId, status: 'ready', doc_type: ex.doc_type, result: ex, error: null, updated_at: now() })
    // A file the agent recognises takes the matching slot of the checklist, if that slot is still free.
    if (ex.slot && FK[ex.slot]) {
      const { data: all } = await supabase.from('project_docs').select('id,field_key').eq('project_id', projectId)
      const me = (all ?? []).find(d => d.id === docId)
      if (me && !me.field_key && !(all ?? []).some(d => d.field_key === ex.slot)) {
        await supabase.from('project_docs').update({ field_key: ex.slot, kind: 'Checklist', title: FK[ex.slot].doc }).eq('id', docId)
      }
    }
    set(jobId, { phase: 'done', facts: ex.facts.length, lines: ex.budget?.lines.length ?? 0 })
  }

  const run = async (items: Array<{ docId: string; jobId: string }>) => {
    const queue = [...items]
    const worker = async () => {
      for (let x = queue.shift(); x; x = queue.shift()) {
        try { await read(x.docId, x.jobId) } catch (e) { set(x.jobId, { phase: 'failed', error: errText(e) }) }
      }
    }
    await Promise.all(Array.from({ length: Math.min(POOL, items.length) }, worker))
  }

  const add = async (files: File[], target?: Target): Promise<Job[]> => {
    if (!editable || !files.length) return []
    setBusy(true)
    const mine: string[] = []
    const reads: Array<{ docId: string; jobId: string }> = []
    try {
      for (const file of files) {
        const jobId = crypto.randomUUID()
        mine.push(jobId)
        push({ id: jobId, name: file.name, phase: 'uploading' })
        try {
          const docId = await store(file, target ?? { key: null, doc: null })
          set(jobId, { docId })
          reads.push({ docId, jobId })
        } catch (e) { set(jobId, { phase: 'failed', error: errText(e) }) }
      }
      await refresh()
      await run(reads)
      await refresh()
    } finally { setBusy(false) }
    return live.current.filter(j => mine.includes(j.id))
  }

  const retry = async (docId: string): Promise<Job[]> => {
    if (!editable) return []
    setBusy(true)
    const jobId = crypto.randomUUID()
    push({ id: jobId, name: 'Reading again', phase: 'reading', docId })
    try { await refresh(); await run([{ docId, jobId }]); await refresh() } finally { setBusy(false) }
    return live.current.filter(j => j.id === jobId)
  }

  const clear = () => { live.current = live.current.filter(j => j.phase === 'uploading' || j.phase === 'reading'); setJobs(live.current) }
  return { jobs, busy, add, retry, clear }
}
