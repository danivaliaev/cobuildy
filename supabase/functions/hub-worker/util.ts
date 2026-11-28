import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

export type Sb = SupabaseClient<any, any, any>;

export interface Job {
  id: string;
  job_type: string;
  payload: any;
  attempts: number;
  max_attempts: number;
  result: any;
  created_at: string;
  parent_job_id?: string | null;
}

export class Settings {
  private cache: Record<string, any> = {};
  constructor(private sb: Sb) {}
  async load() {
    const { data, error } = await this.sb.from("system_settings").select("key,value");
    if (error) throw new Error(`settings: ${error.message}`);
    for (const r of data ?? []) this.cache[r.key] = r.value;
  }
  get<T = any>(key: string, fallback: T): T {
    return (this.cache[key] ?? fallback) as T;
  }
}

export interface Ctx {
  sb: Sb;
  settings: Settings;
  job: Job;
}

/** Thrown by a handler to put its job back in the queue (waiting for upstream jobs). */
export class Defer extends Error {
  constructor(public seconds: number, public reason: string) {
    super(reason);
  }
}

export function adminClient(): Sb {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    db: { schema: "hub" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** lower-case, accent-free, trimmed */
export function norm(s?: string | null): string {
  return (s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

export function normalizeUrl(u: string): string {
  try {
    const x = new URL(u.trim());
    x.hash = "";
    for (const k of [...x.searchParams.keys()]) if (/^(utm_|fbclid|gclid|mc_|ref$)/i.test(k)) x.searchParams.delete(k);
    return x.toString().replace(/\/$/, "");
  } catch {
    return u.trim();
  }
}

const ENT: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " ", "&apos;": "'" };
export function stripHtml(s: string): string {
  return (s ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(amp|lt|gt|quot|#39|nbsp|apos);/g, (m) => ENT[m] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/\s+/g, " ")
    .trim();
}

export const COUNTRY_ALIASES: Record<string, string> = {
  es: "ES", spain: "ES", espana: "ES", espanha: "ES",
  pt: "PT", portugal: "PT",
  fr: "FR", france: "FR", francia: "FR", franca: "FR",
  it: "IT", italy: "IT", italia: "IT",
  de: "DE", germany: "DE", alemania: "DE", alemanha: "DE",
  gb: "GB", uk: "GB", "united kingdom": "GB", "reino unido": "GB",
};
export function toCountry(s?: string | null): string | null {
  const k = norm(s);
  if (!k) return null;
  return COUNTRY_ALIASES[k] ?? (/^[a-z]{2}$/.test(k) ? k.toUpperCase() : null);
}

/** Monday (UTC) of the week containing d, as YYYY-MM-DD */
export function weekStart(d = new Date()): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7; // Mon=0
  x.setUTCDate(x.getUTCDate() - dow);
  return x.toISOString().slice(0, 10);
}

export function isoWeekNumber(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00Z");
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - y0.getTime()) / 86400000 + 1) / 7);
}

export function daysSince(iso?: string | null): number {
  if (!iso) return 999;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 999 : Math.max(0, (Date.now() - t) / 86400000);
}

export const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

export async function pendingJobs(sb: Sb, types: string[], excludeId?: string): Promise<number> {
  let q = sb.from("research_jobs").select("id", { count: "exact", head: true }).in("job_type", types).in("status", ["queued", "running"]);
  if (excludeId) q = q.neq("id", excludeId);
  const { count, error } = await q;
  if (error) throw new Error(`pendingJobs: ${error.message}`);
  return count ?? 0;
}

export async function enqueue(sb: Sb, type: string, payload: any, idem: string, parent?: string, source?: string) {
  const { data, error } = await sb.rpc("enqueue_job", {
    p_type: type, p_payload: payload, p_idem: idem, p_triggered_by: "system", p_parent: parent ?? null, p_source: source ?? null,
  });
  if (error) throw new Error(`enqueue ${type}: ${error.message}`);
  return data as string;
}

export async function ensureCampaign(sb: Sb, week = weekStart()): Promise<{ id: string; week_start: string }> {
  const start = new Date(week + "T00:00:00Z");
  const end = new Date(start.getTime() + 7 * 86400000);
  const { data: existing } = await sb.from("digest_campaigns").select("id,week_start").eq("week_start", week).maybeSingle();
  if (existing) return existing;
  const { data, error } = await sb.from("digest_campaigns")
    .insert({ name: `Week of ${week}`, week_start: week, period_start: start.toISOString(), period_end: end.toISOString() })
    .select("id,week_start").single();
  if (error) {
    const { data: again } = await sb.from("digest_campaigns").select("id,week_start").eq("week_start", week).maybeSingle();
    if (again) return again;
    throw new Error(`campaign: ${error.message}`);
  }
  return data;
}
