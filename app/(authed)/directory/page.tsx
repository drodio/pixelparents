import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { desc } from "drizzle-orm";
import { primaryEmail } from "@/lib/clerk";
import { isAdminEmail } from "@/lib/admin";
import { getDb, hasDatabase } from "@/lib/db";
import { signups, children, type ChildRow } from "@/lib/db/schema/signups";
import { getSignupByEmail } from "@/lib/db/signups";
import {
  buildDirectoryCard,
  directoryPhotoPaths,
  isDirectoryVisible,
  type DirectoryCard,
} from "@/lib/directory";
import { signedPhotoUrls } from "@/lib/blob";
import { readApprovalStatus } from "@/lib/approval";
import { PixelMascot } from "@/components/pixel-mascot";
import { UnverifiedNotice } from "@/components/unverified-notice";
import { DirectoryClient } from "./directory-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "OHS Family Directory — Pixel Parents",
  description: "Browse OHS families who have chosen to share their profiles.",
  // The directory only renders for signed-in OHS families; never index it.
  robots: { index: false, follow: false },
};

// How many photo thumbnails to entice a click with, per card.
const MAX_THUMBS = 4;

function Shell({
  children,
  isAdmin = false,
}: {
  children: React.ReactNode;
  isAdmin?: boolean;
}) {
  return (
    <main className="min-h-dvh bg-black text-white">
      <div className="mx-auto w-full max-w-7xl px-6 py-10">
        <header className="mb-8 flex items-center gap-4">
          <PixelMascot widthClass="w-14" href="/" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              OHS Family Directory
            </h1>
            <p className="mt-1 text-sm text-white/55">
              Families in the Pixel Parents community
            </p>
          </div>
          {isAdmin && (
            <Link
              href="/admin"
              className="ml-auto shrink-0 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-black shadow-sm transition-colors hover:bg-amber-300"
            >
              Admin
            </Link>
          )}
        </header>
        {children}
      </div>
    </main>
  );
}

export default async function DirectoryPage() {
  // 1) Auth: this page is ONLY for signed-in users. Anonymous → sign-in.
  const viewer = await currentUser();
  if (!viewer) redirect("/sign-in");

  const viewerEmail = primaryEmail(viewer);
  // Admins get a quick link back into the admin area from the directory header.
  const isAdmin = await isAdminEmail(viewerEmail);

  // 2) OHS-family gate — IDENTICAL to /p/[token]: a signed-in viewer counts as an
  //    OHS family only if they themselves have a signup. A logged-in non-signup
  //    user sees NO directory data.
  const viewerSignup = viewerEmail ? await getSignupByEmail(viewerEmail) : null;
  const isOhsFamily = Boolean(viewerSignup);
  if (!isOhsFamily) {
    return (
      <Shell isAdmin={isAdmin}>
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
          <h2 className="text-lg font-semibold">This directory is for OHS families</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-white/55">
            Your account isn&apos;t recognized as an OHS family. Sign up as a Pixel
            Parents family to view the directory.
          </p>
          <Link
            href="/signup"
            className="mt-5 inline-block rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-black hover:bg-amber-300"
          >
            Join Pixel Parents
          </Link>
        </div>
      </Shell>
    );
  }

  if (!hasDatabase()) {
    return (
      <Shell isAdmin={isAdmin}>
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-sm text-white/60">
          The directory isn&apos;t available yet.
        </div>
      </Shell>
    );
  }

  // 3) Load all signups + children, then keep ONLY OHS-visible profiles via the
  //    shared isDirectoryVisible gate (which routes the visibility decision
  //    through the same canViewProfile the /p page uses). Children are ordered
  //    deterministically (createdAt) so the displayed/first-child name and the
  //    "sort by child" key are stable across loads.
  const db = getDb();
  const [allRows, kids] = await Promise.all([
    db.select().from(signups).orderBy(desc(signups.createdAt)),
    db.select().from(children).orderBy(children.createdAt),
  ]);

  const included = allRows.filter(isDirectoryVisible);

  // Children are shared per-family; group so each card shows its family's kids.
  const kidsByFamily = new Map<string, ChildRow[]>();
  for (const k of kids) {
    const arr = kidsByFamily.get(k.familyId);
    if (arr) arr.push(k);
    else kidsByFamily.set(k.familyId, [k]);
  }

  // 4) Presign every needed photo (hero + up to MAX_THUMBS per card) in one
  //    deduped batch, then map back by path. Per-field exposure lives in the
  //    pure buildDirectoryCard helper.
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

  // Non-breaking nudge: unverified families still see the full directory, but get
  // a banner inviting them to verify their OHS student.
  const viewerStatus = readApprovalStatus((viewerSignup?.extra ?? {}) as Record<string, unknown>);

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

  return (
    <Shell>
      <UnverifiedNotice status={viewerStatus} />
      {cards.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center text-white/55">
          No families are sharing with the OHS directory yet.
        </div>
      ) : (
        <DirectoryClient cards={cards} />
      )}
    </Shell>
  );
}
