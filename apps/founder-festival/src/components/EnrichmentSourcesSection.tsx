import { FiCheckCircle, FiKey, FiMinusCircle, FiAlertTriangle } from "react-icons/fi";

// The full roster of enrichment data sources for a profile, with each source's
// run status. Surfaces EVERY source — including ones that were skipped because an
// API key isn't configured ("API key not set") or that returned no data — so a
// viewer sees the complete set of ~30 sources and which ran vs. which need a key.
//
// Reads profile.enrichmentStatuses (persisted by the eval pipeline). Falls back
// to deriving from profile.enrichments[] for rows scored before statuses existed.

type EnrichmentStatus = "ok" | "no_api_key" | "no_data" | "error";

type StatusEntry = {
  source: string;
  status: EnrichmentStatus;
  note?: string | null;
  factCount: number;
};

// Human-readable labels for the source slugs. Anything unmapped is title-cased.
const SOURCE_LABELS: Record<string, string> = {
  github: "GitHub",
  producthunt: "Product Hunt",
  wikipedia: "Wikipedia",
  yc: "Y Combinator",
  "exa-domain": "High-signal web (Exa)",
  hackernews: "Hacker News",
  "sec-edgar": "SEC EDGAR",
  stackoverflow: "Stack Overflow",
  npm: "npm",
  huggingface: "Hugging Face",
  wikidata: "Wikidata",
  openalex: "OpenAlex",
  kaggle: "Kaggle",
  crates: "crates.io",
  tranco: "Tranco",
  nfx: "NFX Signal",
  neo: "Neo",
  devto: "DEV.to",
  "hn-tokenmaxxing": "HN Tokenmaxxing",
  librariesio: "Libraries.io",
  "google-kg": "Google Knowledge Graph",
  youtube: "YouTube",
  brightdata: "LinkedIn (BrightData)",
  crunchbase: "Crunchbase",
  "linkedin-company": "LinkedIn Company",
  "crunchbase-person": "Crunchbase Person",
  patents: "USPTO Patents",
  twitter: "X / Twitter",
  website: "Personal website",
};

function labelFor(source: string): string {
  return (
    SOURCE_LABELS[source] ??
    source.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function asStatus(v: unknown): EnrichmentStatus {
  return v === "no_api_key" || v === "no_data" || v === "error" ? v : "ok";
}

// Coerce the persisted profile blob into a status list. Prefers
// enrichmentStatuses; falls back to enrichments[] (deriving ok/no_data from
// fact_count) for older rows.
export function statusEntriesFromProfile(profile: unknown): StatusEntry[] {
  if (!profile || typeof profile !== "object") return [];
  const obj = profile as Record<string, unknown>;

  const statuses = obj.enrichmentStatuses;
  if (Array.isArray(statuses)) {
    return statuses
      .map((s): StatusEntry | null => {
        if (!s || typeof s !== "object") return null;
        const o = s as Record<string, unknown>;
        if (typeof o.source !== "string") return null;
        return {
          source: o.source,
          status: asStatus(o.status),
          note: typeof o.note === "string" ? o.note : null,
          factCount: typeof o.factCount === "number" ? o.factCount : 0,
        };
      })
      .filter((x): x is StatusEntry => x !== null);
  }

  const enrichments = obj.enrichments;
  if (Array.isArray(enrichments)) {
    return enrichments
      .map((e): StatusEntry | null => {
        if (!e || typeof e !== "object") return null;
        const o = e as Record<string, unknown>;
        if (typeof o.source !== "string") return null;
        const factCount = typeof o.fact_count === "number" ? o.fact_count : 0;
        return { source: o.source, status: factCount > 0 ? "ok" : "no_data", note: null, factCount };
      })
      .filter((x): x is StatusEntry => x !== null);
  }

  return [];
}

const STATUS_ORDER: Record<EnrichmentStatus, number> = {
  ok: 0,
  no_data: 1,
  no_api_key: 2,
  error: 3,
};

function StatusIcon({ status }: { status: EnrichmentStatus }) {
  if (status === "ok") return <FiCheckCircle className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden />;
  if (status === "no_api_key") return <FiKey className="h-4 w-4 text-zinc-500 shrink-0" aria-hidden />;
  if (status === "error") return <FiAlertTriangle className="h-4 w-4 text-amber-500 shrink-0" aria-hidden />;
  return <FiMinusCircle className="h-4 w-4 text-zinc-600 shrink-0" aria-hidden />;
}

function statusText(e: StatusEntry): string {
  if (e.status === "ok") return `${e.factCount} fact${e.factCount === 1 ? "" : "s"}`;
  if (e.status === "no_api_key") return e.note || "API key not set";
  if (e.status === "error") return e.note ? `error — ${e.note}` : "error";
  return "no data";
}

export function EnrichmentSourcesSection({ profile }: { profile: unknown }) {
  const entries = statusEntriesFromProfile(profile);
  if (entries.length === 0) return null;

  const sorted = [...entries].sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || labelFor(a.source).localeCompare(labelFor(b.source)),
  );
  const okCount = entries.filter((e) => e.status === "ok").length;

  return (
    <section className="w-full flex flex-col gap-3" aria-labelledby="data-sources-heading">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="data-sources-heading" className="font-display text-lg font-bold tracking-tight">
          Data sources
        </h2>
        <span className="text-xs text-zinc-500">
          {okCount} of {entries.length} returned data
        </span>
      </div>
      <p className="text-xs text-zinc-500 -mt-1">
        Every source we check. Sources marked &ldquo;API key not set&rdquo; will start
        contributing once their key is configured.
      </p>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
        {sorted.map((e) => (
          <li
            key={e.source}
            className={`flex items-center gap-2 text-sm ${e.status === "ok" ? "text-zinc-200" : "text-zinc-500"}`}
          >
            <StatusIcon status={e.status} />
            <span className="font-medium">{labelFor(e.source)}</span>
            <span className="text-zinc-500 font-normal ml-auto text-xs">{statusText(e)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
