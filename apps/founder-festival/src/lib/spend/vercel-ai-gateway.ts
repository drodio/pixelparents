import { parseVercelCredits } from "./parse";
import { fetchWithTimeout } from "@/lib/fetch-timeout";

// Live read of account-wide AI Gateway credit usage. All LLM scoring flows
// through the gateway, so `totalUsedUsd` is the authoritative lifetime LLM
// spend — the number the operator sees on Vercel's AI dashboard. The /credits
// endpoint returns LIFETIME totals (no date range), which is why the dashboard
// labels this card "lifetime" while the DB-derived cards use a 30-day window.

export type VercelCredits = {
  balanceUsd: number;
  totalUsedUsd: number;
  fetchedAt: string; // ISO timestamp of the live read
};

export type VercelCreditsResult =
  | { ok: true; data: VercelCredits }
  | { ok: false; error: string };

const CREDITS_URL = "https://ai-gateway.vercel.sh/v1/credits";
const CACHE_TTL_MS = 60_000;

// Module-level cache so a burst of dashboard hits doesn't hammer the endpoint.
let cache: { data: VercelCredits; at: number } | null = null;

export async function getVercelCredits(): Promise<VercelCreditsResult> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return { ok: true, data: cache.data };
  }
  const key = process.env.AI_GATEWAY_API_KEY;
  if (!key) return { ok: false, error: "AI_GATEWAY_API_KEY not set" };

  try {
    const res = await fetchWithTimeout(CREDITS_URL, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    if (!res.ok) {
      return { ok: false, error: `AI Gateway returned HTTP ${res.status}` };
    }
    const json = await res.json();
    const parsed = parseVercelCredits(json);
    const data: VercelCredits = { ...parsed, fetchedAt: new Date().toISOString() };
    cache = { data, at: Date.now() };
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "fetch failed" };
  }
}
