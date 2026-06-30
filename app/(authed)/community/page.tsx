import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { desc } from "drizzle-orm";
import { primaryEmail } from "@/lib/clerk";
import { getSignupByEmail } from "@/lib/db/signups";
import { getStats, getBreakdowns } from "@/lib/db/aggregates";
import { getDb, hasDatabase } from "@/lib/db";
import { signups, children, type ChildRow } from "@/lib/db/schema/signups";
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
import { UnverifiedNotice } from "@/components/unverified-notice";
import { ShowcaseClient } from "./showcase-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Community — Pixel Parents",
  description:
    "Browse the Pixel Parents (Stanford OHS) community — parents and students who have chosen to share.",
  // Only renders for signed-in OHS families; never index it.
  robots: { index: false, follow: false },
};

// Amber accent, matching the rest of pixelparents.org.
const AMBER = "#fbbf24";

// How many photo thumbnails to entice a click with, per card.
const MAX_THUMBS = 4;

function PageHeader() {
  return (
    <header className="mb-8">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Our community</h1>
      <p className="mt-1 text-sm text-white/55">
        Stanford OHS parents and students, building together.
      </p>
    </header>
  );
}

// A compact stat chip for the condensed stats strip beside the map.
function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <span className="text-xl font-semibold tracking-tight text-amber-400">
        {value.toLocaleString()}
      </span>
      <span className="text-sm text-white/55">{label}</span>
    </div>
  );
}

export default async function CommunityPage() {
  // 1) Auth: signed-in only. Anonymous → sign-in.
  const viewer = await currentUser();
  if (!viewer) redirect("/sign-in");
  const email = primaryEmail(viewer);

  // 2) OHS-family gate — identical to the old /directory + /community pages.
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
  //    map/stats aggregates — all in parallel.
  const db = getDb();
  const [allRows, kids, stats, breakdowns] = await Promise.all([
    db.select().from(signups).orderBy(desc(signups.createdAt)),
    db.select().from(children).orderBy(children.createdAt),
    getStats(),
    getBreakdowns(),
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

  // Presign every needed photo (hero + up to MAX_THUMBS per card) in one deduped
  // batch. Per-field exposure (and student coarsening) lives in buildDirectoryCard.
  const allPaths = Array.from(
    new Set(
      included.flatMap((r) =>
        directoryPhotoPaths(r, kidsByFamily.get(r.familyId) ?? []).slice(0, 1 + MAX_THUMBS),
      ),
    ),
  );
  const signed = allPaths.length > 0 ? await signedPhotoUrls(allPaths) : [];
  const urlByPath = new Map<string, string>();
  allPaths.forEach((p, i) => {
    if (signed[i]) urlByPath.set(p, signed[i]);
  });

  const currentYear = new Date().getFullYear();
  const cards: DirectoryCard[] = included.map((row) =>
    buildDirectoryCard(
      row,
      kidsByFamily.get(row.familyId) ?? [],
      urlByPath,
      MAX_THUMBS,
      currentYear,
    ),
  );

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
              <div className="grid grid-cols-2 gap-3">
                <StatChip label="Families" value={stats.total_families ?? 0} />
                <StatChip label="Parents" value={stats.total_signups ?? 0} />
                <StatChip label="Kids at OHS" value={stats.total_children ?? 0} />
                <StatChip label="Here to build" value={builders} />
              </div>
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
          {cards.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center text-white/55">
              No members are sharing with the community yet.
            </div>
          ) : (
            // ShowcaseClient calls useSearchParams() to restore shareable filters
            // from the URL; a Suspense boundary is required so the build doesn't
            // bail out of prerendering the surrounding tree (App Router rule).
            <Suspense fallback={null}>
              <ShowcaseClient cards={cards} />
            </Suspense>
          )}
        </section>
      </div>
    </>,
  );
}
