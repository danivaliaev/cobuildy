import { runLlm } from "./llm.ts";
import { clamp, Ctx, Defer, daysSince, enqueue, pendingJobs, toCountry } from "./util.ts";

const DEFAULT_WEIGHTS = { developer_relevance: 25, geographic: 20, business_impact: 20, timeliness: 15, source_reliability: 10, uniqueness: 10 };

export function timeliness(days: number): number {
  return days <= 2 ? 100 : days <= 7 ? 80 : days <= 14 ? 55 : days <= 30 ? 30 : 10;
}

export async function stageAnalysis(ctx: Ctx) {
  const { sb, settings, job } = ctx;
  if ((await pendingJobs(sb, ["stage_research", "scan_source"], job.id)) > 0) throw new Defer(45, "waiting for source scans to finish");
  const max = settings.get<any>("pipeline", {}).max_articles_per_analysis_run ?? 150;
  const country: string | null = job.payload.country ?? null; // only the articles of this market's sources
  let q = (sb as any).from("raw_articles").select(country ? "id, source:research_sources!inner(country)" : "id").eq("status", "new");
  if (country) q = q.eq("source.country", country);
  const { data, error } = await q.order("published_at", { ascending: false, nullsFirst: false }).limit(max);
  if (error) throw new Error(error.message);
  const ids = (data ?? []).map((r: any) => r.id);
  if (ids.length) await sb.from("raw_articles").update({ status: "analyzing" }).in("id", ids);
  for (const id of ids) await enqueue(sb, "analyze_article", { raw_id: id }, `analyze:${id}:${job.id}`, job.id);
  return { articles_enqueued: ids.length };
}

let catCache: { at: number; rows: any[] } | null = null;
async function categories(ctx: Ctx) {
  if (catCache && Date.now() - catCache.at < 300_000) return catCache.rows;
  const { data, error } = await ctx.sb.from("intelligence_categories").select("id,slug,name,parent_id").eq("is_active", true);
  if (error) throw new Error(error.message);
  catCache = { at: Date.now(), rows: data ?? [] };
  return catCache.rows;
}

const SCORE = { type: "integer", minimum: 0, maximum: 100 };
function schemaFor(topSlugs: string[], subSlugs: string[]) {
  return {
    type: "object",
    properties: {
      is_relevant: { type: "boolean", description: "True only if this is useful to real estate developers/investors active in Spain or Portugal (market, financing, regulation, investment, industry). False for unrelated news, ads, listings spam, celebrity/lifestyle." },
      irrelevance_reason: { type: "string" },
      same_event_as: { type: ["integer", "null"], description: "Index of the existing item that reports the SAME event, or null." },
      relation: { type: ["string", "null"], enum: ["exact_duplicate", "similar", "different_coverage", null] },
      summary: { type: "string", description: "Concise English summary, max 60 words, using only facts in the text." },
      country: { type: ["string", "null"], description: "ISO 3166-1 alpha-2" },
      region: { type: ["string", "null"] },
      city: { type: ["string", "null"] },
      category: { type: "string", enum: topSlugs },
      subcategory: { type: ["string", "null"], enum: [...subSlugs, null] },
      asset_class: { type: "array", items: { type: "string", enum: ["residential", "commercial", "hospitality", "land", "mixed_use", "industrial", "other"] } },
      investment_relevance: SCORE,
      financing_relevance: SCORE,
      development_relevance: SCORE,
      market_impact: { type: "string", enum: ["low", "medium", "high"] },
      developer_relevance: { ...SCORE, description: "Relevance to real estate developers" },
      geographic_relevance: { ...SCORE, description: "Relevance to Spain/Portugal and their regions/cities" },
      business_impact: { ...SCORE, description: "Business and financial impact" },
      uniqueness: { ...SCORE, description: "Information value / how new this is vs. generic coverage" },
      score_explanation: { type: "string", description: "1-2 sentences explaining the scores" },
      confidence: { type: "string", enum: ["low", "medium", "high"], description: "Use low when only a headline is available" },
      key_takeaways: { type: "array", items: { type: "string" }, maxItems: 4 },
      business_implications: { type: "string", description: "Potential implications for developers; hedge interpretation" },
      suggested_audience: { type: "array", items: { type: "string" }, description: "e.g. 'residential developers on the Costa del Sol', 'developers seeking mezzanine'" },
      entities: {
        type: "object",
        properties: {
          companies: { type: "array", items: { type: "string" } }, investors: { type: "array", items: { type: "string" } },
          developers: { type: "array", items: { type: "string" } }, institutions: { type: "array", items: { type: "string" } },
        },
      },
      financial_figures: {
        type: "array",
        items: { type: "object", properties: { label: { type: "string" }, value: { type: "string" }, amount_eur: { type: ["number", "null"] }, context: { type: "string" } }, required: ["label", "value"] },
      },
      statements: {
        type: "array", description: "Key statements, each typed. verified_fact = stated as fact by an official/primary source in the text; reported_claim = attributed claim or rumour; ai_interpretation = your inference.",
        items: { type: "object", properties: { text: { type: "string" }, type: { type: "string", enum: ["verified_fact", "reported_claim", "ai_interpretation"] } }, required: ["text", "type"] },
      },
    },
    required: ["is_relevant", "category", "summary", "developer_relevance", "geographic_relevance", "business_impact", "uniqueness", "confidence", "market_impact"],
  };
}

const SYSTEM = `You are the research analyst of Cobuildy, a platform that helps real estate developers in Spain and Portugal raise debt and equity.
Analyse ONE article (headline + snippet from an RSS feed or search API) and return structured data.
Hard rules:
- Use ONLY the supplied text. Never invent facts, figures, names, places or dates. Leave fields null/empty when unknown.
- You see only a headline and snippet: set confidence to "low" unless the snippet is substantive, and say so in score_explanation.
- Type every statement honestly: verified_fact, reported_claim, or ai_interpretation. Interpretation for developers belongs in business_implications and must be hedged.
- Decide whether the article describes the same event as one of the EXISTING ITEMS (a different outlet or language covering the same news counts). If so set same_event_as to its index and choose relation.
- Be strict on relevance: generic housing-market opinion, listings, lifestyle, or unrelated news -> is_relevant=false.`;

export async function analyzeArticle(ctx: Ctx) {
  const { sb, settings, job } = ctx;
  const rawId = job.payload.raw_id;
  const { data: raw, error } = await sb.from("raw_articles")
    .select("*, source:research_sources(id,name,reliability_score,country,language,source_type)").eq("id", rawId).single();
  if (error || !raw) throw new Error(`raw article ${rawId} not found`);
  if (["analyzed", "duplicate", "skipped"].includes(raw.status)) return { skipped: raw.status };

  try {
    const { data: sameUrl } = await sb.from("intelligence_item_sources").select("item_id").eq("url", raw.url).limit(1).maybeSingle();
    if (sameUrl) {
      await sb.from("raw_articles").update({ status: "duplicate", intelligence_item_id: sameUrl.item_id }).eq("id", raw.id);
      return { duplicate: "exact_url" };
    }

    const cfg = settings.get<any>("pipeline", {});
    const { data: cands } = await sb.rpc("find_similar_items", { p_title: raw.title, p_days: cfg.dedupe_window_days ?? 30, p_limit: 5 });
    const candidates: any[] = cands ?? [];

    const cats = await categories(ctx);
    const top = cats.filter((c) => !c.parent_id);
    const subs = cats.filter((c) => c.parent_id);
    const user = [
      `SOURCE: ${raw.source?.name ?? "unknown"} (${raw.source?.source_type ?? "?"}, country ${raw.source?.country ?? "?"}, language ${raw.language ?? "?"})`,
      `CATEGORIES: ${top.map((c) => `${c.slug} = ${c.name}`).join("; ")}`,
      `ARTICLE`,
      `Title: ${raw.title}`,
      `Publisher: ${raw.publisher ?? "unknown"}`,
      `Published: ${raw.published_at ?? "unknown"}`,
      `URL: ${raw.url}`,
      `Snippet: ${raw.snippet || "(none - headline only)"}`,
      candidates.length ? `EXISTING ITEMS (possible same event):\n${candidates.map((c, i) => `[${i}] ${c.title} (${c.country ?? "?"}, ${c.city ?? "?"})`).join("\n")}` : "EXISTING ITEMS: none",
    ].join("\n");

    const res = await runLlm(ctx, "analysis", "analysis", {
      system: SYSTEM, user, toolName: "record_analysis", toolDescription: "Record the structured analysis of the article",
      schema: schemaFor(top.map((c) => c.slug), subs.map((c) => c.slug)), maxTokens: 1800,
    }, { type: "raw_article", id: raw.id });
    const a = res.data;

    if (!a.is_relevant) {
      await sb.from("raw_articles").update({ status: "skipped", metadata: { ...raw.metadata, skipped_reason: a.irrelevance_reason ?? "not relevant" } }).eq("id", raw.id);
      return { skipped: "not_relevant" };
    }

    // merge into an existing item when the model found the same event
    const idx = Number.isInteger(a.same_event_as) ? a.same_event_as : null;
    if (idx !== null && candidates[idx]) {
      const target = candidates[idx];
      await sb.from("intelligence_item_sources").upsert({
        item_id: target.id, raw_article_id: raw.id, source_id: raw.source_id, url: raw.url, title: raw.title,
        publisher: raw.publisher, published_at: raw.published_at, relation: a.relation ?? "similar",
      }, { onConflict: "item_id,url", ignoreDuplicates: true });
      await sb.from("raw_articles").update({ status: "duplicate", intelligence_item_id: target.id }).eq("id", raw.id);
      await sb.from("intelligence_items").update({ updated_at: new Date().toISOString() }).eq("id", target.id);
      return { merged_into: target.id, relation: a.relation ?? "similar" };
    }

    const w = { ...DEFAULT_WEIGHTS, ...settings.get<any>("scoring.weights", {}) } as Record<string, number>;
    const comps: Record<string, number> = {
      developer_relevance: clamp(a.developer_relevance), geographic: clamp(a.geographic_relevance), business_impact: clamp(a.business_impact),
      timeliness: timeliness(daysSince(raw.published_at ?? raw.fetched_at)), source_reliability: clamp(raw.source?.reliability_score ?? 50), uniqueness: clamp(a.uniqueness),
    };
    const total = Object.values(w).reduce((s, v) => s + v, 0) || 100;
    const aiScore = Math.round(Object.entries(comps).reduce((s, [k, v]) => s + v * (w[k] ?? 0), 0) / total);

    const cat = top.find((c) => c.slug === a.category) ?? null;
    const sub = subs.find((c) => c.slug === a.subcategory && (!cat || c.parent_id === cat.id)) ?? null;

    const { data: item, error: e2 } = await sb.from("intelligence_items").insert({
      title: raw.title, summary: a.summary, canonical_url: raw.url, publisher: raw.publisher, primary_source_id: raw.source_id,
      publication_date: raw.published_at, language: raw.language, country: toCountry(a.country), region: a.region ?? null, city: a.city ?? null,
      category_id: cat?.id ?? null, subcategory_id: sub?.id ?? null, asset_class: a.asset_class ?? [],
      investment_relevance: a.investment_relevance ?? null, financing_relevance: a.financing_relevance ?? null, development_relevance: a.development_relevance ?? null,
      market_impact: a.market_impact, ai_score: aiScore, score_breakdown: { components: comps, weights: w }, score_explanation: a.score_explanation ?? null,
      confidence: a.confidence, key_takeaways: a.key_takeaways ?? [], business_implications: a.business_implications ?? null,
      suggested_audience: a.suggested_audience ?? [], entities: a.entities ?? {}, financial_figures: a.financial_figures ?? [], statements: a.statements ?? [],
      content_basis: raw.snippet ? "headline_snippet" : "headline_only", status: "analyzed", ai_model: res.model, analysed_at: new Date().toISOString(),
    }).select("id").single();
    if (e2) throw new Error(e2.message);

    await sb.from("intelligence_item_sources").insert({
      item_id: item.id, raw_article_id: raw.id, source_id: raw.source_id, url: raw.url, title: raw.title, publisher: raw.publisher, published_at: raw.published_at, relation: "original",
    });
    await sb.from("raw_articles").update({ status: "analyzed", intelligence_item_id: item.id }).eq("id", raw.id);
    return { item_id: item.id, ai_score: aiScore };
  } catch (e) {
    if (e instanceof Defer) throw e;
    await sb.from("raw_articles").update({
      attempts: (raw.attempts ?? 0) + 1, error: String((e as Error).message).slice(0, 300),
      status: job.attempts >= job.max_attempts ? "failed" : "analyzing",
    }).eq("id", raw.id);
    throw e;
  }
}
