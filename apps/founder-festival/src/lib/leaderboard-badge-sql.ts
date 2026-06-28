import { sql, type SQL } from "drizzle-orm";

// JSONB accessor for a key under profile.extractedMetrics. Values are stored as
// JSON scalars, so cast at the call site (::bigint / ::int / ::boolean). A
// missing key yields SQL NULL, and NULL::int / NULL::boolean is a safe NULL
// (the predicate is simply false), so no per-row guard is needed.
const em = (key: string) => sql.raw(`(profile->'extractedMetrics'->>'${key}')`);

// "Investor stage focus" badges fire when ANY raw string in the
// investor_stage_focus jsonb array matches the stage's regex (see
// STAGE_BADGE_MAP in badges.ts). We replicate that match in SQL with a POSIX
// (~*) test over the unnested array. `extraNot` lets "seed" exclude "pre-seed",
// mirroring the first-match-wins order in computeBadges() (pre-seed is listed
// first there, so a "pre-seed" string never also counts as plain "seed").
const stageFocus = (pattern: string, extraNot?: string): SQL =>
  sql.raw(
    `jsonb_typeof(investor_stage_focus) = 'array' AND EXISTS (` +
      `SELECT 1 FROM jsonb_array_elements_text(investor_stage_focus) e ` +
      `WHERE e ~* '${pattern}'${extraNot ? ` AND e !~* '${extraNot}'` : ""})`,
  );

// One SQL predicate per filterable badge id, mirroring computeBadges() in
// src/lib/badges.ts. OR-combined within the badge facet by buildLeaderboardWhere.
// Predicates run against the `evaluations` table query, so column refs are
// unqualified (or "evaluations."-qualified inside correlated subqueries).
export const BADGE_SQL_PREDICATES: Record<string, SQL> = {
  // Claimed: any high/medium-confidence claim row in `users` for this eval —
  // mirrors the claimedSet logic in decorateRows().
  claimed: sql.raw(
    `EXISTS (SELECT 1 FROM users u WHERE u.evaluation_id = evaluations.id ` +
      `AND u.match_confidence IN ('high','medium'))`,
  ),
  yc: sql`${em("ycBatch")} IS NOT NULL`,
  "serial-founder": sql`${em("companiesFounded")}::int >= 2`,
  "first-founder": sql`${em("companiesFounded")}::int = 1`,
  unicorn: sql`${em("isUnicornFounder")}::boolean = true`,
  ipo: sql`${em("hadIpo")}::boolean = true`,
  acquired: sql`${em("hadAcquisition")}::boolean = true`,
  exits: sql`${em("exitCount")}::int >= 2`,
  raised: sql`${em("totalRaisedUsd")}::bigint > 0`,
  employees: sql`${em("employeesCount")}::int >= 10`,
  partner: sql`${em("partnerAtFirm")} IS NOT NULL`,
  angel: sql`${em("isAngelInvestor")}::boolean = true`,
  deployed: sql`${em("totalDeployedUsd")}::bigint >= 1000000`,
  "leads-rounds": sql.raw(`investor_leads_rounds = true`),
  "on-neo": sql.raw(`on_neo = true`),
  // Investor stage-focus (regexes ported from STAGE_BADGE_MAP).
  "pre-seed-focus": stageFocus(`pre[[:space:]-]?seed`),
  "seed-focus": stageFocus(`\\yseed\\y`, `pre[[:space:]-]?seed`),
  "series-a-focus": stageFocus(`series[[:space:]]*a`),
  "series-b-focus": stageFocus(`series[[:space:]]*b`),
  "series-c-focus": stageFocus(`series[[:space:]]*c`),
  "growth-stage-focus": stageFocus(`growth|series[[:space:]]*[def]`),
  oss: sql`${em("topGithubRepo")} IS NOT NULL AND ${em("topGithubRepoStars")}::int >= 1000`,
  wiki: sql`${em("onWikipedia")}::boolean = true`,
  // "Top Nk Web": a mmHits entry for the primary company domain (or a subdomain
  // of it) ranked within the top 100k — mirrors companyMmRank() in badges.ts.
  mm: sql.raw(
    `profile->>'primaryCompanyDomain' IS NOT NULL ` +
      `AND jsonb_typeof(profile->'mmHits') = 'array' ` +
      `AND EXISTS (SELECT 1 FROM jsonb_array_elements(profile->'mmHits') h ` +
      `WHERE (h->>'rank')::int <= 100000 AND (` +
      `lower(regexp_replace(h->>'domain','^www\\.','')) = lower(regexp_replace(profile->>'primaryCompanyDomain','^www\\.','')) ` +
      `OR lower(regexp_replace(h->>'domain','^www\\.','')) LIKE '%.' || lower(regexp_replace(profile->>'primaryCompanyDomain','^www\\.',''))))`,
  ),
};

export const FILTERABLE_BADGE_IDS = Object.keys(BADGE_SQL_PREDICATES);
