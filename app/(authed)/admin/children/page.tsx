import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { desc } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db";
import { signups, children } from "@/lib/db/schema/signups";
import { isAdminEmail } from "@/lib/admin";
import { ChildrenTable, type ChildTableRow } from "../children-table";

export const dynamic = "force-dynamic";

export default async function ChildrenPage({
  searchParams,
}: {
  searchParams: Promise<{ parent?: string }>;
}) {
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

  const { parent } = await searchParams;
  const db = getDb();
  const [kids, parents] = await Promise.all([
    db.select().from(children).orderBy(desc(children.createdAt)),
    db.select({ id: signups.id, firstName: signups.firstName, lastName: signups.lastName }).from(signups),
  ]);

  const parentById = new Map(parents.map((p) => [p.id, p]));
  const filtered = parent ? kids.filter((k) => k.signupId === parent) : kids;
  const filterParent = parent ? parentById.get(parent) : undefined;

  const data: ChildTableRow[] = filtered.map((k) => {
    const p = parentById.get(k.signupId);
    return {
      id: k.id,
      firstName: k.firstName,
      grade: k.grade,
      interests: k.interests,
      notes: k.notes,
      signupId: k.signupId,
      parentId: p?.id ?? null,
      parentName: p ? `${p.firstName} ${p.lastName}` : null,
    };
  });

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Children</h2>

      {filterParent ? (
        <p className="text-sm text-white/60">
          Showing children of{" "}
          <span className="font-semibold text-white">
            {filterParent.firstName} {filterParent.lastName}
          </span>{" "}
          ·{" "}
          <Link href="/admin/children" className="text-amber-400 hover:underline">
            Show all
          </Link>
        </p>
      ) : (
        <p className="text-sm text-white/60">
          {data.length} child{data.length === 1 ? "" : "ren"}
        </p>
      )}

      {data.length === 0 ? (
        <section className="rounded-lg border border-white/10 p-6 text-sm">
          No children yet.
        </section>
      ) : (
        <ChildrenTable rows={data} />
      )}
    </div>
  );
}
