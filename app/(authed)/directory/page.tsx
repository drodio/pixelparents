import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { desc } from "drizzle-orm";
import { primaryEmail } from "@/lib/clerk";
import { getDb, hasDatabase } from "@/lib/db";
import { signups, children, type ChildRow } from "@/lib/db/schema/signups";
import { getSignupByEmail } from "@/lib/db/signups";
import { coerceShareVisibility, shareFieldsOrDefault } from "@/lib/share";
import { signedPhotoUrls } from "@/lib/blob";
import { PixelMascot } from "@/components/pixel-mascot";
import { DirectoryClient, type DirectoryCard } from "./directory-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "OHS Family Directory — Pixel Parents",
  description: "Browse OHS families who have chosen to share their profiles.",
  // The directory only renders for signed-in OHS families; never index it.
  robots: { index: false, follow: false },
};

// How many photo thumbnails to entice a click with, per card.
const MAX_THUMBS = 4;

function Shell({ children }: { children: React.ReactNode }) {
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
              Families in the Pixel Parents community who share with OHS families.
            </p>
          </div>
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

  // 2) OHS-family gate — IDENTICAL to /p/[token]: a signed-in viewer counts as an
  //    OHS family only if they themselves have a signup. A logged-in non-signup
  //    user sees NO directory data.
  const isOhsFamily = Boolean(viewerEmail && (await getSignupByEmail(viewerEmail)));
  if (!isOhsFamily) {
    return (
      <Shell>
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
      <Shell>
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-sm text-white/60">
          The directory isn&apos;t available yet.
        </div>
      </Shell>
    );
  }

  // 3) Load all signups + children, then keep ONLY OHS-visible profiles. This is
  //    exactly the set for which canViewProfile("ohs", {isOwner:false,
  //    isOhsFamily:true}) === true: visibility resolves to "ohs", sharing is on,
  //    and a share token exists.
  const db = getDb();
  const [allRows, kids] = await Promise.all([
    db.select().from(signups).orderBy(desc(signups.createdAt)),
    db.select().from(children),
  ]);

  const included = allRows.filter(
    (r) =>
      r.shareEnabled === true &&
      Boolean(r.shareToken) &&
      coerceShareVisibility(r.shareVisibility) === "ohs" &&
      // Skip blank auto-save drafts (a real shared profile always has a name).
      Boolean(r.firstName?.trim()),
  );

  // Children are shared per-family; group so each card shows its family's kids.
  const kidsByFamily = new Map<string, ChildRow[]>();
  for (const k of kids) {
    const arr = kidsByFamily.get(k.familyId);
    if (arr) arr.push(k);
    else kidsByFamily.set(k.familyId, [k]);
  }

  // 4) Per included signup, expose ONLY the opted-in fields. Collect the photo
  //    pathnames to presign (hero = first family photo; thumbs fill from family
  //    then child photos — all gated behind the "photos" field, matching /p).
  type Pending = {
    row: (typeof included)[number];
    fields: Set<string>;
    photoPaths: string[];
  };
  const pending: Pending[] = included.map((r) => {
    const fields = new Set(shareFieldsOrDefault(r.shareFields));
    const familyKids = kidsByFamily.get(r.familyId) ?? [];
    const photoPaths = fields.has("photos")
      ? [
          ...(r.photos ?? []).map((p) => p.pathname),
          ...familyKids.flatMap((k) => (k.photos ?? []).map((p) => p.pathname)),
        ].slice(0, 1 + MAX_THUMBS)
      : [];
    return { row: r, fields, photoPaths };
  });

  // Presign every needed photo in one batch (deduped), then map back by path.
  const allPaths = Array.from(new Set(pending.flatMap((p) => p.photoPaths)));
  const signed = allPaths.length > 0 ? await signedPhotoUrls(allPaths) : [];
  const urlByPath = new Map<string, string>();
  allPaths.forEach((p, i) => {
    if (signed[i]) urlByPath.set(p, signed[i]);
  });

  const cards: DirectoryCard[] = pending.map(({ row, fields }) => {
    const familyKids = kidsByFamily.get(row.familyId) ?? [];

    const location = fields.has("location")
      ? [row.city, row.state].filter(Boolean).join(", ") || null
      : null;

    const parentInterests = fields.has("interests") ? row.parentInterests ?? [] : [];

    const sharedChildren = fields.has("children")
      ? familyKids.map((k) => ({
          firstName: k.firstName,
          grade: k.grade ?? null,
          interests: k.interests ?? [],
        }))
      : [];

    // Combined interest set for chips + filtering: parent + child interests, but
    // only those whose source field was shared. Deduped case-insensitively.
    const childInterests = fields.has("children")
      ? familyKids.flatMap((k) => k.interests ?? [])
      : [];
    const interestByKey = new Map<string, string>();
    for (const i of [...parentInterests, ...childInterests]) {
      const t = i?.trim();
      if (!t) continue;
      const key = t.toLowerCase();
      if (!interestByKey.has(key)) interestByKey.set(key, t);
    }

    // Photos (gated by "photos"): hero first, remaining as thumbnails.
    const photoUrls = fields.has("photos")
      ? [
          ...(row.photos ?? []).map((p) => p.pathname),
          ...familyKids.flatMap((k) => (k.photos ?? []).map((p) => p.pathname)),
        ]
          .map((path) => urlByPath.get(path))
          .filter((u): u is string => Boolean(u))
      : [];

    return {
      token: row.shareToken!,
      name: [row.firstName, row.lastName].filter(Boolean).join(" "),
      firstName: row.firstName,
      location,
      children: sharedChildren,
      interests: Array.from(interestByKey.values()),
      heroUrl: photoUrls[0] ?? null,
      thumbUrls: photoUrls.slice(1, 1 + MAX_THUMBS),
    };
  });

  return (
    <Shell>
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
