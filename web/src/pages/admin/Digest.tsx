// Weekly digest section of the admin. The work itself is done by the Intelligence Hub (schema "hub": sources, background jobs,
// analysis, scoring, digest writing). One digest per market (Spain, Portugal): its own sources, its own audience profile, its own button.
// This page starts a run, shows progress and lets a person edit the draft and copy it into the newsletter.
import { useEffect, useState } from 'react'
import { supabase, errText } from '../../lib/supabase'
import { Empty, ErrorLine, Field, Pill, useAction, useLoad } from '../../components/ui'
import { when } from '../../lib/format'
import { digestToMarkdown, exportTitle, mdToHtml, parseSourceList, weekStartUtc, type DigestContent, type DigestItemRow } from '../../lib/digest'

const hub = () => supabase.schema('hub')

const MARKETS = [
  { code: 'ES', label: 'Spain', language: 'es' },
  { code: 'PT', label: 'Portugal', language: 'pt' },
] as const
type Market = (typeof MARKETS)[number]['code']
const WINDOW_DAYS = 7

type Source = { id: string; name: string; url: string; source_type: string; country: string | null; language: string | null; is_active: boolean; last_scan_at: string | null; last_success_at: string | null; error_message: string | null; consecutive_failures: number; config: { kind?: string; site?: string; note?: string } | null }
type Job = { id: string; job_type: string; status: string; error: string | null; created_at: string; finished_at: string | null; payload: { country?: string | null } | null }
type Item = { id: string; title: string; publisher: string | null; canonical_url: string | null; publication_date: string | null; ai_score: number | null; status: string; summary: string | null }
type DigestRow = { id: string; title: string; status: string; language: string; content: DigestContent | null; error: string | null; created_at: string; approved_at: string | null; developer: { company_name: string; country: string | null } | null; campaign: { week_start: string } | null }
type DItem = DigestItemRow & { id: string }

const LANGS = { es: 'Spanish', pt: 'Portuguese', en: 'English' } as const
const DIGEST_TONE: Record<string, 'good' | 'warn' | 'plan' | 'bad'> = { approved: 'good', sent: 'good', generated: 'warn', in_review: 'plan', draft: 'warn', failed: 'bad' }
const ACTIVE_JOB = ['queued', 'running']
const STAGE_LABEL: Record<string, string> = { stage_research: 'Reading sites', scan_source: 'Reading sites', stage_analysis: 'Analysing articles', analyze_article: 'Analysing articles', stage_personalization: 'Choosing the best', personalize_developer: 'Choosing the best', stage_digest: 'Writing the digest', generate_digest: 'Writing the digest' }
const STAGE_ORDER = ['Reading sites', 'Analysing articles', 'Choosing the best', 'Writing the digest']
const marketOf = (code: string | null | undefined) => MARKETS.find(m => m.code === code)

function Sources({ market }: { market: Market }) {
  const list = useLoad(async () => {
    const { data, error } = await hub().from('research_sources').select('id,name,url,source_type,country,language,is_active,last_scan_at,last_success_at,error_message,consecutive_failures,config').order('created_at')
    if (error) throw error
    return data as Source[]
  })
  const act = useAction(list.reload)
  const m = marketOf(market)!
  const [text, setText] = useState('')
  const [lang, setLang] = useState<'es' | 'pt' | 'en'>(m.language)
  useEffect(() => { setLang(m.language) }, [m.language])
  const [found, setFound] = useState<Array<{ input: string; feed_url: string | null; title: string | null; items: number; error?: string }> | null>(null)
  const [bad, setBad] = useState<string[]>([])
  const [checking, setChecking] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const check = async () => {
    const { ok, bad: b } = parseSourceList(text)
    setBad(b); setErr(null); setFound(null)
    if (!ok.length) return
    setChecking(true)
    try {
      const { data, error } = await supabase.functions.invoke('hub-find-feed', { body: { urls: ok.map(o => o.url) } })
      if (error) {
        let msg = errText(error)
        try { const body = await (error as unknown as { context?: Response }).context?.json(); if (body?.error) msg = body.error } catch { /* keep the generic text */ }
        throw new Error(msg)
      }
      const names = new Map(ok.map(o => [o.url, o.name]))
      setFound((data.results as Array<{ input: string; feed_url: string | null; title: string | null; items: number; error?: string }>).map(r => ({ ...r, title: names.get(r.input) && names.get(r.input) !== new URL(r.input).hostname.replace(/^www\./, '') ? names.get(r.input)! : r.title })))
    } catch (e) { setErr(errText(e)) } finally { setChecking(false) }
  }
  const addFound = () => {
    const have = new Set((list.data ?? []).map(s => s.url.replace(/\/$/, '').toLowerCase()))
    const rows = (found ?? []).filter(f => f.feed_url && !have.has(f.feed_url.replace(/\/$/, '').toLowerCase()))
      .map(f => ({ name: (f.title || new URL(f.feed_url!).hostname.replace(/^www\./, '')).slice(0, 120), url: f.feed_url!, source_type: 'rss', language: lang, country: market, is_active: true }))
    void act.run(async () => {
      if (rows.length) { const { error } = await hub().from('research_sources').insert(rows); if (error) throw error }
      setFound(null); setText(bad.join('\n'))
    })
  }
  const okCount = found?.filter(f => f.feed_url).length ?? 0
  const tone = (s: Source) => (s.error_message ? 'bad' : s.last_success_at ? 'good' : undefined)
  const kindOf = (s: Source) => (s.config?.kind === 'sitemap' ? 'via sitemap' : s.config?.kind === 'listing' ? 'via news pages' : s.source_type)
  const sorted = [...(list.data ?? [])].sort((a, b) => (a.country === market ? 0 : 1) - (b.country === market ? 0 : 1) || (a.country ?? 'zz').localeCompare(b.country ?? 'zz'))

  return (
    <section className="adm-card">
      <h2>Sources</h2>
      <p className="muted">Each source belongs to one country, and each digest reads only the sources of its country. A source with no country is not used by either digest. Paste site addresses below, one per line (or <code>Name, address</code>): the tool finds each site's RSS feed and adds it to <b>{m.label}</b>. A site without a feed needs to be connected by the developer.</p>
      <textarea rows={3} value={text} onChange={e => { setText(e.target.value); setFound(null) }} placeholder={'Idealista News, https://www.idealista.com/news/\nhttps://www.eleconomista.es/vivienda/'} aria-label="Site addresses" />
      <div className="row">
        <div style={{ minWidth: 150 }}><Field label="Language of these sites"><select value={lang} onChange={e => setLang(e.target.value as typeof lang)}>{(Object.keys(LANGS) as Array<keyof typeof LANGS>).map(k => <option key={k} value={k}>{LANGS[k]}</option>)}</select></Field></div>
        <button className="btn pri" type="button" disabled={checking || !text.trim()} onClick={() => void check()} style={{ alignSelf: 'end' }}>{checking ? 'Looking for feeds…' : `Find feeds for ${m.label}`}</button>
      </div>
      {bad.length > 0 && <div className="err" role="alert">Not an address: {bad.join(' · ')}</div>}
      <ErrorLine error={err} />
      {found && (
        <div className="adm-card" style={{ background: 'var(--soft)' }}>
          {found.map(f => (
            <div key={f.input} className="row" style={{ alignItems: 'flex-start' }}>
              <Pill tone={f.feed_url ? 'good' : 'bad'}>{f.feed_url ? 'feed found' : 'no feed'}</Pill>
              <div style={{ flex: 1, minWidth: 0, wordBreak: 'break-all' }}>{f.input.replace(/^https?:\/\/(www\.)?/, '')}
                <div className="muted" style={{ fontSize: 13 }}>{f.feed_url ? `${f.title ?? ''} · ${f.items} articles in the feed · ${f.feed_url}` : f.error}</div></div>
            </div>))}
          <div className="row"><button className="btn pri" disabled={act.busy || !okCount} onClick={addFound}>Add {okCount} source{okCount === 1 ? '' : 's'} to {m.label}</button><button className="btn" onClick={() => setFound(null)}>Cancel</button></div>
        </div>
      )}
      <ErrorLine error={act.error ?? list.error} />
      {list.data && list.data.length === 0 ? <Empty>No sources yet.</Empty> : (
        <div className="scrollx"><table>
          <thead><tr><th>On</th><th>Name</th><th>Country</th><th>Site</th><th>Last read</th><th /></tr></thead>
          <tbody>{sorted.map(s => (
            <tr key={s.id} style={s.is_active && s.country === market ? undefined : { opacity: 0.55 }}>
              <td><input type="checkbox" aria-label={`Use ${s.name}`} checked={s.is_active} disabled={act.busy} style={{ width: 'auto', minHeight: 0 }}
                onChange={e => void act.run(async () => { const { error } = await hub().from('research_sources').update({ is_active: e.target.checked }).eq('id', s.id); if (error) throw error })} /></td>
              <td>{s.name}<div className="muted" style={{ fontSize: 12 }}>{kindOf(s)}{s.config?.note && !s.is_active ? ` · ${s.config.note}` : ''}</div></td>
              <td><select aria-label={`Country of ${s.name}`} value={s.country ?? ''} disabled={act.busy} style={{ minWidth: 110 }}
                onChange={e => void act.run(async () => { const { error } = await hub().from('research_sources').update({ country: e.target.value || null }).eq('id', s.id); if (error) throw error })}>
                <option value="">Not used</option>{MARKETS.map(x => <option key={x.code} value={x.code}>{x.label}</option>)}</select></td>
              <td style={{ wordBreak: 'break-all', maxWidth: 260 }}>{s.config?.site ? <a href={s.config.site} target="_blank" rel="noreferrer">{s.config.site.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60)}</a> : <a href={s.url} target="_blank" rel="noreferrer">{s.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60)}</a>}</td>
              <td>{s.last_scan_at ? <><Pill tone={tone(s)}>{s.error_message ? 'failed' : 'ok'}</Pill> <span className="muted">{when(s.last_scan_at)}</span>{s.error_message && <div className="muted" style={{ fontSize: 13 }}>{s.error_message}{s.consecutive_failures > 1 ? ` (${s.consecutive_failures} times)` : ''}</div>}</> : <span className="muted">not read yet</span>}</td>
              <td><button className="btn sm" disabled={act.busy} onClick={() => { if (confirm(`Remove ${s.name}? Articles already collected from it stay.`)) void act.run(async () => { const { error } = await hub().from('research_sources').delete().eq('id', s.id); if (error) throw new Error(error.message.includes('foreign key') ? 'This source has articles. Switch it off instead.' : error.message) }) }}>Remove</button></td>
            </tr>))}</tbody>
        </table></div>
      )}
    </section>
  )
}

function Run({ market, onDone }: { market: Market; onDone: () => void }) {
  const m = marketOf(market)!
  const jobs = useLoad(async () => {
    const since = new Date(Date.now() - 6 * 3600e3).toISOString()
    const { data, error } = await hub().from('research_jobs').select('id,job_type,status,error,created_at,finished_at,payload').gte('created_at', since).order('created_at', { ascending: false }).limit(400)
    if (error) throw error
    return data as Job[]
  })
  const running = jobs.data?.some(j => ACTIVE_JOB.includes(j.status)) ?? false
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => { void jobs.reload() }, 5000)
    return () => clearInterval(t)
  }, [running, jobs.reload])
  useEffect(() => { if (jobs.data && !running) onDone() }, [running]) // eslint-disable-line react-hooks/exhaustive-deps
  const act = useAction(jobs.reload)

  const start = () => void act.run(async () => {
    // A digest of this week that is already in review or approved is written again, so ask first.
    const { data: ex, error: e1 } = await hub().from('digests').select('status, developer:developers!inner(country), campaign:digest_campaigns!inner(week_start)')
      .eq('developer.country', market).eq('campaign.week_start', weekStartUtc()).in('status', ['in_review', 'approved'])
    if (e1) throw new Error(e1.message)
    if (ex?.length && !confirm(`This week's ${m.label} digest is already ${ex[0].status.replace('_', ' ')}. Creating it again replaces its text and your edits. Continue?`)) return
    const { error } = await hub().rpc('enqueue_job', { p_type: 'pipeline', p_payload: { include_analyzed: true, country: market, max_age_days: WINDOW_DAYS, force: true }, p_triggered_by: 'manual' })
    if (error) throw new Error(error.message)
  })
  // Progress of the latest run (the hub works through runs one after another).
  const latest = (jobs.data ?? []).find(j => j.job_type === 'pipeline')
  const since = latest?.created_at ?? ''
  const byStage = new Map<string, { done: number; failed: number; active: number }>()
  for (const j of jobs.data ?? []) {
    const label = STAGE_LABEL[j.job_type]
    if (!label || j.created_at < since) continue
    const c = byStage.get(label) ?? { done: 0, failed: 0, active: 0 }
    if (j.status === 'succeeded') c.done++; else if (j.status === 'failed') c.failed++; else if (ACTIVE_JOB.includes(j.status)) c.active++
    byStage.set(label, c)
  }
  const failed = (jobs.data ?? []).filter(j => j.status === 'failed' && j.job_type !== 'scan_source' && j.created_at >= since).slice(0, 3)
  const runLabel = marketOf(latest?.payload?.country)?.label

  return (
    <section className="adm-card">
      <h2>Create the {m.label} digest</h2>
      <p className="muted">Reads the {m.label} sources, analyses the articles of the last {WINDOW_DAYS} days, picks the best ones for small developers and writes a draft in {LANGS[m.language]}. It runs in the background and takes a few minutes. Nothing is sent to anyone, and nothing runs by itself.</p>
      <div className="row"><button className="btn pri" type="button" disabled={act.busy || running} onClick={start}>{running ? `Running${runLabel ? ` (${runLabel})` : ''}…` : `Create ${m.label} digest`}</button></div>
      <ErrorLine error={act.error ?? jobs.error} />
      {byStage.size > 0 && (
        <div className="scrollx"><table>
          <caption className="muted" style={{ textAlign: 'left' }}>Latest run{runLabel ? `: ${runLabel}` : ''}, started {when(latest?.created_at)}</caption>
          <thead><tr><th>Step</th><th>Done</th><th>In progress</th><th>Failed</th></tr></thead>
          <tbody>{STAGE_ORDER.filter(s => byStage.has(s)).map(s => { const c = byStage.get(s)!; return <tr key={s}><td>{s}</td><td>{c.done}</td><td>{c.active || '—'}</td><td>{c.failed ? <Pill tone="bad">{c.failed}</Pill> : '—'}</td></tr> })}</tbody>
        </table></div>
      )}
      {failed.length > 0 && <div className="err">{failed.map(j => `${STAGE_LABEL[j.job_type] ?? j.job_type}: ${j.error}`).join(' · ')}</div>}
    </section>
  )
}

function BestItems({ market, reloadKey }: { market: Market; reloadKey: number }) {
  const m = marketOf(market)!
  const list = useLoad(async () => {
    const { data: src, error: e0 } = await hub().from('research_sources').select('id').eq('country', market)
    if (e0) throw e0
    const ids = (src ?? []).map(s => s.id)
    if (!ids.length) return [] as Item[]
    const since = new Date(Date.now() - WINDOW_DAYS * 864e5).toISOString()
    const { data, error } = await hub().from('intelligence_items').select('id,title,publisher,canonical_url,publication_date,ai_score,status,summary').in('primary_source_id', ids).or(`publication_date.gte.${since},and(publication_date.is.null,created_at.gte.${since})`).in('status', ['analyzed', 'approved', 'selected']).order('ai_score', { ascending: false }).limit(15)
    if (error) throw error
    return data as Item[]
  }, [reloadKey, market])
  return (
    <section className="adm-card">
      <h2>Best {m.label} articles of the last {WINDOW_DAYS} days</h2>
      <p className="muted">What the analysis rated highest. The digest picks from these for the audience.</p>
      <ErrorLine error={list.error} />
      {list.data && list.data.length === 0 ? <Empty>Nothing analysed yet. Create the digest above.</Empty> : (
        <div className="scrollx"><table>
          <thead><tr><th>Score</th><th>Article</th><th>Source</th><th>Date</th></tr></thead>
          <tbody>{list.data?.map(i => (
            <tr key={i.id}><td><b>{i.ai_score ?? '—'}</b></td>
              <td>{i.canonical_url ? <a href={i.canonical_url} target="_blank" rel="noreferrer">{i.title}</a> : i.title}{i.summary && <div className="muted" style={{ fontSize: 13 }}>{i.summary.slice(0, 160)}{i.summary.length > 160 ? '…' : ''}</div>}</td>
              <td>{i.publisher ?? '—'}</td><td>{when(i.publication_date)}</td></tr>))}</tbody>
        </table></div>
      )}
    </section>
  )
}

function DigestEditor({ d, onChange, onClose }: { d: DigestRow; onChange: () => void; onClose: () => void }) {
  const items = useLoad(async () => {
    const { data, error } = await hub().from('digest_items').select('id,section,position,headline,summary,why_relevant,impact,source_url,source_name,is_removed').eq('digest_id', d.id).order('section').order('position')
    if (error) throw error
    return data as DItem[]
  }, [d.id])
  const [pulse, setPulse] = useState(d.content?.market_pulse ?? '')
  const [insight, setInsight] = useState(d.content?.insight ?? '')
  const [edits, setEdits] = useState<Record<string, Partial<DItem>>>({})
  const [note, setNote] = useState('')
  const act = useAction(async () => { onChange(); await items.reload(); setEdits({}) })
  const locked = d.status === 'sent'
  const merged: DItem[] = (items.data ?? []).map(i => ({ ...i, ...edits[i.id] }))
  const dirty = pulse !== (d.content?.market_pulse ?? '') || insight !== (d.content?.insight ?? '') || Object.keys(edits).length > 0
  const set = (id: string, p: Partial<DItem>) => setEdits(e => ({ ...e, [id]: { ...e[id], ...p } }))
  const content: DigestContent = { ...(d.content ?? {}), market_pulse: pulse, insight }
  const generatedAt = (d.content as { generated_at?: string } | null)?.generated_at ?? d.created_at
  const md = digestToMarkdown(exportTitle(d.language, generatedAt), d.language, content, merged)

  const save = () => void act.run(async () => {
    for (const [id, p] of Object.entries(edits)) {
      const { error } = await hub().from('digest_items').update({ headline: p.headline, summary: p.summary, why_relevant: p.why_relevant, impact: p.impact, is_removed: p.is_removed, updated_at: new Date().toISOString() }
      ).eq('id', id)
      if (error) throw error
    }
    const { error } = await hub().from('digests').update({ content, html: null, status: d.status === 'generated' ? 'in_review' : d.status, updated_at: new Date().toISOString() }).eq('id', d.id)
    if (error) throw error
  })
  const setStatus = (status: string) => void act.run(async () => {
    // The database fills in who approved and when (digest_guard).
    const { error } = await hub().from('digests').update(status === 'approved' ? { status } : { status, approved_by: null, approved_at: null }).eq('id', d.id)
    if (error) throw error
  })
  const copy = async (what: 'md' | 'html') => {
    try {
      if (what === 'html' && 'ClipboardItem' in window) await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([mdToHtml(md)], { type: 'text/html' }), 'text/plain': new Blob([md], { type: 'text/plain' }) })])
      else await navigator.clipboard.writeText(md)
      setNote(what === 'html' ? 'Copied. Paste it into Substack.' : 'Markdown copied.')
    } catch (e) { setNote(errText(e)) }
  }

  return (
    <section className="adm-card">
      <div className="row"><h2 style={{ margin: 0 }}>{d.title}</h2><span className="sp" /><Pill tone={DIGEST_TONE[d.status]}>{d.status.replace('_', ' ')}</Pill><button className="btn sm" onClick={onClose}>Close</button></div>
      <p className="muted">Created {when(generatedAt)} · {LANGS[d.language as keyof typeof LANGS] ?? d.language}. Read it and check the facts against the links before you publish. Edits are saved when you click Save.</p>
      {d.error && <div className="err">{d.error}</div>}
      <ErrorLine error={act.error ?? items.error} />
      <Field label="Market pulse"><textarea rows={4} value={pulse} disabled={locked} onChange={e => setPulse(e.target.value)} /></Field>
      {merged.map(i => (
        <div key={i.id} className="adm-card" style={{ background: 'var(--soft)', opacity: i.is_removed ? 0.5 : 1 }}>
          <div className="row"><Pill tone="plan">{i.section.replace('_', ' ')}</Pill><span className="sp" />
            <button className="btn sm" disabled={locked} onClick={() => set(i.id, { is_removed: !i.is_removed })}>{i.is_removed ? 'Put back' : 'Remove'}</button></div>
          <Field label="Headline"><input value={i.headline} disabled={locked || i.is_removed} onChange={e => set(i.id, { headline: e.target.value })} /></Field>
          <Field label="Summary"><textarea rows={3} value={i.summary ?? ''} disabled={locked || i.is_removed} onChange={e => set(i.id, { summary: e.target.value })} /></Field>
          <Field label="Why it matters"><textarea rows={2} value={i.why_relevant ?? ''} disabled={locked || i.is_removed} onChange={e => set(i.id, { why_relevant: e.target.value })} /></Field>
          {i.source_url && <a href={i.source_url} target="_blank" rel="noreferrer" style={{ fontSize: 14 }}>{i.source_name ?? i.source_url}</a>}
        </div>))}
      <Field label="Cobuildy insight"><textarea rows={3} value={insight} disabled={locked} onChange={e => setInsight(e.target.value)} /></Field>
      <details><summary>Preview the text that is copied (with the call to action)</summary><pre style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{md}</pre></details>
      {note && <p className="muted" role="status">{note}</p>}
      <div className="row">
        <button className="btn pri" disabled={act.busy || !dirty || locked} onClick={save}>Save changes</button>
        <button className="btn" disabled={dirty} title={dirty ? 'Save your changes first' : ''} onClick={() => void copy('html')}>Copy for Substack</button>
        <button className="btn" disabled={dirty} title={dirty ? 'Save your changes first' : ''} onClick={() => void copy('md')}>Copy Markdown</button>
        <span className="sp" />
        {!locked && (d.status === 'approved'
          ? <button className="btn" disabled={act.busy} onClick={() => setStatus('in_review')}>Back to review</button>
          : <button className="btn" disabled={act.busy || dirty} title={dirty ? 'Save your changes first' : ''} onClick={() => setStatus('approved')}>Mark as approved</button>)}
      </div>
    </section>
  )
}

function Digests({ market, reloadKey }: { market: Market; reloadKey: number }) {
  const m = marketOf(market)!
  const list = useLoad(async () => {
    const { data, error } = await hub().from('digests').select('id,title,status,language,content,error,created_at,approved_at,developer:developers!inner(company_name,country),campaign:digest_campaigns(week_start)').eq('developer.country', market).order('created_at', { ascending: false }).limit(30)
    if (error) throw error
    return data as unknown as DigestRow[]
  }, [reloadKey, market])
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => { setOpen(null) }, [market])
  const cur = list.data?.find(d => d.id === open)
  return (
    <>
      {cur && <DigestEditor key={cur.id} d={cur} onChange={list.reload} onClose={() => setOpen(null)} />}
      <section className="adm-card">
        <h2>{m.label} digests</h2>
        <ErrorLine error={list.error} />
        {list.data && list.data.length === 0 ? <Empty>No {m.label} digests yet. Create the digest above and the draft appears here.</Empty> : (
          <div className="scrollx"><table>
            <thead><tr><th>Week</th><th>Audience</th><th>Status</th><th>Created</th><th /></tr></thead>
            <tbody>{list.data?.map(d => (
              <tr key={d.id}><td>{when(d.campaign?.week_start)}</td><td>{d.developer?.company_name ?? '—'}</td><td><Pill tone={DIGEST_TONE[d.status]}>{d.status.replace('_', ' ')}</Pill>{d.error && <div className="muted" style={{ fontSize: 13 }}>{d.error}</div>}</td><td>{when(d.created_at)}</td>
                <td><button className="btn sm" disabled={d.status === 'failed'} onClick={() => { setOpen(d.id); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Open</button></td></tr>))}</tbody>
          </table></div>
        )}
      </section>
    </>
  )
}

export function DigestPage() {
  const gate = useLoad(async () => {
    const { data, error } = await hub().rpc('can_edit')
    if (error) throw error
    return data === true
  })
  const [version, setVersion] = useState(0)
  const [market, setMarket] = useState<Market>('ES')
  if (gate.loading) return <Empty>Loading…</Empty>
  if (gate.error) return <ErrorLine error={gate.error} />
  if (!gate.data) return <div className="adm-card"><h2>No access yet</h2><p className="muted">Your account is not an editor of the Intelligence Hub. Ask an admin to add you to the hub team, then reload this page.</p></div>
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div className="row" role="tablist" aria-label="Market">
        {MARKETS.map(x => <button key={x.code} role="tab" aria-selected={market === x.code} className={market === x.code ? 'btn pri' : 'btn'} type="button" onClick={() => setMarket(x.code)}>{x.label}</button>)}
      </div>
      <Run market={market} onDone={() => setVersion(v => v + 1)} />
      <Digests market={market} reloadKey={version} />
      <BestItems market={market} reloadKey={version} />
      <Sources market={market} />
    </div>
  )
}
