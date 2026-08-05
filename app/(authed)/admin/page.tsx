import { currentUser } from "@clerk/nextjs/server";
import { desc } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db";
import { signups, children, type ChildRow } from "@/lib/db/schema/signups";
import { isAdminEmail, isEnvAdmin, dbAdminEmails } from "@/lib/admin";
import { signedPhotoUrls } from "@/lib/blob";
import { ParentsTable, type ParentRow } from "./parents-table";
import { enforcementSummaries } from "@/lib/db/enforcement";

export const dynamic = "force-dynamic";

export default async function ParentsPage() {
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? undefined;
  if (!(await isAdminEmail(email))) return null;

  if (!hasDatabase()) {
    return (
      <section className="rounded-lg border border-white/10 p-6 text-sm">
        <code>DATABASE_URL</code> isn&rsquo;t configured yet.
      </section>
    );
  }

  const db = getDb();
  const [allRows, kids, adminSet] = await Promise.all([
    db.select().from(signups).orderBy(desc(signups.createdAt)),
    db.select().from(children),
    dbAdminEmails(),
  ]);

  // Auto-save creates a draft signup row on first /signup keystroke. Hide rows
  // that are still completely blank (no name/email yet) so abandoned drafts
  // don't clutter the admin list. They can be pruned from the DB later.
  const rows = allRows.filter(
    (r) => (r.firstName?.trim() || r.lastName?.trim() || r.email?.trim()),
  );

  // Children are shared per-family, so group by familyId and attach the same
  // kids to every parent row in that family (co-parents show the same children).
  const kidsByFamily = new Map<string, ChildRow[]>();
  for (const k of kids) {
    const arr = kidsByFamily.get(k.familyId);
    if (arr) arr.push(k);
    else kidsByFamily.set(k.familyId, [k]);
  }

  // Presign every family's private photos — family-level AND per-child — in one
  // batch, then map back by pathname.
  // Dedupe: in a multi-parent family the same shared child photos appear under
  // every parent row, so the same pathname would otherwise be presigned N times.
  const allPathnames = Array.from(
    new Set(
      rows.flatMap((r) => [
        ...(r.photos ?? []).map((p) => p.pathname),
        ...(kidsByFamily.get(r.familyId) ?? []).flatMap((k) =>
          (k.photos ?? []).map((p) => p.pathname),
        ),
      ]),
    ),
  );
  const signed = await signedPhotoUrls(allPathnames);

  // ONE batched query for every listed member, so the Enforcement column
  // never becomes an N+1.
  const enforcement = await enforcementSummaries(rows.map((r) => r.id));
  const urlByPath = new Map<string, string>();
  allPathnames.forEach((p, i) => {
    if (signed[i]) urlByPath.set(p, signed[i]);
  });

  const data: ParentRow[] = rows.map((r) => {
    const familyPhotos = (r.photos ?? []).map((p) => ({
      url: urlByPath.get(p.pathname) ?? "",
      pathname: p.pathname,
      caption: p.caption ?? null,
      width: p.width,
      height: p.height,
      label: null as string | null,
    }));
    const childPhotos = (kidsByFamily.get(r.familyId) ?? []).flatMap((k) =>
      (k.photos ?? []).map((p) => ({
        url: urlByPath.get(p.pathname) ?? "",
        pathname: p.pathname,
        caption: p.caption ?? null,
        width: p.width,
        height: p.height,
        label: k.firstName as string | null,
      })),
    );
    const photos = [...familyPhotos, ...childPhotos].filter((p) => p.url);
    const extra = (r.extra ?? {}) as Record<string, unknown>;
    return {
      id: r.id,
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email,
      phone: r.phone,
      githubUsername: r.githubUsername,
      ohsAffiliation: r.ohsAffiliation,
      builderInterest: typeof extra.builderInterest === "string" ? extra.builderInterest : null,
      technicalDepth: r.technicalDepth,
      timeCommitment: r.timeCommitment,
      skillsets: r.skillsets,
      city: r.city,
      state: r.state,
      parentInterests: r.parentInterests,
      photoCount: photos.length,
      photos,
      dbAdmin: adminSet.has(r.email.toLowerCase()),
      envAdmin: isEnvAdmin(r.email),
      enforcement: (() => {
        const e = enforcement.get(r.id);
        return e
          ? { summary: e.summary, muted: e.restriction.muted, banned: e.restriction.banned }
          : undefined;
      })(),
      kids: (kidsByFamily.get(r.familyId) ?? []).map((k) => ({
        id: k.id,
        firstName: k.firstName,
        grade: k.grade,
      })),
      submittedLabel: new Date(r.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      createdAtMs: new Date(r.createdAt).getTime(),
    };
  });

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Parents</h2>
      <p className="text-sm text-white/60">
        {rows.length} submission{rows.length === 1 ? "" : "s"} · {kids.length}{" "}
        child{kids.length === 1 ? "" : "ren"}
      </p>
      {rows.length === 0 ? (
        <section className="rounded-lg border border-white/10 p-6 text-sm">
          No submissions yet.
        </section>
      ) : (
        <ParentsTable rows={data} />
      )}
    </div>
  );
}
