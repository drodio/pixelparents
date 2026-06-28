import { db } from "@/db";
import { evaluations, scoringJobs, scoringJobItems, creditLedger, users, badgeOverrides, profileEmails } from "@/db/schema";
import { orderEmailsForDisplay, type ProfileEmail } from "@/lib/profile-emails";
import { and, count, desc, eq, gt, inArray, lte, sql } from "drizzle-orm";
import { computeBadges, type BadgeStatus } from "./badges";
import { profileUrlFor } from "./profile-slug";

// "airbnb.com" → "Airbnb" (mirrors leaderboard.ts; kept local to avoid a cycle).
function companyNameFromDomain(domain: string | null | undefined): string | null {
  if (!domain) return null;
  const root = domain.toLowerCase().replace(/^www\./, "").split(".")[0];
  return root ? root.charAt(0).toUpperCase() + root.slice(1) : null;
}

type ProfileBlob = {
  primaryCompanyDomain?: string | null;
  extractedMetrics?: { partnerAtFirm?: string | null } | null;
  mmHits?: Array<{ domain: string; rank: number }>;
  // Clean identity block written by buildIdentity() on every fresh score/re-score.
  // Preferred source for company name; older rows lack it and fall back below.
  identity?: { companyName?: string | null } | null;
};

export type ScoredProfileSource = "web" | "bulk" | "api";

// Classify a scored profile's source. The paid developer API is the only path
// that CHARGES the user (records a credit_ledger score_debit), so a charge is
// the authoritative API signal; bulk-job evals are linked to a scoring_job_item;
// everything else is a person scoring on the site (web). This deliberately does
// NOT key off request_ip — older/headerless web scores have a null IP and used
// to misclassify as "api".
export function classifyProfileSource(opts: { chargeCents: number; isBulk: boolean }): ScoredProfileSource {
  if (opts.chargeCents > 0) return "api";
  if (opts.isBulk) return "bulk";
  return "web";
}

export const ALL_PROFILE_SOURCES: ScoredProfileSource[] = ["web", "bulk", "api"];

// Normalize a requested source-filter list (e.g. from the "re-score stale
// profiles" checkboxes) to the valid sources. Empty / missing / all-invalid →
// all sources (the "all of the above" default).
export function parseSelectedSources(raw: unknown): ScoredProfileSource[] {
  if (!Array.isArray(raw)) return [...ALL_PROFILE_SOURCES];
  const picked = ALL_PROFILE_SOURCES.filter((s) => raw.includes(s));
  return picked.length > 0 ? picked : [...ALL_PROFILE_SOURCES];
}

// Does a profile (by its DERIVED source) pass the selected-source filter?
export function matchesSourceFilter(
  opts: { chargeCents: number; isBulk: boolean },
  selected: ScoredProfileSource[],
): boolean {
  return selected.includes(classifyProfileSource(opts));
}

export type ScoredProfileRow = {
  id: string;
  fullName: string | null;
  linkedinUrl: string;
  source: ScoredProfileSource;
  costCents: number | null; // cost to us; null on pre-instrumentation rows
  chargeCents: number; // billed to the user; 0 for web/bulk (never charged)
  claimerClerkUserId: string | null; // null when unclaimed
  // Enrichment email (AnyMailFinder) for unclaimed profiles; surfaced as
  // "Unverified" in the admin Email column. null until Find Email is run.
  foundEmail: string | null;
  foundEmailStatus: string | null;
  // All emails for this profile from profile_emails (operator/anymailfinder),
  // ordered verified-first. Claimer Clerk emails are merged in at the display
  // layer (they live in Clerk, not this table).
  emails: { email: string; status: "verified" | "unverified"; source: string }[];
  // Operator/CSV-provided contact phone + job title (null until supplied). The
  // claimer's Clerk-verified phone is merged at the display layer (lives in Clerk).
  phone: string | null;
  jobTitle: string | null;
  updatedAt: Date;
  // Canonical SUBJECT location (from CSV/operator, parsed LinkedIn, or claimer).
  subjectCity: string | null;
  subjectRegion: string | null;
  subjectCountry: string | null;
  // Requester IP + approximate location (set for user-initiated /api/eval
  // scores; null for bulk/API and older rows captured before this was added).
  requestIp: string | null;
  requestCity: string | null;
  requestRegion: string | null; // state / region code, e.g. "CA"
  requestCountry: string | null; // ISO code, e.g. "US"
  // Scores + leaderboard data, mirrored for the admin table.
  founderScore: number;
  investorScore: number;
  combinedScore: number; // evaluations.score (founder + investor)
  leaderboardRank: number | null; // rank by combined score; null if not rankable
  badges: string[]; // badge labels (computed like the leaderboard)
  companyName: string | null;
  companyUrl: string | null; // external company link; null → render plain text
  profileHref: string; // canonical profile URL
  // Every bulk run this profile belongs to (re-scores → multiple). [] for web/api.
  runs: { jobId: string; title: string | null }[];
  // Per-run item status; only set by listProfilesForJob (the single-run view).
  status?: string;
};

// Base evaluation columns shared by listScoredProfiles + listProfilesForJob so
// the two read identical rows and can't drift. Matches EvalBaseRow below.
const EVAL_BASE_COLUMNS = {
  id: evaluations.id,
  fullName: evaluations.fullName,
  linkedinUrl: evaluations.linkedinUrl,
  requestIp: evaluations.requestIp,
  requestCity: evaluations.requestCity,
  requestRegion: evaluations.requestRegion,
  requestCountry: evaluations.requestCountry,
  subjectCity: evaluations.subjectCity,
  subjectRegion: evaluations.subjectRegion,
  subjectCountry: evaluations.subjectCountry,
  costTotalCents: evaluations.costTotalCents,
  updatedAt: evaluations.updatedAt,
  founderScore: evaluations.founderScore,
  investorScore: evaluations.investorScore,
  combinedScore: evaluations.score,
  slug: evaluations.slug,
  slugKind: evaluations.slugKind,
  profile: evaluations.profile,
  foundEmail: evaluations.foundEmail,
  foundEmailStatus: evaluations.foundEmailStatus,
  phone: evaluations.phone,
  jobTitle: evaluations.jobTitle,
  investorStageFocus: evaluations.investorStageFocus,
  investorIndustryFocus: evaluations.investorIndustryFocus,
  investorLeadsRounds: evaluations.investorLeadsRounds,
  onNeo: evaluations.onNeo,
} as const;

type EvalBaseRow = {
  id: string;
  fullName: string | null;
  linkedinUrl: string;
  requestIp: string | null;
  requestCity: string | null;
  requestRegion: string | null;
  requestCountry: string | null;
  subjectCity: string | null;
  subjectRegion: string | null;
  subjectCountry: string | null;
  costTotalCents: number | null;
  updatedAt: Date;
  founderScore: number;
  investorScore: number;
  combinedScore: number;
  slug: string | null;
  slugKind: string | null;
  profile: unknown;
  foundEmail: string | null;
  foundEmailStatus: string | null;
  phone: string | null;
  jobTitle: string | null;
  investorStageFocus: string[] | null;
  investorIndustryFocus: string[] | null;
  investorLeadsRounds: boolean | null;
  onNeo: boolean | null;
};

// One row per real (source="url") profile, newest first, capped at `limit`.
// Source classification via classifyProfileSource: charged → api, else linked to
// a scoring_job_items row → bulk, else → web. request_ip is surfaced for display
// (IP + city/region/country) but no longer drives classification.
//
// `ownerEmail` enforces a "theirs"-scoped role (see role-scope.ts): when set,
// only profiles whose creating bulk job was created by that email are returned —
// web/API profiles have no creating job, so a scoped viewer never sees them.
// null (the default) = no scope filter (every profile).
// Evaluation ids owned by a "theirs"-scoped viewer (their bulk jobs' items).
// Returns [] when the viewer owns nothing. Shared by the list/page/count fns so
// their scoping can't drift.
async function ownedEvaluationIds(ownerEmail: string): Promise<string[]> {
  const owned = await db
    .select({ evaluationId: scoringJobItems.evaluationId })
    .from(scoringJobItems)
    .innerJoin(scoringJobs, eq(scoringJobItems.jobId, scoringJobs.id))
    .where(eq(scoringJobs.createdByEmail, ownerEmail));
  return Array.from(new Set(owned.map((r) => r.evaluationId).filter((x): x is string => !!x)));
}

// Base WHERE for the scored-profiles list: source='url', optionally scoped to a
// set of owned ids. Returns null when the scope owns nothing (caller short-circuits).
function profilesBaseWhere(ownedIds: string[] | null) {
  if (ownedIds === null) return eq(evaluations.source, "url");
  if (ownedIds.length === 0) return null;
  return and(eq(evaluations.source, "url"), inArray(evaluations.id, ownedIds));
}

export async function listScoredProfiles(
  limit = 200,
  ownerEmail: string | null = null,
): Promise<ScoredProfileRow[]> {
  const ownedIds = ownerEmail !== null ? await ownedEvaluationIds(ownerEmail) : null;
  const where = profilesBaseWhere(ownedIds);
  if (where === null) return [];

  const evals = await db
    .select(EVAL_BASE_COLUMNS)
    .from(evaluations)
    .where(where)
    // (updatedAt, id) DESC — id tiebreak keeps the order stable & matches the
    // keyset cursor in listScoredProfilesPage.
    .orderBy(desc(evaluations.updatedAt), desc(evaluations.id))
    .limit(limit);
  return enrichEvals(evals);
}

// Total count of scored profiles for the header ("Showing X of Y"), honoring the
// same ownerEmail scope as listScoredProfiles.
export async function countScoredProfiles(ownerEmail: string | null = null): Promise<number> {
  const ownedIds = ownerEmail !== null ? await ownedEvaluationIds(ownerEmail) : null;
  const where = profilesBaseWhere(ownedIds);
  if (where === null) return 0;
  const [r] = await db.select({ n: count() }).from(evaluations).where(where);
  return r?.n ?? 0;
}

export type ProfilesCursor = { updatedAtIso: string; id: string };

// Keyset-paginated page of scored profiles, newest first. Pass the previous
// page's last (updatedAt, id) as the cursor to get the next page. Ordering and
// scope match listScoredProfiles exactly so a paged scroll == the full list.
export async function listScoredProfilesPage(
  cursor: ProfilesCursor | null,
  limit: number,
  ownerEmail: string | null = null,
): Promise<ScoredProfileRow[]> {
  const ownedIds = ownerEmail !== null ? await ownedEvaluationIds(ownerEmail) : null;
  const base = profilesBaseWhere(ownedIds);
  if (base === null) return [];

  // Row-value keyset: (updated_at, id) < (cursor.updatedAt, cursor.id) in DESC order.
  const keyset = cursor
    ? sql`(${evaluations.updatedAt}, ${evaluations.id}) < (${new Date(cursor.updatedAtIso)}, ${cursor.id})`
    : undefined;

  const evals = await db
    .select(EVAL_BASE_COLUMNS)
    .from(evaluations)
    .where(keyset ? and(base, keyset) : base)
    .orderBy(desc(evaluations.updatedAt), desc(evaluations.id))
    .limit(limit);
  return enrichEvals(evals);
}

// Shared enrichment: given base evaluation rows, attach derived source, charge,
// claimer, leaderboard rank, badges, company, canonical href, and the bulk runs
// each profile belongs to. Used by listScoredProfiles (full list) and
// listProfilesForJob (one run). Sub-queries are scoped to the passed ids except
// the leaderboard rank, which is a global window mapped onto these ids.
async function enrichEvals(evals: EvalBaseRow[]): Promise<ScoredProfileRow[]> {
  const ids = evals.map((e) => e.id);
  if (ids.length === 0) return [];

  // Bulk runs: each (eval → scoring_job) link with the run title. Replaces the
  // old bulkSet; an eval can be in several runs (re-scores) → de-dup by jobId.
  const runRows = await db
    .select({
      evaluationId: scoringJobItems.evaluationId,
      jobId: scoringJobItems.jobId,
      title: scoringJobs.title,
    })
    .from(scoringJobItems)
    .innerJoin(scoringJobs, eq(scoringJobItems.jobId, scoringJobs.id))
    .where(inArray(scoringJobItems.evaluationId, ids));
  const runsByEval = new Map<string, { jobId: string; title: string | null }[]>();
  for (const r of runRows) {
    if (!r.evaluationId) continue;
    if (!runsByEval.has(r.evaluationId)) runsByEval.set(r.evaluationId, []);
    const list = runsByEval.get(r.evaluationId)!;
    if (!list.some((x) => x.jobId === r.jobId)) list.push({ jobId: r.jobId, title: r.title });
  }

  // Charge: sum of score_debit amounts per evaluation (delta is negative).
  const debits = await db
    .select({ evaluationId: creditLedger.evaluationId, delta: creditLedger.deltaCents })
    .from(creditLedger)
    .where(and(eq(creditLedger.reason, "score_debit"), inArray(creditLedger.evaluationId, ids)));
  const chargeMap = new Map<string, number>();
  for (const d of debits) {
    if (!d.evaluationId) continue;
    chargeMap.set(d.evaluationId, (chargeMap.get(d.evaluationId) ?? 0) + -d.delta);
  }

  // Claim: evaluation id → claimer clerk id (high/owner-grade only, matching
  // the rest of the app's "claimed" definition; a medium name-only match is
  // linked for dedup but is not the owner).
  const claims = await db
    .select({
      evaluationId: users.evaluationId,
      clerkUserId: users.clerkUserId,
      clerkUsername: users.clerkUsername,
      matchConfidence: users.matchConfidence,
    })
    .from(users)
    .where(inArray(users.evaluationId, ids));
  const claimMap = new Map<string, string>();
  const usernameMap = new Map<string, string>(); // eval id → claimer's clerk username
  for (const c of claims) {
    if (c.evaluationId && c.matchConfidence === "high") {
      claimMap.set(c.evaluationId, c.clerkUserId);
      if (c.clerkUsername && !usernameMap.has(c.evaluationId)) {
        usernameMap.set(c.evaluationId, c.clerkUsername);
      }
    }
  }

  // Leaderboard rank: position by combined score among non-code-redeemed profiles.
  // Computed once, mapped to the displayed rows.
  const rankResult = await db.execute(sql`
    SELECT id::text AS id, rank() OVER (ORDER BY score DESC) AS rnk
    FROM evaluations
    WHERE source != 'code'
  `);
  const rankRows =
    (rankResult as unknown as { rows?: Array<{ id: string; rnk: number }> }).rows ??
    (rankResult as unknown as Array<{ id: string; rnk: number }>);
  const rankMap = new Map<string, number>();
  for (const r of rankRows ?? []) rankMap.set(r.id, Number(r.rnk));

  // Badge overrides for the displayed rows, grouped by eval (matches leaderboard).
  const overridesByEval = new Map<
    string,
    Array<{ badgeId: string; status: BadgeStatus; editedLabel: string | null }>
  >();
  const overrideRows = await db
    .select({
      evaluationId: badgeOverrides.evaluationId,
      badgeId: badgeOverrides.badgeId,
      status: badgeOverrides.status,
      editedLabel: badgeOverrides.editedLabel,
    })
    .from(badgeOverrides)
    .where(inArray(badgeOverrides.evaluationId, ids));
  for (const r of overrideRows) {
    if (!overridesByEval.has(r.evaluationId)) overridesByEval.set(r.evaluationId, []);
    overridesByEval
      .get(r.evaluationId)!
      .push({ badgeId: r.badgeId, status: r.status as BadgeStatus, editedLabel: r.editedLabel });
  }

  // All emails per profile (operator + anymailfinder), grouped + display-ordered.
  const emailsByEval = new Map<string, ProfileEmail[]>();
  const emailRows = await db
    .select({
      evaluationId: profileEmails.evaluationId,
      email: profileEmails.email,
      status: profileEmails.status,
      source: profileEmails.source,
      addedAt: profileEmails.addedAt,
    })
    .from(profileEmails)
    .where(inArray(profileEmails.evaluationId, ids));
  for (const r of emailRows) {
    if (!emailsByEval.has(r.evaluationId)) emailsByEval.set(r.evaluationId, []);
    emailsByEval.get(r.evaluationId)!.push({
      email: r.email,
      status: r.status as "verified" | "unverified",
      source: r.source as ProfileEmail["source"],
      addedAt: r.addedAt,
    });
  }

  return evals.map((e) => {
    const chargeCents = chargeMap.get(e.id) ?? 0;
    const p = (e.profile as ProfileBlob | null) ?? null;
    const firmName = p?.extractedMetrics?.partnerAtFirm?.trim() || null;
    // Prefer the clean identity company name; fall back to firm / domain guess.
    const companyName =
      p?.identity?.companyName?.trim() || firmName || companyNameFromDomain(p?.primaryCompanyDomain);
    const rawDomain = (p?.primaryCompanyDomain ?? "").trim().toLowerCase();
    const companyUrl = rawDomain ? `https://${rawDomain.replace(/^https?:\/\//, "")}` : null;
    const runs = runsByEval.get(e.id) ?? [];
    const badges = computeBadges(
      {
        isClaimed: claimMap.has(e.id),
        extractedMetrics: p?.extractedMetrics ?? null,
        mmHits: p?.mmHits ?? null,
        primaryCompanyDomain: p?.primaryCompanyDomain ?? null,
        investorStageFocus: e.investorStageFocus,
        investorIndustryFocus: e.investorIndustryFocus,
        investorLeadsRounds: e.investorLeadsRounds,
        onNeo: e.onNeo,
      },
      overridesByEval.get(e.id) ?? [],
    );
    return {
      id: e.id,
      fullName: e.fullName,
      linkedinUrl: e.linkedinUrl,
      source: classifyProfileSource({ chargeCents, isBulk: runs.length > 0 }),
      costCents: e.costTotalCents,
      chargeCents,
      claimerClerkUserId: claimMap.get(e.id) ?? null,
      foundEmail: e.foundEmail,
      foundEmailStatus: e.foundEmailStatus,
      emails: orderEmailsForDisplay(emailsByEval.get(e.id) ?? []).map((m) => ({
        email: m.email,
        status: m.status,
        source: m.source,
      })),
      phone: e.phone,
      jobTitle: e.jobTitle,
      updatedAt: e.updatedAt,
      subjectCity: e.subjectCity,
      subjectRegion: e.subjectRegion,
      subjectCountry: e.subjectCountry,
      requestIp: e.requestIp,
      requestCity: e.requestCity,
      requestRegion: e.requestRegion,
      requestCountry: e.requestCountry,
      founderScore: e.founderScore,
      investorScore: e.investorScore,
      combinedScore: e.combinedScore,
      leaderboardRank: rankMap.get(e.id) ?? null,
      badges: badges.filter((b) => b.status !== "rejected").map((b) => b.label),
      companyName,
      companyUrl,
      profileHref: profileUrlFor({
        evalId: e.id,
        clerkUsername: usernameMap.get(e.id) ?? null,
        slug: e.slug,
        slugKind: e.slugKind,
      }),
      runs,
    };
  });
}

export type JobProfiles = {
  // null when the job doesn't exist. failedItems = live count of `failed` items
  // (drives the "Re-run failed" control).
  job: { id: string; title: string | null; failedItems: number } | null;
  rows: ScoredProfileRow[]; // one row per linked (scored) eval, each with .status
  unresolvedCount: number; // items in this run with no evaluation yet (not shown)
};

// The scored profiles in ONE bulk run (for /admin/profiles/<jobId>). Reuses the
// shared enrichEvals() so the rows match the main list exactly, then attaches
// each profile's per-item status. Phase A shows only items that resolved to an
// evaluation; unresolvedCount reports how many are still pending/unscored.
export async function listProfilesForJob(jobId: string): Promise<JobProfiles> {
  const [job] = await db
    .select({ id: scoringJobs.id, title: scoringJobs.title })
    .from(scoringJobs)
    .where(eq(scoringJobs.id, jobId))
    .limit(1);
  if (!job) return { job: null, rows: [], unresolvedCount: 0 };

  // Newest item first so that, if an eval was scored more than once in this job,
  // we keep its most recent item's status.
  const items = await db
    .select({ evaluationId: scoringJobItems.evaluationId, status: scoringJobItems.status })
    .from(scoringJobItems)
    .where(eq(scoringJobItems.jobId, jobId))
    .orderBy(desc(scoringJobItems.createdAt));

  const unresolvedCount = items.filter((it) => !it.evaluationId).length;
  const failedItems = items.filter((it) => it.status === "failed").length;
  const jobOut = { id: job.id, title: job.title, failedItems };
  const statusByEval = new Map<string, string>();
  for (const it of items) {
    if (it.evaluationId && !statusByEval.has(it.evaluationId)) {
      statusByEval.set(it.evaluationId, it.status);
    }
  }
  const evalIds = [...statusByEval.keys()];
  if (evalIds.length === 0) return { job: jobOut, rows: [], unresolvedCount };

  const evals = await db
    .select(EVAL_BASE_COLUMNS)
    .from(evaluations)
    .where(inArray(evaluations.id, evalIds))
    .orderBy(desc(evaluations.updatedAt));

  const enriched = await enrichEvals(evals);
  // Every enriched row's id came from statusByEval's keys, so the status is
  // always present — assert it to make that contract explicit.
  const rows = enriched.map((r) => ({ ...r, status: statusByEval.get(r.id)! }));
  return { job: jobOut, rows, unresolvedCount };
}

// Profiles eligible for a "Re-Score Existing" job: real (source="url"),
// successfully scored (score > 0), last scored (updatedAt) ON OR BEFORE the
// `notScoredSince` cutoff (inclusive ≤), and whose DERIVED source is in
// `sources`. (`notScoredSince` is the historical wire name for the cutoff.)
// Returns the
// minimal fields the job needs. Shares the charge/bulk derivation with
// listScoredProfiles (via classifyProfileSource) so the two can't diverge.
export async function selectStaleProfiles(opts: {
  notScoredSince: Date;
  sources: ScoredProfileSource[];
}): Promise<Array<{ id: string; linkedinUrl: string }>> {
  const evals = await db
    .select({ id: evaluations.id, linkedinUrl: evaluations.linkedinUrl })
    .from(evaluations)
    .where(
      and(
        eq(evaluations.source, "url"),
        gt(evaluations.score, 0),
        lte(evaluations.updatedAt, opts.notScoredSince),
      ),
    );
  const ids = evals.map((e) => e.id);
  if (ids.length === 0) return [];

  const jobItemRows = await db
    .select({ evaluationId: scoringJobItems.evaluationId })
    .from(scoringJobItems)
    .where(inArray(scoringJobItems.evaluationId, ids));
  const bulkSet = new Set(
    jobItemRows.map((r) => r.evaluationId).filter((x): x is string => !!x),
  );

  const debits = await db
    .select({ evaluationId: creditLedger.evaluationId, delta: creditLedger.deltaCents })
    .from(creditLedger)
    .where(and(eq(creditLedger.reason, "score_debit"), inArray(creditLedger.evaluationId, ids)));
  const chargeMap = new Map<string, number>();
  for (const d of debits) {
    if (!d.evaluationId) continue;
    chargeMap.set(d.evaluationId, (chargeMap.get(d.evaluationId) ?? 0) + -d.delta);
  }

  return evals
    .filter((e) =>
      matchesSourceFilter(
        { chargeCents: chargeMap.get(e.id) ?? 0, isBulk: bulkSet.has(e.id) },
        opts.sources,
      ),
    )
    .map((e) => ({ id: e.id, linkedinUrl: e.linkedinUrl }));
}

// Hard ceiling on a single top-N "Re-Score Existing" job so a typo in the
// form (extra zero) can't queue a million LLM calls. Adjust if a legitimate
// case needs more — costs and credits still gate it client-side anyway.
export const TOP_PROFILES_MAX = 10_000;

// Profiles eligible for a "Top N by score" re-score job. Same baseline as
// selectStaleProfiles (source="url", score>0, derived source ∈ sources) but
// ordered by combined score desc (id desc tiebreaker) and sliced to N. The
// source filter is applied to the ordered list, so "Top 500 web-only"
// returns the 500 highest-scored web profiles — not "the 500 highest, then
// only web." Caps N at TOP_PROFILES_MAX to be safe.
export async function selectTopProfiles(opts: {
  topN: number;
  sources: ScoredProfileSource[];
}): Promise<Array<{ id: string; linkedinUrl: string }>> {
  const topN = Math.min(Math.max(0, Math.trunc(opts.topN)), TOP_PROFILES_MAX);
  if (topN === 0) return [];
  const evals = await db
    .select({ id: evaluations.id, linkedinUrl: evaluations.linkedinUrl })
    .from(evaluations)
    .where(and(eq(evaluations.source, "url"), gt(evaluations.score, 0)))
    .orderBy(desc(evaluations.score), desc(evaluations.id));
  const ids = evals.map((e) => e.id);
  if (ids.length === 0) return [];

  const jobItemRows = await db
    .select({ evaluationId: scoringJobItems.evaluationId })
    .from(scoringJobItems)
    .where(inArray(scoringJobItems.evaluationId, ids));
  const bulkSet = new Set(
    jobItemRows.map((r) => r.evaluationId).filter((x): x is string => !!x),
  );

  const debits = await db
    .select({ evaluationId: creditLedger.evaluationId, delta: creditLedger.deltaCents })
    .from(creditLedger)
    .where(and(eq(creditLedger.reason, "score_debit"), inArray(creditLedger.evaluationId, ids)));
  const chargeMap = new Map<string, number>();
  for (const d of debits) {
    if (!d.evaluationId) continue;
    chargeMap.set(d.evaluationId, (chargeMap.get(d.evaluationId) ?? 0) + -d.delta);
  }

  const out: Array<{ id: string; linkedinUrl: string }> = [];
  for (const e of evals) {
    if (out.length >= topN) break;
    if (
      matchesSourceFilter(
        { chargeCents: chargeMap.get(e.id) ?? 0, isBulk: bulkSet.has(e.id) },
        opts.sources,
      )
    ) {
      out.push({ id: e.id, linkedinUrl: e.linkedinUrl });
    }
  }
  return out;
}
