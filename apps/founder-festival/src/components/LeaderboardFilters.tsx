"use client";

import { useRouter, useSearchParams } from "next/navigation";
// Import facet constants from the DB-free module — NOT from "@/lib/leaderboard",
// which imports @/db and would pull the database client into this client bundle
// (neon() then throws "No database connection string" in the browser).
import {
  STAGE_VALUES,
  badgeFilterLabel,
  type LeaderboardFilter,
  type LeaderboardRole,
} from "@/lib/leaderboard-constants";
// Industry taxonomy is a pure (DB-free) module, safe for the client bundle.
import { industryLabel } from "@/lib/industries";
import { FAMILY_FILTER_OPTIONS } from "@/lib/family-constants";

// Human labels for facet values. Kept here (UI concern) rather than in the
// filter layer (data concern).
const STAGE_LABELS: Record<string, string> = {
  idea: "Idea", "pre-seed": "Pre-seed", seed: "Seed",
  "series-a": "Series A", "series-b": "Series B", "series-c+": "Series C+",
  growth: "Growth", public: "Public", acquired: "Acquired",
};
const ROLES: Array<{ id: LeaderboardRole; label: string }> = [
  { id: "both", label: "Both" },
  { id: "founder", label: "Founders" },
  { id: "investor", label: "Investors" },
];
// Min-threshold options shared by Capital raised + Team size.
const RAISED_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Any" },
  { value: "50000", label: "$50K+" },
  { value: "1000000", label: "$1M+" },
  { value: "10000000", label: "$10M+" },
  { value: "100000000", label: "$100M+" },
  { value: "1000000000", label: "$1B+" },
];
const TEAM_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Any" },
  { value: "10", label: "10+" },
  { value: "50", label: "50+" },
  { value: "200", label: "200+" },
  { value: "1000", label: "1,000+" },
];

export function LeaderboardFilters({
  filter,
  // Per-badge counts (how many leaderboard profiles carry each badge) used to
  // populate + sort the Badges section. Omitted/empty → the Badges section
  // renders nothing.
  badgeCounts,
  // Per-canonical-industry counts; powers the Industries section the same way
  // badgeCounts powers Badges. Omitted/empty → no Industries section.
  industryCounts,
}: {
  filter: LeaderboardFilter;
  badgeCounts?: Record<string, number>;
  industryCounts?: Record<string, number>;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  // Mutate one or more params off the current URL and navigate. Role changes
  // also clear `sort` so it re-derives from the new role.
  function apply(mutate: (p: URLSearchParams) => void) {
    const next = new URLSearchParams(sp.toString());
    mutate(next);
    next.delete("e"); // drop the row-highlight param on any filter change
    const qs = next.toString();
    router.push(qs ? `/leaderboard?${qs}` : "/leaderboard", { scroll: false });
  }

  // Toggle a value in a comma-separated facet param.
  function toggleCsv(key: string, value: string) {
    apply((p) => {
      const current = (p.get(key) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const nextVals = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      if (nextVals.length) p.set(key, nextVals.join(","));
      else p.delete(key);
    });
  }

  function setRole(role: LeaderboardRole) {
    apply((p) => {
      if (role === "both") p.delete("role");
      else p.set("role", role);
      p.delete("sort"); // re-derive sort from role
    });
  }

  function setParam(key: string, value: string) {
    apply((p) => {
      if (value) p.set(key, value);
      else p.delete(key);
    });
  }

  // Badges section: every badge with a non-zero count, most common first, each
  // labelled "Label (count)". Active filters still render as removable pills in
  // the results column (see LeaderboardActiveFilters).
  const badgeRows = Object.entries(badgeCounts ?? {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  // Industries section: every canonical industry with a non-zero count, most
  // common first. Same UX as Badges; toggles the `industry` CSV facet.
  const industryRows = Object.entries(industryCounts ?? {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex flex-col gap-6 text-sm">
      {/* Role */}
      <FacetGroup title="Role">
        <div className="flex rounded-md border border-zinc-800 overflow-hidden">
          {ROLES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRole(r.id)}
              aria-pressed={filter.role === r.id}
              className={`flex-1 px-2 py-1.5 text-xs font-medium transition-colors ${
                filter.role === r.id
                  ? "bg-zinc-100 text-zinc-900"
                  : "bg-zinc-900/60 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </FacetGroup>

      {/* Stage */}
      <FacetGroup title="Stage">
        {STAGE_VALUES.map((s) => (
          <CheckRow
            key={s}
            label={STAGE_LABELS[s] ?? s}
            checked={filter.stages.includes(s)}
            onChange={() => toggleCsv("stage", s)}
          />
        ))}
      </FacetGroup>

      {/* Capital raised */}
      <FacetGroup title="Capital raised">
        <SelectRow
          value={filter.raisedMin != null ? String(filter.raisedMin) : ""}
          options={RAISED_OPTIONS}
          onChange={(v) => setParam("raised_min", v)}
          ariaLabel="Minimum capital raised"
        />
      </FacetGroup>

      {/* Team size */}
      <FacetGroup title="Team size">
        <SelectRow
          value={filter.teamMin != null ? String(filter.teamMin) : ""}
          options={TEAM_OPTIONS}
          onChange={(v) => setParam("team_min", v)}
          ariaLabel="Minimum team size"
        />
      </FacetGroup>

      {/* Badges — full taxonomy, most common first, with live counts. */}
      {badgeRows.length > 0 && (
        <FacetGroup title="Badges">
          {/* Show all badges on the page — the leaderboard is almost always
              taller than this list, so no inner scroll area. */}
          <div className="flex flex-col gap-1.5">
            {badgeRows.map(([id, count]) => (
              <CheckRow
                key={id}
                label={`${badgeFilterLabel(id)} (${count.toLocaleString("en-US")})`}
                checked={filter.badges.includes(id)}
                onChange={() => toggleCsv("badge", id)}
              />
            ))}
          </div>
        </FacetGroup>
      )}

      {/* Industries — canonical taxonomy, most common first, with live counts.
          No inner scroll (matches Badges) — the leaderboard is taller. */}
      {industryRows.length > 0 && (
        <FacetGroup title="Industries">
          <div className="flex flex-col gap-1.5">
            {industryRows.map(([slug, count]) => (
              <CheckRow
                key={slug}
                label={`${industryLabel(slug) ?? slug} (${count.toLocaleString("en-US")})`}
                checked={filter.industries.includes(slug)}
                onChange={() => toggleCsv("industry", slug)}
              />
            ))}
          </div>
        </FacetGroup>
      )}

      {/* Family & Kids — fixed taxonomy. Matches a founder who has a PUBLIC
          family member of the selected kind (children/spouse/partner/pets). */}
      <FacetGroup title="Family & Kids">
        <div className="flex flex-col gap-1.5">
          {FAMILY_FILTER_OPTIONS.map((o) => (
            <CheckRow
              key={o.value}
              label={o.label}
              checked={filter.family.includes(o.value)}
              onChange={() => toggleCsv("family", o.value)}
            />
          ))}
        </div>
      </FacetGroup>
    </div>
  );
}

function FacetGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

function CheckRow({
  label, checked, onChange,
}: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-zinc-300 hover:text-zinc-100">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-3.5 w-3.5 rounded border-zinc-700 bg-zinc-900 accent-zinc-200"
      />
      <span>{label}</span>
    </label>
  );
}

function SelectRow({
  value, options, onChange, ariaLabel,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
  ariaLabel: string;
}) {
  return (
    <select
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 text-sm text-zinc-200 focus:border-zinc-600 focus:outline-none"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
