// Read-side PostHog client. Counterpart to the write-only `posthog-server.ts`
// (which only ingests events): this runs HogQL against the PostHog Query API so
// we can READ analytics back out — used by the daily-metrics digest cron.
//
// Auth uses a PERSONAL API KEY (`phx_…`) in POSTHOG_SECRET, NOT the public
// ingest key (`phc_…`, NEXT_PUBLIC_POSTHOG_KEY) which can write but never read.
// Returns null/throws-free helpers so a missing key never crashes a caller.
import { fetchWithTimeout } from "@/lib/fetch-timeout";

const PROJECT_ID = process.env.POSTHOG_PROJECT_ID ?? "0";

// The Query API lives on the app host (us.posthog.com), NOT the ingest host
// (us.i.posthog.com that NEXT_PUBLIC_POSTHOG_HOST points at). Derive the app
// host from the ingest host when possible, else default to US cloud.
function apiHost(): string {
  if (process.env.POSTHOG_API_HOST) return process.env.POSTHOG_API_HOST;
  const ingest = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "";
  if (ingest.includes("eu.i.posthog.com")) return "https://eu.posthog.com";
  return "https://us.posthog.com";
}

export function posthogReadConfigured(): boolean {
  return !!process.env.POSTHOG_SECRET;
}

export type HogQLRow = (string | number | null)[];

// Runs a HogQL query and returns its result rows (array-of-arrays, column order
// matching the SELECT). Throws on auth/HTTP/HogQL errors so the caller can
// decide whether to abort the whole digest or skip one metric.
export async function phQuery(hogql: string): Promise<HogQLRow[]> {
  const key = process.env.POSTHOG_SECRET;
  if (!key) throw new Error("POSTHOG_SECRET not set — cannot read from PostHog");

  const res = await fetchWithTimeout(
    `${apiHost()}/api/projects/${PROJECT_ID}/query/`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query: hogql } }),
    },
    30_000, // HogQL aggregations over large event volumes can run longer than the default
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`PostHog query failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as { results?: HogQLRow[] };
  return data.results ?? [];
}
