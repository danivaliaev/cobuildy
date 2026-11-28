// Helpers of the admin digest page.

/** Addresses pasted one per line, optionally as "Name, address" or "Name | address". Bad lines are returned separately. */
export function parseSourceList(text: string): { ok: Array<{ name: string; url: string }>; bad: string[] } {
  const ok: Array<{ name: string; url: string }> = []
  const bad: string[] = []
  const seen = new Set<string>()
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const m = /(https?:\/\/\S+|(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/\S*)?)\s*$/i.exec(line)
    if (!m) { bad.push(line); continue }
    let url = m[1]
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url
    let host: string
    try { const u = new URL(url); host = u.hostname.replace(/^www\./, ''); if (!host.includes('.')) throw new Error('host') } catch { bad.push(line); continue }
    const key = url.replace(/\/$/, '').toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const name = line.slice(0, m.index).replace(/[,|;:\-–—\s]+$/, '').trim() || host
    ok.push({ name: name.slice(0, 120), url: url.slice(0, 500) })
  }
  return { ok, bad }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const inline = (s: string) => esc(s)
  .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t: string, u: string) => `<a href="${u}">${t}</a>`)
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/\*([^*]+)\*/g, '<em>$1</em>')

/** The digest's Markdown as simple HTML for pasting into an email tool. Headings, paragraphs, bold, italics, links and rules only. */
export function mdToHtml(md: string): string {
  const out: string[] = []
  for (const block of md.replace(/\r/g, '').split(/\n{2,}/)) {
    const b = block.trim()
    if (!b) continue
    const h = /^(#{1,3})\s+(.*)$/.exec(b)
    if (h) out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`)
    else if (/^---+$/.test(b)) out.push('<hr>')
    else out.push(`<p>${inline(b).replace(/\n/g, '<br>')}</p>`)
  }
  return out.join('\n')
}

export type DigestItemRow = { section: string; position: number; headline: string; summary: string | null; why_relevant: string | null; impact: string | null; source_url: string | null; source_name: string | null; is_removed: boolean }
export type DigestContent = { title?: string; subtitle?: string; market_pulse?: string; insight?: string }

const SECTION_ORDER = ['market_news', 'financing', 'regulatory', 'opportunities']
const LABELS: Record<string, { sections: Record<string, string>; pulse: string; insight: string; why: string; impact: string; read: string; footer: string; cta: string; ctaLink: string; brand: string }> = {
  es: { sections: { market_news: 'Mercado', financing: 'Financiación', regulatory: 'Normativa', opportunities: 'Oportunidades' }, pulse: 'Pulso del mercado', insight: 'La visión de Cobuildy', why: 'Por qué importa', impact: 'Impacto posible', read: 'Leer en', footer: 'Resumen elaborado por el equipo de Cobuildy a partir de fuentes públicas. Los enlaces llevan a los artículos originales.', cta: '**¿Desarrollas un proyecto y buscas financiación?** Cobuildy conecta a promotores con inversores y financiadores en España y Portugal. Cuéntanos tu proyecto y te decimos qué inversores encajan.', ctaLink: 'Cuéntanos tu proyecto en cobuildy.com', brand: 'Cobuildy Weekly España' },
  en: { sections: { market_news: 'Market news', financing: 'Financing', regulatory: 'Regulation', opportunities: 'Opportunities' }, pulse: 'Market pulse', insight: 'Cobuildy insight', why: 'Why it matters', impact: 'Possible impact', read: 'Read on', footer: 'Summary prepared by the Cobuildy team from public sources. Links lead to the original articles.', cta: '**Developing a project and looking for funding?** Cobuildy connects developers with investors and lenders in Spain and Portugal. Tell us about your project and we show you which investors fit.', ctaLink: 'Tell us about your project at cobuildy.com', brand: 'Cobuildy Weekly' },
  pt: { sections: { market_news: 'Mercado', financing: 'Financiamento', regulatory: 'Regulação', opportunities: 'Oportunidades' }, pulse: 'Pulso do mercado', insight: 'A visão da Cobuildy', why: 'Porque importa', impact: 'Impacto possível', read: 'Ler em', footer: 'Resumo elaborado pela equipa da Cobuildy a partir de fontes públicas. As ligações levam aos artigos originais.', cta: '**Está a desenvolver um projeto e procura financiamento?** A Cobuildy liga promotores a investidores e financiadores em Portugal e Espanha. Conte-nos o seu projeto e mostramos-lhe os investidores que se ajustam.', ctaLink: 'Conte-nos o seu projeto em cobuildy.com', brand: 'Cobuildy Weekly Portugal' },
}

/** The first line of the text, for a newsletter: brand, market and the day it was written. */
export function exportTitle(language: string, generatedAt?: string | null): string {
  const L = LABELS[language] ?? LABELS.en
  const d = generatedAt ? new Date(generatedAt) : new Date()
  const locale = language === 'pt' ? 'pt-PT' : language === 'es' ? 'es-ES' : 'en-GB'
  return `${L.brand} · ${Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })}`.replace(/ · $/, '')
}

/** Monday (UTC) of the week of d as YYYY-MM-DD: the same week the hub puts a digest in. */
export function weekStartUtc(d = new Date()): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7))
  return x.toISOString().slice(0, 10)
}

/** The digest as Markdown, ready to edit or paste. Removed items are left out. */
export function digestToMarkdown(title: string, language: string, content: DigestContent, items: DigestItemRow[]): string {
  const L = LABELS[language] ?? LABELS.en
  const out = [`# ${title}`, '']
  if (content.market_pulse) out.push(`## ${L.pulse}`, '', content.market_pulse.trim(), '')
  for (const sec of SECTION_ORDER) {
    const rows = items.filter(i => i.section === sec && !i.is_removed).sort((a, b) => a.position - b.position)
    if (!rows.length) continue
    out.push(`## ${L.sections[sec] ?? sec}`, '')
    for (const it of rows) {
      out.push(`### ${it.headline}`, '')
      if (it.summary) out.push(it.summary.trim(), '')
      if (it.why_relevant) out.push(`**${L.why}:** ${it.why_relevant.trim()}`, '')
      if (it.impact) out.push(`**${L.impact}:** ${it.impact.trim()}`, '')
      if (it.source_url) out.push(`[${L.read} ${it.source_name || new URL(it.source_url).hostname.replace(/^www\./, '')}](${it.source_url})`, '')
    }
  }
  if (content.insight) out.push(`## ${L.insight}`, '', content.insight.trim(), '')
  // The call to action links to the site with tags, so visits from the newsletter show up in the funnel report.
  out.push('---', '', L.cta, '', `[${L.ctaLink}](https://cobuildy.com/?utm_source=substack&utm_medium=digest&utm_campaign=digest-${LABELS[language] ? language : 'en'})`, '', `*${L.footer}*`)
  return out.join('\n')
}
