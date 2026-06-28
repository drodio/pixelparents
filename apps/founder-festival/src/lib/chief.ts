import { fetchWithTimeout } from "@/lib/fetch-timeout";
// Chief (chief.bot / api.storytell.ai) async client.
//
// COST NOTE — UPDATED 2026-06-19: the Chief API now DOES expose per-search credit
// usage. The per-message GET (`/v1/chats/{chat}/messages/{message}`) returns
// `ingress_credits` (input), `egress_credits` (output), and `total_credits`
// alongside `response`. We surface these on ChiefResult.credits so callers can
// report exact spend (no more "count calls and reconcile in the dashboard").
// We still also enforce a CALL COUNT cap via CHIEF_CALL_BUDGET as a coarse
// backstop; for a credit cap, sum result.credits.total across a batch.
// (Historical: before 2026-06-19 the API exposed no usage data at all — only the
// call count was meterable.)
//
// LATENCY NOTE: responses take MINUTES (research > expert), so this is for ASYNC
// /background use only — never inline in the eval request path. POST returns
// immediately with ids; we poll the per-message endpoint until `response` lands.

const BASE = "https://api.storytell.ai";

export class ChiefBudgetError extends Error {}

let callsThisProcess = 0;
/** Calls made by chiefSearch in this process (the meterable proxy for spend). */
export function chiefCallsUsed(): number {
  return callsThisProcess;
}
/** Reset the in-process counter (tests / a fresh batch). */
export function resetChiefCalls(): void {
  callsThisProcess = 0;
}

export function chiefConfigured(): boolean {
  return Boolean(process.env.CHIEF_API_TOKEN && process.env.CHIEF_PROJECT_ID);
}

export type ChiefSearchOpts = {
  intelligence?: "auto" | "fast" | "expert" | "research";
  publicData?: boolean;
  maxWaitMs?: number; // give up after this; research mode can take many minutes
  pollMs?: number;
};

// Per-search credit usage, read straight off the Chief message object.
export type ChiefCredits = { total: number; ingress: number; egress: number };
export type ChiefResult = { text: string; ms: number; calls: number; credits: ChiefCredits | null };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Run one Chief search and wait (polling) for the answer. Returns null on:
// not-configured, HTTP error, or timeout — all fail-safe (callers treat null as
// "no Chief signal", never an exception) EXCEPT a budget overrun, which throws
// ChiefBudgetError so a batch stops deterministically at the cap.
export async function chiefSearch(prompt: string, opts: ChiefSearchOpts = {}): Promise<ChiefResult | null> {
  if (!chiefConfigured()) return null;
  const token = process.env.CHIEF_API_TOKEN as string;
  const projectId = process.env.CHIEF_PROJECT_ID as string;

  const budget = Number(process.env.CHIEF_CALL_BUDGET) || 0;
  if (budget > 0 && callsThisProcess >= budget) {
    throw new ChiefBudgetError(`Chief call budget (${budget}) reached; refusing further calls`);
  }
  callsThisProcess++;

  const headers = {
    "X-API-Key": token,
    "X-Project-Id": projectId,
    "content-type": "application/json",
  };
  const t0 = Date.now();
  let post: Response;
  try {
    post = await fetchWithTimeout(`${BASE}/v1/chats`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        prompt,
        intelligence: opts.intelligence ?? "expert",
        public_data: opts.publicData ?? true,
      }),
    });
  } catch {
    return null;
  }
  if (!post.ok) return null;
  const ids = (await post.json().catch(() => null)) as { chat_id?: string; message_id?: string } | null;
  if (!ids?.chat_id || !ids?.message_id) return null;

  const maxWait = opts.maxWaitMs ?? 360_000; // 6 min default
  const pollMs = opts.pollMs ?? 5_000;
  while (Date.now() - t0 < maxWait) {
    await sleep(pollMs);
    let r: Response;
    try {
      r = await fetchWithTimeout(`${BASE}/v1/chats/${ids.chat_id}/messages/${ids.message_id}`, { headers });
    } catch {
      continue;
    }
    if (!r.ok) continue;
    const m = (await r.json().catch(() => null)) as
      | { response?: string; ingress_credits?: number; egress_credits?: number; total_credits?: number }
      | null;
    if (m?.response) {
      const credits =
        m.total_credits != null || m.ingress_credits != null || m.egress_credits != null
          ? { total: m.total_credits ?? 0, ingress: m.ingress_credits ?? 0, egress: m.egress_credits ?? 0 }
          : null;
      return { text: m.response, ms: Date.now() - t0, calls: callsThisProcess, credits };
    }
  }
  return null; // timed out — caller degrades gracefully
}

// ── Split submit / poll, for background generation across cron ticks ──────────
// chiefSearch holds one request open for minutes (fine for a local script, but
// it exceeds a serverless function's max duration). For in-app generation we
// SUBMIT (fast POST → ids), persist the ids, and POLL on a schedule until the
// answer lands — so no single request runs for minutes.

export type ChiefHandle = { chatId: string; messageId: string };

// Create a Chief chat and return its ids immediately (no waiting). Returns null
// on not-configured / HTTP error; throws ChiefBudgetError on a call-budget overrun.
export async function chiefSubmit(prompt: string, opts: ChiefSearchOpts = {}): Promise<ChiefHandle | null> {
  if (!chiefConfigured()) return null;
  const budget = Number(process.env.CHIEF_CALL_BUDGET) || 0;
  if (budget > 0 && callsThisProcess >= budget) {
    throw new ChiefBudgetError(`Chief call budget (${budget}) reached; refusing further calls`);
  }
  callsThisProcess++;
  const headers = {
    "X-API-Key": process.env.CHIEF_API_TOKEN as string,
    "X-Project-Id": process.env.CHIEF_PROJECT_ID as string,
    "content-type": "application/json",
  };
  let post: Response;
  try {
    post = await fetchWithTimeout(`${BASE}/v1/chats`, {
      method: "POST",
      headers,
      body: JSON.stringify({ prompt, intelligence: opts.intelligence ?? "expert", public_data: opts.publicData ?? true }),
    });
  } catch {
    return null;
  }
  if (!post.ok) return null;
  const ids = (await post.json().catch(() => null)) as { chat_id?: string; message_id?: string } | null;
  if (!ids?.chat_id || !ids?.message_id) return null;
  return { chatId: ids.chat_id, messageId: ids.message_id };
}

export type ChiefPoll =
  | { status: "pending" }
  | { status: "ready"; text: string; credits: ChiefCredits | null }
  | { status: "error" };

// One non-blocking poll of a submitted Chief message. "pending" = keep waiting;
// "ready" = the answer landed; "error" = not configured / HTTP error this tick
// (callers can retry on the next tick — a transient error is not terminal).
export async function chiefPoll(handle: ChiefHandle): Promise<ChiefPoll> {
  if (!chiefConfigured()) return { status: "error" };
  const headers = {
    "X-API-Key": process.env.CHIEF_API_TOKEN as string,
    "X-Project-Id": process.env.CHIEF_PROJECT_ID as string,
  };
  let r: Response;
  try {
    r = await fetchWithTimeout(`${BASE}/v1/chats/${handle.chatId}/messages/${handle.messageId}`, { headers });
  } catch {
    return { status: "error" };
  }
  if (!r.ok) return { status: "error" };
  const m = (await r.json().catch(() => null)) as
    | { response?: string; ingress_credits?: number; egress_credits?: number; total_credits?: number }
    | null;
  if (!m) return { status: "error" };
  if (!m.response) return { status: "pending" };
  const credits =
    m.total_credits != null || m.ingress_credits != null || m.egress_credits != null
      ? { total: m.total_credits ?? 0, ingress: m.ingress_credits ?? 0, egress: m.egress_credits ?? 0 }
      : null;
  return { status: "ready", text: m.response, credits };
}

// ── Public share link ─────────────────────────────────────────────────────────
// Ensure a Chief chat is publicly shared and return its share URL (the
// `https://chief.bot/shared/chat/<hash>` form — note the hash is NOT the chat_id).
// POST /v1/chats/{chat}/share is idempotent: it creates the share if needed and
// returns the existing one otherwise. Returns null on not-configured / HTTP error
// / missing url so callers can degrade (the dossier stays linkless).
export async function chiefShare(chatId: string): Promise<string | null> {
  if (!chiefConfigured()) return null;
  const headers = {
    "X-API-Key": process.env.CHIEF_API_TOKEN as string,
    "X-Project-Id": process.env.CHIEF_PROJECT_ID as string,
    "content-type": "application/json",
  };
  let r: Response;
  try {
    r = await fetchWithTimeout(`${BASE}/v1/chats/${chatId}/share`, { method: "POST", headers, body: "{}" });
  } catch {
    return null;
  }
  if (!r.ok) return null;
  const j = (await r.json().catch(() => null)) as { url?: string } | null;
  return j?.url && j.url.startsWith("https://") ? j.url : null;
}

// The H1 the dossier prompt always emits ("# Deep Intelligence Dossier on …").
// chief.bot's share page matches scroll-to text with whitespace removed, so we
// anchor on this static phrase (present for every profile).
export const DOSSIER_SCROLL_ANCHOR = "Deep Intelligence Dossier on";

// Build the public, scroll-to dossier link: the Chief share URL anchored to the
// message (`?leaf=`) AND scrolled to the report heading (`?start=&end=`, the same
// value → a point scroll), matching the chief.bot FE constructor:
//   ?start=<anchor>&end=<anchor>&leaf=<message_id>
export function dossierShareUrl(shareBase: string, messageId: string): string {
  const sep = shareBase.includes("?") ? "&" : "?";
  const anchor = encodeURIComponent(DOSSIER_SCROLL_ANCHOR.replace(/\s+/g, ""));
  return `${shareBase}${sep}start=${anchor}&end=${anchor}&leaf=${encodeURIComponent(messageId)}`;
}
