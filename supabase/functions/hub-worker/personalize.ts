import { clamp, Ctx, Defer, daysSince, enqueue, ensureCampaign, isoWeekNumber, norm, pendingJobs, toCountry, weekStart } from "./util.ts";

export type Section = "market_news" | "financing" | "regulatory" | "opportunities";
export const SECTIONS: Section[] = ["market_news", "financing", "regulatory", "opportunities"];

export function sectionFor(topSlug: string | null | undefined): Section {
  switch (topSlug) {
    case "financing": return "financing";
    case "regulatory": return "regulatory";
    case "investment_opportunities": return "opportunities";
    default: return "market_news";
  }
}

const DEFAULT_W = { geography: 25, asset_class: 20, financing: 20, stage_size: 10, interests: 10, recency: 10, base_score: 5 };

const ASSET_SYNONYMS: Record<string, string> = {
  residential: "residential", housing: "residential", vivienda: "residential", residencial: "residential", habitacao: "residential", apartments: "residential", villas: "residential",
  commercial: "commercial", office: "commercial", offices: "commercial", retail: "commercial", oficinas: "commercial",
  hospitality: "hospitality", hotel: "hospitality", hotels: "hospitality", hotelero: "hospitality", hotelaria: "hospitality", "branded residences": "hospitality",
  land: "land", suelo: "land", terreno: "land", solo: "land",
  mixed_use: "mixed_use", "mixed use": "mixed_use", mixed: "mixed_use",
  industrial: "industrial", logistics: "industrial", logistica: "industrial",
};
const canonAsset = (s: string) => ASSET_SYNONYMS[norm(s)] ?? norm(s);

export interface Scored { item: any; score: number; components: Record<string, number>; reason: string; section: Section; catSlug: string | null }

function flatten(v: any): string[] {
  if (v == null) return [];
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(flatten);
  if (typeof v === "object") return Object.values(v).flatMap(flatten);
  return [String(v)];
}

function score(dev: any, prefs: any, item: any, catInfo: { slug: string | null; parent: string | null }, w: Record<string, number>): Scored {
  const reasons: string[] = [];
  const hay = norm([item.title, item.summary, ...(item.key_takeaways ?? []), item.business_implications].join(" "));

  // geography
  const focus = [...(dev.geographic_focus ?? []), ...(dev.target_markets ?? [])].map(norm).filter(Boolean);
  const city = norm(item.city), region = norm(item.region), country = item.country as string | null;
  let geo = 0;
  if (!focus.length) geo = 50;
  else {
    for (const f of focus) {
      if (city && (f === city || (f.length > 3 && (city.includes(f) || f.includes(city))))) { geo = Math.max(geo, 100); reasons.push(`located in ${item.city}`); }
      else if (region && (f === region || (f.length > 3 && (region.includes(f) || f.includes(region))))) { geo = Math.max(geo, 85); reasons.push(`in ${item.region}`); }
      else if (country && toCountry(f) === country) { geo = Math.max(geo, 60); reasons.push(`${country} market`); }
      else if (f.length > 3 && hay.includes(f)) geo = Math.max(geo, 70);
    }
    if (!geo && !item.city && !item.region && !country) geo = 30;
    if (!geo && dev.country && country === toCountry(dev.country)) geo = 20;
  }

  // asset class
  const devAssets = new Set((dev.asset_classes ?? []).map(canonAsset));
  const itemAssets = (item.asset_class ?? []).map(canonAsset);
  let asset = 5;
  if (!devAssets.size) asset = 50;
  else if (!itemAssets.length || itemAssets.every((a: string) => a === "other")) asset = 40;
  else if (itemAssets.some((a: string) => devAssets.has(a))) { asset = 100; reasons.push(`${itemAssets.find((a: string) => devAssets.has(a))} asset class`); }

  // financing fit
  const instruments = (dev.preferred_instruments ?? []).map(norm).filter(Boolean);
  const hasFinNeed = instruments.length > 0 || !!dev.financing_requirements;
  let fin = clamp(item.financing_relevance ?? 0);
  if (instruments.some((i: string) => i.length > 3 && hay.includes(i))) { fin = clamp(fin + 30); reasons.push("matches preferred financing instruments"); }
  if (!hasFinNeed) fin = Math.round(fin * 0.6);

  // stage / size
  let stage = clamp(item.development_relevance ?? 40);
  const lo = Number(dev.project_size_min ?? dev.ticket_min ?? 0), hi = Number(dev.project_size_max ?? dev.ticket_max ?? 0);
  if (hi > 0) {
    const hit = (item.financial_figures ?? []).some((f: any) => typeof f.amount_eur === "number" && f.amount_eur >= lo * 0.5 && f.amount_eur <= hi * 2);
    if (hit) { stage = clamp(stage + 25); reasons.push("deal size in your range"); }
  }
  const stageWords = (dev.development_stages ?? []).map(norm).filter((s: string) => s.length > 3);
  if (stageWords.some((s: string) => hay.includes(s))) stage = clamp(stage + 10);

  // interests
  const preferred: string[] = prefs?.preferred_categories ?? [];
  const kw = flatten(prefs?.interests).map(norm).filter((k) => k.length > 3);
  let interests = 10;
  if (catInfo.slug && (preferred.includes(catInfo.slug) || (catInfo.parent && preferred.includes(catInfo.parent)))) { interests = 100; }
  else if (kw.some((k) => hay.includes(k))) { interests = 70; reasons.push("matches your stated interests"); }
  else if (!preferred.length && !kw.length) interests = 50;

  const d = daysSince(item.publication_date ?? item.created_at);
  const recency = d <= 3 ? 100 : d <= 7 ? 85 : d <= 10 ? 65 : d <= 14 ? 45 : 20;
  const base = clamp(item.manual_score ?? item.ai_score ?? 0);

  const comps = { geography: geo, asset_class: asset, financing: fin, stage_size: stage, interests, recency, base_score: base };
  const sum = Object.values(w).reduce((s, v) => s + v, 0) || 100;
  let total = Math.round(Object.entries(comps).reduce((s, [k, v]) => s + v * (w[k] ?? 0), 0) / sum);

  const excluded = (prefs?.excluded_topics ?? []).map(norm).filter(Boolean);
  if (excluded.some((e: string) => hay.includes(e))) { total = 0; reasons.length = 0; reasons.push("excluded topic"); }

  const top = catInfo.parent ?? catInfo.slug;
  return { item, score: total, components: comps, reason: [...new Set(reasons)].slice(0, 3).join("; "), section: sectionFor(top), catSlug: top };
}

/** Balanced, diverse selection: section quotas first, then best remaining, with a penalty for repeating a category/publisher. */
export function pickBalanced(scored: Scored[], max: number, minScore: number): Scored[] {
  const pool = scored.filter((s) => s.score >= minScore).sort((a, b) => b.score - a.score);
  const quota: Record<Section, number> = {
    market_news: Math.max(1, Math.round(max * 0.4)), financing: Math.max(1, Math.round(max * 0.25)),
    regulatory: Math.max(1, Math.round(max * 0.15)), opportunities: Math.max(1, Math.round(max * 0.2)),
  };
  const chosen: Scored[] = [];
  const catCount: Record<string, number> = {}, pubCount: Record<string, number> = {};
  const effective = (s: Scored) => s.score - 10 * (catCount[s.item.subcategory_id ?? s.catSlug ?? ""] ?? 0) - 8 * (pubCount[norm(s.item.publisher)] ?? 0);
  const take = (s: Scored) => {
    chosen.push(s);
    const ck = s.item.subcategory_id ?? s.catSlug ?? "";
    catCount[ck] = (catCount[ck] ?? 0) + 1;
    const pk = norm(s.item.publisher);
    pubCount[pk] = (pubCount[pk] ?? 0) + 1;
  };
  for (const sec of SECTIONS) {
    for (let i = 0; i < quota[sec] && chosen.length < max; i++) {
      const cand = pool.filter((s) => s.section === sec && !chosen.includes(s)).sort((a, b) => effective(b) - effective(a))[0];
      if (!cand) break;
      take(cand);
    }
  }
  while (chosen.length < max) {
    const cand = pool.filter((s) => !chosen.includes(s)).sort((a, b) => effective(b) - effective(a))[0];
    if (!cand) break;
    take(cand);
  }
  return chosen;
}

export async function loadDeveloper(ctx: Ctx, id: string) {
  const { data, error } = await ctx.sb.from("developers").select("*, prefs:developer_preferences(*)").eq("id", id).single();
  if (error || !data) throw new Error(`developer ${id} not found`);
  const prefs = Array.isArray(data.prefs) ? data.prefs[0] : data.prefs;
  return { dev: data, prefs: prefs ?? { language: "en", max_items: 8, preferred_categories: [], interests: {}, excluded_topics: [], detail_level: "standard" } };
}

/** Scores every eligible item for one developer, stores the scores and marks the selected ones for the campaign. */
export async function computeAndSelect(ctx: Ctx, developerId: string, campaignId: string, includeAnalyzed: boolean, maxAgeDays?: number | null) {
  const { sb, settings } = ctx;
  const { dev, prefs } = await loadDeveloper(ctx, developerId);
  const pipe = settings.get<any>("pipeline", {});
  const w = { ...DEFAULT_W, ...settings.get<any>("personalization.weights", {}) } as Record<string, number>;
  const statuses = includeAnalyzed ? ["approved", "selected", "analyzed"] : ["approved", "selected"];
  const since = new Date(Date.now() - (maxAgeDays ?? pipe.article_max_age_days ?? 14) * 86400000).toISOString();

  // A developer of one market only gets news from the sources of that market (hub.research_sources.country).
  const market = dev.country ? toCountry(dev.country) : null;
  let marketSources: string[] | null = null;
  if (market) {
    const { data: srcs } = await sb.from("research_sources").select("id").eq("country", market);
    marketSources = (srcs ?? []).map((s: any) => s.id);
  }
  let iq = sb.from("intelligence_items").select("*").in("status", statuses)
    .or(`publication_date.gte.${since},and(publication_date.is.null,created_at.gte.${since})`);
  if (marketSources) iq = iq.in("primary_source_id", marketSources.length ? marketSources : ["00000000-0000-0000-0000-000000000000"]);
  const { data: items, error } = await iq.limit(1000);
  if (error) throw new Error(error.message);

  // never repeat what this developer already received
  const { data: sent } = await sb.from("digest_items").select("item_id, digests!inner(developer_id,status)")
    .eq("digests.developer_id", developerId).eq("digests.status", "sent").eq("is_removed", false);
  const already = new Set((sent ?? []).map((r: any) => r.item_id));

  const { data: cats } = await sb.from("intelligence_categories").select("id,slug,parent_id");
  const byId = new Map((cats ?? []).map((c) => [c.id, c]));
  const info = (item: any) => {
    const c = byId.get(item.subcategory_id ?? item.category_id);
    const parent = c?.parent_id ? byId.get(c.parent_id)?.slug ?? null : null;
    const slug = c?.slug ?? null;
    return { slug, parent: parent ?? (c && !c.parent_id ? c.slug : null) };
  };

  const scored = (items ?? []).filter((i) => !already.has(i.id)).map((i) => score(dev, prefs, i, info(i), w));
  const picked = pickBalanced(scored, prefs.max_items ?? 8, pipe.min_selection_score ?? 35);
  const pickedIds = new Set(picked.map((p) => p.item.id));

  await sb.from("developer_relevance_scores").update({ selected: false }).eq("developer_id", developerId).eq("campaign_id", campaignId);
  const rows = scored.filter((s) => s.score > 0).map((s) => ({
    developer_id: developerId, item_id: s.item.id, personalization_score: s.score, components: s.components, reason: s.reason || null,
    selected: pickedIds.has(s.item.id), campaign_id: pickedIds.has(s.item.id) ? campaignId : null, computed_at: new Date().toISOString(),
  }));
  for (let i = 0; i < rows.length; i += 200) {
    const { error: e2 } = await sb.from("developer_relevance_scores").upsert(rows.slice(i, i + 200), { onConflict: "developer_id,item_id" });
    if (e2) throw new Error(e2.message);
  }
  return { scored: scored.length, selected: picked, dev, prefs };
}

export async function stagePersonalization(ctx: Ctx) {
  const { sb, job } = ctx;
  if ((await pendingJobs(sb, ["stage_research", "scan_source", "stage_analysis", "analyze_article"], job.id)) > 0) throw new Defer(45, "waiting for analysis to finish");
  const campaign = await ensureCampaign(sb, job.payload.week_start ?? weekStart());
  let dq = sb.from("developers").select("id").eq("status", "active");
  if (job.payload.country) dq = dq.eq("country", job.payload.country);
  const { data: devs, error } = await dq;
  if (error) throw new Error(error.message);
  for (const d of devs ?? []) {
    await enqueue(sb, "personalize_developer", { developer_id: d.id, campaign_id: campaign.id, include_analyzed: !!job.payload.include_analyzed, max_age_days: job.payload.max_age_days ?? null }, `pers:${job.id}:${d.id}`, job.id);
  }
  return { developers_enqueued: devs?.length ?? 0, campaign_id: campaign.id };
}

export async function personalizeDeveloper(ctx: Ctx) {
  const p = ctx.job.payload;
  const r = await computeAndSelect(ctx, p.developer_id, p.campaign_id, !!p.include_analyzed, p.max_age_days ?? null);
  return { scored: r.scored, selected: r.selected.length };
}

export function developerDueThisWeek(prefs: any, week: string): boolean {
  const f = prefs?.frequency ?? "weekly";
  if (f === "weekly") return true;
  if (f === "biweekly") return isoWeekNumber(week) % 2 === 0;
  return Number(week.slice(8, 10)) <= 7; // monthly: first week of the month
}
