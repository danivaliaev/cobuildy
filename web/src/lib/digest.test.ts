import { describe, expect, it } from 'vitest'
import { digestToMarkdown, exportTitle, mdToHtml, parseSourceList, weekStartUtc } from './digest'

describe('source list', () => {
  it('reads addresses and names, drops duplicates and junk', () => {
    const r = parseSourceList('Idealista News, https://www.idealista.com/news/\nhttps://www.idealista.com/news\nel-economista.es/vivienda\nnot a site\n\n')
    expect(r.ok).toEqual([
      { name: 'Idealista News', url: 'https://www.idealista.com/news/' },
      { name: 'el-economista.es', url: 'https://el-economista.es/vivienda' },
    ])
    expect(r.bad).toEqual(['not a site'])
  })
})

describe('digest text', () => {
  const items = [
    { section: 'financing', position: 0, headline: 'Los bancos relajan la deuda a promotor', summary: 'Resumen.', why_relevant: 'Más deuda senior.', impact: null, source_url: 'https://ex.com/a', source_name: 'Expansión', is_removed: false },
    { section: 'financing', position: 1, headline: 'Quitada', summary: 'x', why_relevant: null, impact: null, source_url: null, source_name: null, is_removed: true },
    { section: 'market_news', position: 0, headline: 'El suelo sube', summary: 'S', why_relevant: null, impact: 'Costes mayores.', source_url: 'https://www.ex.com/b', source_name: null, is_removed: false },
  ]
  const md = digestToMarkdown('Resumen semanal', 'es', { market_pulse: 'Pulso.', insight: 'Visión.' }, items)
  it('orders sections, skips removed items, labels in the language', () => {
    expect(md.indexOf('## Mercado')).toBeLessThan(md.indexOf('## Financiación'))
    expect(md).not.toContain('Quitada')
    expect(md).toContain('## Pulso del mercado')
    expect(md).toContain('**Por qué importa:** Más deuda senior.')
    expect(md).toContain('[Leer en Expansión](https://ex.com/a)')
    expect(md).toContain('[Leer en ex.com](https://www.ex.com/b)')
  })
  it('becomes HTML and escapes markup', () => {
    const html = mdToHtml(md)
    expect(html).toContain('<h1>Resumen semanal</h1>')
    expect(html).toContain('<a href="https://ex.com/a">Leer en Expansión</a>')
    expect(mdToHtml('<script>x</script>')).toBe('<p>&lt;script&gt;x&lt;/script&gt;</p>')
  })
})

describe('newsletter extras', () => {
  it('ends with a call to action in the digest language, tagged for the funnel report', () => {
    const es = digestToMarkdown('T', 'es', {}, [])
    expect(es).toContain('¿Desarrollas un proyecto y buscas financiación?')
    expect(es).toContain('(https://cobuildy.com/?utm_source=substack&utm_medium=digest&utm_campaign=digest-es)')
    const pt = digestToMarkdown('T', 'pt', {}, [])
    expect(pt).toContain('Está a desenvolver um projeto e procura financiamento?')
    expect(pt).toContain('utm_campaign=digest-pt')
    expect(pt.indexOf('procura financiamento')).toBeLessThan(pt.indexOf('Resumo elaborado pela equipa'))
  })
  it('titles the text by market and day', () => {
    expect(exportTitle('es', '2026-11-28T14:00:00Z')).toBe('Cobuildy Weekly España · 28 de noviembre de 2026')
    expect(exportTitle('pt', '2026-11-28T14:00:00Z')).toBe('Cobuildy Weekly Portugal · 28 de novembro de 2026')
  })
  it('finds the Monday of the week like the hub does', () => {
    expect(weekStartUtc(new Date('2026-11-28T10:00:00Z'))).toBe('2026-11-23')
    expect(weekStartUtc(new Date('2026-11-29T23:59:00Z'))).toBe('2026-11-23')
    expect(weekStartUtc(new Date('2026-11-30T00:00:00Z'))).toBe('2026-11-30')
  })
})
