"use client";

import type { LeaderboardFilter } from "@/lib/leaderboard-constants";
import { badgeFilterLabel } from "@/lib/leaderboard-constants";
import { industryLabel } from "@/lib/industries";
import { FAMILY_FILTER_LABELS } from "@/lib/family-constants";

// Labels for the non-badge facets (badges use badgeFilterLabel). Mirrors the
// option labels in LeaderboardFilters; kept small + local rather than exported.
const STAGE_LABELS: Record<string, string> = {
  idea: "Idea", "pre-seed": "Pre-seed", seed: "Seed",
  "series-a": "Series A", "series-b": "Series B", "series-c+": "Series C+",
  growth: "Growth", public: "Public", acquired: "Acquired",
};
const OUTCOME_LABELS: Record<string, string> = {
  ipo: "IPO", acquired: "Acquired", unicorn: "Unicorn",
};
const RAISED_LABELS: Record<string, string> = {
  "50000": "$50K+ raised", "1000000": "$1M+ raised", "10000000": "$10M+ raised",
  "100000000": "$100M+ raised", "1000000000": "$1B+ raised",
};
const TEAM_LABELS: Record<string, string> = {
  "10": "10+ team", "50": "50+ team", "200": "200+ team", "1000": "1,000+ team",
};
const ROLE_LABELS: Record<string, string> = {
  founder: "Founders", investor: "Investors",
};

type Pill = { key: string; label: string; remove: (sp: URLSearchParams) => void };

function dropFromCsv(sp: URLSearchParams, key: string, value: string) {
  const next = (sp.get(key) ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean)
    .filter((v) => v !== value);
  if (next.length) sp.set(key, next.join(","));
  else sp.delete(key);
}

// Active-filter pills under the search box. Each filter (role, stage, capital,
// team, badge — and outcome from legacy URLs) renders as a removable white pill.
// Removing one navigates with just that value stripped. Renders nothing when no
// filters are active. `navigate` mutates a copy of the current URLSearchParams
// and pushes (owned by LeaderboardClient so all navigation stays in one place).
export function LeaderboardActiveFilters({
  filter,
  navigate,
}: {
  filter: LeaderboardFilter;
  navigate: (mutate: (sp: URLSearchParams) => void) => void;
}) {
  const pills: Pill[] = [];

  if (filter.role !== "both") {
    pills.push({
      key: "role",
      label: ROLE_LABELS[filter.role] ?? filter.role,
      // Drop sort too so it re-derives from the (now "both") role.
      remove: (sp) => { sp.delete("role"); sp.delete("sort"); },
    });
  }
  for (const s of filter.stages) {
    pills.push({ key: `stage:${s}`, label: STAGE_LABELS[s] ?? s, remove: (sp) => dropFromCsv(sp, "stage", s) });
  }
  for (const o of filter.outcomes) {
    pills.push({ key: `outcome:${o}`, label: OUTCOME_LABELS[o] ?? o, remove: (sp) => dropFromCsv(sp, "outcome", o) });
  }
  if (filter.raisedMin != null) {
    pills.push({
      key: "raised",
      label: RAISED_LABELS[String(filter.raisedMin)] ?? `$${filter.raisedMin.toLocaleString("en-US")}+ raised`,
      remove: (sp) => sp.delete("raised_min"),
    });
  }
  if (filter.teamMin != null) {
    pills.push({
      key: "team",
      label: TEAM_LABELS[String(filter.teamMin)] ?? `${filter.teamMin.toLocaleString("en-US")}+ team`,
      remove: (sp) => sp.delete("team_min"),
    });
  }
  for (const b of filter.badges) {
    pills.push({ key: `badge:${b}`, label: badgeFilterLabel(b), remove: (sp) => dropFromCsv(sp, "badge", b) });
  }
  for (const ind of filter.industries) {
    pills.push({ key: `industry:${ind}`, label: industryLabel(ind) ?? ind, remove: (sp) => dropFromCsv(sp, "industry", ind) });
  }
  for (const fam of filter.family) {
    pills.push({ key: `family:${fam}`, label: FAMILY_FILTER_LABELS[fam] ?? fam, remove: (sp) => dropFromCsv(sp, "family", fam) });
  }

  if (pills.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs uppercase tracking-[0.15em] text-zinc-500">Filters</span>
      {pills.map((p) => (
        <span
          key={p.key}
          className="inline-flex items-center gap-1 rounded-md bg-white text-zinc-900 pl-2.5 pr-1.5 py-1 text-xs font-medium"
        >
          {p.label}
          <button
            type="button"
            aria-label={`Remove ${p.label} filter`}
            onClick={() => navigate(p.remove)}
            className="inline-flex h-4 w-4 items-center justify-center rounded-full leading-none text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900"
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}
