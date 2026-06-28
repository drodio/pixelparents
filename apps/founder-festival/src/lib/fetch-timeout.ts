// Shared fetch wrapper that enforces a wall-clock timeout via AbortController,
// so a hung external API can't stall a request or cron run indefinitely. Mirrors
// the per-call pattern enrichers/neo.ts already used. NOTE: enrichers run through
// runEnrichments' withEnricherTimeout (Promise.race) and don't need this; use it
// for STANDALONE external integrations (Luma, Twilio, AnyMailFinder, Blob,
// BrightData async, Chief) that aren't otherwise time-boxed.

// Default deadline for a single external call. Generous enough for slow APIs,
// bounded enough to fail a stuck socket. Overridable per call.
export const DEFAULT_FETCH_TIMEOUT_MS = Number(process.env.EXTERNAL_FETCH_TIMEOUT_MS) || 15_000;

export async function fetchWithTimeout(
  url: string | URL,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
