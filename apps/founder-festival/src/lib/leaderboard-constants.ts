// Pure leaderboard filter constants + types. This module MUST NOT import `@/db`
// (or anything that transitively does) — it is imported by the `"use client"`
// leaderboard filter UI. A runtime value import from `@/lib/leaderboard` (which
// imports `@/db` → `neon(process.env.DATABASE_URL!)`) drags the database client
// into the browser bundle, where DATABASE_URL is undefined and `neon()` throws
// at module evaluation, white-screening the page. Keep all client-shared facet
// constants/types here; keep query code in `@/lib/leaderboard`.

import type { FamilyFilter } from "@/lib/family-constants";

export type LeaderboardTab = "founder" | "investor" | "combined";

// Canonical company-stage facet values (the scoring enum minus "n/a").
export const STAGE_VALUES = [
  "idea", "pre-seed", "seed", "series-a", "series-b", "series-c+", "growth", "public", "acquired",
] as const;
export type StageValue = (typeof STAGE_VALUES)[number];

// Outcome/traction facet keys → map to extractedMetrics booleans in SQL.
export const OUTCOME_VALUES = ["ipo", "acquired", "unicorn"] as const;
export type OutcomeValue = (typeof OUTCOME_VALUES)[number];

export type LeaderboardRole = "founder" | "investor" | "both";

// Sort direction. "highest" = highest score first (DESC, the default); "lowest"
// = lowest score first (ASC). Serialized in the URL as the `top` param so a
// sorted view is shareable (e.g. ?sort=investor&top=lowest).
export type LeaderboardDirection = "highest" | "lowest";

// Keyset cursor on (orderCol, id). Decoded from an opaque string by the API.
export type LeaderboardCursor = { score: number; id: string };

// The single source of truth for what's being filtered/sorted. Both the
// leaderboard server component and /api/v1/leaderboard build one of these and
// pass it to getLeaderboard(). OR within each array facet, AND across facets.
export type LeaderboardFilter = {
  role: LeaderboardRole;          // "both" === the old combined view
  sort: LeaderboardTab;           // founder | investor | combined
  direction: LeaderboardDirection; // highest (DESC, default) | lowest (ASC)
  stages: StageValue[];           // company_stage IN (...)
  outcomes: OutcomeValue[];       // OR of hadIpo/hadAcquisition/isUnicornFounder
  badges: string[];               // OR of badge predicates (see leaderboard-badge-sql)
  industries: string[];           // canonical industry slugs; array-overlap match on canonical_industries
  family: FamilyFilter[];         // OR of "has a public family member of type X" (children/spouse/partner/dog/cat/pet)
  raisedMin: number | null;       // totalRaisedUsd >= (USD)
  raisedMax: number | null;       // totalRaisedUsd <= (USD)
  teamMin: number | null;         // employeesCount >= (peak headcount)
  limit: number;                  // page size (UI uses 500; API clamps 1..100)
  cursor: LeaderboardCursor | null; // keyset pagination; UI passes null
};

// Display labels for every filterable badge id (keys mirror BADGE_SQL_PREDICATES
// in leaderboard-badge-sql.ts). Used by the sidebar badge list and the active-
// filter pills. Kept here (DB-free) so the `"use client"` filter UI can import
// it without dragging `@/db` into the browser bundle. NOTE: when a badge id is
// added to BADGE_SQL_PREDICATES, add its label here too.
export const BADGE_FILTER_LABELS: Record<string, string> = {
  claimed: "Claimed profile",
  yc: "YC alum",
  "serial-founder": "Serial founder",
  "first-founder": "First-time founder",
  unicorn: "Unicorn founder",
  ipo: "IPO",
  acquired: "Acquired",
  exits: "2+ exits",
  raised: "Raised capital",
  employees: "10+ employees",
  partner: "VC partner",
  angel: "Angel investor",
  deployed: "$1M+ deployed",
  "leads-rounds": "Leads rounds",
  "on-neo": "Featured on Neo",
  "pre-seed-focus": "Pre-seed focus",
  "seed-focus": "Seed focus",
  "series-a-focus": "Series A focus",
  "series-b-focus": "Series B focus",
  "series-c-focus": "Series C focus",
  "growth-stage-focus": "Growth-stage focus",
  oss: "Top OSS (1k★)",
  wiki: "On Wikipedia",
  mm: "Top web (100k)",
};

// Client-safe list of filterable badge ids (mirrors BADGE_SQL_PREDICATES keys
// in the server-only leaderboard-badge-sql module). Importing that module into
// the browser would drag `@/db`/drizzle in, so the click-to-filter UI reads this
// instead. A test asserts the two stay in sync.
export const FILTERABLE_BADGE_IDS = Object.keys(BADGE_FILTER_LABELS);

// Human label for a badge id, falling back to a title-cased version of the id
// for anything not in the map (e.g. dynamic industry-* badges before the
// industry agent's taxonomy lands).
export function badgeFilterLabel(id: string): string {
  return (
    BADGE_FILTER_LABELS[id] ??
    id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}
