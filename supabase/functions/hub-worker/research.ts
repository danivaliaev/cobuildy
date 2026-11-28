import { XMLParser } from "npm:fast-xml-parser@4";
import { Ctx, enqueue, normalizeUrl, sha256, stripHtml } from "./util.ts";

/** One normalized item produced by a source adapter. Adapters only read official feeds/APIs, never scrape arbitrary pages. */
export interface Discovered {
  url: string;
  title: string;
  snippet: string;
  publishedAt: string | null;
  publisher: string | null;
}

const UA = "CobuildyIntelligenceHub/1.0 (+https://cobuildy.com)";
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", textNodeName: "#text" });
const arr = (x: any) => (x == null ? [] : Array.isArray(x) ? x : [x]);
const txt = (x: any): string => (x == null ? "" : typeof x === "object" ? String(x["#text"] ?? "") : String(x));
const toIso = (s: string) => {
  const d = new Date(s);
  return s && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
};

async function rssAdapter(src: any): Promise<Discovered[]> {
  const res = await fetch(new URL(src.url).toString(), { headers: { "user-agent": UA, accept: "application/rss+xml, application/atom+xml, text/xml, */*" }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching feed`);
  const xml = parser.parse(await res.text());
  const out: Discovered[] = [];
  const rssItems = arr(xml?.rss?.channel?.item);
  for (const it of rssItems) {
    const publisher = txt(it.source) || null;
    let title = stripHtml(txt(it.title));
    if (publisher && title.endsWith(` - ${publisher}`)) title = title.slice(0, -(publisher.length + 3));
    const link = txt(it.link) || txt(it.guid);
    if (!link || !title) continue;
    // Google News descriptions repeat the headline + related links; keep only a short snippet
    let snippet = stripHtml(txt(it.description)).slice(0, 600);
    if (src.source_type === "google_news" && snippet.toLowerCase().startsWith(title.toLowerCase().slice(0, 30))) snippet = "";
    out.push({ url: link, title, snippet, publishedAt: toIso(txt(it.pubDate) || txt(it["dc:date"])), publisher });
  }
  for (const e of arr(xml?.feed?.entry)) {
    const links = arr(e.link);
    const alt = links.find((l: any) => !l["@_rel"] || l["@_rel"] === "alternate") ?? links[0];
    const link = alt?.["@_href"] ?? txt(alt);
    const title = stripHtml(txt(e.title));
    if (!link || !title) continue;
    out.push({ url: link, title, snippet: stripHtml(txt(e.summary) || txt(e.content)).slice(0, 600), publishedAt: toIso(txt(e.published) || txt(e.updated)), publisher: txt(e.author?.name) || null });
  }
  return out;
}

/** Configurable web-search adapter. Needs BRAVE_API_KEY or TAVILY_API_KEY as an Edge Function secret (not configured by default). */
async function webSearchAdapter(src: any): Promise<Discovered[]> {
  const cfg = src.config ?? {};
  const q = cfg.query as string;
  if (!q) throw new Error("web_search source needs config.query");
  const provider = cfg.provider ?? "brave";
  if (provider === "brave") {
    const key = Deno.env.get("BRAVE_API_KEY");
    if (!key) throw new Error("BRAVE_API_KEY is not configured");
    const u = new URL("https://api.search.brave.com/res/v1/news/search");
    u.searchParams.set("q", q);
    u.searchParams.set("freshness", cfg.freshness ?? "pw");
    if (src.country) u.searchParams.set("country", src.country);
    if (src.language) u.searchParams.set("search_lang", src.language);
    const res = await fetch(u, { headers: { "X-Subscription-Token": key, accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`Brave HTTP ${res.status}`);
    const j = await res.json();
    return (j.results ?? []).map((r: any) => ({ url: r.url, title: stripHtml(r.title ?? ""), snippet: stripHtml(r.description ?? ""), publishedAt: toIso(r.page_age ?? ""), publisher: r.meta_url?.hostname ?? null }));
  }
  if (provider === "tavily") {
    const key = Deno.env.get("TAVILY_API_KEY");
    if (!key) throw new Error("TAVILY_API_KEY is not configured");
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ query: q, topic: "news", days: cfg.days ?? 7, max_results: cfg.max_results ?? 20 }), signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);
    const j = await res.json();
    return (j.results ?? []).map((r: any) => ({ url: r.url, title: stripHtml(r.title ?? ""), snippet: stripHtml(r.content ?? "").slice(0, 600), publishedAt: toIso(r.published_date ?? ""), publisher: safeHost(r.url) }));
  }
  throw new Error(`Unknown search provider "${provider}"`);
}
const safeHost = (u: string) => { try { return new URL(u).hostname; } catch { return null; } };

/** Adapter registry: add a new source type here without touching the pipeline. */
const adapters: Record<string, (src: any) => Promise<Discovered[]>> = {
  rss: rssAdapter,
  google_news: rssAdapter,
  web_search: webSearchAdapter,
};

export async function stageResearch(ctx: Ctx) {
  const { sb, job } = ctx;
  let q = sb.from("research_sources").select("id,name").eq("is_active", true);
  if (job.payload.country) q = q.eq("country", job.payload.country);
  const { data: sources, error } = await q;
  if (error) throw new Error(error.message);
  let n = 0;
  for (const s of sources ?? []) {
    await enqueue(sb, "scan_source", { source_id: s.id, max_age_days: job.payload.max_age_days ?? null }, `scan:${job.id}:${s.id}`, job.id, s.id);
    n++;
  }
  return { sources_enqueued: n };
}

export async function scanSource(ctx: Ctx) {
  const { sb, settings, job } = ctx;
  const sourceId = job.payload.source_id;
  const { data: src, error } = await sb.from("research_sources").select("*").eq("id", sourceId).single();
  if (error || !src) throw new Error(`source ${sourceId} not found`);
  const limits = settings.get("pipeline", { max_articles_per_source: 40, article_max_age_days: 14 });
  const now = new Date().toISOString();
  try {
    const adapter = adapters[src.source_type];
    if (!adapter) throw new Error(`No adapter for source type "${src.source_type}" yet`);
    const found = await adapter(src);
    const cutoff = Date.now() - (job.payload.max_age_days ?? limits.article_max_age_days ?? 14) * 86400000;
    const fresh = found
      .filter((d) => !d.publishedAt || new Date(d.publishedAt).getTime() >= cutoff)
      .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
      .slice(0, limits.max_articles_per_source ?? 40);
    const rows = [];
    for (const d of fresh) {
      const url = normalizeUrl(d.url);
      rows.push({
        source_id: src.id, job_id: job.id, url, url_hash: await sha256(url), title: d.title.slice(0, 500),
        snippet: d.snippet || null, published_at: d.publishedAt, publisher: d.publisher, language: src.language,
        metadata: { source_type: src.source_type },
      });
    }
    let inserted = 0;
    if (rows.length) {
      const { data, error: e2 } = await sb.from("raw_articles").upsert(rows, { onConflict: "url_hash", ignoreDuplicates: true }).select("id");
      if (e2) throw new Error(e2.message);
      inserted = data?.length ?? 0;
    }
    await sb.from("research_sources").update({ last_scan_at: now, last_success_at: now, error_status: null, error_message: null, consecutive_failures: 0 }).eq("id", src.id);
    return { fetched: found.length, considered: fresh.length, new_articles: inserted };
  } catch (e) {
    await sb.from("research_sources").update({
      last_scan_at: now, error_status: "scan_failed", error_message: String((e as Error).message).slice(0, 300),
      consecutive_failures: (src.consecutive_failures ?? 0) + 1,
    }).eq("id", src.id);
    throw e;
  }
}
