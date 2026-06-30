import { unstable_cache } from "next/cache";
import { db } from "@/db";
import { badgeOverrides, evaluations, familyMembers, users } from "@/db/schema";
import { isFamilyFilter, familyFilterRelationships } from "@/lib/family-constants";
import { and, arrayOverlaps, asc, desc, eq, gt, gte, ilike, lte, inArray, isNull, ne, notLike, or, sql, type SQL } from "drizzle-orm";
import { computeBadges, type Badge } from "./badges";
import { profileUrlFor } from "./profile-slug";
import type { ExtractedMetrics } from "./scoring";
import { BADGE_SQL_PREDICATES } from "./leaderboard-badge-sql";
import { INDUSTRY_SLUGS } from "./industries";
import { decodeCursor } from "./leaderboard-cursor";

export type LeaderboardRow = {
  id: string;
  linkedinUrl: string;
  fullName: string | null;
  // The owner's chosen nickname (claimed, high-confidence) when set. Display
  // name = nickname ?? fullName. Null when unset/unclaimed.
  nickname: string | null;
  founderScore: number;
  investorScore: number;
  combinedScore: number;
  createdAt: Date;
  // Set when the eval has been claimed (high/medium confidence). Used to
  // render the LinkedIn profile pic on the leaderboard row.
  claimedImageUrl: string | null;
  // Display name of the subject's current/most-relevant company, derived
  // from extractedMetrics.partnerAtFirm (for VC partners — preferred, since
  // it's a real name) or from primaryCompanyDomain (capitalized first segment
  // when partnerAtFirm is null). Null when neither is available.
  companyName: string | null;
  // External URL for the company (https://<primaryCompanyDomain>). Null when
  // no primary domain exists on the eval, in which case the companyName
  // renders as plain text (no link). Always external — leaderboard link
  // should open in a new tab.
  companyUrl: string | null;
  // Canonical profile URL: /profile/<username> if the row's claimer has a
  // Clerk username, else /profile/<kind>/<slug>, else legacy /profile?e=<id>.
  // Resolved server-side so the leaderboard renders fast permalinks.
  profileHref: string;
  badges: Badge[];
  // Founder / investor status markers (current/past/never) — LLM-classified at
  // score time, read straight from the evaluations.founder_status /
  // investor_status columns. Rendered next to the score numbers via StatusMarker.
  founderStatus: ScoreStatus | null;
  investorStatus: ScoreStatus | null;
  // Normalized industry taxonomy slugs (evaluations.canonical_industries).
  // Filterable on the leaderboard (?industry=) and surfaced on the public API.
  canonicalIndustries: string[];
};

export type ScoreStatus = "current" | "past" | "never";

// "airbnb.com" → "Airbnb". Strips the TLD, splits on `.` to handle subdomains
// (we ignore them), and uppercases the first letter. Multi-word brands like
// "producthunt.com" lose the inner casing — accept the trade-off.
export function companyNameFromDomain(domain: string | null | undefined): string | null {
  if (!domain) return null;
  const stripped = domain.toLowerCase().replace(/^www\./, "");
  const root = stripped.split(".")[0];
  if (!root) return null;
  return root.charAt(0).toUpperCase() + root.slice(1);
}

type ProfileBlob = {
  primaryCompanyDomain?: string | null;
  extractedMetrics?: Partial<ExtractedMetrics> | null;
  mmHits?: Array<{ domain: string; rank: number }>;
  // Clean identity block (buildIdentity); preferred company-name source.
  identity?: { companyName?: string | null } | null;
};

// Facet constants + filter types live in a DB-free module so the `"use client"`
// filter UI can import the constants without dragging `@/db` (this file imports
// it) into the browser bundle. Re-exported here so existing server-side
// consumers of `@/lib/leaderboard` keep working unchanged.
export {
  STAGE_VALUES,
  OUTCOME_VALUES,
} from "./leaderboard-constants";
export type {
  LeaderboardTab,
  StageValue,
  OutcomeValue,
  LeaderboardRole,
  LeaderboardDirection,
  LeaderboardCursor,
  LeaderboardFilter,
} from "./leaderboard-constants";
import { STAGE_VALUES, OUTCOME_VALUES } from "./leaderboard-constants";
import type {
  LeaderboardTab,
  StageValue,
  OutcomeValue,
  LeaderboardRole,
  LeaderboardDirection,
  LeaderboardFilter,
} from "./leaderboard-constants";

const ROLE_TO_SORT: Record<LeaderboardRole, LeaderboardTab> = {
  founder: "founder", investor: "investor", both: "combined",
};

function csv(sp: URLSearchParams, key: string): string[] {
  const raw = sp.get(key);
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function intParam(sp: URLSearchParams, key: string): number | null {
  const raw = sp.get(key);
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

// Shared parser: URLSearchParams → a fully-defaulted LeaderboardFilter. Invalid
// members are dropped (lenient, matching the rest of the API surface). Used by
// BOTH the leaderboard server component and /api/v1/leaderboard. Cursor decoding
// is layered on by the API route (decodeCursor); here cursor defaults to null.
export function parseLeaderboardFilter(sp: URLSearchParams): LeaderboardFilter {
  const role: LeaderboardRole =
    sp.get("role") === "founder" ? "founder"
    : sp.get("role") === "investor" ? "investor"
    : "both";

  const sortRaw = sp.get("sort");
  const sort: LeaderboardTab =
    sortRaw === "founder" || sortRaw === "investor" || sortRaw === "combined"
      ? sortRaw
      : ROLE_TO_SORT[role];

  // Direction defaults to "highest" (DESC); only an explicit "lowest" flips it.
  const direction: LeaderboardDirection =
    sp.get("top") === "lowest" ? "lowest" : "highest";

  const stages = csv(sp, "stage").filter((s): s is StageValue =>
    (STAGE_VALUES as readonly string[]).includes(s));
  const outcomes = csv(sp, "outcome").filter((o): o is OutcomeValue =>
    (OUTCOME_VALUES as readonly string[]).includes(o));
  const badges = csv(sp, "badge").filter((b) => BADGE_SQL_PREDICATES[b] != null);
  const industries = csv(sp, "industry").filter((s) => (INDUSTRY_SLUGS as readonly string[]).includes(s));
  const family = csv(sp, "family").filter(isFamilyFilter);

  const limitRaw = intParam(sp, "limit");
  const limit = limitRaw == null ? 50 : Math.min(100, Math.max(1, limitRaw));

  // Clamp numeric facets to safe non-negative bounds. team_min is compared as
  // ::int (employeesCount), so a value beyond INT4_MAX would overflow Postgres
  // and 500 instead of returning an empty result; raised_* are ::bigint.
  const nonNeg = (v: number | null) => (v == null ? null : Math.max(0, v));
  const int4 = (v: number | null) => (v == null ? null : Math.min(2_147_483_647, Math.max(0, v)));

  return {
    role, sort, direction, stages, outcomes, badges, industries, family,
    raisedMin: nonNeg(intParam(sp, "raised_min")),
    raisedMax: nonNeg(intParam(sp, "raised_max")),
    teamMin: int4(intParam(sp, "team_min")),
    limit,
    cursor: decodeCursor(sp.get("cursor")),
  };
}

const emNum = (key: string) => sql`(profile->'extractedMetrics'->>${key})::bigint`;

// Project ONLY the profile-blob keys decorateRows actually reads (company name,
// domain, the extractedMetrics + mmHits that computeBadges needs) instead of
// SELECTing the whole multi-KB JSONB (bio, grounding, enrichment dumps, bd_async
// facts) and shipping it over the wire per row × 50-100 rows/page. The structured
// sub-objects (extractedMetrics, mmHits) are passed through whole, so values are
// identical — only the unread narrative fields are dropped. Shape = ProfileBlob.
const PROFILE_PROJECTION = sql<ProfileBlob | null>`jsonb_build_object(
  'primaryCompanyDomain', ${evaluations.profile}->'primaryCompanyDomain',
  'identity', jsonb_build_object('companyName', ${evaluations.profile}->'identity'->'companyName'),
  'extractedMetrics', ${evaluations.profile}->'extractedMetrics',
  'mmHits', ${evaluations.profile}->'mmHits'
)`;

// Compiles the facet portion of a filter into a single AND-of-facets condition
// (OR within each facet, AND across facets). Returns undefined when no facet is
// active. Role/sort are handled separately in getLeaderboard (score columns).
export function buildLeaderboardWhere(filter: LeaderboardFilter): SQL | undefined {
  const facets: SQL[] = [];

  if (filter.stages.length > 0) {
    facets.push(inArray(evaluations.companyStage, filter.stages));
  }

  if (filter.outcomes.length > 0) {
    const parts = filter.outcomes.map((o) =>
      o === "ipo" ? sql`(profile->'extractedMetrics'->>'hadIpo')::boolean = true`
      : o === "acquired" ? sql`(profile->'extractedMetrics'->>'hadAcquisition')::boolean = true`
      : sql`(profile->'extractedMetrics'->>'isUnicornFounder')::boolean = true`);
    facets.push(or(...parts)!);
  }

  if (filter.raisedMin != null) facets.push(gte(emNum("totalRaisedUsd"), filter.raisedMin));
  if (filter.raisedMax != null) facets.push(lte(emNum("totalRaisedUsd"), filter.raisedMax));
  if (filter.teamMin != null) {
    facets.push(sql`(profile->'extractedMetrics'->>'employeesCount')::int >= ${filter.teamMin}`);
  }

  if (filter.badges.length > 0) {
    const parts = filter.badges.map((b) => BADGE_SQL_PREDICATES[b]).filter(Boolean) as SQL[];
    if (parts.length > 0) facets.push(or(...parts)!);
  }

  // Industry filter: array-overlap (`&&`) — the row matches if ANY of its
  // canonical_industries slugs is in the requested set. Slugs are validated in
  // parseLeaderboardFilter against the taxonomy.
  if (filter.industries.length > 0) {
    facets.push(arrayOverlaps(evaluations.canonicalIndustries, filter.industries));
  }

  // Family & Kids: the profile has at least one PUBLIC family member whose
  // relationship falls in one of the selected buckets (children/spouse/etc.).
  if (filter.family.length > 0) {
    const rels = familyFilterRelationships(filter.family);
    if (rels.length > 0) {
      facets.push(
        inArray(
          evaluations.id,
          db
            .select({ id: familyMembers.evaluationId })
            .from(familyMembers)
            .where(and(ne(familyMembers.publicShare, "none"), inArray(familyMembers.relationship, rels))),
        ),
      );
    }
  }

  if (facets.length === 0) return undefined;
  return and(...facets);
}

// Test-fixture URL prefixes used by tests/app/*.test.ts. If a stray row with
// one of these handles ends up in prod (older test runs, ad-hoc seeding), it
// should NEVER appear on the public leaderboard.
const TEST_HANDLE_PREFIXES = [
  "https://%linkedin.com/in/applicant-%",
  "https://%linkedin.com/in/dup-applicant-%",
  "https://%linkedin.com/in/draft-%",
  "https://%linkedin.com/in/auto-%",
  "https://%linkedin.com/in/low-%",
  "https://%linkedin.com/in/near-%",
] as const;

// Excludes code-redeemed entries (they have no real LinkedIn URL), known
// test-fixture handles, and superadmin-hidden profiles. Hidden profiles still
// resolve at their canonical URL — only this query excludes them. See
// /api/admin/profile/[evalId]/hide for the toggle.
//
// Low-signal profiles (signalQuality === "low") are now included like any other
// scored profile — they appear in the leaderboard, search, event attendee lists,
// and connections. Only code-redeemed, hidden, and test-fixture rows are excluded.
// The statistical baselines (computePercentile, credibility getPopulation,
// founder-matrix getMatrixCandidates) still exclude low-signal independently to
// avoid skewing ranking distributions.
function baseWhereFor(): SQL | undefined {
  return and(
    ne(evaluations.source, "code"),
    isNull(evaluations.hiddenAt),
    ...TEST_HANDLE_PREFIXES.map((p) => notLike(evaluations.linkedinUrl, p)),
  );
}
const baseWhere = baseWhereFor();

function orderColFor(sort: LeaderboardTab) {
  return sort === "founder" ? evaluations.founderScore
    : sort === "investor" ? evaluations.investorScore
    : evaluations.score;
}

// Founder/investor roles require a positive score on that dimension (mirrors
// the old per-tab behavior). "both" shows everyone.
function roleGateFor(role: LeaderboardRole): SQL | undefined {
  if (role === "founder") return gt(evaluations.founderScore, 0);
  if (role === "investor") return gt(evaluations.investorScore, 0);
  return undefined;
}

// Total profiles on the public leaderboard (baseWhere only — independent of any
// active facet filter), split by dimension for the leaderboard subtitle. The
// split mirrors the role gate: a profile is a "founder profile" when
// founderScore > 0 and an "investor profile" when investorScore > 0, so someone
// who scores on both is counted in each (same semantics as the Founder /
// Investor filter). Computed in one pass with conditional aggregates.
// Cache tag for the GLOBAL (viewer-independent, unfiltered) leaderboard
// aggregates. They're recomputed on every anonymous landing-page hit but change
// only when scores are (re)written; revalidateTag(LEADERBOARD_COUNTS_TAG) lets a
// write path bust them immediately, otherwise they refresh on the revalidate
// window below. Sidebar counts are approximate, so bounded staleness is fine.
export const LEADERBOARD_COUNTS_TAG = "leaderboard-counts";
const COUNTS_REVALIDATE_SECONDS = 120;

async function countByScore(where: SQL | undefined): Promise<{ founders: number; investors: number }> {
  const [row] = await db
    .select({
      founders: sql<number>`count(*) filter (where ${evaluations.founderScore} > 0)::int`,
      investors: sql<number>`count(*) filter (where ${evaluations.investorScore} > 0)::int`,
    })
    .from(evaluations)
    .where(where);
  return { founders: row?.founders ?? 0, investors: row?.investors ?? 0 };
}

// The unfiltered global totals — cached (this is the default landing-page path).
const getGlobalLeaderboardCounts = unstable_cache(
  () => countByScore(baseWhere),
  ["leaderboard-global-counts"],
  { revalidate: COUNTS_REVALIDATE_SECONDS, tags: [LEADERBOARD_COUNTS_TAG] },
);

// CONNECT MODE — total head count for the Directory subtitle. Scores are all 0
// in connect mode, so the founder/investor split (countByScore) would read
// 0/0. This counts every Directory-visible person (baseWhere + active facets).
export async function getDirectoryCount(filter?: LeaderboardFilter): Promise<number> {
  const facetWhere = filter ? buildLeaderboardWhere(filter) : undefined;
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(evaluations)
    .where(and(baseWhere, facetWhere));
  return row?.n ?? 0;
}

export async function getLeaderboardCounts(
  filter?: LeaderboardFilter,
): Promise<{ founders: number; investors: number }> {
  // When facets are active, count only profiles that match them so the
  // leaderboard subtitle can say "N … match your filters" — live, not cached
  // (the facet space is unbounded). With no facets it's the global total, served
  // from the cross-request cache. Role isn't applied here — the founder/investor
  // split already is the role distinction.
  const facetWhere = filter ? buildLeaderboardWhere(filter) : undefined;
  if (!facetWhere) return getGlobalLeaderboardCounts();
  return countByScore(and(baseWhere, facetWhere));
}

// How many leaderboard-visible profiles carry each filterable badge. One pass
// over the same baseWhere universe with a conditional aggregate per badge id,
// reusing the exact BADGE_SQL_PREDICATES the filter uses — so the sidebar count
// next to "YC alum" matches what filtering by it returns. Counts are GLOBAL
// (not re-scoped to the active filter). Badge ids with a 0 count are still
// returned (the UI hides them).
async function computeBadgeCounts(): Promise<Record<string, number>> {
  const selection: Record<string, SQL<number>> = {};
  for (const [id, predicate] of Object.entries(BADGE_SQL_PREDICATES)) {
    selection[id] = sql<number>`count(*) filter (where ${predicate})::int`;
  }
  const [row] = await db.select(selection).from(evaluations).where(baseWhere);
  const out: Record<string, number> = {};
  for (const id of Object.keys(BADGE_SQL_PREDICATES)) {
    out[id] = Number((row as Record<string, unknown> | undefined)?.[id] ?? 0);
  }
  return out;
}
// Global + viewer-independent → cached across requests (see LEADERBOARD_COUNTS_TAG).
export const getBadgeCounts = unstable_cache(computeBadgeCounts, ["leaderboard-badge-counts"], {
  revalidate: COUNTS_REVALIDATE_SECONDS,
  tags: [LEADERBOARD_COUNTS_TAG],
});

// How many leaderboard-visible profiles carry each canonical industry. Unnests
// the canonical_industries text[] and counts per slug over the same baseWhere
// universe — so the sidebar count next to "Fintech" matches `?industry=fintech`.
// Global (not re-scoped to the active filter); only slugs with a row appear.
async function computeIndustryCounts(): Promise<Record<string, number>> {
  const result = await db.execute(sql`
    SELECT s AS slug, COUNT(*)::int AS count
    FROM ${evaluations}, unnest(${evaluations.canonicalIndustries}) AS s
    WHERE ${baseWhere}
    GROUP BY s
  `);
  const rows =
    (result as unknown as { rows?: Array<{ slug: string; count: number }> }).rows ??
    (result as unknown as Array<{ slug: string; count: number }>);
  const out: Record<string, number> = {};
  for (const r of Array.isArray(rows) ? rows : []) {
    if (r?.slug) out[r.slug] = Number(r.count);
  }
  return out;
}
// Global + viewer-independent → cached across requests (see LEADERBOARD_COUNTS_TAG).
export const getIndustryCounts = unstable_cache(computeIndustryCounts, ["leaderboard-industry-counts"], {
  revalidate: COUNTS_REVALIDATE_SECONDS,
  tags: [LEADERBOARD_COUNTS_TAG],
});

export async function getLeaderboard(filter: LeaderboardFilter): Promise<LeaderboardRow[]> {
  const orderCol = orderColFor(filter.sort);
  const roleGate = roleGateFor(filter.role);
  const facetWhere = buildLeaderboardWhere(filter);
  const asc_ = filter.direction === "lowest";

  // Keyset pagination on (orderCol, id): rows strictly "after" the cursor in
  // the current ordering. For "highest" (DESC) that's strictly-less-than; for
  // "lowest" (ASC) it's strictly-greater-than. id is the unique tiebreaker and
  // sorts in the same direction as the score column.
  const cursorWhere = filter.cursor
    ? asc_
      ? sql`(${orderCol} > ${filter.cursor.score} OR (${orderCol} = ${filter.cursor.score} AND ${evaluations.id} > ${filter.cursor.id}))`
      : sql`(${orderCol} < ${filter.cursor.score} OR (${orderCol} = ${filter.cursor.score} AND ${evaluations.id} < ${filter.cursor.id}))`
    : undefined;

  // and(...) ignores undefined args, so optional clauses compose cleanly.
  const where = and(baseWhere, roleGate, facetWhere, cursorWhere);

  const rawRows = await db
    .select({
      id: evaluations.id,
      linkedinUrl: evaluations.linkedinUrl,
      fullName: evaluations.fullName,
      founderScore: evaluations.founderScore,
      investorScore: evaluations.investorScore,
      combinedScore: evaluations.score,
      createdAt: evaluations.createdAt,
      profile: PROFILE_PROJECTION,
      slug: evaluations.slug,
      slugKind: evaluations.slugKind,
      investorStageFocus: evaluations.investorStageFocus,
      investorIndustryFocus: evaluations.investorIndustryFocus,
      investorLeadsRounds: evaluations.investorLeadsRounds,
      onNeo: evaluations.onNeo,
      founderStatus: evaluations.founderStatus,
      investorStatus: evaluations.investorStatus,
      canonicalIndustries: evaluations.canonicalIndustries,
    })
    .from(evaluations)
    .where(where)
    // Tiebreaker is id (not createdAt) so the keyset cursor is stable + unique.
    // Both columns sort in the requested direction so the cursor comparison
    // above stays consistent with the ordering.
    .orderBy(
      asc_ ? asc(orderCol) : desc(orderCol),
      asc_ ? asc(evaluations.id) : desc(evaluations.id),
    )
    .limit(filter.limit);

  return decorateRows(rawRows);
}

// CONNECT MODE — Directory listing. A score-free sibling of getLeaderboard:
// SAME base filter (no code entries / hidden / test handles) and the SAME facet
// filters (industry/expertise/stage/etc — useful for discovery), but with NO
// role gate (connect mode has no founder/investor roles) and NO score ordering.
// Rows are sorted by display name (nulls last), id as the stable tiebreaker.
//
// Returns up to `limit` rows in one shot — connect-mode communities are small
// and the Directory disables infinite-scroll, so we don't need the score-keyset
// pagination machinery (which encodes a numeric score in its cursor). Reuses the
// exact same decorateRows() pipeline so company/badges/image/href are identical.
export async function getDirectory(
  filter: LeaderboardFilter,
  limit = 1000,
): Promise<LeaderboardRow[]> {
  const facetWhere = buildLeaderboardWhere(filter);
  const where = and(baseWhere, facetWhere);

  const rawRows = await db
    .select({
      id: evaluations.id,
      linkedinUrl: evaluations.linkedinUrl,
      fullName: evaluations.fullName,
      founderScore: evaluations.founderScore,
      investorScore: evaluations.investorScore,
      combinedScore: evaluations.score,
      createdAt: evaluations.createdAt,
      profile: PROFILE_PROJECTION,
      slug: evaluations.slug,
      slugKind: evaluations.slugKind,
      investorStageFocus: evaluations.investorStageFocus,
      investorIndustryFocus: evaluations.investorIndustryFocus,
      investorLeadsRounds: evaluations.investorLeadsRounds,
      onNeo: evaluations.onNeo,
      founderStatus: evaluations.founderStatus,
      investorStatus: evaluations.investorStatus,
      canonicalIndustries: evaluations.canonicalIndustries,
    })
    .from(evaluations)
    .where(where)
    // Name-ascending, NULL names last, id as the stable tiebreaker. No score
    // ordering — the Directory is alphabetical, not ranked.
    .orderBy(
      sql`${evaluations.fullName} ASC NULLS LAST`,
      asc(evaluations.id),
    )
    .limit(limit);

  return decorateRows(rawRows);
}

// Build full LeaderboardRows for a specific set of evaluation ids (e.g. event
// attendees), reusing the exact leaderboard decoration (company, badges, image,
// profileHref). Low-signal profiles are now returned like any other row — the
// caller names the exact ids they want. Order is not guaranteed — callers sort.
export async function getLeaderboardRowsForEvalIds(
  ids: string[],
): Promise<LeaderboardRow[]> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return [];
  const rawRows = await db
    .select({
      id: evaluations.id,
      linkedinUrl: evaluations.linkedinUrl,
      fullName: evaluations.fullName,
      founderScore: evaluations.founderScore,
      investorScore: evaluations.investorScore,
      combinedScore: evaluations.score,
      createdAt: evaluations.createdAt,
      profile: PROFILE_PROJECTION,
      slug: evaluations.slug,
      slugKind: evaluations.slugKind,
      investorStageFocus: evaluations.investorStageFocus,
      investorIndustryFocus: evaluations.investorIndustryFocus,
      investorLeadsRounds: evaluations.investorLeadsRounds,
      onNeo: evaluations.onNeo,
      founderStatus: evaluations.founderStatus,
      investorStatus: evaluations.investorStatus,
      canonicalIndustries: evaluations.canonicalIndustries,
    })
    .from(evaluations)
    .where(inArray(evaluations.id, unique));
  return decorateRows(rawRows);
}

type RawRow = {
  id: string;
  linkedinUrl: string;
  fullName: string | null;
  founderScore: number;
  investorScore: number;
  combinedScore: number;
  createdAt: Date;
  profile: unknown;
  slug: string | null;
  slugKind: string | null;
  investorStageFocus: string[] | null;
  investorIndustryFocus: string[] | null;
  investorLeadsRounds: boolean | null;
  onNeo: boolean | null;
  founderStatus: ScoreStatus | null;
  investorStatus: ScoreStatus | null;
  canonicalIndustries: string[] | null;
};

async function decorateRows(rawRows: RawRow[]): Promise<LeaderboardRow[]> {
  // Single batched query for claim state + image URLs across all rows on
  // the page — avoids N+1 lookups against Clerk's Backend API.
  // An eval can have multiple claim rows (sign out + re-sign-in via
  // LinkedIn creates a new clerkUserId → new users row). Order by
  // "has image first" then "most-recently verified" so the first hit per
  // evaluationId wins on image lookup. Claim-set membership is recorded
  // for every claim row regardless of image presence.
  const evalIds = rawRows.map((r) => r.id);
  const claimedSet = new Set<string>();
  const claimedImageMap = new Map<string, string>();
  // First username per eval (for /profile/<username> canonical URLs).
  const claimedUsernameMap = new Map<string, string>();
  // Owner's chosen nickname per eval (preferred display name).
  const claimedNicknameMap = new Map<string, string>();
  if (evalIds.length > 0) {
    const claims = await db
      .select({
        evaluationId: users.evaluationId,
        clerkImageUrl: users.clerkImageUrl,
        clerkUsername: users.clerkUsername,
        nickname: users.nickname,
      })
      .from(users)
      .where(
        and(
          inArray(users.evaluationId, evalIds),
          // Claimed = high (owner-grade) only. A medium (LinkedIn name-only)
          // claimer is NOT the owner — they must not paint a claimed badge /
          // avatar / canonical username onto the public leaderboard.
          eq(users.matchConfidence, "high"),
        ),
      )
      .orderBy(
        sql`${users.clerkImageUrl} IS NULL`,
        desc(users.verifiedAt),
      );
    for (const c of claims) {
      if (!c.evaluationId) continue;
      claimedSet.add(c.evaluationId);
      if (c.clerkImageUrl && !claimedImageMap.has(c.evaluationId)) {
        claimedImageMap.set(c.evaluationId, c.clerkImageUrl);
      }
      if (c.clerkUsername && !claimedUsernameMap.has(c.evaluationId)) {
        claimedUsernameMap.set(c.evaluationId, c.clerkUsername);
      }
      if (c.nickname?.trim() && !claimedNicknameMap.has(c.evaluationId)) {
        claimedNicknameMap.set(c.evaluationId, c.nickname.trim());
      }
    }
  }

  // Pull all badge overrides for the rows on this page in one query, then
  // group by eval id so each row's computeBadges() call gets just its own.
  const overridesByEval = new Map<string, Array<{ badgeId: string; status: string; editedLabel: string | null }>>();
  if (evalIds.length > 0) {
    const rows = await db
      .select({
        evaluationId: badgeOverrides.evaluationId,
        badgeId: badgeOverrides.badgeId,
        status: badgeOverrides.status,
        editedLabel: badgeOverrides.editedLabel,
      })
      .from(badgeOverrides)
      .where(inArray(badgeOverrides.evaluationId, evalIds));
    for (const r of rows) {
      if (!overridesByEval.has(r.evaluationId)) overridesByEval.set(r.evaluationId, []);
      overridesByEval.get(r.evaluationId)!.push({
        badgeId: r.badgeId,
        status: r.status,
        editedLabel: r.editedLabel,
      });
    }
  }

  return rawRows.map<LeaderboardRow>((r) => {
    const p = (r.profile as ProfileBlob | null) ?? null;
    // Prefer the clean identity company name (buildIdentity). Otherwise the
    // explicit VC firm name (partnerAtFirm), then capitalizing the first
    // segment of the primary domain.
    const firmName = p?.extractedMetrics?.partnerAtFirm ?? null;
    const companyName =
      p?.identity?.companyName?.trim() || firmName?.trim() || companyNameFromDomain(p?.primaryCompanyDomain);
    // External link to the company's site. Null when we don't have a
    // primary domain (e.g. VC firm where partnerAtFirm is set but no
    // domain was captured). The rendering code falls back to plain text.
    const rawDomain = (p?.primaryCompanyDomain ?? "").trim().toLowerCase();
    const companyUrl = rawDomain ? `https://${rawDomain.replace(/^https?:\/\//, "")}` : null;
    return {
      id: r.id,
      linkedinUrl: r.linkedinUrl,
      fullName: r.fullName,
      nickname: claimedNicknameMap.get(r.id) ?? null,
      founderScore: r.founderScore,
      investorScore: r.investorScore,
      combinedScore: r.combinedScore,
      createdAt: r.createdAt,
      claimedImageUrl: claimedImageMap.get(r.id) ?? null,
      companyName,
      companyUrl,
      profileHref: profileUrlFor({
        evalId: r.id,
        clerkUsername: claimedUsernameMap.get(r.id) ?? null,
        slug: r.slug,
        slugKind: r.slugKind,
      }),
      badges: computeBadges(
        {
          isClaimed: claimedSet.has(r.id),
          extractedMetrics: p?.extractedMetrics ?? null,
          mmHits: p?.mmHits ?? null,
          primaryCompanyDomain: p?.primaryCompanyDomain ?? null,
          investorStageFocus: r.investorStageFocus,
          investorIndustryFocus: r.investorIndustryFocus,
          investorLeadsRounds: r.investorLeadsRounds,
          onNeo: r.onNeo,
          canonicalIndustries: r.canonicalIndustries,
        },
        (overridesByEval.get(r.id) ?? []).map((o) => ({
          badgeId: o.badgeId,
          status: o.status as "likely" | "confirmed" | "pending" | "rejected",
          editedLabel: o.editedLabel,
        })),
      ),
      founderStatus: r.founderStatus ?? null,
      investorStatus: r.investorStatus ?? null,
      canonicalIndustries: r.canonicalIndustries ?? [],
    };
  });
}

// Cap on rows returned by a single search call. The client renders matches
// inline in the leaderboard table; we don't paginate search results because
// "find this person" is the dominant use case and a high cap is rarely useful.
const SEARCH_LIMIT = 100;

// Split a search box value into whitespace-delimited tokens. Each token must
// match (AND across tokens); within a token we OR across the searchable fields.
// This makes a partial multi-word query like "sam odio" match "Samuel … Odio"
// (which a single contiguous "%sam odio%" ILIKE would miss).
export function tokenizeSearchQuery(raw: string): string[] {
  return raw.trim().split(/\s+/).filter(Boolean);
}

// Turkish letters that have no NFKD decomposition (they're base letters, not
// accented Latin), mapped to their nearest ASCII. Without this, searching for a
// Luma name like "Ebru Yıldırım" (dotless ı) never matches a profile stored as
// ASCII "Ebru Yildirim".
const TURKISH_ASCII: Record<string, string> = {
  ı: "i", İ: "i", ş: "s", Ş: "s", ğ: "g", Ğ: "g", ü: "u", Ü: "u", ö: "o", Ö: "o", ç: "c", Ç: "c",
};

// Fold a query token to lowercase ASCII: Turkish letters first, then decompose
// accented Latin (é → e) and drop the combining marks. Used to match against the
// profile slug (which is itself the ASCII-folded name), making search
// diacritic-insensitive.
export function asciiFoldForSearch(s: string): string {
  return s
    .replace(/[ıİşŞğĞüÜöÖçÇ]/g, (m) => TURKISH_ASCII[m] ?? m)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

// Escape %, _ and \ so a user-typed token matches literally (no accidental
// wildcard widening), then wrap in %...% for a contains match.
const ilikeNeedle = (token: string) =>
  `%${token.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;

// Full-DB search across name / company / LinkedIn handle. Respects the same
// baseWhere (low signal, code, hidden, test handles) and the same role gate
// + facet filters as `getLeaderboard`, so a search inside an active filter is
// scoped to that filter's universe. ILIKE is case-insensitive.
export async function searchLeaderboard(
  filter: LeaderboardFilter,
  rawQuery: string,
): Promise<LeaderboardRow[]> {
  // Cap tokens: each token AND-s an OR over 5 ILIKE patterns (3 on JSONB), so an
  // unbounded token count is a query-complexity DoS. 8 covers any real name+company.
  const tokens = tokenizeSearchQuery(rawQuery).slice(0, 8);
  if (tokens.length === 0) return [];

  const orderCol = orderColFor(filter.sort);
  const roleGate = roleGateFor(filter.role);
  const facetWhere = buildLeaderboardWhere(filter);
  // Search uses the standard baseWhere (code-redeemed/hidden/test rows excluded).
  // Low-signal profiles are included like any other scored profile.
  const searchBaseWhere = baseWhere;

  // Each token must hit at least one field (name, LinkedIn URL, or any of the
  // three plausible company-name fields in the profile JSON blob); tokens are
  // AND-ed so every word in the query has to appear somewhere on the row.
  const tokenConds = tokens.map((token) => {
    const needle = ilikeNeedle(token);
    // ASCII-folded needle matched against the slug (which is the ASCII-folded
    // name), so a diacritic query like "Yıldırım" finds the profile stored as
    // "Yildirim" (slug "…-yildirim"). Folding an already-ASCII token is a no-op.
    const foldedNeedle = ilikeNeedle(asciiFoldForSearch(token));
    return or(
      ilike(evaluations.fullName, needle),
      ilike(evaluations.linkedinUrl, needle),
      ilike(evaluations.slug, foldedNeedle),
      sql`profile->'identity'->>'companyName' ILIKE ${needle}`,
      sql`profile->'extractedMetrics'->>'partnerAtFirm' ILIKE ${needle}`,
      sql`profile->>'primaryCompanyDomain' ILIKE ${needle}`,
    )!;
  });
  const searchWhere = and(...tokenConds);

  const where = and(searchBaseWhere, roleGate, facetWhere, searchWhere);

  const rawRows = await db
    .select({
      id: evaluations.id,
      linkedinUrl: evaluations.linkedinUrl,
      fullName: evaluations.fullName,
      founderScore: evaluations.founderScore,
      investorScore: evaluations.investorScore,
      combinedScore: evaluations.score,
      createdAt: evaluations.createdAt,
      profile: PROFILE_PROJECTION,
      slug: evaluations.slug,
      slugKind: evaluations.slugKind,
      investorStageFocus: evaluations.investorStageFocus,
      investorIndustryFocus: evaluations.investorIndustryFocus,
      investorLeadsRounds: evaluations.investorLeadsRounds,
      onNeo: evaluations.onNeo,
      founderStatus: evaluations.founderStatus,
      investorStatus: evaluations.investorStatus,
      canonicalIndustries: evaluations.canonicalIndustries,
    })
    .from(evaluations)
    .where(where)
    .orderBy(
      filter.direction === "lowest" ? asc(orderCol) : desc(orderCol),
      filter.direction === "lowest" ? asc(evaluations.id) : desc(evaluations.id),
    )
    .limit(SEARCH_LIMIT);

  return decorateRows(rawRows);
}

export type PercentileDimension = "founder" | "investor" | "combined";
export type PercentileResult = { percentile: number; rankFromTop: number; total: number };

// Pure math: turn a (below, total) pair into the rendered percentile + rank.
// Percentile = below/total * 100, rounded; rank-from-top = total - below.
// Extracted so the SQL aggregate stays thin and the arithmetic is unit-tested.
export function percentileFromCounts(below: number, total: number): PercentileResult {
  if (total === 0) return { percentile: 0, rankFromTop: 1, total: 0 };
  return { percentile: Math.round((below / total) * 100), rankFromTop: total - below, total };
}

// Pull the first row out of a neon-http execute() result (either `{ rows: [...] }`
// or a bare array depending on the driver path).
function firstRow<T>(result: unknown): T | undefined {
  const rows = (result as { rows?: T[] }).rows ?? (result as T[]);
  return Array.isArray(rows) ? rows[0] : undefined;
}

// The population predicate shared by every percentile/baseline scan: exclude
// low-signal and code-redeemed rows so placeholders don't skew the denominator.
const POPULATION_PREDICATE = sql`signal_quality != 'low' AND source != 'code'`;

// Percentile = (# of rows with col < mine) / (# of total rows) * 100, rounded.
// Excludes low-signal and code-redeemed entries from the denominator so the
// number isn't skewed by placeholder rows.
export async function computePercentile(
  score: number,
  dimension: PercentileDimension,
): Promise<PercentileResult> {
  const col =
    dimension === "founder"
      ? sql`founder_score`
      : dimension === "investor"
        ? sql`investor_score`
        : sql`score`;
  const result = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE ${col} < ${score}) AS below,
      COUNT(*) AS total
    FROM evaluations
    WHERE ${POPULATION_PREDICATE}
  `);
  const row = firstRow<{ below: number; total: number }>(result);
  return percentileFromCounts(Number(row?.below ?? 0), Number(row?.total ?? 0));
}

// All three dimensions in ONE table scan. /profile and the public API each need
// founder + investor + combined percentiles over the same population; calling
// computePercentile 3× ran 3 full-table scans. A single conditional-aggregate
// pass collapses them — identical math, a third of the I/O on the hottest page.
export async function computePercentilesAll(scores: {
  founder: number;
  investor: number;
  combined: number;
}): Promise<Record<PercentileDimension, PercentileResult>> {
  const result = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE founder_score < ${scores.founder})   AS founder_below,
      COUNT(*) FILTER (WHERE investor_score < ${scores.investor}) AS investor_below,
      COUNT(*) FILTER (WHERE score < ${scores.combined})          AS combined_below,
      COUNT(*) AS total
    FROM evaluations
    WHERE ${POPULATION_PREDICATE}
  `);
  const row = firstRow<{ founder_below: number; investor_below: number; combined_below: number; total: number }>(result);
  const total = Number(row?.total ?? 0);
  return {
    founder: percentileFromCounts(Number(row?.founder_below ?? 0), total),
    investor: percentileFromCounts(Number(row?.investor_below ?? 0), total),
    combined: percentileFromCounts(Number(row?.combined_below ?? 0), total),
  };
}

// Ordinal suffix for "1st", "2nd", "3rd", "4th"...
export function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
