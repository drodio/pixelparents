import { createHash } from "node:crypto";
import { db } from "@/db";
import { badgeOverrides, evaluations, events as eventsTable, recommendationResponses, recommendationVisibility, scoreItems, users } from "@/db/schema";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { auth, currentUser } from "@clerk/nextjs/server";
import { isAdmin, isSuperAdmin } from "@/lib/admin";
import { canonicalProfileUrl } from "@/lib/canonical-profile-url";
import { ProfileSocialCard, type SocialCardData } from "@/components/ProfileSocialCard";
import { deriveEvalStatus } from "@/lib/eval-pipeline";
import { isOwningConfidence } from "@/lib/identity-match";
import { ScoreTable } from "@/components/ScoreTable";
import { CombinedScoreModal } from "@/components/CombinedScoreModal";
import { ReScoreButton } from "@/components/ReScoreButton";
import { Recommendations } from "@/components/Recommendations";
import { ScoringLogButton } from "@/components/ScoringLogButton";
import { NeoEndorsements } from "@/components/NeoEndorsements";
import { AdminProfileBox } from "@/components/AdminProfileBox";
import { ManualHintButton } from "@/components/ManualHintButton";
import { EventsCTA } from "@/components/EventsCTA";
import { ClaimSuccessBanner } from "@/components/ClaimSuccessBanner";
import { AppliedBanner } from "@/components/events/AppliedBanner";
import { MismatchOverlayController } from "@/components/MismatchOverlay";
import { Avatar } from "@/components/Avatar";
import { AdminProfileActions } from "@/components/AdminProfileActions";
import { LowSignalProfile } from "@/components/LowSignalProfile";
import { StatusMarker } from "@/components/FounderStatusMarker";
import { humanizeLinkedinHandle } from "@/lib/display-name";
import { EditNameButton } from "@/components/EditNameButton";
import { EditCredibilityTitle } from "@/components/EditCredibilityTitle";
import { UnclaimedNotice } from "@/components/UnclaimedNotice";
import { VerifyToOwnBanner } from "@/components/VerifyToOwnBanner";
import { LocationLine } from "@/components/LocationLine";
import { SiteHeaderNav } from "@/components/SiteHeaderNav";
import { getCurrentViewerContext } from "@/lib/current-viewer";
import { computePercentilesAll, ordinal } from "@/lib/leaderboard";
import { getTkmxBadge } from "@/lib/tkmx-badge";
import { getProfileDossier, isDossierViewable } from "@/lib/profile-dossier";
import { ProfileDossierBox } from "@/components/ProfileDossierBox";
import { buildProfileMetadata } from "@/lib/profile-metadata";
import { isUuid } from "@/lib/canonicalize";
import { computeBadges } from "@/lib/badges";
import { Badges } from "@/components/Badges";
import { CollapsibleRow } from "@/components/CollapsibleRow";
import { getPublicFamilyBadges } from "@/lib/family";
import { CredibilityRadarSection } from "@/components/CredibilityRadarSection";
import { MemberEndorsements } from "@/components/MemberEndorsements";
import { renderMentions } from "@/lib/event-chat-shared";
import {
  getViewerPointsBudget,
  listEndorsementsForProfile,
  listEndorsementsByMember,
  type EndorsementView,
  type PointsBudget,
} from "@/lib/endorsements";
import { getCredibilityRadars } from "@/lib/credibility";
import { FounderMatrix } from "@/components/FounderMatrix";
import { computeMatrix, getMatrixCandidates } from "@/lib/founder-matrix";
import type { ExtractedMetrics } from "@/lib/scoring";

type ProfileShape = {
  fullName?: string;
  primaryCompanyDomain?: string | null;
  extractedMetrics?: Partial<ExtractedMetrics> | null;
  mmHits?: Array<{ domain: string; rank: number }>;
};

type PageProps = {
  searchParams: Promise<{
    e?: string;
    claimed?: string;
    claim_failed?: string;
    claim_mismatch?: string;
    // Event-apply confirmation: the apply flow redirects success to /welcome
    // with ?applied=<event-slug>, which forwards here. Renders AppliedBanner.
    applied?: string;
    // Internal: set by the /profile/[handle][/slug] dynamic routes when they
    // synthesize an `e` param and re-invoke this page as a function. Tells us
    // NOT to redirect to the canonical URL (we're already at it). Direct
    // /profile?e=<uuid> hits don't have this flag and DO get redirected.
    _canonical?: string;
    // Super-admin debug: open the Score Detail modal on load (from the
    // /admin/profiles "Score Detail" link).
    debug?: string;
  }>;
};

// Per-eval Open Graph metadata so shared links show
// "Founder Festival: <Name>'s Profile" with a generated image of the
// score, instead of the generic site title. Implementation lives in
// buildProfileMetadata so the username + kind/slug routes can share it.
export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const { e } = await searchParams;
  if (!e || !isUuid(e)) return {};
  return buildProfileMetadata(e);
}

type Row = { points: number; reason: string };
type BreakdownShape = { founder?: Row[]; investor?: Row[] } | Row[] | null;

// Per-row shape passed into ScoreTable once we read from score_items rather
// than the legacy JSON. Includes id/status/confidence/source so the table can
// render the confidence circle, owner action buttons, and strike-through.
type ScoreItemRow = {
  id: string;
  points: number;
  reason: string;
  source: "system" | "user";
  status: "likely" | "pending" | "confirmed" | "rejected";
  confidence: number;
  // Per-phrase citations emitted by the AI scorer. Each entry maps a
  // substring of `reason` to the URL(s) backing it. Renders as subtle
  // gold-underlined phrases on the score breakdown. Empty array for rows
  // scored before this feature shipped (graceful degradation: plain text).
  citations: Array<{ phrase: string; sources: string[] }>;
};

// Deterministic primary key for a backfilled seed row, derived from its
// natural identity (eval + rubric + position). Two concurrent first-loads
// compute identical ids for identical seeds, so the second insert collides on
// the PK and is dropped by onConflictDoNothing — giving us race-safe backfill
// without an interactive transaction (which the Neon HTTP driver can't do).
// Postgres validates uuid *format*, not version bits, so any 8-4-4-4-12 hex
// string is a valid uuid.
function seedItemId(evaluationId: string, rubric: string, sortOrder: number): string {
  const h = createHash("sha256")
    .update(`score-item:${evaluationId}:${rubric}:${sortOrder}`)
    .digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

// One-time backfill: if this eval has no score_items rows but the legacy
// breakdown JSON is populated, materialize the rows so the new ScoreTable can
// own them. Idempotent — second call finds the rows and no-ops. Returns the
// rows in display order (founder first, then investor, each sorted by
// sortOrder).
async function loadScoreItems(
  evaluationId: string,
  legacyBreakdown: { founder: Row[]; investor: Row[] },
): Promise<{ founder: ScoreItemRow[]; investor: ScoreItemRow[] }> {
  function toRow(r: typeof scoreItems.$inferSelect): ScoreItemRow & { rubric: string } {
    return {
      id: r.id,
      points: r.points,
      reason: r.reason,
      source: r.source as ScoreItemRow["source"],
      status: r.status as ScoreItemRow["status"],
      confidence: r.confidence,
      rubric: r.rubric,
      citations: r.citations ?? [],
    };
  }
  // Concurrent page loads can race the backfill, so we wrap the seed step
  // in a Postgres advisory transaction-lock keyed off the eval id. The lock
  // is auto-released at transaction end; subsequent reads see the inserted
  // rows and skip the seed branch.
  const existing = (
    await db
      .select()
      .from(scoreItems)
      .where(eq(scoreItems.evaluationId, evaluationId))
      .orderBy(desc(scoreItems.confidence), asc(scoreItems.sortOrder))
  ).map(toRow);
  if (existing.length > 0) {
    return {
      founder: existing.filter((r) => r.rubric === "founder"),
      investor: existing.filter((r) => r.rubric === "investor"),
    };
  }
  const seeds = [
    ...legacyBreakdown.founder.map((row, i) => ({
      id: seedItemId(evaluationId, "founder", i),
      evaluationId,
      rubric: "founder" as const,
      reason: row.reason,
      points: row.points,
      source: "system" as const,
      status: "likely" as const,
      confidence: 50,
      sortOrder: i,
    })),
    ...legacyBreakdown.investor.map((row, i) => ({
      id: seedItemId(evaluationId, "investor", i),
      evaluationId,
      rubric: "investor" as const,
      reason: row.reason,
      points: row.points,
      source: "system" as const,
      status: "likely" as const,
      confidence: 50,
      sortOrder: i,
    })),
  ];
  if (seeds.length === 0) return { founder: [], investor: [] };
  // Race-safe backfill without a transaction: the seeds carry deterministic
  // primary keys (seedItemId), so if a concurrent first-load already inserted
  // them, onConflictDoNothing drops our duplicates. We then re-read to return
  // whichever set won. The Neon HTTP driver has no interactive transactions,
  // so the previous advisory-lock approach threw on every render.
  await db.insert(scoreItems).values(seeds).onConflictDoNothing();
  const inserted = (
    await db
      .select()
      .from(scoreItems)
      .where(eq(scoreItems.evaluationId, evaluationId))
      .orderBy(desc(scoreItems.confidence), asc(scoreItems.sortOrder))
  ).map(toRow);
  return {
    founder: inserted.filter((r) => r.rubric === "founder"),
    investor: inserted.filter((r) => r.rubric === "investor"),
  };
}

type RecommendationsData = {
  summary: string;
  items: Array<{ id: string; text: string; category: string }>;
};

function splitBreakdown(b: BreakdownShape): { founder: Row[]; investor: Row[] } {
  if (Array.isArray(b)) return { founder: b, investor: [] };
  if (b && typeof b === "object") return { founder: b.founder ?? [], investor: b.investor ?? [] };
  return { founder: [], investor: [] };
}

export default async function WelcomePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const { e, claim_failed: claimFailed, applied } = sp;
  if (!e || !isUuid(e)) redirect("/");
  // Direct hits to /profile?e=<uuid> upgrade to the canonical vanity URL
  // (/profile/<username> or /profile/<kind>/<slug>) so shared links + the
  // address bar end up on the clean path. Dynamic routes pass _canonical=1
  // when delegating to this page, which suppresses the upgrade.
  if (!sp._canonical) {
    const canonical = await canonicalProfileUrl(e);
    if (canonical) {
      const extras = new URLSearchParams();
      for (const [k, v] of Object.entries(sp)) {
        if (k === "e" || k === "_canonical" || v == null) continue;
        if (Array.isArray(v)) v.forEach((x) => extras.append(k, x));
        else extras.append(k, v);
      }
      const tail = extras.toString();
      redirect(`${canonical}${tail ? `?${tail}` : ""}`);
    }
  }
  const [row] = await db.select().from(evaluations).where(eq(evaluations.id, e)).limit(1);
  if (!row) redirect("/");

  // Gate the Score Detail button to localhost OR the super-admin (drodio) so
  // it doesn't leak debug data on prod. The /admin/profiles "Score Detail" link
  // sends super-admins here with ?debug=1 to open it straight away. Computed
  // BEFORE the low-signal bounce so an admin can inspect low-signal profiles.
  const headersList = await headers();
  const host = (headersList.get("host") ?? "").toLowerCase();
  const isLocalhost = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  const superAdmin = await isSuperAdmin();
  const showScoreDetail = isLocalhost || superAdmin;
  const autoOpenScoreDetail = showScoreDetail && sp.debug === "1";

  // Low-signal evals render a claimable "not enough public data" view instead of
  // the score breakdown — but an admin opening Score Detail (?debug=1) needs to
  // see the profile + grounding here, so skip it in that case.
  if (
    deriveEvalStatus(row.score) === "low-signal" &&
    row.source === "url" &&
    !autoOpenScoreDetail
  ) {
    const { userId: lsClerkUserId } = await auth();
    let lsIsOwner = false;
    if (lsClerkUserId) {
      const [m] = await db
        .select({ conf: users.matchConfidence })
        .from(users)
        .where(and(eq(users.clerkUserId, lsClerkUserId), eq(users.evaluationId, row.id)))
        .limit(1);
      lsIsOwner = !!m && m.conf === "high";
    }
    const lsName =
      (row.fullName ?? "").trim() || humanizeLinkedinHandle(row.linkedinUrl) || "This founder";
    let lsAppliedTitle: string | null = null;
    if (applied) {
      const [evt] = await db
        .select({ title: eventsTable.title })
        .from(eventsTable)
        .where(eq(eventsTable.slug, applied))
        .limit(1);
      lsAppliedTitle = evt?.title ?? null;
    }
    return (
      <LowSignalProfile
        evaluationId={row.id}
        name={lsName}
        firstName={lsName.split(/\s+/)[0] || null}
        isOwner={lsIsOwner}
        appliedEventTitle={lsAppliedTitle}
      />
    );
  }

  const legacy = splitBreakdown(row.breakdown as BreakdownShape);
  // Credibility radar (FEAT-02): founder and/or investor, each shown only when
  // that dimension scored. Percentile-ranked against the scored population.
  const showFounderRadar = row.founderScore > 0;
  const showInvestorRadar = row.investorScore > 0;
  const showRadar = showFounderRadar || showInvestorRadar;

  // These reads are all independent and keyed only on `row`, so batch them into
  // a single round-trip group rather than a sequential await waterfall (each
  // await is a fresh neon-http TLS hop, so latency was stacking instead of
  // overlapping). getMatrixCandidates is gated on showRadar (== radars != null).
  const [scoreItemRows, radars, matrixCandidates, viewer, canonicalPath, overrideRows, familyBadges] =
    await Promise.all([
      loadScoreItems(row.id, legacy),
      showRadar ? getCredibilityRadars(row.breakdown) : Promise.resolve(null),
      showRadar ? getMatrixCandidates() : Promise.resolve(null),
      getCurrentViewerContext(),
      canonicalProfileUrl(row.id),
      db
        .select({
          badgeId: badgeOverrides.badgeId,
          status: badgeOverrides.status,
          editedLabel: badgeOverrides.editedLabel,
        })
        .from(badgeOverrides)
        .where(eq(badgeOverrides.evaluationId, row.id)),
      getPublicFamilyBadges(row.id),
    ]);
  // Relationship Matrix: peer-comparison pills shown just below the Credibility
  // section. Computed for each dimension the profile scored on so the component
  // can offer a Founder/Investor toggle; the dominant dimension shows first.
  // Skipped when this profile has no radar (low signal).
  const matrixDim: "founder" | "investor" =
    row.investorScore > row.founderScore ? "investor" : "founder";
  const buildMatrix = (dim: "founder" | "investor") => {
    if (!radars || !matrixCandidates) return null;
    const vec = (dim === "founder" ? radars.founder : radars.investor).map((v) => v.score);
    return vec.some((s) => s > 0)
      ? computeMatrix(row.id, vec, dim, matrixCandidates)
      : null;
  };
  const matrixFounder = showFounderRadar ? buildMatrix("founder") : null;
  const matrixInvestor = showInvestorRadar ? buildMatrix("investor") : null;
  const hasMatrix = !!matrixFounder || !!matrixInvestor;
  const recs = (row.recommendations ?? null) as RecommendationsData | null;
  // HN Tokenmaxxing standing (stored by the enricher) → gold badge next to the
  // leaderboard badge. null when the subject isn't a ranked tkmx member.
  const tkmxBadge = getTkmxBadge(row.profile);
  const profileBlob = (row.profile as ProfileShape | null) ?? null;
  const profileFullName = profileBlob?.fullName;
  const fullName = (row.fullName ?? profileFullName ?? "").trim() || null;
  // First name only — shared by ScoreTable, UnclaimedNotice, EventsCTA,
  // Recommendations to personalize the claim modal + CTA copy.
  const firstName = fullName?.split(/\s+/)[0] || null;

  // Event-apply confirmation: the apply flow lands here via /welcome with
  // ?applied=<slug>. Look up the event title for the gold banner; silently no
  // banner if the slug doesn't resolve. Mirrors /not-this-round.
  let appliedEventTitle: string | null = null;
  if (applied) {
    const [evt] = await db
      .select({ title: eventsTable.title })
      .from(eventsTable)
      .where(eq(eventsTable.slug, applied))
      .limit(1);
    appliedEventTitle = evt?.title ?? null;
  }

  // Determine if the current Clerk session owns this evaluation (claim flow
  // succeeded with high or medium identity match). Drives whether rating
  // clicks save directly or open the Claim Your Profile modal.
  const { userId: clerkUserId } = await auth();
  // `viewer` (site-nav context: the viewer's own profile URL + signed-in state)
  // is fetched in the batched Promise.all above.
  let isOwner = false;
  // True when the signed-in viewer has ANY claim row on this eval (any
  // confidence), even a name-only "medium" one. Used ONLY to stop nagging a
  // person to "Claim" a profile they already claimed — it does NOT grant the
  // owner-grade privileges (avatar/nickname/location), which stay gated to
  // "high" via isOwner / primaryClaim to prevent impersonation.
  let viewerHasClaim = false;
  // "Owner finished registering" = has both primary email AND primary phone in
  // Clerk. Until then, the dispute/modify link routes to /account/setup
  // rather than the dispute UI (which only opens once setup is complete).
  let ownerNeedsSetup = false;
  // True when the signed-in user is in ADMIN_EMAILS. Drives whether the
  // ScoreTable shows ✓/✏/✗ + an "Admin" pill on rows of profiles the viewer
  // doesn't own, and is the only path to resolve status='pending' rows.
  const isAdminViewer = clerkUserId ? await isAdmin() : false;
  if (clerkUserId) {
    const [match] = await db
      .select()
      .from(users)
      .where(
        and(eq(users.clerkUserId, clerkUserId), eq(users.evaluationId, row.id)),
      )
      .limit(1);
    viewerHasClaim = !!match;
    isOwner = !!match && isOwningConfidence(match.matchConfidence);
    if (isOwner) {
      const clerkUser = await currentUser().catch(() => null);
      ownerNeedsSetup =
        clerkUser != null &&
        (clerkUser.primaryEmailAddressId == null ||
          clerkUser.primaryPhoneNumberId == null);
    }
  }
  // True when the viewer is a claimed MEMBER — i.e. they've claimed THEIR OWN
  // profile (their own eval), regardless of which profile they're viewing. This
  // is distinct from viewerHasClaim ("claimed THIS profile"): a member viewing
  // someone else's profile is a member but not a claimer of that profile. Gates
  // the events-CTA hide + the Member Endorsements surface.
  const viewerIsMember = !!viewer.ownEvaluationId;

  // Single query, several outputs:
  //   - claimedImageUrl → renders the claimer's LinkedIn profile picture
  //     even when a stranger is viewing
  //   - isClaimedByAnyone → drives the amber "data may not be accurate"
  //     notice under the welcome line when nobody has claimed yet
  //   - nickname → claimed owner's chosen display name
  //   - city/region/country → location shown under the heading
  // Multiple claim rows can exist per eval (sign out + re-claim via
  // LinkedIn creates a new Clerk userId → new users row). Pick image and
  // nickname from the "primary" row (image present, most-recent verifiedAt)
  // but coalesce location across ALL claim rows — the owner may have edited
  // location on a different Clerk account that's also claimed this eval.
  const claimRows = await db
    .select({
      clerkImageUrl: users.clerkImageUrl,
      matchConfidence: users.matchConfidence,
      nickname: users.nickname,
      city: users.city,
      region: users.region,
      country: users.country,
    })
    .from(users)
    .where(
      and(
        eq(users.evaluationId, row.id),
        // Owner-grade only: a name-only ("medium") claimer must not paint their
        // avatar / nickname / location onto a public profile (impersonation).
        eq(users.matchConfidence, "high"),
      ),
    )
    .orderBy(
      sql`${users.clerkImageUrl} IS NULL`,
      desc(users.verifiedAt),
    );
  const primaryClaim = claimRows[0] ?? null;
  const claimedImageUrl = primaryClaim?.clerkImageUrl ?? null;
  const isClaimedByAnyone = isOwner || !!primaryClaim;
  // Claimed owner's chosen display name. Falls through to fullName when
  // the owner hasn't set one (or when the profile is unclaimed).
  const nickname = primaryClaim?.nickname?.trim() || null;
  // Chief "Deep Intelligence" dossier (one per profile, if it's been run). Only
  // real profiles render the box, so skip the lookup for code-sourced rows.
  const dossier = row.source !== "code" ? await getProfileDossier(row.id) : null;
  // Location: first non-blank value across all claim rows. Trim so a row
  // with empty strings (vs. NULL) doesn't win over a row with real data.
  const firstNonBlank = (key: "city" | "region" | "country"): string | null => {
    for (const r of claimRows) {
      const v = r[key]?.trim();
      if (v) return v;
    }
    return null;
  };
  const anyClaim = primaryClaim
    ? {
        ...primaryClaim,
        city: firstNonBlank("city"),
        region: firstNonBlank("region"),
        country: firstNonBlank("country"),
      }
    : null;

  // When the claim callback bounces back with ?claim_failed=github|email, we
  // auto-open the Claim Your Profile modal with a yellow banner steering the
  // visitor to LinkedIn (the higher-confidence path).
  const initialClaimBanner =
    claimFailed === "github" || claimFailed === "email"
      ? ({ kind: "claim_failed" as const, provider: claimFailed as "github" | "email" })
      : null;

  // Per-dimension percentiles (no combined). Hidden when the score is 0 or
  // when there aren't enough peers to be meaningful.
  const [percentiles, savedRows, privacyRows] = await Promise.all([
    computePercentilesAll({
      founder: row.founderScore,
      investor: row.investorScore,
      combined: row.score,
    }),
    db
      .select()
      .from(recommendationResponses)
      .where(eq(recommendationResponses.evaluationId, row.id)),
    db
      .select({ itemId: recommendationVisibility.itemId, visibility: recommendationVisibility.visibility })
      .from(recommendationVisibility)
      .where(eq(recommendationVisibility.evaluationId, row.id)),
  ]);
  const { founder: founderP, investor: investorP, combined: combinedP } = percentiles;
  // Per-answer visibility (sparse table: a row exists only for non-public). The
  // legacy data stored only "private"; the migration remaps those to
  // "members_only" so they read as member-visible.
  const answerVisById = new Map(
    privacyRows.map((p) => [p.itemId, p.visibility === "private" ? "private" : "members_only"] as const),
  );

  // Shareable "social card" shown when the avatar or name is clicked: photo +
  // name + scores + LinkedIn/X/Facebook share + copy-link. profileUrl is the
  // absolute canonical URL built from the request host (`canonicalPath` is from
  // the batched Promise.all above).
  const socialCard: SocialCardData = {
    imageUrl: claimedImageUrl,
    name: nickname ?? fullName ?? humanizeLinkedinHandle(row.linkedinUrl) ?? "This founder",
    profileUrl: canonicalPath ? `${isLocalhost ? "http" : "https"}://${host}${canonicalPath}` : null,
    founderScore: row.founderScore,
    investorScore: row.investorScore,
    rank: combinedP.rankFromTop,
  };
  // For viewers who aren't the owner (and aren't admin), priority text and
  // edited text on private rows are scrubbed server-side so the strings never
  // reach the browser. Rating + category remain so the client can render the
  // blurred placeholder + the highlighted button position.
  const viewerCanReadPrivate = isOwner || isAdminViewer;
  // 3-way answer visibility: public → everyone; members_only → claimed members
  // (+ owner/admin); private → owner/admin only. Returns the stored level and
  // whether the text must be scrubbed for THIS viewer.
  const answerVisibility = (itemId: string): "public" | "members_only" | "private" =>
    answerVisById.get(itemId) ?? "public";
  const answerScrubbed = (itemId: string): boolean => {
    const v = answerVisibility(itemId);
    if (v === "public") return false;
    if (v === "private") return !viewerCanReadPrivate;
    return !viewerCanReadPrivate && !viewerIsMember; // members_only
  };
  const showFounderPct = row.source !== "code" && row.founderScore > 0 && founderP.total >= 2;
  const showInvestorPct = row.source !== "code" && row.investorScore > 0 && investorP.total >= 2;

  // Owner overrides layered onto the AI-computed badges below — turns
  // grayscale "likely" pills into confirmed/pending/hidden based on the
  // owner's actions in the Badges UI. (`overrideRows` is from the batched
  // Promise.all above.)
  const badges = computeBadges(
    {
      isClaimed: isClaimedByAnyone,
      extractedMetrics: profileBlob?.extractedMetrics ?? null,
      mmHits: profileBlob?.mmHits ?? null,
      primaryCompanyDomain: profileBlob?.primaryCompanyDomain ?? null,
      investorStageFocus: row.investorStageFocus,
      investorIndustryFocus: row.investorIndustryFocus,
      investorLeadsRounds: row.investorLeadsRounds,
      onNeo: row.onNeo,
      canonicalIndustries: row.canonicalIndustries,
    },
    overrideRows.map((o) => ({
      badgeId: o.badgeId,
      status: o.status as "likely" | "confirmed" | "pending" | "rejected",
      editedLabel: o.editedLabel,
    })),
  );
  // Split the achievement badges into the "Professional" group (everything the
  // owner can edit / earn) and the derived "Industries" group (turquoise sector
  // pills) so each renders under its own gray label.
  const professionalBadges = badges.filter((b) => b.category !== "industry");
  const industryBadges = badges.filter((b) => b.category === "industry");
  // Public family disclosure badges (e.g. "Daughter") the owner opted into — just
  // the labels, shown to everyone alongside the achievement badges.
  // (`familyBadges` is from the batched Promise.all above.)
  const savedResponses = savedRows.map((r) => {
    const scrubbed = answerScrubbed(r.itemId);
    return {
      itemId: r.itemId,
      rating: r.rating,
      category: scrubbed ? null : r.category,
      editedText: scrubbed ? null : r.editedText,
      visibility: answerVisibility(r.itemId),
      // "system" (a pre-populated event rating) vs "user" (a row the owner
      // added). Lets the widget tell a genuine custom row apart from a system
      // rating whose item id no longer matches the (regenerated) item list.
      source: r.source,
    };
  });

  // ── Member Endorsements ──────────────────────────────────────────────────
  // The LIST renders for EVERYONE (anonymous included) — visibility-filtered, so
  // public endorsements show to anyone while members_only/private stay gated.
  // The compose form is members-only on someone else's profile (Requirement 3).
  const endorseCtx = { ownEvaluationId: viewer.ownEvaluationId, isMember: viewerIsMember };
  const forProfileEndorsements = await listEndorsementsForProfile(row.id, endorseCtx);
  let endorseBudget: PointsBudget = { total: 0, used: 0, available: 0 };
  let endorseExistingPoints = 0;
  let endorsedByMe: EndorsementView[] = [];
  if (viewerIsMember && viewer.ownEvaluationId) {
    endorseBudget = await getViewerPointsBudget(viewer.ownEvaluationId);
    endorseExistingPoints =
      forProfileEndorsements.find((e) => e.fromEvaluationId === viewer.ownEvaluationId)?.authorPoints ?? 0;
    // The viewer's authored endorsements — powers both the owner's
    // "People you've endorsed" list and the compose form's points breakdown.
    endorsedByMe = await listEndorsementsByMember(viewer.ownEvaluationId, endorseCtx);
  }
  const canEndorse = viewerIsMember && !isOwner;
  const endorseData:
    | { canEndorse: boolean; budget: PointsBudget; existingPoints: number; forProfile: EndorsementView[]; byMe: EndorsementView[] }
    | null =
    forProfileEndorsements.length > 0 || canEndorse
      ? {
          canEndorse,
          budget: endorseBudget,
          existingPoints: endorseExistingPoints,
          forProfile: forProfileEndorsements,
          byMe: endorsedByMe,
        }
      : null;

  return (
    <div className="flex flex-col flex-1 px-4 sm:px-6 pt-3 pb-8 sm:pt-4 sm:pb-10 bg-[#151515] text-zinc-100">
      <header className="flex justify-between items-center mb-10 sm:mb-16">
        <div className="flex items-center gap-3 sm:gap-6">
          <a href="/?home=1" aria-label="Founder Festival home" className="opacity-90 hover:opacity-100 transition-opacity">
            <img
              src="/images/founder-festival-logo.png"
              alt="Founder Festival"
              width={498}
              height={444}
              className="w-12 sm:w-14 h-auto"
            />
          </a>
          <SiteHeaderNav
            currentPage="profile"
            userProfileHref={viewer.profileHref}
            isAuthed={viewer.isAuthed}
          />
        </div>
      </header>
      {/* Floating super-admin toolbar, fixed bottom-left (the top row is taken
          by the logo/nav and the Admin link + avatar). Single home for the
          super-admin profile actions, rendered as hyperlinks:
          "Admin: Scoring Log | Re-Score | Hide | Delete". Hide/Delete are
          super-admin-only (and the APIs re-check); Scoring Log + Re-Score also
          show on localhost. Rendered outside <header> since AdminProfileBox is
          position:fixed and lives independently of header layout. */}
      {showScoreDetail && (
        <AdminProfileBox>
          <ScoringLogButton evaluationId={row.id} autoOpen={autoOpenScoreDetail} />
          <ReScoreButton evaluationId={row.id} variant="link" isAdmin fullName={fullName} />
          {superAdmin ? (
            <ManualHintButton evaluationId={row.id} currentHint={row.manualProfileHint} />
          ) : null}
          {superAdmin ? (
            <AdminProfileActions
              evaluationId={row.id}
              initialHidden={row.hiddenAt !== null}
            />
          ) : null}
        </AdminProfileBox>
      )}
      <main className="flex-1 flex flex-col items-center gap-8 sm:gap-10 max-w-2xl mx-auto w-full">
        <ClaimSuccessBanner />
        {appliedEventTitle && <AppliedBanner eventTitle={appliedEventTitle} />}
        <MismatchOverlayController fullName={fullName} />
        <div className="text-center flex flex-col gap-3 sm:gap-4">
          <div className="group flex items-center justify-center gap-3">
            {claimedImageUrl && (
              <ProfileSocialCard card={socialCard} className="rounded-full hover:opacity-90 transition-opacity">
                <Avatar imageUrl={claimedImageUrl} name={nickname ?? fullName} size="lg" />
              </ProfileSocialCard>
            )}
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-3">
                <ProfileSocialCard card={socialCard}>
                  <span className="font-display text-2xl sm:text-3xl transition-colors hover:text-zinc-300">
                    {nickname
                      ? `Welcome, ${nickname}`
                      : fullName
                        ? `Welcome, ${fullName}`
                        : "Welcome."}
                  </span>
                </ProfileSocialCard>
                {/* Edit pencil on hover: owner → /account; everyone else →
                    ClaimProfileModal. Visible whenever the heading row is
                    hovered (group / group-hover) — see EditNameButton. */}
                <EditNameButton
                  isOwner={isOwner}
                  evaluationId={row.id}
                  firstName={firstName}
                />
                {/* When no nickname, the LinkedIn icon sits next to the welcome
                    line. When a nickname IS set, the icon moves down with the
                    full-name subtitle (the icon represents the real person, not
                    the display nickname). */}
                {!nickname && row.linkedinUrl && (
                  <a
                    href={row.linkedinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={fullName ? `${fullName} on LinkedIn` : "LinkedIn profile"}
                    className="text-zinc-500 hover:text-[#0a66c2] transition-colors"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-5 w-5">
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.852 3.37-1.852 3.601 0 4.267 2.37 4.267 5.455v6.288zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.063 2.063 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                    </svg>
                  </a>
                )}
              </div>
              {nickname && fullName && (
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-sm text-zinc-400">{fullName}</p>
                  {row.linkedinUrl && (
                    <a
                      href={row.linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${fullName} on LinkedIn`}
                      className="text-zinc-500 hover:text-[#0a66c2] transition-colors"
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-4 w-4">
                        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.852 3.37-1.852 3.601 0 4.267 2.37 4.267 5.455v6.288zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.063 2.063 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                      </svg>
                    </a>
                  )}
                  {/* Inline location suffix on the fullName row when the user
                      has a nickname (the welcome line above shows the
                      nickname, this subtitle carries the real-name + LI icon
                      + " | City, State, Country"). */}
                  <LocationLine
                    initialCity={anyClaim?.city ?? null}
                    initialRegion={anyClaim?.region ?? null}
                    initialCountry={anyClaim?.country ?? null}
                    canEdit={isOwner}
                    mode="inline"
                  />
                </div>
              )}
              {/* No-nickname: location renders on its own row below the
                  welcome line, with the inline editor. */}
              {!nickname && (
                <div className="mt-1">
                  <LocationLine
                    initialCity={anyClaim?.city ?? null}
                    initialRegion={anyClaim?.region ?? null}
                    initialCountry={anyClaim?.country ?? null}
                    canEdit={isOwner}
                  />
                </div>
              )}
            </div>
          </div>
          {!isClaimedByAnyone && !viewerHasClaim && (
            <UnclaimedNotice evaluationId={row.id} firstName={firstName} />
          )}
          {/* Name-only (medium) claimer viewing their own profile: offer the
              verify-to-own upgrade (email auto-match, else LinkedIn-URL attest). */}
          {viewerHasClaim && !isOwner && (
            <VerifyToOwnBanner evaluationId={row.id} linkedinUrl={row.linkedinUrl} />
          )}
          {/* Dual + combined: founder/investor (each with its own percentile
              underneath) stacked on left, vertical divider, Combined on right
              (the score itself is a link to the leaderboard). */}
          {/* Tighter gap on a 390px screen so the big combined number + the
              two side scores don't get cramped; opens up from sm and up. */}
          {/* Wrapper: the three-score row, then the Leaderboard/Tokenmaxxer/
              Re-Score row spanning the FULL width beneath it (so its labels
              don't wrap onto two lines as they did when confined to the
              narrower Combined column). */}
          <div className="flex flex-col items-center gap-3 mt-2">
          <div className="flex items-start justify-center gap-4 sm:gap-10">
            <div className="flex flex-col gap-4 text-right">
              <div className="flex flex-col items-end gap-0">
                <div className="flex items-baseline justify-end gap-3">
                  <span className="text-xs uppercase tracking-[0.18em] text-zinc-500 w-20">Founder</span>
                  {/* whitespace-nowrap so the superscript status marker stays to
                      the RIGHT of the number (even six-digit ones) and never
                      wraps below it. */}
                  <span className="font-display text-3xl sm:text-4xl font-bold tabular-nums whitespace-nowrap">
                    {row.founderScore.toLocaleString("en-US")}
                    <StatusMarker role="founder" status={row.founderStatus} />
                  </span>
                </div>
                {showFounderPct && (
                  <p className="text-xs text-zinc-400 mt-1">
                    {ordinal(founderP.percentile)} percentile
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-0">
                <div className="flex items-baseline justify-end gap-3">
                  <span className="text-xs uppercase tracking-[0.18em] text-zinc-500 w-20">Investor</span>
                  <span className="font-display text-3xl sm:text-4xl font-bold tabular-nums whitespace-nowrap">
                    {row.investorScore.toLocaleString("en-US")}
                    <StatusMarker role="investor" status={row.investorStatus} />
                  </span>
                </div>
                {showInvestorPct && (
                  <p className="text-xs text-zinc-400 mt-1">
                    {ordinal(investorP.percentile)} percentile
                  </p>
                )}
              </div>
            </div>
            {/* Divider scales up progressively so it doesn't tower over the
                side scores on the smallest screens. */}
            <div className="h-16 sm:h-20 md:h-24 w-px bg-zinc-700" aria-hidden />
            <div className="flex flex-col items-center gap-0">
              <span className="text-xs uppercase tracking-[0.2em] text-zinc-500">Combined</span>
              <CombinedScoreModal
                score={row.score}
                founder={scoreItemRows.founder
                  .filter((r) => r.status !== "rejected")
                  .map((r) => ({ reason: r.reason, points: r.points }))}
                investor={scoreItemRows.investor
                  .filter((r) => r.status !== "rejected")
                  .map((r) => ({ reason: r.reason, points: r.points }))}
                scoreClassName="font-display text-6xl sm:text-8xl md:text-9xl font-bold tracking-tight tabular-nums leading-none"
              />
            </div>
          </div>
          {row.source !== "code" && (
            // Full-width row beneath the scores. flex-wrap so it stacks
            // gracefully on a phone; each badge whitespace-nowrap so its own
            // label never breaks across two lines.
            <div className="flex flex-row flex-wrap items-center justify-center gap-2.5 sm:gap-3 text-xs sm:text-sm">
              {/* Leaderboard is the BUTTON (outlined pill) → /leaderboard.
                  Re-Score Me is a plain link next to it. */}
              <a
                href={`/leaderboard?e=${row.id}`}
                className="whitespace-nowrap rounded-md border border-[#dfa43a]/60 text-[#dfa43a] hover:bg-[#dfa43a]/10 px-3 py-0.5 transition-colors"
              >
                #{combinedP.rankFromTop} on Leaderboard
              </a>
              {/* HN Tokenmaxxing badge: same gold as the leaderboard badge but
                  less rounded (rounded-md, like the achievement Badges). Opens
                  the subject's tkmx profile in a new tab. */}
              {tkmxBadge && (
                <a
                  href={tkmxBadge.profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="whitespace-nowrap rounded-md border border-[#dfa43a]/60 text-[#dfa43a] hover:bg-[#dfa43a]/10 px-3 py-0.5 transition-colors"
                >
                  #{tkmxBadge.rank} HN Tokenmaxxer
                </a>
              )}
              <ReScoreButton evaluationId={row.id} variant="link" isOwner={isOwner} isAdmin={isAdminViewer} fullName={fullName} />
            </div>
          )}
          {/* Chief Deep Intelligence dossier — a "View …" link when one exists,
              otherwise a "Run …" box that gates on buying credits. */}
          {row.source !== "code" && (
            <ProfileDossierBox
              name={nickname ?? fullName ?? "this founder"}
              evaluationId={row.id}
              shareUrl={isDossierViewable(dossier) ? dossier.shareUrl : null}
              status={dossier?.status ?? null}
              superAdmin={superAdmin}
            />
          )}
          {/* Hide / Delete now live in the top-right admin pill
              (AdminProfileBox), alongside Scoring Log + Re-Score. */}
          </div>
        </div>
        {/* Credibility title + badge groups. Left-justified block, centered on
            the page. The LLM-generated one-sentence title sits above the badges;
            each badge group gets a gray label and renders as left-justified
            bullet points. "Professional" = the achievement/identity badges,
            "Industries" = the derived sector badges, "Personal" = family badges. */}
        <div className="w-full max-w-2xl mx-auto flex flex-col items-start gap-2.5 text-left">
          <EditCredibilityTitle
            evaluationId={row.id}
            title={row.credibilityTitle}
            isOwner={isOwner}
            viewerIsMember={viewerIsMember}
            firstName={firstName}
          />
          {professionalBadges.length > 0 && (
            <Badges
              badges={professionalBadges}
              layout="wrap"
              size="sm"
              align="left"
              label="• Professional:"
              editable={isOwner || isAdminViewer}
              evaluationId={row.id}
              leaderboardLinks
              collapsible
            />
          )}
          {industryBadges.length > 0 && (
            <Badges
              badges={industryBadges}
              layout="wrap"
              size="sm"
              align="left"
              label="• Industries:"
              leaderboardLinks
              collapsible
            />
          )}
          {familyBadges.length > 0 && (
            // Family / kids / pets badges: dark purple, clickable → leaderboard
            // filtered to everyone with that kind of family member. Constrained
            // to one row with a "+N more" expander like the other groups.
            <CollapsibleRow
              label={<span className="shrink-0 mr-1 text-xs text-zinc-500">• Personal:</span>}
              signature={familyBadges.map((b) => b.label).join("|")}
              items={familyBadges.map((b, i) =>
                b.filterKey ? (
                  <a
                    key={i}
                    href={`/leaderboard?family=${b.filterKey}`}
                    className="whitespace-nowrap rounded-md border border-purple-500/50 bg-purple-500/15 px-2.5 py-0.5 text-xs text-purple-200 transition-colors hover:bg-purple-500/25"
                  >
                    {b.label}
                  </a>
                ) : (
                  <span
                    key={i}
                    className="whitespace-nowrap rounded-md border border-purple-500/50 bg-purple-500/15 px-2.5 py-0.5 text-xs text-purple-200"
                  >
                    {b.label}
                  </span>
                ),
              )}
            />
          )}
        </div>
        {/* Hide the big events CTA when a claimed member is viewing SOMEONE
            ELSE's profile — we know it isn't them (Requirement 1). The owner
            and unclaimed visitors still see it. */}
        {(!viewerIsMember || isOwner) && (
          <EventsCTA
            evaluationId={row.id}
            isOwner={isOwner}
            initialBanner={initialClaimBanner}
            firstName={firstName}
          />
        )}
        {/* Member Endorsements — above Credibility, claimed-members only. */}
        {endorseData && (
          <>
            {isOwner && endorseData.byMe.length > 0 && (
              <section className="w-full flex flex-col gap-2">
                <h3 className="font-display text-lg font-semibold text-zinc-100">Members you&apos;ve endorsed</h3>
                <ul className="flex flex-col gap-1 text-sm text-zinc-300">
                  {endorseData.byMe.map((e) => (
                    <li key={e.id} className="flex min-w-0 items-baseline gap-1.5">
                      <a
                        href={`${e.toHref}#endorsement-${e.fromEvaluationId}`}
                        className="shrink-0 font-medium text-[#dfa43a] hover:underline"
                      >
                        {e.toName?.trim() || "a member"}
                      </a>
                      {e.authorPoints != null && (
                        <span className="shrink-0 text-zinc-500">+{e.authorPoints.toLocaleString("en-US")} pts</span>
                      )}
                      {/* As much of the endorsement as fits on one line, then … */}
                      <span className="flex min-w-0 items-baseline text-zinc-400">
                        <span className="shrink-0">&ldquo;</span>
                        <span className="min-w-0 truncate">
                          {renderMentions(e.body).map((s) => s.text).join("")}
                        </span>
                        <span className="shrink-0">&rdquo;</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <MemberEndorsements
              toEvaluationId={row.id}
              firstName={firstName ?? "this member"}
              viewerCanEndorse={endorseData.canEndorse}
              budget={endorseData.budget}
              existingPoints={endorseData.existingPoints}
              endorsements={endorseData.forProfile}
              isOwner={isOwner}
              isAuthed={viewer.isAuthed}
              viewerOwnEvaluationId={viewer.ownEvaluationId}
              myAllocations={endorseData.byMe.map((e) => ({
                name: e.toName?.trim() || "A member",
                points: e.authorPoints ?? 0,
              }))}
            />
          </>
        )}
        {radars && (
          <section className="w-full flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h3 className="font-display text-xl font-bold text-zinc-100">Credibility</h3>
            </div>
            <CredibilityRadarSection
              founder={showFounderRadar ? radars.founder : null}
              investor={showInvestorRadar ? radars.investor : null}
              defaultDimension={row.investorScore > row.founderScore ? "investor" : "founder"}
            />
          </section>
        )}
        {hasMatrix && (
          <FounderMatrix
            founder={matrixFounder}
            investor={matrixInvestor}
            defaultDimension={matrixDim}
          />
        )}
        <ScoreTable
          founder={scoreItemRows.founder}
          investor={scoreItemRows.investor}
          isCodeEntry={row.source === "code"}
          evaluationId={row.id}
          isOwner={isOwner}
          isClaimedByAnyone={isClaimedByAnyone}
          ownerNeedsSetup={ownerNeedsSetup}
          fullName={fullName}
          isAdminViewer={isAdminViewer}
        />
        {recs && (
          <Recommendations
            evaluationId={row.id}
            summary={recs.summary}
            prePopulated={(recs.items ?? []).map((item) => {
              const scrubbed = answerScrubbed(item.id);
              return {
                id: item.id,
                category: scrubbed ? null : item.category,
                text: scrubbed ? null : item.text,
                visibility: answerVisibility(item.id),
              };
            })}
            savedResponses={savedResponses}
            isOwner={isOwner}
            initialBanner={initialClaimBanner}
            firstName={firstName}
          />
        )}
        {row.onNeo === true && row.neoSlug ? (
          <NeoEndorsements slug={row.neoSlug} firstName={firstName} />
        ) : null}
      </main>
    </div>
  );
}
