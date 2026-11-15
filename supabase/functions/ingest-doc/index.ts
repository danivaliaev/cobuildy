// Cobuildy document reader: reads one uploaded file of a project and returns the facts and budget lines in it.
// It runs with the caller's own JWT (row-level security and storage policies decide which files it can open) and never writes to the database:
// the app shows the result for review, saves what the developer accepts and keeps the file and place each value came from.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import * as XLSX from 'npm:xlsx@0.18.5'
import { unzipSync } from 'npm:fflate@0.8.2'
import fieldModel from './fields.json' with { type: 'json' }
import budgetModel from './budget.json' with { type: 'json' }
import { DOC_TYPES, STRATEGY_TEXT, cleanExtraction, docxToText, sheetsToText, systemPrompt } from './lib.ts'

const MODEL = Deno.env.get('INGEST_MODEL') ?? Deno.env.get('AGENT_MODEL') ?? 'claude-sonnet-5-5'
const DAILY_LIMIT = Number(Deno.env.get('INGEST_DAILY_LIMIT') ?? '40')
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

type Field = { key: string; label: string; kind: string; question: string }
const FIELDS = fieldModel.fields as Field[]
const FK: Record<string, Field> = Object.fromEntries(FIELDS.map(f => [f.key, f]))
type Cat = { id: string; label: string; hint: string }
const BUDGET = budgetModel as unknown as Record<string, { cats: Cat[] }>

const strategyOf = (v: string): string => (/land/i.test(v) ? 'land' : /progress|construction|under way|underway/i.test(v) ? 'wip' : /refurb|renovat/i.test(v) ? 'refurb' : 'land')

const TOOL = {
  name: 'record_extraction',
  description: 'Record what the document says: its type, the profile facts in it and, if it has one, the cost budget lines.',
  input_schema: {
    type: 'object',
    properties: {
      doc_type: { type: 'string', enum: DOC_TYPES },
      summary: { type: 'string', description: 'One sentence on what the document is.' },
      facts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string', enum: FIELDS.map(f => f.key) },
            status: { type: 'string', enum: ['filled', 'partial', 'unknown'] },
            display: { type: 'string', description: 'Short plain-text value in English, under 70 characters.' },
            amount: { type: ['number', 'null'], description: 'Money fields: euros. Build programme: months. Pre-sales: units. Otherwise null.' },
            ref: { type: 'string', description: 'Where in the file: Sheet!Cell, page number or section.' },
            quote: { type: 'string', description: 'Exact short text that supports the fact, at most 120 characters.' },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          },
          required: ['key', 'status', 'ref', 'confidence'],
        },
      },
      budget_lines: {
        type: 'array',
        description: 'Cost lines only. No subtotals, totals or sales revenue.',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            cat: { type: 'string', description: 'The category id that fits best.' },
            amount: { type: 'number', description: 'Euros.' },
            spent: { type: ['number', 'null'], description: 'Euros already spent or paid, if the document has such a column.' },
            ref: { type: 'string' },
          },
          required: ['label', 'cat', 'amount', 'ref'],
        },
      },
      stated_total: { type: ['number', 'null'], description: 'The document’s own grand total of the budget lines, in euros.' },
      warnings: { type: 'array', items: { type: 'string' } },
    },
    required: ['doc_type', 'summary', 'facts'],
  },
}

const b64 = (bytes: Uint8Array) => {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return json({ error: 'The document reader is not configured yet.' }, 503)

  const auth = req.headers.get('Authorization') ?? ''
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
  const { data: u, error: ue } = await sb.auth.getUser()
  if (ue || !u.user) return json({ error: 'Please sign in again.' }, 401)

  let body: { project_id?: string; doc_id?: string }
  try { body = await req.json() } catch { return json({ error: 'Invalid request.' }, 400) }
  if (!body.project_id || !body.doc_id) return json({ error: 'Invalid request.' }, 400)

  // Both reads go through row-level security: only the project's owner (or staff) gets a row.
  const { data: project } = await sb.from('projects').select('id,status,profile').eq('id', body.project_id).maybeSingle()
  if (!project) return json({ error: 'Project not found.' }, 404)
  if (['discarded', 'closed_won', 'closed_lost'].includes(project.status)) return json({ error: 'This project is closed.' }, 409)
  const { data: doc } = await sb.from('project_docs').select('id,storage_path,file_name,mime').eq('id', body.doc_id).eq('project_id', body.project_id).maybeSingle()
  if (!doc?.storage_path) return json({ error: 'The file was not found.' }, 404)

  const { count: today } = await sb.from('agent_calls').select('id', { count: 'exact', head: true })
    .eq('user_id', u.user.id).eq('kind', 'ingest').gte('created_at', new Date(Date.now() - 864e5).toISOString())
  if ((today ?? 0) >= DAILY_LIMIT) return json({ error: 'Daily limit for reading documents reached. It resets within 24 hours.' }, 429)

  const dl = await sb.storage.from('data-room').download(doc.storage_path)
  if (dl.error || !dl.data) return json({ error: 'The file could not be opened.' }, 404)
  const bytes = new Uint8Array(await dl.data.arrayBuffer())
  const mime = doc.mime ?? ''
  const name = doc.file_name ?? 'document'

  // The file as the model reads it: PDFs and pictures go in as they are, spreadsheets and Word files as text.
  const content: unknown[] = []
  const warnings: string[] = []
  try {
    if (mime === 'application/pdf') content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64(bytes) } })
    else if (mime === 'image/jpeg' || mime === 'image/png') content.push({ type: 'image', source: { type: 'base64', media_type: mime, data: b64(bytes) } })
    else if (mime.includes('spreadsheetml') || mime === 'application/vnd.ms-excel') {
      const t = sheetsToText(XLSX, bytes)
      if (!t.text) return json({ error: 'The workbook is empty.' }, 422)
      if (t.truncated) warnings.push('The workbook is large, so only its first rows and sheets were read.')
      content.push({ type: 'text', text: `Spreadsheet "${name}". Each row is written as ADDRESS=value pairs, so a value in cell C14 of sheet Budget is cited as Budget!C14.\n\n${t.text}` })
    } else if (mime.includes('wordprocessingml')) {
      const t = docxToText(unzipSync, bytes)
      if (!t.text) return json({ error: 'The document has no text.' }, 422)
      if (t.truncated) warnings.push('The document is long, so only its first part was read.')
      content.push({ type: 'text', text: `Word document "${name}":\n\n${t.text}` })
    } else return json({ error: 'Old .doc files cannot be read. Save the file as .docx or PDF and upload it again.' }, 415)
  } catch (e) {
    console.error('convert', String(e).slice(0, 300))
    return json({ error: 'The file could not be read. It may be damaged or protected by a password.' }, 422)
  }
  content.push({ type: 'text', text: 'Read this document and record what it says by calling the record_extraction tool. Respond only with that tool call.' })

  const fields = (project.profile as { fields?: Record<string, { st: string; v: string }> } | null)?.fields ?? {}
  const strategy = strategyOf(fields.a_strategy?.st && fields.a_strategy.st !== 'empty' ? fields.a_strategy.v : '')
  const cats = (BUDGET[strategy] ?? BUDGET.land).cats
  const current = Object.fromEntries(Object.entries(fields).filter(([k, f]) => FK[k] && (f.st === 'filled' || f.st === 'partial') && f.v).map(([k, f]) => [k, f.v]))
  const system = systemPrompt({ fields: FIELDS, cats, strategy, current })

  let res: Response
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 8000, system, tools: [TOOL], tool_choice: { type: 'auto' }, messages: [{ role: 'user', content }] }),
      signal: AbortSignal.timeout(130_000),
    })
  } catch {
    return json({ error: 'Reading the document took too long. Try again, or upload a smaller file.' }, 504)
  }
  if (!res.ok) {
    const t = (await res.text()).slice(0, 400)
    console.error('anthropic', res.status, t)
    if (res.status === 400 && /page|too large|too long|size/i.test(t)) return json({ error: 'This file is too long or too large to read here. Upload only the relevant pages.' }, 422)
    return json({ error: 'The document reader is temporarily unavailable. Please try again.' }, 502)
  }
  const out = await res.json()
  const use = (out.content as Array<{ type: string; input?: unknown }>).find(b => b.type === 'tool_use')
  if (!use) {
    console.error('no tool_use', JSON.stringify(out.content).slice(0, 300))
    return json({ error: 'The reader could not make sense of this file. Try again, or upload a clearer version.' }, 502)
  }
  const result = cleanExtraction(use?.input ?? {}, { isKey: k => Boolean(FK[k]), kind: k => FK[k]?.kind ?? 'text', isCat: c => cats.some(x => x.id === c) })
  result.warnings = [...warnings, ...result.warnings]

  await sb.from('agent_calls').insert({ user_id: u.user.id, project_id: body.project_id, kind: 'ingest', input_tokens: out.usage?.input_tokens ?? 0, output_tokens: out.usage?.output_tokens ?? 0 })
  return json({ ...result, strategy: STRATEGY_TEXT[strategy] ? strategy : 'land' })
})
