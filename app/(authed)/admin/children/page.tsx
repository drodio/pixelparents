import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { desc } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db";
import { signups, children } from "@/lib/db/schema/signups";
import { isAdminEmail } from "@/lib/admin";
import { Pills } from "../pills";
import { TableWrap, thCls, tdCls } from "../ui";
import { PencilIcon } from "../icons";
import { DeleteChildButton } from "../delete-child-button";

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
          <Link href="/admin/children" className="text-teal-300 hover:underline">
            Show all
          </Link>
        </p>
      ) : (
        <p className="text-sm text-white/60">
          {filtered.length} child{filtered.length === 1 ? "" : "ren"}
        </p>
      )}

      {filtered.length === 0 ? (
        <section className="rounded-lg border border-white/10 p-6 text-sm">
          No children yet.
        </section>
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <th className={thCls}>Child</th>
              <th className={thCls}>Parent</th>
              <th className={thCls}>Grade</th>
              <th className={thCls}>Interests</th>
              <th className={thCls}>Notes</th>
              <th className={thCls}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((k) => {
              const p = parentById.get(k.signupId);
              return (
                <tr
                  key={k.id}
                  id={`c-${k.id}`}
                  className="border-t border-white/10 odd:bg-white/[0.02] hover:bg-white/[0.05] target:bg-emerald-500/10"
                >
                  <th scope="row" className={`${tdCls} whitespace-nowrap text-left font-bold text-white`}>
                    {k.firstName}
                  </th>
                  <td className={`${tdCls} whitespace-nowrap`}>
                    {p ? (
                      <Link href={`/admin#p-${p.id}`} className="text-teal-300 hover:underline">
                        {p.firstName} {p.lastName}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={`${tdCls} whitespace-nowrap text-white/80`}>{k.grade ?? "—"}</td>
                  <td className={tdCls}>
                    <Pills values={k.interests} />
                  </td>
                  <td className={`${tdCls} max-w-md text-white/80`}>{k.notes || "—"}</td>
                  <td className={`${tdCls} whitespace-nowrap`}>
                    <div className="flex items-center gap-1">
                      <Link
                        href={`/signup/thanks?id=${k.signupId}&admin=1`}
                        title="Edit child(ren) details"
                        className="rounded-md p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                      >
                        <PencilIcon />
                      </Link>
                      <DeleteChildButton id={k.id} name={k.firstName} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}
    </div>
  );
}
