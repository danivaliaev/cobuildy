import { useRef, useState } from 'react'
import { ACCEPT } from '../lib/docs'
import type { Ingest, Job } from './useIngest'
import { tr, useT } from '../i18n'

const phaseText = (j: Job) =>
  j.phase === 'uploading' ? tr('Uploading…', 'Subiendo…') : j.phase === 'reading' ? tr('Reading…', 'Leyendo…')
    : j.phase === 'done' ? tr(`Read: ${j.facts ?? 0} ${j.facts === 1 ? 'fact' : 'facts'}${j.lines ? `, ${j.lines} budget lines` : ''}`, `Leído: ${j.facts ?? 0} ${j.facts === 1 ? 'dato' : 'datos'}${j.lines ? `, ${j.lines} partidas de presupuesto` : ''}`) : (j.error ?? tr('Could not be read', 'No se ha podido leer'))

/** Progress of the files being uploaded and read, and what went wrong with a file. */
export function JobList({ jobs, onClear }: { jobs: Job[]; onClear?: () => void }) {
  const t = useT()
  if (!jobs.length) return null
  const idle = jobs.every(j => j.phase === 'done' || j.phase === 'failed')
  return (
    <div className="jobs" aria-live="polite">
      {jobs.slice(-6).map(j => (
        <div key={j.id} className={`job ${j.phase}`}>
          <span className="jn">{j.name}</span>
          <span className={j.phase === 'failed' ? 'err' : 'muted'}>{phaseText(j)}</span>
        </div>))}
      {idle && onClear && <button type="button" className="linkbtn" onClick={onClear}>{t('Clear', 'Borrar')}</button>}
    </div>
  )
}

/** One place to drop any project file: the agent reads it, and the developer reviews what it found before anything is saved. */
export function DropCard({ ingest, onFiles, readyCount, onReview, editable }: { ingest: Ingest; onFiles: (files: File[]) => void; readyCount: number; onReview: () => void; editable: boolean }) {
  const t = useT()
  const pick = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  if (!editable) return null
  const take = (list: FileList | null) => { if (list && list.length) onFiles(Array.from(list)) }
  return (
    <section
      className={`card drop${over ? ' over' : ''}`} aria-label={t('Add documents', 'Añadir documentos')}
      onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); take(e.dataTransfer.files) }}
    >
      <input ref={pick} type="file" multiple accept={ACCEPT} hidden aria-hidden="true" tabIndex={-1} onChange={e => { take(e.target.files); e.target.value = '' }} />
      <div className="row"><h2>{t('Add your documents', 'Añade tus documentos')}</h2><span className="sp" />
        {readyCount > 0 && <button type="button" className="btn sm pri" onClick={onReview}>{t(`Review ${readyCount} ${readyCount === 1 ? 'file' : 'files'} I read`, `Revisar ${readyCount} ${readyCount === 1 ? 'archivo leído' : 'archivos leídos'}`)}</button>}</div>
      <p className="muted">{t('Drop your cost budget, nota simple, licence, valuation or any other project file here. I read them, fill in the profile and show you what I found before anything is saved. PDF, Word, Excel, JPG or PNG, up to 25 MB each.', 'Suelta aquí tu presupuesto de costes, nota simple, licencia, tasación o cualquier otro archivo del proyecto. Los leo, relleno el perfil y te enseño lo que he encontrado antes de guardar nada. PDF, Word, Excel, JPG o PNG, hasta 25 MB cada uno.')}</p>
      <div className="row"><button type="button" className="btn" disabled={ingest.busy} onClick={() => pick.current?.click()}>{ingest.busy ? t('Working…', 'Trabajando…') : t('Choose files', 'Elegir archivos')}</button><span className="muted small">{t('or drag them onto this card', 'o arrástralos a esta tarjeta')}</span></div>
      <JobList jobs={ingest.jobs} onClear={ingest.clear} />
    </section>
  )
}
