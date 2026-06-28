import { fetchWithTimeout } from "@/lib/fetch-timeout";
// BrightData Web Scraper API client (https://brightdata.com). Triggers a managed
// collection for a known URL, polls until the snapshot is ready, and downloads
// the structured JSON. Used by the BrightData enricher to pull high-fidelity
// LinkedIn (and, later, Crunchbase) data the Exa/EnrichLayer text path misses.
//
// The API is async: POST /trigger → snapshot_id → poll /progress → GET /snapshot.
// Everything here is best-effort: any failure (no key, HTTP error, timeout, empty
// result) resolves to null so the caller degrades gracefully.

const BASE = "https://api.brightdata.com/datasets/v3";

// Dataset IDs from BrightData's marketplace (collected by URL).
export const BRIGHTDATA_DATASETS = {
  linkedinProfile: "gd_l1viktl72bvl7bjuj0",
  crunchbaseCompany: "gd_l1vijqt9jfj7olije",
} as const;

function authHeaders(key: string): HeadersInit {
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// POST inputs to a dataset; returns the snapshot id (or null on failure).
async function triggerCollection(
  key: string,
  datasetId: string,
  inputs: Array<Record<string, unknown>>,
): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(`${BASE}/trigger?dataset_id=${datasetId}`, {
      method: "POST",
      headers: authHeaders(key),
      body: JSON.stringify(inputs),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { snapshot_id?: string };
    return j.snapshot_id ?? null;
  } catch {
    return null;
  }
}

// Poll /progress until the snapshot is "ready" (or "failed"/deadline). Returns
// true only when ready. BrightData LinkedIn pulls finish in ~3–17s; Crunchbase
// can take ~20s+, so callers pass a maxWaitMs matched to their deadline budget.
async function waitForSnapshot(
  key: string,
  snapshotId: string,
  maxWaitMs: number,
  pollMs: number,
): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetchWithTimeout(`${BASE}/progress/${snapshotId}`, { headers: authHeaders(key) });
      if (res.ok) {
        const j = (await res.json()) as { status?: string };
        if (j.status === "ready") return true;
        if (j.status === "failed") return false;
      }
    } catch {
      // transient — keep polling until the deadline
    }
    await sleep(pollMs);
  }
  return false;
}

async function downloadSnapshot(key: string, snapshotId: string): Promise<unknown[] | null> {
  try {
    const res = await fetchWithTimeout(
      `${BASE}/snapshot/${snapshotId}?format=json`,
      { headers: authHeaders(key) },
      30_000, // a snapshot download can be a larger payload than the quick API calls
    );
    if (!res.ok) return null;
    const j = (await res.json()) as unknown;
    return Array.isArray(j) ? j : [j];
  } catch {
    return null;
  }
}

// Orchestrate trigger → wait → download for a single dataset + input list.
export async function collectFromBrightData(opts: {
  datasetId: string;
  inputs: Array<Record<string, unknown>>;
  maxWaitMs?: number;
  pollMs?: number;
}): Promise<unknown[] | null> {
  const key = process.env.BRIGHTDATA_API_KEY;
  if (!key) return null;
  const snapshotId = await triggerCollection(key, opts.datasetId, opts.inputs);
  if (!snapshotId) return null;
  const ready = await waitForSnapshot(key, snapshotId, opts.maxWaitMs ?? 28_000, opts.pollMs ?? 2_500);
  if (!ready) return null;
  return downloadSnapshot(key, snapshotId);
}

// A trimmed view of the BrightData LinkedIn People Profile record — only the
// fields the enricher reads. The raw record carries far more (posts, activity,
// similar_profiles, banner, etc.); we keep `raw` separately for inspection.
export type BrightDataLinkedinProfile = {
  name?: string | null;
  about?: string | null;
  followers?: number | null;
  connections?: number | null;
  current_company?: { name?: string | null; company_id?: string | null } | null;
  current_company_name?: string | null;
  experience?: Array<{
    title?: string | null;
    company?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    description?: string | null;
  }> | null;
  education?: Array<{ title?: string | null; degree?: string | null; field?: string | null; start_year?: string | null; end_year?: string | null }> | null;
  honors_and_awards?: Array<{ title?: string | null }> | null;
  certifications?: Array<unknown> | null;
  languages?: Array<{ title?: string | null; subtitle?: string | null }> | null;
  activity?: Array<unknown> | null;
  posts?: Array<unknown> | null;
  recommendations_count?: number | null;
  // LinkedIn's STABLE per-person numeric id — identical across vanity-URL changes.
  // The bulletproof future dedup key (see identity-dedup follow-up).
  linkedin_num_id?: string | number | null;
};

// Fetch one LinkedIn profile by URL. Identity is exact (we query the specific
// profile URL), so there's no same-name ambiguity to corroborate.
export async function fetchBrightDataLinkedinProfile(
  linkedinUrl: string,
  opts: { maxWaitMs?: number } = {},
): Promise<{ profile: BrightDataLinkedinProfile; raw: unknown } | null> {
  const rows = await collectFromBrightData({
    datasetId: BRIGHTDATA_DATASETS.linkedinProfile,
    inputs: [{ url: linkedinUrl }],
    maxWaitMs: opts.maxWaitMs ?? 28_000,
  });
  const raw = rows?.[0];
  if (!raw || typeof raw !== "object") return null;
  return { profile: raw as BrightDataLinkedinProfile, raw };
}

// A trimmed view of the BrightData Crunchbase company record — the fields the
// Crunchbase enricher reads. The raw record carries far more (builtwith, bombora,
// similar_companies, news, etc.).
export type BrightDataCrunchbaseCompany = {
  name?: string | null;
  website?: string | null;
  num_employees?: string | null; // a band like "11-50" / "5001-10000"
  operating_status?: string | null; // "active" | "closed"
  ipo_status?: string | null; // "private" | "public" | "delisted"
  founders?: Array<{ value?: string | null }> | null;
  investors?: Array<{ value?: string | null } | { funding_round?: unknown; value?: string | null }> | null;
  num_investors?: number | null;
  num_funding_rounds?: number | null;
  acquired_by?: { acquirer?: string | null; transaction_name?: string | null } | null;
  num_acquisitions?: number | null;
  monthly_visits?: number | null; // Semrush web traffic
  semrush_visits_latest_month?: number | null;
  apptopia_total_downloads?: number | null; // mobile app downloads
  financials_highlights?: { num_funding_rounds?: number | null; funding_total?: number | null } | null;
  funds_raised?: Array<{ value?: string | number | null }> | null;
  founded_date?: string | null;
  cb_rank?: number | null;
};

// ── Async primitives (for the Crunchbase sweep) ─────────────────────────────
// Crunchbase collection is too slow to wait on inline, so the async flow splits
// it: trigger now (store the snapshot id), then a cron polls status + downloads
// when ready. All best-effort (null on any failure).

const authKey = () => process.env.BRIGHTDATA_API_KEY;

// Start a Crunchbase collection for one org slug; returns the snapshot id (no wait).
export async function triggerCrunchbaseSnapshot(slug: string): Promise<string | null> {
  const key = authKey();
  if (!key || !slug) return null;
  return triggerCollection(key, BRIGHTDATA_DATASETS.crunchbaseCompany, [
    { url: `https://www.crunchbase.com/organization/${slug}` },
  ]);
}

// Generic: start any dataset collection; returns the snapshot id (no wait).
export async function triggerBdSnapshot(
  datasetId: string,
  inputs: Array<Record<string, unknown>>,
): Promise<string | null> {
  const key = authKey();
  if (!key) return null;
  return triggerCollection(key, datasetId, inputs);
}

// Generic: download any ready snapshot's records (raw, untyped).
export async function downloadBdSnapshot(snapshotId: string): Promise<unknown[] | null> {
  const key = authKey();
  if (!key) return null;
  return downloadSnapshot(key, snapshotId);
}

export type SnapshotStatus = "running" | "ready" | "failed" | "unknown";

export async function getSnapshotStatus(snapshotId: string): Promise<SnapshotStatus> {
  const key = authKey();
  if (!key) return "unknown";
  try {
    const res = await fetchWithTimeout(`${BASE}/progress/${snapshotId}`, { headers: authHeaders(key) });
    if (!res.ok) return "unknown";
    const j = (await res.json()) as { status?: string };
    if (j.status === "ready") return "ready";
    if (j.status === "failed") return "failed";
    return "running";
  } catch {
    return "unknown";
  }
}

// Download a ready Crunchbase snapshot's records.
export async function downloadCrunchbaseSnapshot(
  snapshotId: string,
): Promise<BrightDataCrunchbaseCompany[] | null> {
  const key = authKey();
  if (!key) return null;
  const rows = await downloadSnapshot(key, snapshotId);
  if (!rows) return null;
  return rows.filter((r): r is BrightDataCrunchbaseCompany => !!r && typeof r === "object");
}

// Fetch Crunchbase company records by org SLUG (the /organization/<slug> path).
// The caller corroborates each returned record (e.g. founders-include-subject)
// before trusting it — a slug guessed from a company name can resolve to the
// wrong org. Multiple slugs go in ONE snapshot to minimize round-trips.
export async function fetchBrightDataCrunchbase(
  slugs: string[],
  opts: { maxWaitMs?: number } = {},
): Promise<BrightDataCrunchbaseCompany[]> {
  const uniq = [...new Set(slugs.filter(Boolean))].slice(0, 4);
  if (uniq.length === 0) return [];
  const rows = await collectFromBrightData({
    datasetId: BRIGHTDATA_DATASETS.crunchbaseCompany,
    inputs: uniq.map((s) => ({ url: `https://www.crunchbase.com/organization/${s}` })),
    maxWaitMs: opts.maxWaitMs ?? 38_000,
  });
  return (rows ?? []).filter((r): r is BrightDataCrunchbaseCompany => !!r && typeof r === "object");
}
