import { describe, expect, it } from 'vitest'
import { digestToMarkdown, mdToHtml, parseSourceList } from './digest'

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
