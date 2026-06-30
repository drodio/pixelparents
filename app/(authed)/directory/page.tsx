import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { unstable_cache } from "next/cache";
import { primaryEmail } from "@/lib/clerk";
import { getSignupByEmail, getDirectorySignups } from "@/lib/db/signups";
import { getStats, getBreakdowns } from "@/lib/db/aggregates";
import { getDb, hasDatabase } from "@/lib/db";
import { children, type ChildRow, type SignupRow } from "@/lib/db/schema/signups";
import { isStudentAccount } from "@/lib/family-display";
import {
  buildDirectoryCard,
  directoryPhotoPaths,
  isDirectoryVisible,
  type DirectoryCard,
} from "@/lib/directory";
import { signedPhotoUrls } from "@/lib/blob";
import { readApprovalStatus, type ApprovalStatus } from "@/lib/approval";
import { isAdminEmail } from "@/lib/admin";
import { buildMarkers } from "@/lib/community-map";
import { WorldMap } from "@/components/world-map";
import { DashboardShell } from "@/components/dashboard-shell";
import { SignedOutPanel } from "@/components/signed-out-panel";
import { UnverifiedNotice } from "@/components/unverified-notice";
import { ShowcaseClient } from "./showcase-client";
import { ShowcaseSkeleton } from "./showcase-skeleton";
import { StatStrip } from "./stat-strip";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Directory — Pixel Parents",
  description:
    "Browse the Pixel Parents (Stanford OHS) directory — parents and students who have chosen to share.",
  // Only renders for signed-in OHS families; never index it.
  robots: { index: false, follow: false },
};

// Amber accent, matching the rest of pixelparents.org.
const AMBER = "#fbbf24";

// How many photo thumbnails to entice a click with, per card.
const MAX_THUMBS = 4;

// The map markers + condensed stats change slowly (they move only when a family
// joins / updates), yet getStats()/getBreakdowns() are several aggregate queries
// that ran on EVERY cold render. Cache the unfiltered aggregates for a short
// window so a cold start serves them from Next's data cache instead of
// recomputing. Unfiltered only — the filtered API callers (stats/breakdowns
// routes, MCP) keep calling getStats/getBreakdowns directly and are unaffected.
// 60s keeps the directory's headline numbers effectively live while removing the
// per-request aggregate cost. Keyed + tagged so they can be revalidated if needed.
const AGGREGATES_REVALIDATE_SECONDS = 60;

const getCachedStats = unstable_cache(() => getStats(), ["directory-stats"], {
  revalidate: AGGREGATES_REVALIDATE_SECONDS,
  tags: ["directory-aggregates"],
});

const getCachedBreakdowns = unstable_cache(() => getBreakdowns(), ["directory-breakdowns"], {
  revalidate: AGGREGATES_REVALIDATE_SECONDS,
  tags: ["directory-aggregates"],
});

// Streamed child that resolves the thumbnail-complete card set (its presigns are
// deferred off the first paint — see CommunityPage). Module-scoped so it isn't
// recreated per render; it just awaits the caller's already-started Promise, so
// React can suspend on it behind a hero-only fallback.
async function ThumbnailedShowcase({ cards }: { cards: Promise<DirectoryCard[]> }) {
  return <ShowcaseClient cards={await cards} />;
}

function PageHeader() {
  return (
    <header className="mb-8">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Directory</h1>
      <p className="mt-1 text-sm text-white/55">
        Stanford OHS parents and students, building together.
      </p>
    </header>
  );
}

export default async function CommunityPage() {
  // 1) Auth: signed-in only. Anonymous → render the grayed shell (locked tabs +
  //    sign-in CTA), NOT a redirect. We return BEFORE any DB query, so a
  //    signed-out visitor never loads or sees community PII (signups, kids,
  //    photos, map markers).
  const viewer = await currentUser();
  if (!viewer) {
    return (
      <DashboardShell authed={false} firstName={null} email={null} status={null}>
        <SignedOutPanel area="community" />
      </DashboardShell>
    );
  }
  const email = primaryEmail(viewer);

  // 2) OHS-family gate — identical to the old /directory + /directory pages.
  const [viewerSignup, isAdmin] = await Promise.all([
    email ? getSignupByEmail(email) : Promise.resolve(null),
    isAdminEmail(email),
  ]);
  const isOhsFamily = Boolean(viewerSignup);
  const firstName = viewerSignup?.firstName ?? viewer.firstName ?? null;
  const status: ApprovalStatus | null = viewerSignup
    ? readApprovalStatus((viewerSignup.extra ?? {}) as Record<string, unknown>)
    : null;

  const shell = (content: React.ReactNode) => (
    <DashboardShell firstName={firstName} email={email} status={status} isAdmin={isAdmin}>
      {content}
    </DashboardShell>
  );

  if (!isOhsFamily) {
    return shell(
      <>
        <PageHeader />
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
          <h2 className="text-lg font-semibold">This page is for OHS families</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-white/55">
            Your account isn&apos;t recognized as an OHS family yet. Join Pixel Parents to see the
            community.
          </p>
          <Link
            href="/signup"
            className="mt-5 inline-block rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-black transition hover:bg-amber-300"
          >
            Join Pixel Parents
          </Link>
        </div>
      </>,
    );
  }

  if (!hasDatabase()) {
    return shell(
      <>
        <PageHeader />
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center text-white/55">
          The community view isn&apos;t available yet — check back once families start joining.
        </div>
      </>,
    );
  }

  // 3) Load signups + children for the member grid (directory load path) AND the
  //    map/stats aggregates — all in parallel. getDirectorySignups pushes the
  //    cheap visibility preconditions into SQL (so a cold render reads a fraction
  //    of the table); the authoritative isDirectoryVisible() gate still runs in
  //    JS below. Aggregates are served from Next's short-lived data cache.
  const db = getDb();
  const [allRows, kids, stats, breakdowns] = await Promise.all([
    getDirectorySignups(),
    db.select().from(children).orderBy(children.createdAt),
    getCachedStats(),
    getCachedBreakdowns(),
  ]);

  // Keep ONLY opt-in, OHS-visible profiles via the shared isDirectoryVisible gate
  // (the same single-source-of-truth gate the /p page uses). Applies to parents
  // AND student accounts — a student appears only if they opted into sharing.
  const included = allRows.filter(isDirectoryVisible);

  // Children are shared per-family; group so each card shows its family's kids.
  const kidsByFamily = new Map<string, ChildRow[]>();
  for (const k of kids) {
    const arr = kidsByFamily.get(k.familyId);
    if (arr) arr.push(k);
    else kidsByFamily.set(k.familyId, [k]);
  }

  // The STUDENT accounts in each family, grouped by familyId. A rendered child is
  // resolved to its own student account (verified-email match) so the card shows
  // the child's accurate, aggregated tag set (kid interests UNION the student
  // account's expertise signals). Built from ALL rows (not just `included`) — the
  // student account need not earn its own directory card to enrich its parent's.
  const studentsByFamily = new Map<string, SignupRow[]>();
  for (const r of allRows) {
    if (!isStudentAccount(r)) continue;
    const arr = studentsByFamily.get(r.familyId);
    if (arr) arr.push(r);
    else studentsByFamily.set(r.familyId, [r]);
  }

  // Photo presigning is the per-render hot spot: it was up to (1 hero + MAX_THUMBS)
  // presigns PER visible card. Split it so the grid paints fast:
  //   • HEROES are presigned eagerly here — they're above the fold and drive the
  //     first visual. One presign per card.
  //   • THUMBNAILS are deferred (presigned inside a streamed Suspense child below)
  //     so they don't block the initial render. Until they arrive the cards show
  //     just the hero (thumbUrls = []), exactly as a photoless card already does;
  //     no shown photo is dropped — the thumbnails simply stream in a beat later.
  const currentYear = new Date().getFullYear();

  // Build the full visible card set from a pathname→url map. Reused for the
  // hero-only first paint and the thumbnail-complete streamed render so the card
  // projection (field gating, student coarsening) stays single-sourced.
  const buildCards = (urlByPath: Map<string, string>): DirectoryCard[] =>
    included.map((row) =>
      buildDirectoryCard(
        row,
        kidsByFamily.get(row.familyId) ?? [],
        urlByPath,
        MAX_THUMBS,
        currentYear,
        studentsByFamily.get(row.familyId) ?? [],
      ),
    );

  // Presign a set of pathnames into a pathname→url map (drops failed signs).
  const presignToMap = async (paths: string[]): Promise<Map<string, string>> => {
    const urlByPath = new Map<string, string>();
    if (paths.length === 0) return urlByPath;
    const signed = await signedPhotoUrls(paths);
    paths.forEach((p, i) => {
      if (signed[i]) urlByPath.set(p, signed[i]);
    });
    return urlByPath;
  };

  // Hero = the FIRST photo path of each card; thumbnails = the next MAX_THUMBS.
  const heroPaths = Array.from(
    new Set(
      included.flatMap((r) =>
        directoryPhotoPaths(r, kidsByFamily.get(r.familyId) ?? []).slice(0, 1),
      ),
    ),
  );
  const thumbPaths = Array.from(
    new Set(
      included.flatMap((r) =>
        directoryPhotoPaths(r, kidsByFamily.get(r.familyId) ?? []).slice(1, 1 + MAX_THUMBS),
      ),
    ),
  );

  // First paint: heroes presigned now (full card data — names, tags, filters all
  // work immediately over the complete visible set).
  const heroUrlByPath = await presignToMap(heroPaths);
  const heroCards = buildCards(heroUrlByPath);

  // Deferred: presign hero + thumbnail paths together and rebuild the cards with
  // full thumbnails. Started here (not awaited) and streamed via Suspense so it
  // never blocks the first render. (Re-includes heroPaths so heroUrl survives the
  // rebuild.) Only kicked off when there are thumbnails to add.
  const thumbnailedCards: Promise<DirectoryCard[]> | null =
    thumbPaths.length > 0
      ? presignToMap([...heroPaths, ...thumbPaths]).then(buildCards)
      : null;

  // Map + condensed stats (gracefully degrade if the aggregates aren't ready).
  const hasStats = stats.database !== "pending";
  const markers = hasStats
    ? buildMarkers(breakdowns.signups_by_state, breakdowns.signups_by_country)
    : [];
  const builders = breakdowns.signups_by_builder_interest?.builder ?? 0;
  const statesCount = Object.keys(breakdowns.signups_by_state ?? {}).length;
  const countrySet = new Set(Object.keys(breakdowns.signups_by_country ?? {}));
  if (statesCount > 0) countrySet.add("United States");
  const countriesCount = countrySet.size;

  return shell(
    <>
      <PageHeader />
      <UnverifiedNotice status={status ?? "pending"} />

      <div className="flex flex-col gap-8">
        {/* Compact map widget + condensed stats strip */}
        {hasStats && (
          <section className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-stretch">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
              <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.1em] text-white/40">
                Where we&apos;re building
              </div>
              <WorldMap markers={markers} accent={AMBER} />
            </div>
            <div className="flex flex-col justify-center gap-3">
              <StatStrip
                families={stats.total_families ?? 0}
                parents={stats.total_signups ?? 0}
                kids={stats.total_children ?? 0}
                builders={builders}
              />
              <p className="px-1 text-xs text-white/40">
                {countriesCount
                  ? `${countriesCount} countr${countriesCount === 1 ? "y" : "ies"}`
                  : ""}
                {statesCount
                  ? `${countriesCount ? ", " : ""}${statesCount} US state${
                      statesCount === 1 ? "" : "s"
                    }`
                  : ""}
                {countriesCount || statesCount ? " represented so far. " : ""}
                We&apos;re an online school, so the map keeps filling in as families join from around
                the world.
              </p>
            </div>
          </section>
        )}

        {/* The consolidated member showcase */}
        <section>
          {heroCards.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center text-white/55">
              No members are sharing with the community yet.
            </div>
          ) : thumbnailedCards === null ? (
            // No thumbnails to defer — the hero cards are already the final set.
            // ShowcaseClient calls useSearchParams() to restore shareable filters
            // from the URL; a Suspense boundary is required so the build doesn't
            // bail out of prerendering the surrounding tree (App Router rule).
            <Suspense fallback={<ShowcaseSkeleton />}>
              <ShowcaseClient cards={heroCards} />
            </Suspense>
          ) : (
            // Stream the thumbnail-complete grid: the fallback is the hero-only
            // grid (fully interactive — search/sort/filter all run over the
            // complete visible set), and ThumbnailedShowcase swaps in the cards
            // with thumbnails once their presigns resolve. The Suspense boundary
            // also satisfies the useSearchParams() prerender rule.
            <Suspense fallback={<ShowcaseClient cards={heroCards} />}>
              <ThumbnailedShowcase cards={thumbnailedCards} />
            </Suspense>
          )}
        </section>
      </div>
    </>,
  );
}
