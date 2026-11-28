// Turns a site's sitemap (kind "sitemap") or its news list pages (kind "listing") into an RSS feed, for sites that publish no RSS of their own.
// The Intelligence Hub reads the result like any other RSS source (source_type "rss"), so the worker and its schedule are untouched.
// The caller gives only a source id. The site to read comes from that source's row in hub.research_sources (config.sitemap_url or config.list_urls),
// so this cannot be used to fetch an arbitrary address. It follows only addresses on the same site.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const UA = "Mozilla/5.0 (compatible; CobuildyIntelligenceHub/1.0; +https://cobuildy.com)";

/** Public web addresses only (no private networks or local names). Staff type the addresses; this guards against mistakes. */
function publicUrl(raw: string, base?: string): URL | null {
  let u: URL;
  try { u = new URL(raw, base); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password) return null;
  const h = u.hostname.toLowerCase();
  if ((!h.includes(".") && !h.includes(":")) || h.startsWith("[") || /^\d+$/.test(h) || /\.(local|internal|localhost|lan|home|corp)$/.test(h) || h === "localhost") return null;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]);
    if (a === 10 || a === 127 || a === 0 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return null;
  }
  u.hash = "";
  return u;
}
const bareHost = (u: URL) => u.hostname.toLowerCase().replace(/^www\./, "");

/** One GET with redirects followed by hand, so every hop is checked and stays on the same site. */
async function getPublic(url: string, site: string, ms: number, maxChars: number): Promise<{ status: number; text: string; url: string }> {
  let cur = publicUrl(url);
  for (let hop = 0; cur && hop < 5; hop++) {
    if (bareHost(cur) !== site) throw new Error("The address leaves the site");
    const res = await fetch(cur.toString(), { redirect: "manual", headers: { "user-agent": UA, accept: "application/xml, text/xml, text/html;q=0.9, */*;q=0.5", "accept-language": "es,en;q=0.8,pt;q=0.7" }, signal: AbortSignal.timeout(ms) });
    if (res.status >= 300 && res.status < 400) { cur = publicUrl(res.headers.get("location") ?? "", cur.toString()); continue; }
    return { status: res.status, text: res.ok ? (await res.text()).slice(0, maxChars) : "", url: cur.toString() };
  }
  throw new Error("Too many redirects");
}

const xmlDecode = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").trim();
const tagText = (b: string, name: string) => { const m = b.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i")); return m ? xmlDecode(m[1]) : null; };
const isoOrNull = (s: string | null) => { if (!s) return null; const d = new Date(s); return Number.isNaN(d.getTime()) || d.getUTCFullYear() < 2000 ? null : d.toISOString(); };
const NOT_ARTICLE = /\/(tag|tags|category|categoria|categorias|author|autor|autores|page|pagina|search|buscar|login|contact|contacto|about|privacy|privacidad|cookies|aviso-legal|subscribe|events?|eventos?|podcasts?|webinars?)(\/|$)/i;

/** A readable title from the last part of an address, used only when the page itself cannot be read. */
function slugTitle(u: string): string {
  const seg = decodeURIComponent(new URL(u).pathname.split("/").filter(Boolean).pop() ?? "").replace(/\.(html?|php)$/i, "");
  const t = seg.replace(/[-_]+/g, " ").replace(/\b\d{5,}\b/g, "").replace(/\s+/g, " ").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : "";
}

function metaOf(html: string): { title: string | null; description: string | null; published: string | null } {
  const head = html.slice(0, 250_000);
  const meta = (names: string[]) => {
    for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
      const key = m[0].match(/(?:property|name|itemprop)=["']([^"']+)["']/i)?.[1]?.toLowerCase();
      if (key && names.includes(key)) { const v = m[0].match(/content=["']([^"']*)["']/i)?.[1]; if (v) return xmlDecode(v); }
    }
    return null;
  };
  const title = meta(["og:title", "twitter:title"]) ?? xmlDecode((head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ") ?? null;
  return {
    title: title || null,
    description: meta(["og:description", "description", "twitter:description"]),
    published: isoOrNull(meta(["article:published_time", "datepublished", "date", "dc.date", "og:published_time"]) ?? head.match(/<time\b[^>]*\bdatetime=["']([^"']+)["']/i)?.[1] ?? head.match(/"datePublished"\s*:\s*"([^"]+)"/i)?.[1] ?? null),
  };
}


const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Entry = { url: string; lastmod: string | null; title: string | null };
type Article = { url: string; title: string; snippet: string; published: string | null };

async function readArticles(sitemapUrl: string, opts: { days: number; maxPages: number }): Promise<Article[]> {
  const t0 = Date.now();
  const first = publicUrl(sitemapUrl);
  if (!first) throw new Error("Not a public web address");
  const site = bareHost(first);
  const cutoff = Date.now() - opts.days * 86400000;
  // The hub gives a feed 20 seconds in total, so everything here shares one clock.
  const left = () => t0 + 17_000 - Date.now();
  const get = (u: string, ms: number, maxChars: number) => {
    if (left() < 600) throw new Error("The site is too slow to answer");
    return getPublic(u, site, Math.min(ms, left()), maxChars);
  };
  const isMap = (t: string) => /<(urlset|sitemapindex)[\s>]/i.test(t.slice(0, 3000));

  // The address given, then the Sitemap lines in robots.txt, then the usual names.
  let root: { status: number; text: string; url: string } | null = null;
  let why = "";
  const tried = new Set<string>();
  const attempt = async (u: string) => {
    if (root || tried.has(u)) return;
    tried.add(u);
    try {
      const r = await get(u, 8_000, 6_000_000);
      if (r.status >= 200 && r.status < 300 && isMap(r.text)) root = r;
      else why = r.status >= 200 && r.status < 300 ? "This address is not a sitemap" : `HTTP ${r.status} fetching sitemap`;
    } catch (e) { why = e instanceof Error ? e.message : "The site did not answer"; }
  };
  await attempt(/\.xml(\.gz)?(\?|$)/i.test(first.pathname) ? first.toString() : first.origin + "/sitemap.xml");
  if (!root) {
    try {
      const robots = await get(first.origin + "/robots.txt", 5_000, 100_000);
      for (const m of robots.text.matchAll(/^\s*sitemap:\s*(\S+)/gim)) { const u = publicUrl(m[1]); if (u && bareHost(u) === site) await attempt(u.toString()); }
    } catch { /* robots.txt is optional */ }
    await attempt(first.origin + "/sitemap_index.xml");
  }
  if (!root) throw new Error(why || "No sitemap found");
  const rootText = (root as { text: string }).text;

  const entriesOf = (xml: string): Entry[] => {
    const out: Entry[] = [];
    for (const m of xml.matchAll(/<url[\s>][\s\S]*?<\/url>/gi)) {
      const loc = tagText(m[0], "loc");
      const u = loc ? publicUrl(loc) : null;
      if (!u || bareHost(u) !== site || u.pathname === "/" || NOT_ARTICLE.test(u.pathname) || /\.(jpe?g|png|gif|svg|webp|pdf|zip)$/i.test(u.pathname)) continue;
      out.push({ url: u.toString(), lastmod: isoOrNull(tagText(m[0], "news:publication_date") ?? tagText(m[0], "lastmod")), title: tagText(m[0], "news:title") });
    }
    return out;
  };

  let entries: Entry[] = [];
  if (/<sitemapindex[\s>]/i.test(rootText.slice(0, 3000))) {
    const kids = [...rootText.matchAll(/<sitemap[\s>][\s\S]*?<\/sitemap>/gi)].map((m, i) => ({ loc: tagText(m[0], "loc"), mod: isoOrNull(tagText(m[0], "lastmod")), i }))
      .filter((k) => k.loc && publicUrl(k.loc) && bareHost(publicUrl(k.loc)!) === site);
    // News sitemaps are made for recent articles. Otherwise the most recently changed ones, later in the list first (newest posts are usually last).
    const news = kids.filter((k) => /news/i.test(k.loc!));
    const recent = kids.filter((k) => k.mod && new Date(k.mod).getTime() >= cutoff).sort((x, y) => (y.mod ?? "").localeCompare(x.mod ?? "") || y.i - x.i);
    const pick = (news.length ? news : recent.length ? recent : kids.slice(-2)).slice(0, 4);
    const parts = await Promise.all(pick.map(async (k) => {
      try { const r = await get(k.loc!, 8_000, 6_000_000); return r.status >= 200 && r.status < 300 ? entriesOf(r.text) : []; } catch { return []; }
    }));
    entries = parts.flat();
  } else entries = entriesOf(rootText);

  entries = entries.filter((e) => !e.lastmod || new Date(e.lastmod).getTime() >= cutoff)
    .sort((x, y) => (y.lastmod ?? "").localeCompare(x.lastmod ?? "")).slice(0, opts.maxPages);

  const out: Article[] = new Array(entries.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(4, entries.length) }, async () => {
    while (i < entries.length) {
      const k = i++, e = entries[k];
      let title = e.title, snippet = "", published = e.lastmod;
      // A news sitemap already gives the title: skip the page, which is often behind a paywall or rate-limited.
      if (!e.title && left() > 2_500) {
        try {
          const p = await get(e.url, 5_000, 300_000);
          if (p.status >= 200 && p.status < 300) {
            const m = metaOf(p.text);
            title = m.title ?? title; snippet = (m.description ?? "").slice(0, 600); published = m.published ?? published;
          }
        } catch { /* fall back to the address */ }
      }
      title = (title && title.length > 8 ? title : slugTitle(e.url)).slice(0, 300);
      out[k] = { url: e.url, title, snippet, published };
    }
  }));
  return out.filter((a) => a && a.title);
}

/** Pages from a site's own news lists, for sites whose sitemap dates cannot be trusted and that have no feed.
 *  Two kinds of list page are understood: a Next.js page (the articles are in __NEXT_DATA__ with title, address and date) and a plain page
 *  (the article addresses are the links that match config.link_pattern; each article page is then read for its title and date). */
async function readListing(listUrls: string[], opts: { days: number; maxPages: number; linkPattern: RegExp | null }): Promise<Article[]> {
  const t0 = Date.now();
  const firsts = listUrls.map((u) => publicUrl(u)).filter((u): u is URL => !!u);
  if (!firsts.length) throw new Error("Not a public web address");
  const site = bareHost(firsts[0]);
  const cutoff = Date.now() - opts.days * 86400000;
  const left = () => t0 + 17_000 - Date.now();
  const get = (u: string, ms: number, maxChars: number) => {
    if (left() < 600) throw new Error("The site is too slow to answer");
    return getPublic(u, site, Math.min(ms, left()), maxChars);
  };
  const plain = (h: string) => xmlDecode(h.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ")).replace(/\s+/g, " ").trim();

  const known = new Map<string, Article>();          // articles read straight from a list page (Next.js)
  const links = new Map<string, true>();             // article addresses found as links (plain pages)
  let lastError = "";
  const walk = (node: unknown, base: URL, depth = 0) => {
    if (!node || typeof node !== "object" || depth > 40) return;
    const n = node as Record<string, any>;
    const uri = n.canonicalUrl?.uri, ts = n.publishedAt?.timestamp, f = Array.isArray(n.channelFields) ? n.channelFields[0]?.fields : null;
    if (typeof uri === "string" && typeof ts === "number" && f && typeof f.titulo === "string") {
      const u = publicUrl(uri, base.origin);
      if (u && bareHost(u) === site && u.pathname !== "/") {
        known.set(u.toString(), { url: u.toString(), title: plain(f.titulo).slice(0, 300), snippet: typeof f.sinopse === "string" ? plain(f.sinopse).slice(0, 600) : "", published: isoOrNull(new Date(ts * 1000).toISOString()) });
      }
    }
    for (const v of Array.isArray(node) ? node : Object.values(n)) walk(v, base, depth + 1);
  };
  await Promise.all(firsts.slice(0, 6).map(async (first) => {
    try {
      const r = await get(first.toString(), 8_000, 3_000_000);
      if (r.status < 200 || r.status >= 300) { lastError = `HTTP ${r.status} fetching ${first.pathname}`; return; }
      const nd = r.text.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i)?.[1];
      if (nd) { try { walk(JSON.parse(nd), first); } catch { /* fall through to links */ } }
      const pat = opts.linkPattern;
      for (const m of r.text.matchAll(/<a\b[^>]*\bhref=["']([^"'#]+)["']/gi)) {
        const u = publicUrl(xmlDecode(m[1]), r.url);
        if (!u || bareHost(u) !== site || u.pathname === "/" || NOT_ARTICLE.test(u.pathname)) continue;
        u.search = "";
        if (!pat || !pat.test(u.pathname)) continue; // plain pages need a pattern: guessing which links are articles would pull in menus and tags
        links.set(u.toString(), true);
      }
    } catch (e) { lastError = e instanceof Error ? e.message : "The site did not answer"; }
  }));
  for (const k of known.keys()) links.delete(k);
  if (!known.size && !links.size) throw new Error(lastError || "No articles found on the list pages");

  const found: Article[] = [...known.values()].filter((a) => !a.published || new Date(a.published).getTime() >= cutoff);
  const todo = [...links.keys()].slice(0, Math.max(0, opts.maxPages * 2));
  const read: Article[] = new Array(todo.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(4, todo.length) }, async () => {
    while (i < todo.length && left() > 1_500) {
      const k = i++, url = todo[k];
      try {
        const p = await get(url, 5_000, 300_000);
        if (p.status >= 200 && p.status < 300) {
          const m = metaOf(p.text);
          read[k] = { url, title: (m.title && m.title.length > 8 ? m.title : slugTitle(url)).slice(0, 300), snippet: (m.description ?? "").slice(0, 600), published: m.published };
        }
      } catch { /* skip this page */ }
    }
  }));
  for (const a of read) if (a && a.title && (!a.published || new Date(a.published).getTime() >= cutoff)) found.push(a);
  return found.sort((x, y) => (y.published ?? "").localeCompare(x.published ?? "")).slice(0, opts.maxPages);
}

function rss(name: string, link: string, items: Article[]): string {
  const body = items.map((a) => `<item><title>${esc(a.title)}</title><link>${esc(a.url)}</link><guid isPermaLink="true">${esc(a.url)}</guid>${a.published ? `<pubDate>${new Date(a.published).toUTCString()}</pubDate>` : ""}${a.snippet ? `<description>${esc(a.snippet)}</description>` : ""}</item>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${esc(name)}</title><link>${esc(link)}</link><description>Latest articles from the site</description>${body}</channel></rss>`;
}

const text = (body: string, status: number) => new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") return text("Method not allowed", 405);
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return text("Not found", 404);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { db: { schema: "hub" }, auth: { persistSession: false } });
  const { data: src } = await sb.from("research_sources").select("name,config").eq("id", id).maybeSingle();
  const cfg = (src?.config ?? {}) as { kind?: string; sitemap_url?: string; list_urls?: string[]; link_pattern?: string; max_age_days?: number; max_pages?: number };
  const days = Math.min(Number(cfg.max_age_days) || 10, 30), maxPages = Math.min(Number(cfg.max_pages) || 20, 30);
  if (!src) return text("Not found", 404);
  try {
    let items: Article[], link: string;
    if (cfg.kind === "sitemap" && cfg.sitemap_url) {
      items = await readArticles(cfg.sitemap_url, { days, maxPages }); link = cfg.sitemap_url;
    } else if (cfg.kind === "listing" && Array.isArray(cfg.list_urls) && cfg.list_urls.length) {
      let linkPattern: RegExp | null = null;
      if (cfg.link_pattern) { try { linkPattern = new RegExp(cfg.link_pattern, "i"); } catch { /* ignore a bad pattern */ } }
      items = await readListing(cfg.list_urls.slice(0, 6).map(String), { days, maxPages, linkPattern }); link = String(cfg.list_urls[0]);
    } else return text("Not found", 404);
    return new Response(rss(src.name, link, items), { status: 200, headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "no-store" } });
  } catch (e) {
    return text(e instanceof Error ? e.message : "Could not read the site", 502);
  }
});
