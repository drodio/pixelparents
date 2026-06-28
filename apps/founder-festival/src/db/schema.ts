import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  date,
  boolean,
  primaryKey,
  index,
  uniqueIndex,
  doublePrecision,
  serial,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const evaluations = pgTable(
  "evaluations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    linkedinUrl: text("linkedin_url").notNull(),
    fullName: text("full_name"),
    score: integer("score").notNull(), // combined = founder + investor
    founderScore: integer("founder_score").notNull().default(0),
    investorScore: integer("investor_score").notNull().default(0),
    signalQuality: text("signal_quality").notNull(),
    // Founder status, determined by the scoring model (or a cheap classifier
    // backfill). "current" | "past" | "never". null = not yet determined.
    // Drives the green-check / yellow-star / red-star marker on the profile.
    founderStatus: text("founder_status").$type<"current" | "past" | "never">(),
    // Investor status, same idea as founderStatus but for investing activity
    // (GP/partner at a fund, active angel, etc.). Drives the marker next to the
    // investor score. null = not yet determined.
    investorStatus: text("investor_status").$type<"current" | "past" | "never">(),
    // Shape: { founder: [...], investor: [...] }. Old rows may be flat array;
    // consumer code handles both during transition.
    breakdown: jsonb("breakdown").$type<{
      founder: Array<{ points: number; reason: string }>;
      investor: Array<{ points: number; reason: string }>;
    }>(),
    profile: jsonb("profile"),
    // Admin-entered "name hint" / manual profile text for profiles NO public API
    // can read (e.g. a LinkedIn profile the owner set to private — Exa AND
    // EnrichLayer both fail). researchSubject prepends this (authoritative) so name
    // extraction, the identity enrichers, and the grounded name-search have content.
    // Persists across re-scores. Format: first line = full name, rest = roles/about.
    manualProfileHint: text("manual_profile_hint"),
    companyStage: text("company_stage"),
    recommendations: jsonb("recommendations").$type<{
      summary: string;
      items: Array<{ id: string; text: string; category: string }>;
    }>(),
    // Summary paragraph ("what you likely need") gets the same source/status/
    // confidence treatment as individual breakdown items, but lives on the
    // evaluation row rather than score_items since it's a single paragraph.
    summarySource: text("summary_source").notNull().default("system"),
    summaryStatus: text("summary_status").notNull().default("likely"),
    summaryConfidence: integer("summary_confidence").notNull().default(50),
    // When the user edits the summary, the original Claude output is preserved
    // here so admins can compare on the pending-review queue.
    summaryOriginalText: text("summary_original_text"),
    // One-sentence LLM-generated headline describing the person, shown above the
    // badges on every profile (e.g. "4x-exited YC founder and angel investor now
    // building Chief"). Generated during scoring; preserved on re-score when a
    // run yields none (same rule as canonical_industries).
    credibilityTitle: text("credibility_title"),
    // BrightData LinkedIn STABLE numeric id (identical across vanity-URL changes).
    // The strongest duplicate-detection key — two evals with the same id are the
    // same person regardless of which LinkedIn URL they came in through.
    linkedinNumId: text("linkedin_num_id"),
    // Async BrightData enrichment state, keyed by dataset (crunchbaseCompany,
    // linkedinCompany, crunchbasePerson, twitter, …). Each entry holds an in-flight
    // {pending:{snapshotId,input,at}} and/or the resolved {data:{facts,raw}} (facts
    // [] = terminal "nothing usable"). The bd-async-sweep cron polls pending
    // snapshots, corroborates + caches the facts, and re-scores so they fold into
    // the breakdown. These collections are ~19–60s — too slow to block an eval.
    // See src/lib/bd-async.ts.
    bdAsync: jsonb("bd_async").$type<
      Record<
        string,
        {
          pending?: { snapshotId: string; input: Record<string, unknown>; at: string };
          data?: { facts: string[]; raw: unknown };
        }
      >
    >(),
    // Vanity URL: /profile/<slug_kind>/<slug>. slug_kind = "founder" |
    // "investor" — the CANONICAL role. Both /founder/<slug> and
    // /investor/<slug> resolve for every profile: the non-canonical one
    // 301-redirects to the canonical. Claimed users can change both fields
    // via /account; unclaimed profiles use the score-based pick (see
    // pickSlugKind). Slug is globally unique across both roles; if a
    // claimed user changes their slug, the old one is preserved in
    // profile_slug_aliases for the redirect. null only on legacy rows
    // that haven't been backfilled yet.
    slug: text("slug"),
    slugKind: text("slug_kind"),
    exaGrounding: jsonb("exa_grounding"),
    // Full per-eval cost breakdown { llm, exa, totalUsd, version }. See
    // EvalPricing in src/lib/eval-pipeline.ts. Source of truth for exact USD.
    pricing: jsonb("pricing").default(sql`'{}'::jsonb`),
    investorStageFocus: jsonb("investor_stage_focus")
      .$type<string[]>()
      .default(sql`'[]'::jsonb`),
    // Investor profile facets pulled from structured enrichers (Neo, NFX, …)
    // and projected onto the row so badges + filters don't need to JSON-parse
    // `profile.enrichments[]`. Each is a *merged* view across sources; the
    // raw provenance stays in the enrichments blob. See PRD/neo-investor-enricher.md.
    investorIndustryFocus: jsonb("investor_industry_focus")
      .$type<string[]>()
      .default(sql`'[]'::jsonb`),
    // Canonical industry slugs (src/lib/industries.ts taxonomy) for BOTH founders
    // and investors, normalized + deduped from free-text industry signals
    // (investorIndustryFocus + the founder/company industries the scorer infers).
    // A Postgres text[] (not jsonb) so the leaderboard can filter with
    // `= ANY(...)` / overlap and count with `unnest()` cheaply. Empty by default.
    canonicalIndustries: text("canonical_industries")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    investorLeadsRounds: boolean("investor_leads_rounds"),
    investorCheckSize: jsonb("investor_check_size").$type<{
      minUsd?: number;
      maxUsd?: number;
      rawText: string;
    } | null>(),
    // Neo (neo.com) match state. Tri-state: null = never checked
    // (pre-enricher rows), false = checked, no match, true = matched.
    // `neoSlug` enables a /investor/<slug> backlink + the Phase 2 endorsement
    // fetcher; only set when `onNeo === true`.
    onNeo: boolean("on_neo"),
    neoSlug: text("neo_slug"),
    // Denormalized integer cents mirrors of `pricing`, written on every eval so
    // admin spend aggregations are trivial SUMs and the per-item cost split on
    // /admin/score/<id> needs no JSONB parsing. NULL on pre-instrumentation rows
    // (cost is unrecoverable for those — the UI shows "—").
    costLlmCents: integer("cost_llm_cents"),
    costExaCents: integer("cost_exa_cents"),
    costTotalCents: integer("cost_total_cents"),
    source: text("source").notNull(),
    sourceCode: text("source_code"),
    // Requester context for individual user-initiated scoring (set by
    // /api/eval and /api/rescore only — NOT by the bulk cron). Presence of
    // requestIp is the discriminator the /admin/profiles view uses to list
    // individual requests vs. bulk-job evals. Updated to the latest requester
    // on each fresh score / re-score; cached hits leave it untouched (no cost).
    requestIp: text("request_ip"),
    requestCity: text("request_city"),
    requestRegion: text("request_region"),
    requestCountry: text("request_country"),
    // Canonical SUBJECT location (the person being scored) — distinct from
    // requestCity/* (scorer IP) and users.city/* (claimer self-set). Populated by
    // CSV/operator input, parsed LinkedIn (NFX display_name), or mirrored from a
    // claimer. Precedence claimer > operator > linkedin (see src/lib/subject-location.ts).
    // subject_location_raw keeps the original free text when it can't be split.
    subjectCity: text("subject_city"),
    subjectRegion: text("subject_region"),
    subjectCountry: text("subject_country"),
    subjectLocationRaw: text("subject_location_raw"),
    subjectLocationSource: text("subject_location_source"),
    // Operator/CSV-provided contact phone + job title for the subject. The phone
    // is the "provided" source — distinct from the claimer's Clerk-verified phone
    // (read live from Clerk, like the claimer email). Job title has no Clerk
    // equivalent. Both written by applyRowEnrichment from the input row.
    phone: text("phone"),
    jobTitle: text("job_title"),
    // Email discovered by an enrichment tool (AnyMailFinder) for UNCLAIMED
    // profiles. Distinct from a claimer's verified Clerk email. found_email_status
    // mirrors AnyMailFinder's accepted status ("valid"); surfaced in the admin
    // Email column as "Unverified". found_email_by = Clerk id of the admin who ran it.
    foundEmail: text("found_email"),
    foundEmailStatus: text("found_email_status"),
    foundEmailAt: timestamp("found_email_at", { withTimezone: true }),
    foundEmailBy: text("found_email_by"),
    // Async Find Email queue: the button marks eligible rows queued (instant); the
    // find-email-tick cron drains them with concurrency. queued_at is set on enqueue
    // and cleared when a tick claims the row. queued_by = the admin (for charging);
    // billable = false for super-admins (captured at enqueue so charging stays correct
    // when the cron runs later). A processed row ends with found_email set (hit) or
    // found_email_status='not_found' (miss) so it is never re-queued.
    findEmailQueuedAt: timestamp("find_email_queued_at", { withTimezone: true }),
    findEmailQueuedBy: text("find_email_queued_by"),
    findEmailBillable: boolean("find_email_billable"),
    // Superadmin "hide from leaderboard" toggle. NULL = visible. Non-null =
    // hidden by `hidden_by_clerk_user_id` at `hidden_at`. Hidden profiles
    // still resolve at their canonical URL — only the leaderboard query
    // filters them out (see src/lib/leaderboard.ts baseWhere). Toggleable
    // via POST /api/admin/profile/[evalId]/hide. Audit retained via the
    // hidden_by column rather than a separate audit table.
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    hiddenByClerkUserId: text("hidden_by_clerk_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    linkedinUrlUnique: uniqueIndex("evaluations_linkedin_url_unique").on(t.linkedinUrl),
    sourceCodeIdx: index("evaluations_source_code_idx").on(t.sourceCode),
    // /admin/profiles lists rows where request_ip is set (individual requests).
    requestIpIdx: index("evaluations_request_ip_idx").on(t.requestIp),
    // Vanity URL lookup. Slug is GLOBALLY UNIQUE across both roles so that
    // both /founder/<slug> and /investor/<slug> can resolve unambiguously
    // for the same profile (the non-canonical role 301-redirects). Old
    // slugs left behind by an edit live in profile_slug_aliases.
    slugUnique: uniqueIndex("evaluations_slug_unique").on(t.slug),
    // Leaderboard filter — used in every leaderboard query's baseWhere.
    hiddenAtIdx: index("evaluations_hidden_at_idx").on(t.hiddenAt),
    // Stage facet on the leaderboard (company_stage IN (...)). JSONB metric
    // facets stay unindexed for now; add a GIN index on `profile` only if those
    // filters prove slow under load.
    companyStageIdx: index("evaluations_company_stage_idx").on(t.companyStage),
    // NOTE: five performance indexes are managed OUTSIDE drizzle, in
    // scripts/sql/performance-indexes.sql (applied to prod CONCURRENTLY):
    //   evaluations_{score,founder_score,investor_score}_keyset_idx  (partial,
    //     `<col> DESC, id DESC WHERE hidden_at IS NULL [AND <col> > 0]` — leaderboard
    //     keyset pagination), evaluations_find_email_queued_idx (partial), and
    //     evaluations_full_name_trgm_idx (gin_trgm_ops, name search).
    // They are intentionally NOT defined here: drizzle's `.desc()` emits
    // `DESC NULLS LAST`, but the leaderboard ORDER BY needs the Postgres default
    // `DESC` (NULLS FIRST) to use the index — so a drizzle-generated migration
    // would describe a different index than what's in prod. Manage them via the
    // SQL script. Do NOT run `drizzle-kit push` (it would try to drop them).
  }),
);

export const bypassCodes = pgTable(
  "bypass_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(),
    maxUses: integer("max_uses").notNull(),
    usesCount: integer("uses_count").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    assignedScore: integer("assigned_score"),
    note: text("note"),
    eventId: uuid("event_id").references((): AnyPgColumn => events.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => ({
    codeLowerUnique: uniqueIndex("bypass_codes_code_lower_unique").on(sql`lower(${t.code})`),
  }),
);

export const majesticMillion = pgTable(
  "majestic_million",
  {
    rank: integer("rank").primaryKey(),
    domain: text("domain").notNull(),
    refreshedAt: timestamp("refreshed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    domainIdx: index("majestic_million_domain_idx").on(t.domain),
  }),
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    evaluationId: uuid("evaluation_id").references(() => evaluations.id),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedVia: text("verified_via"),
    matchConfidence: text("match_confidence"),
    // Exact identity signal that confirmed the claim. One of the MatchSignal
    // literals defined in src/lib/identity-match.ts (Task 7). Nullable.
    // Legacy rows (pre-2026-05-22) stay null.
    verifiedSignal: text("verified_signal"),
    // Profile picture URL from the Clerk session at claim time (LinkedIn
    // OAuth provides this). Stashed on the claim row so the leaderboard
    // can render it without N+1 Backend API lookups against Clerk.
    clerkImageUrl: text("clerk_image_url"),
    // Clerk username from the session at claim time. When non-null the
    // owner's profile URL becomes /profile/<clerk_username> (which takes
    // precedence over the evaluations.slug name-slug URL). Null when the
    // user hasn't picked a Clerk username (the default for a fresh OAuth
    // signup); a periodic refresh would catch up if they set one later.
    clerkUsername: text("clerk_username"),
    // Optional display name the claimed user picks on /account. When set, it
    // replaces "Welcome <fullName>" on the profile heading (full name moves
    // to a smaller subtitle) AND overrides Clerk firstName in lifecycle
    // welcome-email greetings. Validated at the app layer (1-32 chars,
    // trimmed, no newlines) — no DB CHECK constraint so the rules can evolve
    // without a migration.
    nickname: text("nickname"),
    // Location set by the claimer on /account or via the inline editor on
    // their profile page. All three fields are independent and optional —
    // international profiles often skip "region" (state). Rendered below the
    // fullName on the profile page as "City, Region, Country" with empty
    // values dropped.
    city: text("city"),
    region: text("region"),
    country: text("country"),
    // Notification preferences set on /account/setup. All four default true
    // so the "locked-on while disabled" UI on the setup page matches the
    // stored value when the contact method later gets verified — otherwise
    // the SMS toggle would visibly snap from on (locked) to off (stored) at
    // the moment of phone verification.
    // Legacy single-column-per-category prefs (single global "also text me"
    // toggle). Superseded by the per-channel columns below; kept to avoid a
    // destructive migration. New code uses pref{Email,Text}* only.
    prefInviteEvents: boolean("pref_invite_events").notNull().default(true),
    prefFestivalUpdates: boolean("pref_festival_updates").notNull().default(true),
    prefSponsorIntros: boolean("pref_sponsor_intros").notNull().default(true),
    prefTextAlerts: boolean("pref_text_alerts").notNull().default(true),
    // Per-channel notification prefs — one email + one text boolean per
    // category. Defaults: email=true on all five; text=true only on
    // invite_events (user wants prompt SMS for event invites but not for
    // marketing / intro categories).
    prefEmailInviteEvents: boolean("pref_email_invite_events").notNull().default(true),
    prefTextInviteEvents: boolean("pref_text_invite_events").notNull().default(true),
    prefEmailFestivalUpdates: boolean("pref_email_festival_updates").notNull().default(true),
    prefTextFestivalUpdates: boolean("pref_text_festival_updates").notNull().default(false),
    prefEmailInvestorIntros: boolean("pref_email_investor_intros").notNull().default(true),
    prefTextInvestorIntros: boolean("pref_text_investor_intros").notNull().default(false),
    prefEmailFounderIntros: boolean("pref_email_founder_intros").notNull().default(true),
    prefTextFounderIntros: boolean("pref_text_founder_intros").notNull().default(false),
    prefEmailSponsorIntros: boolean("pref_email_sponsor_intros").notNull().default(true),
    prefTextSponsorIntros: boolean("pref_text_sponsor_intros").notNull().default(false),
    // Event logistics (admin-sent updates/reminders for events you're attending).
    // Default true on BOTH channels — these are operational comms attendees expect.
    // The event email composer respects pref_email_event_logistics as the opt-out.
    prefEmailEventLogistics: boolean("pref_email_event_logistics").notNull().default(true),
    prefTextEventLogistics: boolean("pref_text_event_logistics").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    clerkUserIdUnique: uniqueIndex("users_clerk_user_id_unique").on(t.clerkUserId),
    evaluationIdx: index("users_evaluation_id_idx").on(t.evaluationId),
    // Lower-cased index so /profile/<username> lookups are case-insensitive.
    // A user with Clerk username "DROdio" matches /profile/drodio.
    clerkUsernameLowerIdx: index("users_clerk_username_lower_idx").on(
      sql`lower(${t.clerkUsername})`,
    ),
  }),
);

// URL history for editable profile slugs. When a claimed user changes
// /profile/<role>/<slug> to a new slug via /account, the OLD slug is parked
// here so visitors hitting the old URL get a 301 to the current canonical
// URL (and so nobody else can later claim that slug). A slug is "taken" if
// it appears in evaluations.slug OR profile_slug_aliases.alias_slug — see
// validateSlug() in src/lib/profile-slug.ts.
export const profileSlugAliases = pgTable(
  "profile_slug_aliases",
  {
    aliasSlug: text("alias_slug").primaryKey(),
    evaluationId: uuid("evaluation_id")
      .notNull()
      .references(() => evaluations.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    evaluationIdx: index("profile_slug_aliases_evaluation_id_idx").on(t.evaluationId),
  }),
);

export const recommendationResponses = pgTable(
  "recommendation_responses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    evaluationId: uuid("evaluation_id")
      .notNull()
      .references(() => evaluations.id),
    itemId: text("item_id").notNull(),
    rating: integer("rating").notNull(), // 1..4 = Unlikely / Possibly / Probably / Definitely
    // For pre-populated items, category is null (already on the eval row);
    // for custom-added items, category is the user's pick.
    category: text("category"),
    // For pre-populated items: text edited by the user (null if unchanged).
    // For custom items: the user-written description of the thing.
    editedText: text("edited_text"),
    // "system" (Claude-generated priority) | "user" (custom row added via +Add another)
    source: text("source").notNull().default("system"),
    // "likely" | "pending" | "confirmed" | "rejected"
    status: text("status").notNull().default("likely"),
    // 0-100. User-added rows default to 100; system-added rows inherit from
    // the AI's per-item confidence emission.
    confidence: integer("confidence").notNull().default(50),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    evalItemUnique: uniqueIndex("recommendation_responses_eval_item_unique").on(
      t.evaluationId,
      t.itemId,
    ),
    statusIdx: index("recommendation_responses_status_idx").on(t.status),
  }),
);

// Per-row privacy on the "Are these your current priorities?" rows. Sparse:
// a row exists only when the owner has marked that priority private. Absence
// of a row = public (the default).
//
// Why a separate table: recommendation_responses requires rating NOT NULL,
// and an owner must be able to mark an unrated row private. Keeping rating
// and visibility orthogonal is cleaner than relaxing the rating invariant.
export const recommendationVisibility = pgTable(
  "recommendation_visibility",
  {
    evaluationId: uuid("evaluation_id")
      .notNull()
      .references(() => evaluations.id, { onDelete: "cascade" }),
    itemId: text("item_id").notNull(),
    // Only "private" rows are stored. Public = no row.
    visibility: text("visibility").notNull().default("private"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.evaluationId, t.itemId] }),
  }),
);

// Owner overrides for achievement badges. Each row is one (eval, badge_id)
// pair where the owner confirmed / edited / rejected the computed pill.
// computeBadges() is still the source of truth for which pills CAN appear;
// these rows annotate the computed list with status + an optional edited
// label (e.g. "10+ Employees" → user-edited to "150+ Employees, pending review").
//
// status:
//   "confirmed" → owner says the pill is accurate. Renders in full color.
//   "pending"   → owner edited the value. Renders in pending pill style,
//                 awaits admin review on /admin/pending.
//   "rejected"  → owner says the pill is wrong / doesn't apply. Hidden.
//
// editedLabel: when the owner edits a tiered pill to a different bucket
// (e.g. "10+ Employees" → "150+ Employees"), the new label is stored here.
// Read path layers it over the computed label.
export const badgeOverrides = pgTable(
  "badge_overrides",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    evaluationId: uuid("evaluation_id")
      .notNull()
      .references(() => evaluations.id, { onDelete: "cascade" }),
    badgeId: text("badge_id").notNull(),
    status: text("status").notNull(),
    editedLabel: text("edited_label"),
    // Original (computed) label captured on first edit so the admin queue
    // can show old → new diff without re-computing.
    originalLabel: text("original_label"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    evalBadgeUnique: uniqueIndex("badge_overrides_eval_badge_unique").on(
      t.evaluationId,
      t.badgeId,
    ),
    statusIdx: index("badge_overrides_status_idx").on(t.status),
  }),
);

// Per-item rows for each founder/investor breakdown. Replaces the JSON array
// previously embedded in evaluations.breakdown; that column stays around for
// legacy rows but new evals write here. Owners can confirm / modify / reject
// each row; admins review pending modifications via /admin/pending.
export const scoreItems = pgTable(
  "score_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    evaluationId: uuid("evaluation_id")
      .notNull()
      .references(() => evaluations.id, { onDelete: "cascade" }),
    // "founder" | "investor"
    rubric: text("rubric").notNull(),
    // The displayed sentence. Renderers should still pass it through
    // sanitizeReason() since that strips legacy math noise from older rows.
    reason: text("reason").notNull(),
    // Point value of this row, contributing to the rubric total.
    points: integer("points").notNull(),
    // "system" (emitted by Claude) | "user" (added via +Add another)
    source: text("source").notNull().default("system"),
    // "likely" | "pending" | "confirmed" | "rejected"
    status: text("status").notNull().default("likely"),
    // 0-100. System rows: Claude-emitted heuristic. User rows: always 100.
    // Confirmed rows: 100. Rejected rows: 0.
    confidence: integer("confidence").notNull().default(50),
    // When the user modifies a system row, the original reason + points are
    // preserved so the admin queue can show the diff before approving.
    originalReason: text("original_reason"),
    originalPoints: integer("original_points"),
    // Stable position within the rubric for ordering. New rows go to the end.
    sortOrder: integer("sort_order").notNull().default(0),
    // Per-phrase citations: each entry maps a substring of `reason` to the
    // URL(s) backing that specific phrase. Emitted by the AI scorer; rendered
    // inline on the profile page as subtle-gold-underlined phrases with a
    // hover popover. Pre-existing rows stay at the JSON default `[]` and
    // render as plain text (no decoration) until re-scored.
    citations: jsonb("citations")
      .$type<Array<{ phrase: string; sources: string[] }>>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    evalRubricIdx: index("score_items_eval_rubric_idx").on(t.evaluationId, t.rubric),
    statusIdx: index("score_items_status_idx").on(t.status),
  }),
);

// Admin bulk-scoring jobs. Each job is a list of subjects (names/companies
// or raw LinkedIn URLs) that gets resolved, deduped, queued, and processed
// by the /api/cron/scoring-tick worker. Costs are tracked in cents.
export const scoringJobs = pgTable(
  "scoring_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title"),
    // Which Claude model is used for this job's scoring calls.
    // "sonnet" or "opus" — passed through to runEval.
    model: text("model").notNull(),
    // queued | running | completed | failed | cancelled
    status: text("status").notNull().default("queued"),
    totalItems: integer("total_items").notNull(),
    completedItems: integer("completed_items").notNull().default(0),
    failedItems: integer("failed_items").notNull().default(0),
    estimatedCents: integer("estimated_cents"),
    actualCents: integer("actual_cents").notNull().default(0),
    createdByEmail: text("created_by_email"),
    // Clerk id of the job creator — who credits are charged to under admin credit
    // enforcement (Phase 3). Email isn't enough since credits are keyed by Clerk id.
    createdByClerkUserId: text("created_by_clerk_user_id"),
    // Credits reserved (held) for this job at creation when enforcement was on:
    // multiplier × estimated_cents. Reconciled down to real cost at completion;
    // fully refunded on cancel/fail. Null/0 = no hold (enforcement off).
    creditHoldCents: integer("credit_hold_cents"),
    // When this job is a RE-RUN of another, the source job's id. Lets the list
    // show a "↻ re-run" tag and keeps each run as its own dated entry instead of
    // resetting the original in place. Null for original (non-re-run) jobs.
    rerunOfJobId: uuid("rerun_of_job_id").references((): AnyPgColumn => scoringJobs.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    statusIdx: index("scoring_jobs_status_idx").on(t.status),
  }),
);

export const scoringJobItems = pgTable(
  "scoring_job_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => scoringJobs.id, { onDelete: "cascade" }),
    // Original input as the operator pasted it (preserved for debugging).
    inputRaw: text("input_raw").notNull(),
    // Optional parsed pieces. inputCompany may be null if the line was a URL
    // or just a name.
    inputName: text("input_name"),
    inputCompany: text("input_company"),
    // Enrichment fields carried from the input row (paste/CSV) through the async
    // pipeline. Applied to the evaluation via applyRowEnrichment: input_email →
    // profile_emails (operator/verified); input_city/region/country/location_raw
    // → subject_* location. Null when the input row didn't supply them.
    inputEmail: text("input_email"),
    inputCity: text("input_city"),
    inputRegion: text("input_region"),
    inputCountry: text("input_country"),
    inputLocationRaw: text("input_location_raw"),
    inputPhone: text("input_phone"),
    inputJobTitle: text("input_job_title"),
    // Resolved canonical LinkedIn URL (null until a tick resolves it).
    linkedinUrl: text("linkedin_url"),
    // Once scoring succeeds, link to the resulting evaluation row. Cascade on
    // delete so removing an evaluation (e.g. account deletion) also clears the
    // job item — which itself holds the operator's pasted name/URL — instead of
    // throwing an FK violation and leaving the evaluation half-deleted.
    evaluationId: uuid("evaluation_id").references(() => evaluations.id, { onDelete: "cascade" }),
    // pending | resolving | resolved | scoring | done | failed | skipped | enriched
    // ("enriched" = an existing-profile match enriched in place at job-submit with
    // no LLM re-score; terminal, never claimed by the scoring-tick cron.)
    status: text("status").notNull().default("pending"),
    error: text("error"),
    // Score + cost SNAPSHOT captured when this item finished. The eval row is
    // overwritten by later re-runs, so without a snapshot a past run's row would
    // show a newer run's numbers. Null until the item completes (and on legacy
    // rows scored before snapshots existed → fall back to the live eval).
    founderScore: integer("founder_score"),
    investorScore: integer("investor_score"),
    combinedScore: integer("combined_score"),
    costCents: integer("cost_cents"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    jobIdx: index("scoring_job_items_job_id_idx").on(t.jobId),
    statusIdx: index("scoring_job_items_status_idx").on(t.status),
  }),
);

// Unified multi-email model: a profile (evaluation) can have many emails, each
// with its own status + provenance, so an AnyMailFinder "unverified" email and an
// operator/CSV-provided "verified" email coexist. Replaces the single
// evaluations.found_email column as the email READ source. See src/lib/profile-emails.ts.
export const profileEmails = pgTable(
  "profile_emails",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    evaluationId: uuid("evaluation_id")
      .notNull()
      .references(() => evaluations.id, { onDelete: "cascade" }),
    email: text("email").notNull(), // ALWAYS stored lowercased + trimmed (see normalizeEmail)
    // "verified" (operator/CSV or claimer) | "unverified" (anymailfinder/linkedin)
    status: text("status").notNull(),
    // "operator" | "anymailfinder" | "linkedin"
    source: text("source").notNull(),
    addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
    addedBy: text("added_by"), // Clerk id of the admin for operator source; null otherwise
  },
  (t) => ({
    // Plain (evaluation_id, email) — equivalent to lower(email) since every write
    // normalizes to lowercase, and lets onConflictDoUpdate target it by columns.
    evalEmailUnique: uniqueIndex("profile_emails_eval_email_unique").on(
      t.evaluationId,
      t.email,
    ),
    evalIdx: index("profile_emails_evaluation_id_idx").on(t.evaluationId),
  }),
);

export const rateLimit = pgTable(
  "rate_limit",
  {
    ip: text("ip").notNull(),
    day: date("day").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.ip, t.day] }),
  }),
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    hostName: text("host_name"),
    hostEmail: text("host_email"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    venue: text("venue"),
    // Short display location ("San Mateo, CA") shown on the event page next to
    // the date. Filled from Luma's geo city/region when available, else set by
    // an admin. Preserved on Luma re-sync when Luma has no city/region.
    location: text("location"),
    capacity: integer("capacity"),
    status: text("status").notNull().default("draft"),
    approvalMode: text("approval_mode").notNull().default("manual"),
    criteria: jsonb("criteria").notNull().default(sql`'{}'::jsonb`),
    sponsor: jsonb("sponsor"),
    description: text("description"),
    createdByEmail: text("created_by_email"),
    // Origin of the row: "manual" (created in our admin) or "luma" (synced
    // from the Founder Festival Luma calendar via the API).
    source: text("source").notNull().default("manual"),
    // Luma linkage — set only on source="luma" rows. lumaEventId is the Luma
    // api_id (evt-…) and is the upsert key for re-syncs; lumaUrl is the public
    // lu.ma page; coverUrl is the Luma cover image.
    lumaEventId: text("luma_event_id"),
    lumaUrl: text("luma_url"),
    coverUrl: text("cover_url"),
    // Post-event recap content (TipTap HTML), three tiers each in their own
    // colored box: learningsPublic → everyone (green); learningsMembers → any
    // claimed member (purple); learningsAttendees → gated RSVP'd attendees (amber).
    learningsPublic: text("learnings_public"),
    learningsMembers: text("learnings_members"),
    learningsAttendees: text("learnings_attendees"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    slugUnique: uniqueIndex("events_slug_unique").on(t.slug),
    statusIdx: index("events_status_idx").on(t.status),
    lumaEventIdUnique: uniqueIndex("events_luma_event_id_unique").on(t.lumaEventId),
  }),
);

export const eventApplicants = pgTable(
  "event_applicants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    evaluationId: uuid("evaluation_id").references(() => evaluations.id),
    linkedinUrl: text("linkedin_url").notNull(),
    fullName: text("full_name"),
    email: text("email").notNull(),
    needs: jsonb("needs"),
    status: text("status").notNull().default("pending"),
    decisionReason: text("decision_reason"),
    adminNote: text("admin_note"),
    bypassCodeId: uuid("bypass_code_id").references(() => bypassCodes.id),
    decidedByEmail: text("decided_by_email"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    eventLinkedinUnique: uniqueIndex("event_applicants_event_linkedin_unique").on(
      t.eventId,
      t.linkedinUrl,
    ),
    statusIdx: index("event_applicants_status_idx").on(t.eventId, t.status),
  }),
);

export const eventDecisionLog = pgTable(
  "event_decision_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    applicantId: uuid("applicant_id")
      .notNull()
      .references(() => eventApplicants.id, { onDelete: "cascade" }),
    fromStatus: text("from_status").notNull(),
    toStatus: text("to_status").notNull(),
    reason: text("reason"),
    actorEmail: text("actor_email"),
    at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    applicantIdx: index("event_decision_log_applicant_idx").on(t.applicantId),
  }),
);

export const eventInvites = pgTable(
  "event_invites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    linkedinUrl: text("linkedin_url"),
    email: text("email"),
    source: text("source").notNull(),
    redeemedByApplicantId: uuid("redeemed_by_applicant_id").references(() => eventApplicants.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    codeUnique: uniqueIndex("event_invites_code_unique").on(t.code),
    eventIdx: index("event_invites_event_idx").on(t.eventId),
  }),
);

// Who registered for an event on Luma, pulled via the get-guests API
// (src/lib/event-attendees-sync.ts). One row per Luma guest per event, keyed on
// (event_id, luma_guest_api_id) for idempotent re-sync. evaluationId is matched
// by email and is null when no Founder Festival profile exists for the guest.
// approvalStatus is the RSVP state; "approved" == RSVP'd yes (used for gating +
// analytics). checkedInAt comes from Luma and is null unless scanned at the door.
export const eventAttendees = pgTable(
  "event_attendees",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    evaluationId: uuid("evaluation_id").references(() => evaluations.id),
    lumaGuestApiId: text("luma_guest_api_id").notNull(),
    lumaUserApiId: text("luma_user_api_id"),
    email: text("email"), // lowercased; null if Luma had none
    name: text("name"),
    linkedinUrl: text("linkedin_url"), // captured from the Luma "LinkedIn?" registration answer; normalized https://linkedin.com/in/<handle>
    // "luma" = imported from the Luma guest-list sync; "manual" = added by an
    // admin via the attendee manager. Manual rows use a synthetic
    // lumaGuestApiId of "manual:<evaluationId>".
    source: text("source").notNull().default("luma"),
    // Soft-delete. Admin "remove" sets this true; the Luma re-sync's
    // onConflictDoUpdate does NOT touch it, so removed guests stay removed
    // across re-syncs. resolveEventAttendeeEvalIds + the admin list filter it.
    removedByAdmin: boolean("removed_by_admin").notNull().default(false),
    approvalStatus: text("approval_status").notNull().default("pending"),
    registeredAt: timestamp("registered_at", { withTimezone: true }),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
    lumaUrl: text("luma_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    eventGuestUnique: uniqueIndex("event_attendees_event_guest_unique").on(
      t.eventId,
      t.lumaGuestApiId,
    ),
    eventIdx: index("event_attendees_event_idx").on(t.eventId),
    evaluationIdx: index("event_attendees_evaluation_idx").on(t.evaluationId),
  }),
);

// Photos shown in an event's recap carousel. source distinguishes the Luma
// cover (auto, always public), admin uploads, and attendee uploads (Phase 6).
// visibility gates who sees the photo: "public" (anyone) | "attendees" (only
// gated RSVP'd+claimed attendees). Files live in Vercel Blob; blobUrl is public.
export const eventPhotos = pgTable(
  "event_photos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    blobUrl: text("blob_url").notNull(),
    // "luma_cover" | "admin" | "attendee"
    source: text("source").notNull().default("admin"),
    uploadedByEvaluationId: uuid("uploaded_by_evaluation_id").references(() => evaluations.id),
    // "public" | "attendees"
    visibility: text("visibility").notNull().default("public"),
    caption: text("caption"),
    // true once a human writes/edits the caption — "Re-Run all auto-captions"
    // skips these so manual captions are never overwritten. Auto-generated
    // captions leave this false.
    captionManual: boolean("caption_manual").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    eventIdx: index("event_photos_event_idx").on(t.eventId, t.sortOrder),
  }),
);

// Category badges for events (e.g. "Intimate dinner", "Founder + Investor Mixer",
// "Family friendly"). A shared vocabulary: created inline while editing an event,
// deduped by slug (case-insensitive). Shown on event cards + the event page and
// clickable to filter the /events list. NOTE: distinct from the printed name-tag
// "badges" in lib/event-badges.ts.
export const eventBadges = pgTable("event_badges", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  // kebab-case of name; the URL filter key (/events?badge=family-friendly) and
  // the de-dup key so "Mixer" and "mixer" collapse to one badge.
  slug: text("slug").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  slugUnique: uniqueIndex("event_badges_slug_unique").on(t.slug),
}));

// Which badges are applied to which events (many-to-many).
export const eventBadgeLinks = pgTable("event_badge_links", {
  eventId: uuid("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  badgeId: uuid("badge_id")
    .notNull()
    .references(() => eventBadges.id, { onDelete: "cascade" }),
}, (t) => ({
  pk: primaryKey({ columns: [t.eventId, t.badgeId] }),
  badgeIdx: index("event_badge_links_badge_idx").on(t.badgeId),
}));

// Stored AI-personalized post-event learnings, one per (event, attendee). Chief
// (or AI) generation is slow + costs credits, so results are persisted and shown
// in the admin attendee table (expandable) rather than regenerated on each view.
export const eventPersonalizedLearnings = pgTable(
  "event_personalized_learnings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    evaluationId: uuid("evaluation_id")
      .notNull()
      .references(() => evaluations.id, { onDelete: "cascade" }),
    method: text("method").notNull().default("chief"), // "chief" | "ai"
    html: text("html").notNull(),
    // Async generation status: "generating" while Chief works (html empty),
    // "done" once stored, "failed" on timeout/error. Existing rows default "done".
    status: text("status").notNull().default("done"), // "generating" | "done" | "failed"
    chiefChatId: text("chief_chat_id"),
    chiefMessageId: text("chief_message_id"),
    error: text("error"),
    generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    eventEvalUnique: uniqueIndex("event_personalized_event_eval_unique").on(t.eventId, t.evaluationId),
  }),
);

// Stored "Attendee Insights" (Recommended Connections), one per (event, attendee).
// Chief composes, from the attendee's profile + all event learnings + every other
// attendee, the top-3 people to connect with and a give/get match. Like
// event_personalized_learnings: slow + credit-metered, so persisted and shown in
// the admin attendee row, on the attendee's event page, and emailable.
export const eventRecommendedConnections = pgTable(
  "event_recommended_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    evaluationId: uuid("evaluation_id")
      .notNull()
      .references(() => evaluations.id, { onDelete: "cascade" }),
    method: text("method").notNull().default("chief"), // "chief" | "ai"
    html: text("html").notNull(),
    // Async generation status: "generating" while Chief works (html empty),
    // "done" once stored, "failed" on timeout/error. Existing rows default "done".
    status: text("status").notNull().default("done"), // "generating" | "done" | "failed"
    chiefChatId: text("chief_chat_id"),
    chiefMessageId: text("chief_message_id"),
    error: text("error"),
    generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    eventEvalUnique: uniqueIndex("event_recommended_connections_event_eval_unique").on(t.eventId, t.evaluationId),
  }),
);

// Event hosts (e.g. District, Agate Hound). Reusable across events via the
// event_hosts join. iconUrl is a Vercel Blob image; url is the click-out target
// (the host's profile/site). An event can have multiple hosts.
export const hosts = pgTable("hosts", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  blurb: text("blurb"),
  iconUrl: text("icon_url"),
  url: text("url"),
  // URL slug for the public /hosts/<slug> page. Nullable: a null slug falls back
  // to slugify(name) at read time. Uniqueness is enforced at the app layer (the
  // admin save rejects a slug already used by another host).
  slug: text("slug"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const eventHosts = pgTable(
  "event_hosts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    hostId: uuid("host_id")
      .notNull()
      .references(() => hosts.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => ({
    eventHostUnique: uniqueIndex("event_hosts_event_host_unique").on(t.eventId, t.hostId),
    eventIdx: index("event_hosts_event_idx").on(t.eventId),
    hostIdx: index("event_hosts_host_idx").on(t.hostId),
  }),
);

// Festival profiles associated with a host (people who work there). UI wiring
// comes later; the table exists so associations can be stored now.
export const hostProfiles = pgTable(
  "host_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hostId: uuid("host_id")
      .notNull()
      .references(() => hosts.id, { onDelete: "cascade" }),
    evaluationId: uuid("evaluation_id")
      .notNull()
      .references(() => evaluations.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => ({
    hostEvalUnique: uniqueIndex("host_profiles_host_eval_unique").on(t.hostId, t.evaluationId),
    hostIdx: index("host_profiles_host_idx").on(t.hostId),
  }),
);

// Event sponsors. Reusable across events via event_sponsors. logoUrl is a Vercel
// Blob image; websiteUrl is the click-out. People who work at a sponsor are
// attached via sponsor_profiles and shown under the sponsor on the public recap.
export const sponsors = pgTable("sponsors", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  blurb: text("blurb"),
  logoUrl: text("logo_url"),
  websiteUrl: text("website_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const eventSponsors = pgTable(
  "event_sponsors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    sponsorId: uuid("sponsor_id")
      .notNull()
      .references(() => sponsors.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => ({
    eventSponsorUnique: uniqueIndex("event_sponsors_event_sponsor_unique").on(t.eventId, t.sponsorId),
    eventIdx: index("event_sponsors_event_idx").on(t.eventId),
    sponsorIdx: index("event_sponsors_sponsor_idx").on(t.sponsorId),
  }),
);

// Festival profiles who work at a sponsor — shown beneath the sponsor publicly.
export const sponsorProfiles = pgTable(
  "sponsor_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sponsorId: uuid("sponsor_id")
      .notNull()
      .references(() => sponsors.id, { onDelete: "cascade" }),
    evaluationId: uuid("evaluation_id")
      .notNull()
      .references(() => evaluations.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => ({
    sponsorEvalUnique: uniqueIndex("sponsor_profiles_sponsor_eval_unique").on(t.sponsorId, t.evaluationId),
    sponsorIdx: index("sponsor_profiles_sponsor_idx").on(t.sponsorId),
  }),
);

// Priorities an event is optimized for, categorized with the same taxonomy as
// founder recommendation priorities (fundraising/hiring/intros/tactical/
// positioning/wellbeing). Stored so we can later match founders whose priorities
// align with an event's. Admin-defined; no public display in this phase.
export const eventPriorities = pgTable(
  "event_priorities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    category: text("category").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    eventIdx: index("event_priorities_event_idx").on(t.eventId, t.sortOrder),
  }),
);

// Attendee → attendee connection requests for an event. The target approves or
// denies (from their event/profile page or a tokenized email link). On approve,
// contact info (email + LinkedIn) is exchanged. token backs the email links.
export const connectionRequests = pgTable(
  "connection_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    fromEvaluationId: uuid("from_evaluation_id")
      .notNull()
      .references(() => evaluations.id, { onDelete: "cascade" }),
    toEvaluationId: uuid("to_evaluation_id")
      .notNull()
      .references(() => evaluations.id, { onDelete: "cascade" }),
    // "pending" | "approved" | "denied"
    status: text("status").notNull().default("pending"),
    token: text("token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => ({
    pairUnique: uniqueIndex("connection_requests_pair_unique").on(
      t.eventId,
      t.fromEvaluationId,
      t.toEvaluationId,
    ),
    tokenUnique: uniqueIndex("connection_requests_token_unique").on(t.token),
    toIdx: index("connection_requests_to_idx").on(t.toEvaluationId, t.status),
  }),
);

// Per-profile auto-handling of future connection requests, by requester group
// (founder | investor | sponsor) and scope (global, or a specific event id).
// action: "auto_approve" | "auto_deny" | "ask" (ask = default; no row needed).
export const connectionPreferences = pgTable(
  "connection_preferences",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    evaluationId: uuid("evaluation_id")
      .notNull()
      .references(() => evaluations.id, { onDelete: "cascade" }),
    // "global" or an event id (uuid as text) for event-specific prefs
    scope: text("scope").notNull(),
    // "founder" | "investor" | "sponsor"
    group: text("group").notNull(),
    // "auto_approve" | "auto_deny" | "ask"
    action: text("action").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    prefUnique: uniqueIndex("connection_preferences_unique").on(t.evaluationId, t.scope, t.group),
    evalIdx: index("connection_preferences_eval_idx").on(t.evaluationId),
  }),
);

// Per-attendee, per-event contact-sharing mode. "open_to_all" = my contact info
// is shown to fellow attendees directly; "by_request" = they must Connect first.
export const eventContactSharing = pgTable(
  "event_contact_sharing",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    evaluationId: uuid("evaluation_id")
      .notNull()
      .references(() => evaluations.id, { onDelete: "cascade" }),
    // "open_to_all" | "by_request"
    mode: text("mode").notNull().default("by_request"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pairUnique: uniqueIndex("event_contact_sharing_unique").on(t.eventId, t.evaluationId),
  }),
);

// Named RBAC roles a super-admin defines. `grants` is an array of grant keys
// (see src/lib/grants.ts). The legacy `scope` column is superseded by the
// per-category `usersScope`/`eventsScope` below and is no longer read.
export const adminRoles = pgTable("admin_roles", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  scope: text("scope").notNull().default("edit_all"),
  // Per-category record scope: "all" (every record) | "theirs" (only records
  // this admin created, matched by created_by_email). Users = scoring jobs +
  // scored profiles; Events = events. Default "all". Enforced for role-based
  // admins; super-admins/env-admins always see all. See src/lib/role-scope.ts.
  usersScope: text("users_scope").notNull().default("all"),
  eventsScope: text("events_scope").notNull().default("all"),
  grants: jsonb("grants").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  // Cost multiplier (≥1, default 10): every cost shown to (and, later, charged
  // to) this role is multiplied by it. Super-admins/env-admins see ×1.
  costMultiplier: integer("cost_multiplier").notNull().default(10),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  nameUnique: uniqueIndex("admin_roles_name_unique").on(t.name),
}));

// Runtime-grantable admin access. One row per Clerk user who has requested or
// been granted admin. status: "pending" (requested, awaiting a decision) |
// "approved" (is an admin) | "denied" (declined; may request again). Keyed on
// clerk_user_id — the authenticated identity, so a grant can't be spoofed.
export const adminAccess = pgTable(
  "admin_access",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    email: text("email"),
    name: text("name"),
    imageUrl: text("image_url"),
    status: text("status").notNull().default("pending"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedByEmail: text("decided_by_email"),
    // Phase 2: the role assigned when this user was approved (null = full admin,
    // backward-compatible for rows approved before roles existed).
    roleId: uuid("role_id").references((): AnyPgColumn => adminRoles.id),
  },
  (t) => ({
    clerkUserIdUnique: uniqueIndex("admin_access_clerk_user_id_unique").on(t.clerkUserId),
  }),
);

// Email-based admin invitations. A super-admin (or anyone with the
// invite_admins grant) creates an invite by entering an email + role,
// which generates a single-use secret token, stores this row, and
// sends an email with /admin/accept-invite?token=<token>. The recipient
// clicks the link; the redeem endpoint validates that their signed-in
// Clerk session has the invited email VERIFIED (case-insensitive match
// against verifiedEmails(currentUser)), then creates/updates the
// admin_access row to status="approved" with the role assigned.
//
// Tokens are one-time-use and expire after 14 days. A redeemed row keeps
// the redeemed_at + redeemed_by_clerk_user_id timestamps for audit.
export const adminInvites = pgTable(
  "admin_invites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Lowercased email the invite is addressed to. The redeem flow compares
    // case-insensitively against the recipient's verified Clerk emails.
    email: text("email").notNull(),
    // null = full admin (matches the existing admin_access convention).
    roleId: uuid("role_id").references((): AnyPgColumn => adminRoles.id),
    // Audit: who sent the invite.
    invitedByEmail: text("invited_by_email").notNull(),
    invitedByClerkUserId: text("invited_by_clerk_user_id").notNull(),
    // The single-use secret. 32 random bytes base64url-encoded by the API
    // route → 43-char URL-safe string. Unique-indexed.
    token: text("token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    // Set on successful redeem. Once non-null the token can't be used again.
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    redeemedByClerkUserId: text("redeemed_by_clerk_user_id"),
  },
  (t) => ({
    tokenUnique: uniqueIndex("admin_invites_token_unique").on(t.token),
    emailIdx: index("admin_invites_email_idx").on(t.email),
  }),
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Owner of the key — a Clerk user id (the developer).
    clerkUserId: text("clerk_user_id").notNull(),
    // SHA-256 hash of the raw key. The raw key is shown to the user exactly
    // once at creation and never stored.
    keyHash: text("key_hash").notNull(),
    // Brand prefix + first 4 random chars (e.g. "sk_festival_live_ab12") for display.
    keyPrefix: text("key_prefix").notNull(),
    label: text("label"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => ({
    keyHashUnique: uniqueIndex("api_keys_key_hash_unique").on(t.keyHash),
    ownerIdx: index("api_keys_clerk_user_id_idx").on(t.clerkUserId),
  }),
);

// One row per (Clerk user, lifecycle-email kind) — written only after a
// successful send (or a deliberate skip). The unique index makes the cron sweep
// idempotent: a failed send leaves no row and is retried next run.
export const sentEmails = pgTable(
  "sent_emails",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    // 'claim_welcome' | 'dev_api_welcome'
    kind: text("kind").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userKindUnique: uniqueIndex("sent_emails_user_kind_unique").on(t.clerkUserId, t.kind),
  }),
);

export const creditBalances = pgTable("credit_balances", {
  // One row per developer (Clerk user id). Source of truth for the atomic check.
  clerkUserId: text("clerk_user_id").primaryKey(),
  balanceCents: integer("balance_cents").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    // + for topup/refund, - for score_debit.
    deltaCents: integer("delta_cents").notNull(),
    // 'topup' | 'score_debit' | 'refund'
    reason: text("reason").notNull(),
    // set on score_debit (linked after the eval is created) / refund.
    evaluationId: uuid("evaluation_id"),
    // set on topup; also the idempotency key for the webhook.
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    balanceAfterCents: integer("balance_after_cents").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ownerIdx: index("credit_ledger_clerk_user_id_idx").on(t.clerkUserId),
    // UNIQUE on payment_intent — the idempotency gate for top-ups. Postgres
    // treats NULLs as distinct, so the many score_debit/refund rows (NULL
    // payment_intent) coexist freely; only real payment intents are deduped.
    piUnique: uniqueIndex("credit_ledger_payment_intent_unique").on(t.stripePaymentIntentId),
  }),
);

// Small key-value store for computed/cached app metrics, read by admin pages and
// the developer API. Currently holds: "avg_cost_cents" = mean cost-to-score
// across all real (source="url") profiles with a recorded cost, refreshed after
// every score write. `value` is a double so fractional cents (e.g. 40.27) survive.
export const appStats = pgTable("app_stats", {
  key: text("key").primaryKey(),
  value: doublePrecision("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Immutable history of scoring runs. One row is written every time a profile is
// actually (re)computed — by runEval (first score / bulk cron) and reEvaluate
// (re-score). Cached hits write nothing. Because reEvaluate UPDATEs the
// evaluations row in place, this table is the ONLY record of how a person's
// score changed over time. Scalar columns drive the Scoring Log table view;
// `snapshot` carries everything else needed to rebuild the Score Detail modal
// for a historical run. Rows are never edited (a run is a point-in-time fact),
// so later admin edits to score_items don't rewrite history.
export const scoringRuns = pgTable(
  "scoring_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    evaluationId: uuid("evaluation_id")
      .notNull()
      .references(() => evaluations.id, { onDelete: "cascade" }),
    founderScore: integer("founder_score").notNull(),
    investorScore: integer("investor_score").notNull(),
    // combined = founder + investor, mirrored from the evaluation at run time.
    score: integer("score").notNull(),
    signalQuality: text("signal_quality").notNull(),
    companyStage: text("company_stage"),
    source: text("source").notNull(),
    sourceCode: text("source_code"),
    // Scoring model id when known (null on backfilled rows — the original
    // model wasn't recorded on the evaluation).
    model: text("model"),
    costTotalCents: integer("cost_total_cents"),
    // Everything Score Detail needs that isn't a scalar column above:
    // { linkedinUrl, breakdown: { founder, investor }, recommendations,
    //   exaGrounding, profile }. Captured as-scored, never mutated.
    snapshot: jsonb("snapshot")
      .$type<{
        linkedinUrl: string;
        breakdown: {
          founder: Array<{ points: number; reason: string }>;
          investor: Array<{ points: number; reason: string }>;
        };
        recommendations: unknown;
        exaGrounding: unknown;
        profile: unknown;
        // Eval-row scoring fields not inside `profile` (investor facets, pricing,
        // cost cents, summary metadata, subject location, slug). Lets a historical
        // run rebuild the full verbose Score Detail. Optional on older snapshots.
        meta?: Record<string, unknown>;
      }>()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    // Scoring Log query: rows for one eval, newest first.
    evalCreatedIdx: index("scoring_runs_eval_created_idx").on(
      t.evaluationId,
      t.createdAt.desc(),
    ),
  }),
);

// Append-only audit trail for the super-admin API surface (native app + any
// bearer-token admin call). One row per authorized super-admin API action AND
// per denied attempt, so there's accountability for a powerful surface that can
// delete profiles, re-score everyone, and manage admins. Writes are best-effort
// (see logAdminAction in src/lib/admin-api.ts) — a logging failure must never
// fail the underlying request, so the API stays up even if this table is absent.
export const adminAuditLog = pgTable(
  "admin_audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Clerk user id of the caller (resolved from the bearer session token or the
    // web cookie). Present even on denied attempts when the caller was at least
    // authenticated.
    clerkUserId: text("clerk_user_id"),
    email: text("email"),
    method: text("method").notNull(),
    path: text("path").notNull(),
    // HTTP status the request resolved to (200, 401, 403, …).
    status: integer("status").notNull(),
    // How the caller authenticated: "bearer" (native app / API) | "cookie" (web)
    // | "unknown".
    tokenType: text("token_type").notNull().default("unknown"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    // Free-form action context (e.g. { action: "delete_profile", evalId }).
    meta: jsonb("meta").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    // "What did this admin do lately?" and the global audit feed, newest first.
    userCreatedIdx: index("admin_audit_log_user_created_idx").on(
      t.clerkUserId,
      t.createdAt.desc(),
    ),
    createdIdx: index("admin_audit_log_created_idx").on(t.createdAt.desc()),
  }),
);

// ── Kids & Family ────────────────────────────────────────────────────────────
// A claimed profile (evaluation) can add family members (kids, partner, etc.).
// Captured in the account's Kids & Family section; used later to build
// family-oriented events. Owned by the evaluation (the claimed profile), so it
// cascades with account/profile deletion.
export const familyMembers = pgTable(
  "family_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    evaluationId: uuid("evaluation_id")
      .notNull()
      .references(() => evaluations.id, { onDelete: "cascade" }),
    // daughter | son | child | partner | spouse | family-member | other
    relationship: text("relationship").notNull(),
    // Free-text relationship label when relationship = "other".
    relationshipOther: text("relationship_other"),
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    // Birthdate (age is computed from it so it never goes stale). Optional.
    birthdate: date("birthdate"),
    // Free-text interest tags; the suggestion pool is DISTINCT across all rows.
    interests: text("interests").array().$type<string[]>().default(sql`'{}'::text[]`).notNull(),
    // Vercel Blob URL for the photo (public bucket + random suffix), but only
    // ever served to authorized viewers through an auth-gated route that streams
    // the bytes — the raw URL is never sent to the client.
    photoUrl: text("photo_url"),
    // "all_claimed" = any claimed user may see it; "specific" = only the
    // evaluations listed in family_member_viewers (empty = private to owner).
    visibility: text("visibility").notNull().default("specific"),
    // Public disclosure on the OWNER's profile (independent of `visibility`,
    // which gates the full record). "none" (default, hidden) | "age_relationship"
    // ("12 year old daughter") | "relationship" ("Daughter") | "generic" ("Child").
    // Only the chosen label is ever exposed publicly — never name/photo/birthdate.
    publicShare: text("public_share").notNull().default("none"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    evalIdx: index("family_members_evaluation_id_idx").on(t.evaluationId),
  }),
);

// Allow-list of claimed profiles that may view a "specific"-visibility family
// member. (No rows + visibility="all_claimed" → visible to all claimed users.)
export const familyMemberViewers = pgTable(
  "family_member_viewers",
  {
    familyMemberId: uuid("family_member_id")
      .notNull()
      .references(() => familyMembers.id, { onDelete: "cascade" }),
    viewerEvaluationId: uuid("viewer_evaluation_id")
      .notNull()
      .references(() => evaluations.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.familyMemberId, t.viewerEvaluationId] }),
    viewerIdx: index("family_member_viewers_viewer_idx").on(t.viewerEvaluationId),
  }),
);

// ── Member Endorsements (vouching) ───────────────────────────────────────────
// One claimed member (`from`) endorses anyone (`evaluationId`, claimed or not)
// with a free-text testimonial, a 3-way visibility, and an allocation of their
// Festival-score "Profile points". Points visibility can't exceed the
// endorsement's. One row per (endorser, endorsee). See
// docs/superpowers/specs/2026-06-10-member-vouching-design.md.
export const endorsements = pgTable(
  "endorsements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Who is being endorsed (may be an unclaimed profile).
    evaluationId: uuid("evaluation_id")
      .notNull()
      .references(() => evaluations.id, { onDelete: "cascade" }),
    // The endorser — must be a claimed member at write time.
    fromEvaluationId: uuid("from_evaluation_id")
      .notNull()
      .references(() => evaluations.id, { onDelete: "cascade" }),
    fromClerkUserId: text("from_clerk_user_id").notNull(),
    // Plain text + @[Name](evalId) mention markers, rendered client-side.
    body: text("body").notNull(),
    // public | members_only | private
    visibility: text("visibility").notNull().default("public"),
    points: integer("points").notNull().default(0),
    // Visibility of the points number; clamped ≤ `visibility`.
    pointsVisibility: text("points_visibility").notNull().default("public"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    toIdx: index("endorsements_evaluation_id_idx").on(t.evaluationId),
    fromIdx: index("endorsements_from_evaluation_id_idx").on(t.fromEvaluationId),
    fromToUnique: uniqueIndex("endorsements_from_to_unique").on(t.fromEvaluationId, t.evaluationId),
  }),
);

// Co-signs: a claimed member adds points to someone else's endorsement
// ("Upvote this endorsement"). The endorsement's total = the author's own
// points + the sum of these. One contribution per (endorsement, member).
export const endorsementContributions = pgTable(
  "endorsement_contributions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    endorsementId: uuid("endorsement_id")
      .notNull()
      .references(() => endorsements.id, { onDelete: "cascade" }),
    fromEvaluationId: uuid("from_evaluation_id")
      .notNull()
      .references(() => evaluations.id, { onDelete: "cascade" }),
    fromClerkUserId: text("from_clerk_user_id").notNull(),
    points: integer("points").notNull().default(0),
    visibility: text("visibility").notNull().default("public"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    endorsementIdx: index("endorsement_contributions_endorsement_id_idx").on(t.endorsementId),
    fromIdx: index("endorsement_contributions_from_evaluation_id_idx").on(t.fromEvaluationId),
    uniquePair: uniqueIndex("endorsement_contributions_unique").on(t.endorsementId, t.fromEvaluationId),
  }),
);

// ── Event Chat (forum on event pages) ────────────────────────────────────────
// Threads + nested comments + upvotes, gated by a per-thread visibility level
// (public | members | attendees). Comments inherit the thread's visibility.
// See docs/superpowers/specs/2026-06-09-event-chat-design.md.
export const eventChatThreads = pgTable(
  "event_chat_threads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    // The claimed member who posted (their evaluation = their profile).
    authorEvalId: uuid("author_eval_id").notNull().references(() => evaluations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    // Plain text + @[Name](evalId) mention markers. Rendered client-side.
    body: text("body").notNull(),
    // "public" | "members" | "attendees" — see canViewChat in event-chat-shared.ts.
    visibility: text("visibility").notNull().default("members"),
    mentionedEvalIds: jsonb("mentioned_eval_ids").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    eventCreatedIdx: index("event_chat_threads_event_created_idx").on(t.eventId, t.createdAt.desc()),
  }),
);

export const eventChatComments = pgTable(
  "event_chat_comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    threadId: uuid("thread_id").notNull().references(() => eventChatThreads.id, { onDelete: "cascade" }),
    // HN-style nesting; null = top-level reply on the thread.
    parentCommentId: uuid("parent_comment_id").references((): AnyPgColumn => eventChatComments.id, {
      onDelete: "cascade",
    }),
    authorEvalId: uuid("author_eval_id").notNull().references(() => evaluations.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    mentionedEvalIds: jsonb("mentioned_eval_ids").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    threadIdx: index("event_chat_comments_thread_idx").on(t.threadId, t.createdAt),
    parentIdx: index("event_chat_comments_parent_idx").on(t.parentCommentId),
  }),
);

// Upvotes on threads AND comments. One per member per item (the unique index).
// Score of a target = count of its vote rows.
export const eventChatVotes = pgTable(
  "event_chat_votes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    targetType: text("target_type").notNull(), // "thread" | "comment"
    targetId: uuid("target_id").notNull(),
    voterEvalId: uuid("voter_eval_id").notNull().references(() => evaluations.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    oneVote: uniqueIndex("event_chat_votes_unique").on(t.targetType, t.targetId, t.voterEvalId),
  }),
);

// ── Claim Review Console: Email-User threads ────────────────────────────────
// When an admin emails a user about a specific pending owner-edit (a score_item),
// we open a thread keyed to that score_item. The thread carries a short, human
// `request_number` (the "#12345" surfaced in the email subject as
// "RE: Your requested profile update (Request #12345)"). Inbound replies are
// matched back to the thread by parsing that number out of the reply subject.
// One thread per score_item (created lazily on first outbound email).
export const claimThreads = pgTable(
  "claim_threads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    scoreItemId: uuid("score_item_id")
      .notNull()
      .references(() => scoreItems.id, { onDelete: "cascade" }),
    evaluationId: uuid("evaluation_id")
      .notNull()
      .references(() => evaluations.id, { onDelete: "cascade" }),
    // The number shown to the user in the subject line. A serial keeps it short
    // and stable; the sequence is bumped to start at 10000 in the migration so
    // early threads don't read as "#1".
    requestNumber: serial("request_number").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    oneThreadPerItem: uniqueIndex("claim_threads_score_item_unique").on(t.scoreItemId),
    requestNumberIdx: uniqueIndex("claim_threads_request_number_unique").on(t.requestNumber),
  }),
);

// Every message in a claim thread — outbound (admin → user) and inbound
// (user → us, captured by the Resend Inbound webhook). Rendered newest-last in
// the claim area so the admin sees the full back-and-forth.
export const claimMessages = pgTable(
  "claim_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => claimThreads.id, { onDelete: "cascade" }),
    // "outbound" (admin → user) | "inbound" (user reply via webhook)
    direction: text("direction").notNull(),
    fromEmail: text("from_email").notNull(),
    toEmail: text("to_email").notNull(),
    subject: text("subject").notNull(),
    // Plain-text body (inbound: the parsed reply text; outbound: what the admin typed).
    body: text("body").notNull(),
    // Inbound idempotency: the webhook provider's event id (Svix `svix-id`).
    // Svix/Resend deliver at-least-once, so a redelivered reply must not append a
    // duplicate message — a unique index drops the second insert. Null for
    // outbound (Postgres unique indexes permit multiple NULLs).
    providerEventId: text("provider_event_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    threadIdx: index("claim_messages_thread_idx").on(t.threadId, t.createdAt),
    providerEventUnique: uniqueIndex("claim_messages_provider_event_unique").on(t.providerEventId),
  }),
);

// ── Changelog ────────────────────────────────────────────────────────────────
// Public-facing, human-curated record of what shipped. Entries are generated
// from git history by scripts/build-changelog.ts (LLM-curated, with PII and
// specific point-values redacted) and rendered on /changelog. Idempotent on
// commit_sha so re-running the sync never duplicates.
export const changelogEntries = pgTable(
  "changelog_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Stable, URL-safe anchor for deep-linking (email → /changelog#<slug>).
    slug: text("slug").notNull(),
    // When it shipped (commit date). Drives the timeline order.
    shippedAt: timestamp("shipped_at", { withTimezone: true }).notNull(),
    title: text("title").notNull(),
    // 1-2 sentence "why we shipped this" (the expanded view).
    summary: text("summary").notNull(),
    // Optional specifics — NO PII, NO specific point values.
    bullets: jsonb("bullets").$type<string[]>().default([]).notNull(),
    // "feature" | "enhancement" | "bug_fix"
    changeType: text("change_type").notNull(),
    // e.g. ["scoring_rubric","leaderboard"] — see CHANGELOG_CATEGORIES.
    categories: jsonb("categories").$type<string[]>().default([]).notNull(),
    // The commit (or merge) this entry summarizes — idempotency key.
    commitSha: text("commit_sha"),
    // Whether a notification email has already gone out for this entry (so the
    // sync can email only NEW entries, never the historical backfill).
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    slugUnique: uniqueIndex("changelog_entries_slug_unique").on(t.slug),
    shaUnique: uniqueIndex("changelog_entries_commit_sha_unique").on(t.commitSha),
    shippedIdx: index("changelog_entries_shipped_at_idx").on(t.shippedAt),
  }),
);

// Lightweight changelog subscribers. A Clerk account is all that's required —
// they do NOT need to claim a profile. We store the Clerk user + email so new
// entries can be emailed (Resend). unsubscribed_at set = opted out.
export const changelogSubscribers = pgTable(
  "changelog_subscribers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    email: text("email").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
  },
  (t) => ({
    clerkUnique: uniqueIndex("changelog_subscribers_clerk_user_id_unique").on(t.clerkUserId),
  }),
);

// ── Org badges (custom badges owned by a host or sponsor) ────────────────────
// Admin-defined badges (e.g., "District Member" on the District host), separate
// from the auto-computed achievement pills. Applied to a profile via a
// badge_overrides row with badgeId = "org:<this id>". See
// docs/superpowers/specs/2026-06-09-org-badges-design.md.
export const orgBadges = pgTable(
  "org_badges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerType: text("owner_type").notNull(), // "host" | "sponsor"
    ownerId: uuid("owner_id").notNull(),
    label: text("label").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ownerIdx: index("org_badges_owner_idx").on(t.ownerType, t.ownerId),
  }),
);

// Which hosts/sponsors an admin (clerk user) may apply badges for. Super-admins
// bypass this (they can apply every org badge). See authorizedOrgBadges().
export const adminOrgAssignments = pgTable(
  "admin_org_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    ownerType: text("owner_type").notNull(), // "host" | "sponsor"
    ownerId: uuid("owner_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    adminOrgUnique: uniqueIndex("admin_org_assignments_unique").on(t.clerkUserId, t.ownerType, t.ownerId),
    adminIdx: index("admin_org_assignments_admin_idx").on(t.clerkUserId),
  }),
);

// ── Docs section (/docs) ──────────────────────────────────────────────────────
// Public markdown documentation pages. body_md is the live source of truth
// (seeded from content/docs/*.md, then editable inline by super-admins). See
// docs/superpowers/specs/2026-06-12-docs-section-design.md.
export const docPages = pgTable(
  "doc_pages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(), // 'quickstart' | 'profiles' | 'leaderboard' | 'account' | 'events'
    title: text("title").notNull(),
    emoji: text("emoji").notNull().default(""),
    navOrder: integer("nav_order").notNull().default(0),
    bodyMd: text("body_md").notNull().default(""),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    updatedBy: text("updated_by").notNull().default("seed"), // clerk user id, 'seed', or 'suggestion'
  },
  (t) => ({
    slugUnique: uniqueIndex("doc_pages_slug_unique").on(t.slug),
  }),
);

// Ship-time LLM-proposed edits to a doc page, pending super-admin review.
export const docPageSuggestions = pgTable(
  "doc_page_suggestions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    proposedMd: text("proposed_md").notNull(),
    rationale: text("rationale").notNull().default(""),
    sourceCommit: text("source_commit").notNull(),
    status: text("status").notNull().default("pending"), // 'pending' | 'published' | 'discarded'
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => ({
    slugStatusIdx: index("doc_page_suggestions_slug_status_idx").on(t.slug, t.status),
    slugCommitUnique: uniqueIndex("doc_page_suggestions_slug_commit_unique").on(t.slug, t.sourceCommit),
  }),
);

// ── Support tickets ───────────────────────────────────────────────────────────
// Filed from /docs/support by claimed users; answered in-app with Resend email
// pings both directions (no inbound MX dependency).
export const supportTickets = pgTable(
  "support_tickets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    evaluationId: uuid("evaluation_id").notNull(), // the claimed filer
    clerkUserId: text("clerk_user_id"),
    email: text("email"), // filer email at creation (for notifications)
    subject: text("subject").notNull().default("Support request"),
    status: text("status").notNull().default("open"), // 'open' | 'closed'
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    evalIdx: index("support_tickets_eval_idx").on(t.evaluationId),
    statusIdx: index("support_tickets_status_updated_idx").on(t.status, t.updatedAt),
  }),
);

export const supportTicketMessages = pgTable(
  "support_ticket_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ticketId: uuid("ticket_id").notNull(),
    authorType: text("author_type").notNull(), // 'user' | 'admin'
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ticketIdx: index("support_ticket_messages_ticket_idx").on(t.ticketId, t.createdAt),
  }),
);

// Global key/value app settings (super-admin editable). Currently holds the
// editable email signature ("Email options"). One row per key.
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// One row per admin-composed email/text SEND (a "blast"). Stores the raw pill
// templates (subject/body with {{var}} markers) + the chosen from-address and
// recipients count, so the admin "past communications" table reads one row per
// send ("12 attendees · email · <date>") and a send can be re-previewed/audited.
// Per-recipient rendered copies live in member_messages (below).
export const messageCampaigns = pgTable(
  "message_campaigns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    createdByClerkUserId: text("created_by_clerk_user_id").notNull(),
    // "email" | "text" | "both" (text path stubbed for now).
    channel: text("channel").notNull().default("email"),
    fromAddress: text("from_address").notNull(),
    subjectTemplate: text("subject_template").notNull(),
    bodyTemplate: text("body_template").notNull(),
    // The signature text captured at compose time (may be edited per-send).
    signatureText: text("signature_text"),
    // Optional BCC for the send — a normalized, comma-joined list of addresses
    // (operator-typed). Copied on EVERY per-recipient send, so the BCC inbox
    // receives one message per recipient (a full audit trail). null = no BCC.
    bccAddress: text("bcc_address"),
    // Snapshot of WHO to send to, resolved at compose time (so a scheduled send
    // goes to exactly who was selected even if the attendee list later changes).
    // Event + personalized-learnings values are re-resolved at send time.
    recipients: jsonb("recipients")
      .$type<
        Array<{
          toEmail: string;
          clerkUserId: string | null;
          evaluationId: string | null;
          fullName: string | null;
          nickname: string | null;
          profileHref: string | null;
          companyName: string | null;
        }>
      >()
      .notNull()
      .default(sql`'[]'::jsonb`),
    recipientCount: integer("recipient_count").notNull().default(0),
    // null = send now; set = scheduled. Drained by the event-email cron.
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    // "scheduled" | "sending" | "sent" | "failed"
    status: text("status").notNull().default("scheduled"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    eventCreatedIdx: index("message_campaigns_event_created_idx").on(t.eventId, t.createdAt.desc()),
    // Due-scheduled lookup for the cron.
    statusScheduledIdx: index("message_campaigns_status_scheduled_idx").on(t.status, t.scheduledFor),
  }),
);

// One row per RECIPIENT per member-facing email — the rendered copy. Powers the
// /account "Messages" inbox AND the campaign drill-down. Written best-effort for
// the new event blasts AND (going forward) the existing member emails
// (connection requests/intros, event approvals, endorsements, chat mentions) so
// the inbox isn't only blasts. A logging failure never blocks the actual send.
export const memberMessages = pgTable(
  "member_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // null for system emails not tied to a composed blast.
    campaignId: uuid("campaign_id").references(() => messageCampaigns.id, { onDelete: "set null" }),
    // Recipient identity — clerkUserId when claimed, else just the email.
    clerkUserId: text("clerk_user_id"),
    toEvaluationId: uuid("to_evaluation_id").references(() => evaluations.id, { onDelete: "set null" }),
    toEmail: text("to_email").notNull(),
    fromAddress: text("from_address").notNull(),
    // e.g. "event_blast" | "connection_request" | "connection_intro" |
    // "event_approved" | "event_waitlist" | "endorsement" | "event_chat_mention".
    type: text("type").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    // The "pertaining to" pill on /account → /events/<slug>. Nullable.
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userSentIdx: index("member_messages_user_sent_idx").on(t.clerkUserId, t.sentAt.desc()),
    evalSentIdx: index("member_messages_eval_sent_idx").on(t.toEvaluationId, t.sentAt.desc()),
    campaignIdx: index("member_messages_campaign_idx").on(t.campaignId),
  }),
);

// One Chief "Deep Intelligence" dossier per profile. Created by an admin today
// (and, in future, a paid self-serve "Run Now" on the profile). Stores the public
// Chief share link (https://chief.bot/shared/chat/<token>) plus provenance — the
// underlying chat/message ids, the per-search credit cost, the model/intelligence
// tier — and the full raw markdown so we can re-render or parse blocks later.
// One row per evaluation (the share link is what the profile box renders).
export const profileDossiers = pgTable("profile_dossiers", {
  evaluationId: uuid("evaluation_id")
    .primaryKey()
    .references(() => evaluations.id, { onDelete: "cascade" }),
  // Chief identifiers for the underlying research chat.
  chatId: text("chat_id"),
  messageId: text("message_id"),
  // The public, unguessable share link rendered on the profile.
  shareUrl: text("share_url"),
  // "ready" | "running" | "failed" — the box shows "View" only when ready.
  status: text("status").notNull().default("ready"),
  // Per-search Chief credits (ingress + egress = total), captured at run time.
  totalCredits: integer("total_credits"),
  model: text("model"),
  intelligence: text("intelligence"),
  // Full markdown report (for re-render / future per-block parsing).
  rawMarkdown: text("raw_markdown"),
  // Clerk id of the buyer who ran (and was charged for) this dossier. The sweep
  // cron uses it to refund the right person if generation fails.
  buyerClerkUserId: text("buyer_clerk_user_id"),
  // Failure reason when status = "failed" (e.g. Chief timeout). Null otherwise.
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
