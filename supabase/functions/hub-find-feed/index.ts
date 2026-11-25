// Finds the RSS/Atom feed of a website for the Intelligence Hub's source list.
// The admin pastes site addresses; this returns each site's feed address (or says none was found). It only reads public pages.
// Only team members who can edit the hub may call it (checked with the caller's own JWT through hub.can_edit).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const UA = "CobuildyIntelligenceHub/1.0 (+https://cobuildy.com)";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

/** Public web addresses only: no private networks, local names or credentials. Staff type these addresses, so this is a guard against mistakes. */
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

/** One request; redirects are followed by hand so each hop is checked too. */
async function fetchPublic(url: string, ms = 20_000): Promise<{ status: number; text: string; url: string }> {
  let cur = publicUrl(url);
  for (let hop = 0; cur && hop < 5; hop++) {
    const res = await fetch(cur.toString(), { redirect: "manual", headers: { "user-agent": UA, accept: "application/rss+xml, application/atom+xml, text/xml, text/html;q=0.8, */*;q=0.5" }, signal: AbortSignal.timeout(ms) });
    if (res.status >= 300 && res.status < 400) { cur = publicUrl(res.headers.get("location") ?? "", cur.toString()); continue; }
    return { status: res.status, text: res.ok ? (await res.text()).slice(0, 3_000_000) : "", url: cur.toString() };
  }
  throw new Error("This address is not a public website, or it redirects too many times");
}

const looksLikeFeed = (t: string) => /<(rss|feed|rdf:RDF)[\s>]/i.test(t.slice(0, 3000));
const COMMON_FEED_PATHS = ["/feed", "/feed/", "/rss", "/rss/", "/rss.xml", "/feed.xml", "/atom.xml", "/index.xml", "/feeds/posts/default"];

/** The feed a normal web page advertises in its head, then the usual feed paths on the same site. */
function feedCandidates(html: string, pageUrl: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const t = m[0];
    if (/type=["']application\/(rss|atom)\+xml["']/i.test(t)) {
      const href = t.match(/href=["']([^"']+)["']/i)?.[1];
      const u = href ? publicUrl(href.replace(/&amp;/g, "&"), pageUrl) : null;
      if (u) out.push(u.toString());
    }
  }
  const origin = new URL(pageUrl).origin;
  const dir = new URL(pageUrl);
  const base = dir.pathname.replace(/\/$/, "");
  for (const p of COMMON_FEED_PATHS) { out.push(origin + p); if (base) out.push(origin + base + p); }
  return [...new Set(out)];
}


const decode = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'");
const feedTitle = (xml: string) => {
  const head = xml.replace(/<(item|entry)[\s>][\s\S]*$/i, "");
  const m = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decode(m[1]).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 120) : null;
};
const itemCount = (xml: string) => (xml.match(/<(item|entry)[\s>]/gi) ?? []).length;

async function find(raw: string): Promise<{ input: string; feed_url: string | null; title: string | null; items: number; error?: string }> {
  const input = raw.trim();
  const u = publicUrl(/^https?:\/\//i.test(input) ? input : "https://" + input);
  if (!u) return { input, feed_url: null, title: null, items: 0, error: "Not a public web address" };
  try {
    const first = await fetchPublic(u.toString(), 15_000);
    if (first.status < 200 || first.status >= 300) return { input, feed_url: null, title: null, items: 0, error: `The site answered HTTP ${first.status}` };
    if (looksLikeFeed(first.text)) return { input, feed_url: first.url, title: feedTitle(first.text), items: itemCount(first.text) };
    for (const c of feedCandidates(first.text, first.url).slice(0, 12)) {
      try {
        const f = await fetchPublic(c, 10_000);
        if (f.status >= 200 && f.status < 300 && looksLikeFeed(f.text)) return { input, feed_url: f.url, title: feedTitle(f.text), items: itemCount(f.text) };
      } catch { /* try the next one */ }
    }
    return { input, feed_url: null, title: null, items: 0, error: "No RSS feed found on this site. Paste the feed address itself if you know it." };
  } catch (e) {
    return { input, feed_url: null, title: null, items: 0, error: e instanceof Error && /public website|redirects/.test(e.message) ? e.message : "The site did not answer" };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const auth = req.headers.get("Authorization") ?? "";
  const hub = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, db: { schema: "hub" }, auth: { persistSession: false } });
  const { data: ok } = await hub.rpc("can_edit");
  if (ok !== true) return json({ error: "Your account is not an editor of the Intelligence Hub." }, 403);
  let body: { urls?: unknown };
  try { body = await req.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const urls = (Array.isArray(body.urls) ? body.urls : []).filter((x): x is string => typeof x === "string" && x.trim().length > 0 && x.length < 500).slice(0, 30);
  if (!urls.length) return json({ error: "No addresses." }, 400);
  const results = new Array(urls.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(5, urls.length) }, async () => { while (i < urls.length) { const k = i++; results[k] = await find(urls[k]); } }));
  return json({ results });
});
