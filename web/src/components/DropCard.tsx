import { useRef, useState } from 'react'
import { ACCEPT } from '../lib/docs'
import type { Ingest, Job } from './useIngest'

const phaseText = (j: Job) =>
  j.phase === 'uploading' ? 'Uploading…' : j.phase === 'reading' ? 'Reading…'
    : j.phase === 'done' ? `Read: ${j.facts ?? 0} ${j.facts === 1 ? 'fact' : 'facts'}${j.lines ? `, ${j.lines} budget lines` : ''}` : (j.error ?? 'Could not be read')

/** Progress of the files being uploaded and read, and what went wrong with a file. */
export function JobList({ jobs, onClear }: { jobs: Job[]; onClear?: () => void }) {
  if (!jobs.length) return null
  const idle = jobs.every(j => j.phase === 'done' || j.phase === 'failed')
  return (
    <div className="jobs" aria-live="polite">
      {jobs.slice(-6).map(j => (
        <div key={j.id} className={`job ${j.phase}`}>
          <span className="jn">{j.name}</span>
          <span className={j.phase === 'failed' ? 'err' : 'muted'}>{phaseText(j)}</span>
        </div>))}
      {idle && onClear && <button type="button" className="linkbtn" onClick={onClear}>Clear</button>}
    </div>
  )
}

/** One place to drop any project file: the agent reads it, and the developer reviews what it found before anything is saved. */
export function DropCard({ ingest, onFiles, readyCount, onReview, editable }: { ingest: Ingest; onFiles: (files: File[]) => void; readyCount: number; onReview: () => void; editable: boolean }) {
  const pick = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  if (!editable) return null
  const take = (list: FileList | null) => { if (list && list.length) onFiles(Array.from(list)) }
  return (
    <section
      className={`card drop${over ? ' over' : ''}`} aria-label="Add documents"
      onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); take(e.dataTransfer.files) }}
    >
      <input ref={pick} type="file" multiple accept={ACCEPT} hidden aria-hidden="true" tabIndex={-1} onChange={e => { take(e.target.files); e.target.value = '' }} />
      <div className="row"><h2>Add your documents</h2><span className="sp" />
        {readyCount > 0 && <button type="button" className="btn sm pri" onClick={onReview}>Review {readyCount} {readyCount === 1 ? 'file' : 'files'} I read</button>}</div>
      <p className="muted">Drop your cost budget, nota simple, licence, valuation or any other project file here. I read them, fill in the profile and show you what I found before anything is saved. PDF, Word, Excel, JPG or PNG, up to 25 MB each.</p>
      <div className="row"><button type="button" className="btn" disabled={ingest.busy} onClick={() => pick.current?.click()}>{ingest.busy ? 'Working…' : 'Choose files'}</button><span className="muted small">or drag them onto this card</span></div>
      <JobList jobs={ingest.jobs} onClear={ingest.clear} />
    </section>
  )
}
