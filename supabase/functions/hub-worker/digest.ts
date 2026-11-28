import { runLlm } from "./llm.ts";
import { computeAndSelect, developerDueThisWeek, loadDeveloper, Section, SECTIONS, sectionFor } from "./personalize.ts";
import { Ctx, Defer, enqueue, ensureCampaign, pendingJobs, weekStart } from "./util.ts";

const LANG: Record<string, string> = { en: "English", es: "Spanish (Spain)", pt: "Portuguese (Portugal)" };
const WORDS: Record<string, number> = { brief: 30, standard: 45, detailed: 70 };

const SYSTEM = (lang: string) => `You are the senior analyst at Cobuildy, writing one personalised weekly intelligence digest for a real estate developer.
Write in ${LANG[lang] ?? "English"}. Style: professional, concise, insightful, data-driven, business-oriented. No generic AI language, no greetings or introductions, no filler.
Hard rules:
- Use ONLY facts contained in the provided items. Never add figures, names, dates, forecasts or market claims that are not in them. Keep amounts exactly as given.
- Keep attribution for claims: statements typed "reported_claim" must read as reported ("according to...", "reportedly"). Statements typed "ai_interpretation" may appear only as hedged implications.
- Do not repeat the same information across summaries, pulse and insight.
- "why_it_matters" must link the item to THIS developer's profile (assets, geography, financing, size). "impact" is the practical potential impact for them, hedged where it is interpretation.
- The Cobuildy insight explains what the week's developments mean for developers like this one, using only the provided items.`;

function profileText(dev: any, prefs: any): string {
  const f = (k: string, v: any) => (v == null || (Array.isArray(v) && !v.length) || v === "" ? null : `${k}: ${Array.isArray(v) ? v.join(", ") : v}`);
  return [
    f("Company", dev.company_name), f("Type", dev.developer_type), f("Asset classes", dev.asset_classes), f("Geographic focus", dev.geographic_focus),
    f("Stages", dev.development_stages), f("Project size (EUR)", [dev.project_size_min, dev.project_size_max].filter(Boolean).join(" - ")),
    f("Financing requirements", dev.financing_requirements), f("Preferred instruments", dev.preferred_instruments), f("Typical ticket (EUR)", [dev.ticket_min, dev.ticket_max].filter(Boolean).join(" - ")),
    f("Target LTV %", dev.target_ltv), f("Preferred structures", dev.preferred_structures), f("Interests", JSON.stringify(prefs.interests ?? {}) === "{}" ? null : JSON.stringify(prefs.interests)),
  ].filter(Boolean).join("\n");
}

function itemPayload(i: any, section: Section, reason?: string | null) {
  return {
    item_id: i.id, section, title: i.title, summary: i.summary, key_takeaways: i.key_takeaways, implications: i.business_implications,
    location: [i.city, i.region, i.country].filter(Boolean).join(", "), publisher: i.publisher, date: i.publication_date,
    statements: i.statements, financial_figures: i.financial_figures, confidence: i.confidence, selected_because: reason ?? undefined,
  };
}

function schemaFor(parts: { pulse: boolean; insight: boolean; itemIds: string[] }, maxWords: number) {
  const props: Record<string, unknown> = {};
  const required: string[] = [];
  if (parts.pulse) { props.market_pulse = { type: "string", description: "Market pulse: 2-4 sentences on the most important developments for this developer, only from the items." }; required.push("market_pulse"); }
  if (parts.itemIds.length) {
    props.items = {
      type: "array",
      items: {
        type: "object",
        properties: {
          item_id: { type: "string", enum: parts.itemIds }, headline: { type: "string", description: "Rewritten headline, max 14 words, factual" },
          summary: { type: "string", description: `Max ${maxWords} words` }, why_it_matters: { type: "string", description: "Max 35 words, specific to this developer" },
          impact: { type: "string", description: "Max 30 words, potential impact on this developer" },
        },
        required: ["item_id", "headline", "summary", "why_it_matters", "impact"],
      },
    };
    required.push("items");
  }
  if (parts.insight) { props.cobuildy_insight = { type: "string", description: "Strategic observation, max 90 words." }; required.push("cobuildy_insight"); }
  return { type: "object", properties: props, required };
}

export async function stageDigest(ctx: Ctx) {
  const { sb, job } = ctx;
  if ((await pendingJobs(sb, ["stage_research", "scan_source", "stage_analysis", "analyze_article", "stage_personalization", "personalize_developer"], job.id)) > 0)
    throw new Defer(45, "waiting for personalization to finish");
  const week = job.payload.week_start ?? weekStart();
  const campaign = await ensureCampaign(sb, week);
  let dq = sb.from("developers").select("id, prefs:developer_preferences(frequency)").eq("status", "active");
  if (job.payload.country) dq = dq.eq("country", job.payload.country);
  const { data: devs, error } = await dq;
  if (error) throw new Error(error.message);
  const force = !!job.payload.force;
  let n = 0, skipped = 0;
  for (const d of devs ?? []) {
    const prefs = Array.isArray(d.prefs) ? d.prefs[0] : d.prefs;
    if (!developerDueThisWeek(prefs, week)) { skipped++; continue; }
    const { data: ex } = await sb.from("digests").select("status").eq("campaign_id", campaign.id).eq("developer_id", d.id).maybeSingle();
    if (ex && (ex.status === "sent" || (!force && ["in_review", "approved"].includes(ex.status)))) { skipped++; continue; }
    await enqueue(sb, "generate_digest", { developer_id: d.id, campaign_id: campaign.id, include_analyzed: !!job.payload.include_analyzed, force, max_age_days: job.payload.max_age_days ?? null }, `gen:${job.id}:${d.id}`, job.id);
    n++;
  }
  return { digests_enqueued: n, skipped, campaign_id: campaign.id };
}

export async function generateDigest(ctx: Ctx) {
  const { sb, job } = ctx;
  const { developer_id, campaign_id, include_analyzed, force, max_age_days } = job.payload;
  const { dev, prefs } = await loadDeveloper(ctx, developer_id);
  const lang = prefs.language ?? "en";

  const { data: existing } = await sb.from("digests").select("id,status,current_version").eq("campaign_id", campaign_id).eq("developer_id", developer_id).maybeSingle();
  if (existing && (existing.status === "sent" || (!force && ["in_review", "approved"].includes(existing.status)))) return { skipped: `digest already ${existing.status}` };

  const load = async () => {
    const { data, error } = await sb.from("developer_relevance_scores")
      .select("personalization_score, reason, item:intelligence_items(*)").eq("developer_id", developer_id).eq("campaign_id", campaign_id).eq("selected", true)
      .order("personalization_score", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).filter((r: any) => r.item);
  };
  let sel = await load();
  if (!sel.length) { await computeAndSelect(ctx, developer_id, campaign_id, !!include_analyzed, max_age_days ?? null); sel = await load(); }

  const upsertDigest = async (patch: Record<string, unknown>) => {
    if (existing) {
      const { error } = await sb.from("digests").update(patch).eq("id", existing.id);
      if (error) throw new Error(error.message);
      return existing.id as string;
    }
    const { data, error } = await sb.from("digests").insert({ campaign_id, developer_id, language: lang, ...patch }).select("id").single();
    if (error) throw new Error(error.message);
    return data.id as string;
  };

  if (!sel.length) {
    await upsertDigest({ status: "failed", error: "No eligible approved intelligence items for this developer this week", title: `Cobuildy Weekly Intelligence - ${dev.company_name}` });
    return { digest: "failed", reason: "no eligible items" };
  }

  const { data: cats } = await sb.from("intelligence_categories").select("id,slug,parent_id");
  const byId = new Map((cats ?? []).map((c) => [c.id, c]));
  const topSlug = (i: any) => {
    const c = byId.get(i.subcategory_id ?? i.category_id);
    return c?.parent_id ? byId.get(c.parent_id)?.slug : c?.slug;
  };
  const rows = sel.map((r: any) => ({ ...r, section: sectionFor(topSlug(r.item)) as Section }));
  const words = WORDS[prefs.detail_level ?? "standard"] ?? 45;

  const user = `DEVELOPER PROFILE\n${profileText(dev, prefs)}\n\nITEMS (the only allowed source of facts)\n${JSON.stringify(rows.map((r: any) => itemPayload(r.item, r.section, r.reason)), null, 1)}`;
  const res = await runLlm(ctx, "digest", "digest", {
    system: SYSTEM(lang), user, toolName: "write_digest", toolDescription: "Write the digest texts",
    schema: schemaFor({ pulse: true, insight: true, itemIds: rows.map((r: any) => r.item.id) }, words), maxTokens: 4000,
  }, { type: "developer", id: developer_id });
  const out = res.data;
  const texts = new Map<string, any>((out.items ?? []).map((x: any) => [x.item_id, x]));

  const content = {
    title: `Cobuildy Weekly Intelligence`, subtitle: `Weekly Real Estate Development & Investment Update`, company: dev.company_name,
    market_pulse: out.market_pulse ?? "", insight: out.cobuildy_insight ?? "", generated_at: new Date().toISOString(), model: res.model, language: lang,
  };
  const digestId = await upsertDigest({ status: "generated", language: lang, title: `Cobuildy Weekly Intelligence - ${dev.company_name}`, content, html: null, error: null });
  await sb.from("digest_items").delete().eq("digest_id", digestId);

  const itemRows: any[] = [];
  for (const sec of SECTIONS) {
    let pos = 0;
    for (const r of rows.filter((x: any) => x.section === sec)) {
      const t = texts.get(r.item.id);
      itemRows.push({
        digest_id: digestId, item_id: r.item.id, section: sec, position: pos++, headline: t?.headline ?? r.item.title, summary: t?.summary ?? r.item.summary,
        why_relevant: t?.why_it_matters ?? r.reason ?? null, impact: t?.impact ?? null,
        location: [r.item.city, r.item.country].filter(Boolean).join(", ") || null, source_url: r.item.canonical_url, source_name: r.item.publisher,
        personalization_score: r.personalization_score,
      });
    }
  }
  const { error: ie } = await sb.from("digest_items").insert(itemRows);
  if (ie) throw new Error(ie.message);

  const version = (existing?.current_version ?? 0) + 1;
  await sb.from("digest_versions").insert({ digest_id: digestId, version, kind: "ai", content: { ...content, items: itemRows }, note: force ? "Full regeneration" : "Initial AI draft" });
  await sb.from("digests").update({ current_version: version }).eq("id", digestId);

  if ((await pendingJobs(sb, ["generate_digest"], job.id)) === 0) {
    await sb.from("notifications").insert({ kind: "digests_ready", title: "Digest drafts are ready for review", body: `Campaign ${campaign_id.slice(0, 8)}: drafts generated. Review and approve before sending.`, link: "/digest-builder" });
  }
  return { digest_id: digestId, items: itemRows.length };
}

/** Regenerates one part of an existing digest: market_pulse, insight, or all items of a section. */
export async function regenerateSection(ctx: Ctx) {
  const { sb, job } = ctx;
  const { digest_id, section } = job.payload as { digest_id: string; section: string };
  const { data: digest, error } = await sb.from("digests").select("*").eq("id", digest_id).single();
  if (error || !digest) throw new Error("digest not found");
  if (digest.status === "sent") throw new Error("A sent digest cannot be modified");
  const { dev, prefs } = await loadDeveloper(ctx, digest.developer_id);
  const lang = digest.language ?? "en";
  const { data: items } = await sb.from("digest_items").select("*, item:intelligence_items(*)").eq("digest_id", digest_id).eq("is_removed", false).order("position");
  const live = (items ?? []).filter((i: any) => i.item);
  if (!live.length) throw new Error("Digest has no items to base the text on");

  const isPulse = section === "market_pulse", isInsight = section === "insight";
  const target = isPulse || isInsight ? [] : live.filter((i: any) => i.section === section);
  if (!isPulse && !isInsight && !target.length) throw new Error(`No items in section ${section}`);

  const user = `DEVELOPER PROFILE\n${profileText(dev, prefs)}\n\nITEMS (the only allowed source of facts)\n${JSON.stringify(live.map((i: any) => itemPayload(i.item, i.section)), null, 1)}\n\nTASK: rewrite only: ${isPulse ? "market_pulse" : isInsight ? "cobuildy_insight" : `the texts of items in section "${section}" (${target.map((t: any) => t.item_id).join(", ")})`}. Take a fresh angle and avoid repeating other sections.`;
  const res = await runLlm(ctx, "digest", "digest_section", {
    system: SYSTEM(lang), user, toolName: "write_digest", toolDescription: "Write the requested digest part",
    schema: schemaFor({ pulse: isPulse, insight: isInsight, itemIds: target.map((t: any) => t.item_id) }, WORDS[prefs.detail_level ?? "standard"] ?? 45), maxTokens: 2500,
  }, { type: "digest", id: digest_id });
  const out = res.data;

  const content = { ...(digest.content ?? {}) };
  if (isPulse) content.market_pulse = out.market_pulse;
  if (isInsight) content.insight = out.cobuildy_insight;
  for (const t of out.items ?? []) {
    await sb.from("digest_items").update({ headline: t.headline, summary: t.summary, why_relevant: t.why_it_matters, impact: t.impact }).eq("digest_id", digest_id).eq("item_id", t.item_id);
  }
  const version = (digest.current_version ?? 0) + 1;
  const { data: all } = await sb.from("digest_items").select("*").eq("digest_id", digest_id).order("section").order("position");
  await sb.from("digest_versions").insert({ digest_id, version, kind: "ai", content: { ...content, items: all }, note: `Regenerated ${section}` });
  const { error: ue } = await sb.from("digests").update({ content, current_version: version, html: null, status: digest.status === "generated" ? "generated" : "in_review" }).eq("id", digest_id);
  if (ue) throw new Error(ue.message);
  return { regenerated: section };
}
