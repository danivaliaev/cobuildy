import type { Ctx } from "./util.ts";

/** Provider-agnostic LLM interface. Add OpenAI/Gemini/etc. by implementing LlmProvider and registering it below. */
export interface LlmRequest {
  model: string;
  system: string;
  user: string;
  toolName: string;
  toolDescription: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}
export interface LlmResult {
  data: any;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}
export interface LlmProvider {
  name: string;
  complete(r: LlmRequest): Promise<LlmResult>;
}

/** Models that refuse a forced tool_choice (400 "tool_choice ... not supported for this model"): remembered so only the first call pays for the retry. */
const noForcedTool = new Set<string>();

class AnthropicProvider implements LlmProvider {
  name = "anthropic";
  async complete(r: LlmRequest): Promise<LlmResult> {
    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) throw new Error("ANTHROPIC_API_KEY is not set for the hub-worker Edge Function");
    const makeBody = (forced: boolean) => JSON.stringify({
      model: r.model,
      max_tokens: r.maxTokens ?? 2000,
      system: forced ? r.system : `${r.system}\n\nYou must answer by calling the tool "${r.toolName}" exactly once. Do not write any other text.`,
      messages: [{ role: "user", content: r.user }],
      tools: [{ name: r.toolName, description: r.toolDescription, input_schema: r.schema }],
      tool_choice: forced ? { type: "tool", name: r.toolName } : { type: "auto" },
    });
    let forced = !noForcedTool.has(r.model);
    let body = makeBody(forced);
    const t0 = Date.now();
    let lastErr = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(90_000),
      });
      if (res.status === 429 || res.status === 529 || res.status >= 500) {
        const wait = Math.min(Number(res.headers.get("retry-after") ?? 2 * (attempt + 1)), 15);
        lastErr = `Anthropic ${res.status}`;
        await new Promise((ok) => setTimeout(ok, wait * 1000));
        continue;
      }
      const json = await res.json();
      if (res.status === 400 && forced && /tool_choice/i.test(String(json?.error?.message ?? ""))) {
        noForcedTool.add(r.model); forced = false; body = makeBody(false); // this model needs "auto": ask again that way
        continue;
      }
      if (!res.ok) throw new Error(`Anthropic ${res.status}: ${json?.error?.message ?? "unknown error"}`);
      const block = (json.content ?? []).find((b: any) => b.type === "tool_use");
      if (!block) throw new Error("Model returned no structured output");
      return {
        data: block.input,
        inputTokens: json.usage?.input_tokens ?? 0,
        outputTokens: json.usage?.output_tokens ?? 0,
        latencyMs: Date.now() - t0,
      };
    }
    throw new Error(`${lastErr} (rate limited or overloaded, will retry later)`);
  }
}

const providers: Record<string, LlmProvider> = { anthropic: new AnthropicProvider() };

export type Task = "analysis" | "digest" | "profile_assist";

/** Runs a structured LLM call using the provider/model configured in hub.system_settings (ai.models) and logs cost. */
export async function runLlm(
  ctx: Ctx,
  task: Task,
  purpose: "analysis" | "digest" | "digest_section" | "profile_assist" | "other",
  req: Omit<LlmRequest, "model">,
  entity?: { type: string; id: string },
): Promise<any> {
  const cfg = ctx.settings.get<Record<string, { provider: string; model: string }>>("ai.models", {})[task];
  if (!cfg) throw new Error(`No AI model configured for task "${task}" (Settings > AI)`);
  const provider = providers[cfg.provider];
  if (!provider) throw new Error(`Unknown AI provider "${cfg.provider}"`);
  const pricing = ctx.settings.get<Record<string, { input_per_mtok: number; output_per_mtok: number }>>("ai.pricing", {})[cfg.model];
  try {
    const out = await provider.complete({ ...req, model: cfg.model });
    const cost = pricing ? (out.inputTokens / 1e6) * pricing.input_per_mtok + (out.outputTokens / 1e6) * pricing.output_per_mtok : 0;
    await ctx.sb.from("ai_generation_logs").insert({
      job_id: ctx.job.id, purpose, provider: cfg.provider, model: cfg.model,
      input_tokens: out.inputTokens, output_tokens: out.outputTokens, cost_usd: cost, latency_ms: out.latencyMs,
      status: "ok", entity_type: entity?.type ?? null, entity_id: entity?.id ?? null,
    });
    return { ...out, model: cfg.model };
  } catch (e) {
    await ctx.sb.from("ai_generation_logs").insert({
      job_id: ctx.job.id, purpose, provider: cfg.provider, model: cfg.model, status: "error",
      error: String((e as Error).message).slice(0, 500), entity_type: entity?.type ?? null, entity_id: entity?.id ?? null,
    });
    throw e;
  }
}
