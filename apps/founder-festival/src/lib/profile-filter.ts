// Pure helpers for the /admin/profiles "Filter" control. A profile is visible
// iff ANY of its labels is enabled. A label is either a source (Web/Bulk/API)
// or a bulk run (keyed by jobId). No React here so it's unit-testable; the
// client component just holds the enabled-key Set and calls rowMatchesFilter.

export type ProfileSource = "web" | "bulk" | "api";

export type FilterableRow = {
  source: ProfileSource;
  runs: { jobId: string; title: string | null }[];
};

export type FilterLabel = {
  key: string; // "source:web" | "run:<jobId>"
  label: string; // display text
  kind: "source" | "run";
};

const SOURCE_LABEL: Record<ProfileSource, string> = { web: "Web", bulk: "Bulk", api: "API" };
const SOURCE_ORDER: ProfileSource[] = ["web", "bulk", "api"];

// The label keys a single row carries: its source + one per run it belongs to.
export function rowLabelKeys(row: FilterableRow): string[] {
  return [`source:${row.source}`, ...row.runs.map((r) => `run:${r.jobId}`)];
}

// Every distinct label across the rows: present source labels (web/bulk/api
// order) first, then run labels (first title seen per jobId wins), de-duped.
export function collectFilterLabels(rows: FilterableRow[]): FilterLabel[] {
  const presentSources = new Set(rows.map((r) => r.source));
  const labels: FilterLabel[] = SOURCE_ORDER.filter((s) => presentSources.has(s)).map((s) => ({
    key: `source:${s}`,
    label: SOURCE_LABEL[s],
    kind: "source" as const,
  }));
  const seenRuns = new Set<string>();
  for (const row of rows) {
    for (const run of row.runs) {
      if (seenRuns.has(run.jobId)) continue;
      seenRuns.add(run.jobId);
      labels.push({ key: `run:${run.jobId}`, label: run.title?.trim() || "Untitled run", kind: "run" });
    }
  }
  return labels;
}

// Visible iff ANY of the row's labels is in the enabled set.
export function rowMatchesFilter(row: FilterableRow, enabled: Set<string>): boolean {
  return rowLabelKeys(row).some((k) => enabled.has(k));
}
