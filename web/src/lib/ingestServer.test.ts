import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { unzipSync, zipSync, strToU8 } from 'fflate'
import { DOC_SLOT, cleanExtraction, docxToText, sheetsToText, systemPrompt } from '../../../supabase/functions/ingest-doc/lib'
import fields from './fields.json'
import budget from './budget.json'

const FK = new Map(fields.fields.map(f => [f.key, f]))
const ctx = { isKey: (k: string) => FK.has(k), kind: (k: string) => FK.get(k)?.kind ?? 'text', isCat: (c: string) => budget.land.cats.some(x => x.id === c) }

function book(): Uint8Array {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([['Budget Vale de Lagar'], [], ['Item', 'EUR', '%'], ['Construction', 3677591, 0.59], ['Design, PM', 684747, 0.11], ['Total', { t: 'n', f: 'SUM(B4:B5)', v: 4362338 }, 1]])
  XLSX.utils.book_append_sheet(wb, ws, 'Budget')
  const hidden = XLSX.utils.aoa_to_sheet([['secret', 1]])
  XLSX.utils.book_append_sheet(wb, hidden, 'Hidden')
  wb.Workbook = { Sheets: [{ Hidden: 0 }, { Hidden: 1 }] }
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))
}

describe('sheetsToText', () => {
  it('writes each cell with its address and skips empty rows and hidden sheets', () => {
    const { text, truncated } = sheetsToText(XLSX, book())
    expect(truncated).toBe(false)
    expect(text).toContain('## Sheet "Budget"')
    expect(text).toContain('A4=Construction | B4=3677591 | C4=0.59')
    expect(text).not.toContain('secret')
    expect(text.split('\n').some(l => l.trim() === '')).toBe(false)
  })
  it('reads the stored result of a formula', () => {
    expect(sheetsToText(XLSX, book()).text).toContain('B6=4362338')
  })
  it('stops at the row limit and says so', () => {
    const rows = Array.from({ length: 450 }, (_, i) => [`L${i}`, i])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Big')
    const r = sheetsToText(XLSX, new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })))
    expect(r.truncated).toBe(true)
    expect(r.text).toContain('A400=L399')
    expect(r.text).not.toContain('A401=')
  })
})

describe('docxToText', () => {
  const docx = (xml: string) => zipSync({ 'word/document.xml': strToU8(xml) })
  it('reads paragraphs and table rows', () => {
    const xml = '<w:document><w:body><w:p><w:r><w:t>Costs &amp; fees</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Build</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>1 660</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>'
    const { text } = docxToText(unzipSync, docx(xml))
    expect(text).toContain('Costs & fees')
    expect(text).toMatch(/Build\s+1 660/)
  })
  it('rejects a zip that is not a Word document', () => {
    expect(() => docxToText(unzipSync, zipSync({ 'a.txt': strToU8('x') }))).toThrow(/Word document/)
  })
})

describe('cleanExtraction', () => {
  it('keeps known fields and drops invented ones, bad statuses and absurd numbers', () => {
    const r = cleanExtraction({
      doc_type: 'nota_simple', summary: 'Land registry extract',
      facts: [
        { key: 'l_title', status: 'partial', display: 'Mortgage in favour of a bank', ref: 'p.2', quote: 'Hipoteca', confidence: 'high' },
        { key: 'made_up', status: 'filled', display: 'x', ref: '', confidence: 'high' },
        { key: 'f_gdv', status: 'filled', display: '', amount: 1e12, ref: '', confidence: 'high' },
        { key: 'a_units', status: 'maybe', display: '16', ref: '', confidence: 'high' },
      ],
    }, ctx)
    expect(r.doc_type).toBe('nota_simple')
    expect(r.slot).toBe('l_title')
    expect(r.facts.map(f => f.key)).toEqual(['l_title'])
  })
  it('keeps the more confident of two facts for the same field', () => {
    const r = cleanExtraction({ doc_type: 'other', summary: '', facts: [
      { key: 'a_units', status: 'filled', display: '15', ref: 'p.1', confidence: 'low' }, { key: 'a_units', status: 'filled', display: '16', ref: 'p.2', confidence: 'high' }] }, ctx)
    expect(r.facts).toHaveLength(1)
    expect(r.facts[0].display).toBe('16')
  })
  it('cleans budget lines, files unknown categories under other and warns when the total does not match', () => {
    const r = cleanExtraction({ doc_type: 'budget', summary: 'Budget', facts: [], budget_lines: [
      { label: 'Construction', cat: 'build', amount: 900, ref: 'Budget!B4' }, { label: 'Misc', cat: 'zzz', amount: 100, spent: 40, ref: 'Budget!B5' }, { label: '', cat: 'build', amount: 5 }, { label: 'Neg', cat: 'build', amount: -5 }],
      stated_total: 2000 }, ctx)
    expect(r.budget?.lines).toHaveLength(2)
    expect(r.budget?.lines[1]).toMatchObject({ cat: 'other', spent: 40 })
    expect(r.slot).toBe('f_budget')
    expect(r.warnings.join(' ')).toMatch(/add up to €1,000/)
  })
  it('does not warn when the lines match the stated total within one percent', () => {
    const r = cleanExtraction({ doc_type: 'budget', summary: '', facts: [], budget_lines: [{ label: 'A', cat: 'build', amount: 1000, ref: '' }], stated_total: 1005 }, ctx)
    expect(r.warnings).toEqual([])
  })
  it('turns garbage into an empty result', () => {
    const r = cleanExtraction(null, ctx)
    expect(r).toMatchObject({ doc_type: 'other', facts: [], budget: null, slot: null })
  })
  it('maps every document type that has a data room slot to a real field', () => {
    for (const k of Object.values(DOC_SLOT)) expect(FK.has(k)).toBe(true)
  })
})

describe('systemPrompt', () => {
  it('names the project type, the categories and the recorded values', () => {
    const p = systemPrompt({ fields: fields.fields as never, cats: budget.refurb.cats, strategy: 'refurb', current: { a_loc: 'Faro' } })
    expect(p).toContain('refurbishment or renovation')
    expect(p).toContain('acqtax')
    expect(p).toContain('"a_loc":"Faro"')
  })
})
