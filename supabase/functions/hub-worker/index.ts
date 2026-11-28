// Cobuildy Intelligence Hub - background worker.
// Triggered by pg_cron (every minute, via pg_net) or by the admin app. Pulls jobs from the pgmq queue "hub_jobs",
// claims them idempotently, runs the handler, retries with backoff and records cost/logs in hub.* tables.
import { createClient } from "npm:@supabase/supabase-js@2";
import { analyzeArticle, stageAnalysis } from "./analysis.ts";
import { generateDigest, regenerateSection, stageDigest } from "./digest.ts";
import { personalizeDeveloper, stagePersonalization } from "./personalize.ts";
import { scanSource, stageResearch } from "./research.ts";
import { adminClient, Ctx, Defer, enqueue, Job, Sb, Settings, weekStart } from "./util.ts";

type Handler = (ctx: Ctx) => Promise<unknown>;

const handlers: Record<string, Handler> = {
  // on-demand "run everything": the stage jobs wait for their upstream jobs (see Defer), so they can all be queued at once
  pipeline: async (ctx) => {
    const { sb, job } = ctx;
    const stages: string[] = job.payload.stages ?? ["research", "analysis", "personalization", "digest"];
    // country: run only that market's sources, developers and digest. max_age_days: the news window. force: write the digest again even if one is in review.
    const payload = { include_analyzed: job.payload.include_analyzed ?? true, week_start: weekStart(), country: job.payload.country ?? null, max_age_days: job.payload.max_age_days ?? null, force: !!job.payload.force };
    for (const s of stages) await enqueue(sb, `stage_${s}`, payload, `pipe:${job.id}:${s}`, job.id);
    return { stages_enqueued: stages };
  },
  stage_research: stageResearch,
  scan_source: scanSource,
  stage_analysis: stageAnalysis,
  analyze_article: analyzeArticle,
  stage_personalization: stagePersonalization,
  personalize_developer: personalizeDeveloper,
  stage_digest: stageDigest,
  generate_digest: generateDigest,
  regenerate_digest_section: regenerateSection,
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function authorized(req: Request, sb: Sb): Promise<boolean> {
  const secret = req.headers.get("x-hub-secret");
  if (secret) {
    const { data } = await sb.rpc("verify_worker_secret", { p: secret });
    return data === true;
  }
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const user = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } }, db: { schema: "hub" }, auth: { persistSession: false },
    });
    const { data } = await user.rpc("can_edit");
    return data === true;
  }
  return false;
}

async function processMessage(sb: Sb, settings: Settings, m: { msg_id: number; read_ct: number; job_id: string }) {
  const { data: claimed } = await sb.rpc("claim_job", { p_id: m.job_id });
  if (!claimed || !claimed.id) {
    const { data: j } = await sb.from("research_jobs").select("status,started_at").eq("id", m.job_id).maybeSingle();
    const busy = j?.status === "running" && j.started_at && Date.now() - new Date(j.started_at).getTime() < 10 * 60_000;
    if (!busy) await sb.rpc("q_archive", { p_msg: m.msg_id }); // finished, cancelled, exhausted or gone
    return;
  }
  const job = claimed as Job;
  const handler = handlers[job.job_type];
  try {
    if (!handler) throw new Error(`No handler for job type "${job.job_type}"`);
    const result = await handler({ sb, settings, job });
    await sb.rpc("finish_job", { p_id: job.id, p_ok: true, p_result: (result as object) ?? {}, p_error: null });
    await sb.rpc("q_archive", { p_msg: m.msg_id });
  } catch (e) {
    if (e instanceof Defer) {
      const n = (job.result?.deferrals ?? 0) + 1;
      if (n <= 120) {
        await sb.from("research_jobs").update({ status: "queued", attempts: Math.max(0, job.attempts - 1), result: { deferrals: n, waiting_for: e.reason } }).eq("id", job.id);
        await sb.rpc("q_delay", { p_msg: m.msg_id, p_vt: e.seconds });
        return;
      }
      await sb.from("research_jobs").update({ attempts: job.max_attempts }).eq("id", job.id);
    }
    const message = String((e as Error)?.message ?? e).slice(0, 500);
    console.error(`[job ${job.id} ${job.job_type}]`, message);
    const { data: status } = await sb.rpc("finish_job", { p_id: job.id, p_ok: false, p_result: null, p_error: message });
    if (status === "queued") await sb.rpc("q_delay", { p_msg: m.msg_id, p_vt: Math.min(30 * 2 ** job.attempts, 600) });
    else await sb.rpc("q_archive", { p_msg: m.msg_id });
  }
}

async function runPool<T>(items: T[], size: number, fn: (x: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(size, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift()!).catch((e) => console.error("worker error", e));
  }));
}

async function processBatch(sb: Sb) {
  const settings = new Settings(sb);
  await settings.load();
  const deadline = Date.now() + 100_000;
  let processed = 0;
  while (Date.now() < deadline) {
    const { data: msgs, error } = await sb.rpc("q_read", { p_vt: 180, p_qty: 6 });
    if (error) { console.error("q_read", error.message); break; }
    if (!msgs?.length) break;
    await runPool(msgs, 3, (m: any) => processMessage(sb, settings, m));
    processed += msgs.length;
  }
  return processed;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  const sb = adminClient();
  if (!(await authorized(req, sb))) return json({ error: "unauthorized" }, 401);
  const run = processBatch(sb).catch((e) => console.error("batch failed", e));
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) { rt.waitUntil(run); return json({ accepted: true }, 202); }
  return json({ processed: await run });
});
