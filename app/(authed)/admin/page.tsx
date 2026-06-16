import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { desc } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db";
import { signups, children, type ChildRow } from "@/lib/db/schema/signups";
import { abbrState } from "@/lib/options";
import { isAdminEmail, isEnvAdmin, dbAdminEmails } from "@/lib/admin";
import { setAdmin } from "./actions";
import { Pills } from "./pills";
import { TableWrap, thCls, tdCls } from "./ui";
import { PencilIcon } from "./icons";
import { DeleteButton } from "./delete-button";

export const dynamic = "force-dynamic";

// "Existing parent (child(ren) currently enrolled at OHS)" -> "Existing parent"
function shortAffiliation(s?: string | null): string | null {
  if (!s) return null;
  return s.split(" (")[0];
}

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
  const [rows, kids, adminSet] = await Promise.all([
    db.select().from(signups).orderBy(desc(signups.createdAt)),
    db.select().from(children),
    dbAdminEmails(),
  ]);

  const kidsBySignup = new Map<string, ChildRow[]>();
  for (const k of kids) {
    const arr = kidsBySignup.get(k.signupId);
    if (arr) arr.push(k);
    else kidsBySignup.set(k.signupId, [k]);
  }

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
        <TableWrap>
          <thead>
            <tr>
              <th className={thCls}>Status</th>
              <th className={thCls}>Name</th>
              <th className={thCls}>Children</th>
              <th className={thCls}>Contact</th>
              <th className={thCls}>GitHub</th>
              <th className={thCls}>Affiliation</th>
              <th className={thCls}>Tech depth</th>
              <th className={thCls}>Time</th>
              <th className={thCls}>Skillsets</th>
              <th className={thCls}>Location</th>
              <th className={thCls}>Parent interests</th>
              <th className={thCls}>Photos</th>
              <th className={thCls}>Actions</th>
              <th className={thCls}>Submitted</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const dbAdmin = adminSet.has(r.email.toLowerCase());
              const envAdmin = isEnvAdmin(r.email);
              const myKids = kidsBySignup.get(r.id) ?? [];
              return (
                <tr
                  key={r.id}
                  id={`p-${r.id}`}
                  className="border-t border-white/10 odd:bg-white/[0.02] hover:bg-white/[0.05] target:bg-emerald-500/10"
                >
                  <td className={`${tdCls} whitespace-nowrap`}>
                    {envAdmin ? (
                      <span className="rounded-md bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300">
                        Superadmin
                      </span>
                    ) : (
                      <form action={setAdmin}>
                        <input type="hidden" name="email" value={r.email} />
                        <input type="hidden" name="make" value={dbAdmin ? "false" : "true"} />
                        <button
                          type="submit"
                          title="Click to toggle Admin / User"
                          className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
                            dbAdmin
                              ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                              : "border-white/20 bg-white/5 text-white/70 hover:bg-white/10"
                          }`}
                        >
                          {dbAdmin ? "Admin" : "User"}
                        </button>
                      </form>
                    )}
                  </td>
                  <th
                    scope="row"
                    className={`${tdCls} whitespace-nowrap text-left font-bold text-white`}
                  >
                    {r.firstName} {r.lastName}
                  </th>
                  <td className={tdCls}>
                    {myKids.length === 0 ? (
                      <span className="text-white/30">—</span>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        {myKids.map((k) => (
                          <Link
                            key={k.id}
                            href={`/admin/children?parent=${r.id}#c-${k.id}`}
                            className="font-bold text-teal-300 hover:underline"
                          >
                            {k.firstName}
                            {k.grade ? (
                              <span className="font-normal text-white/50"> ({k.grade})</span>
                            ) : null}
                          </Link>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className={tdCls}>
                    <a className="text-teal-300 hover:underline" href={`mailto:${r.email}`}>
                      {r.email}
                    </a>
                    <div className="text-white/50">{r.phone}</div>
                  </td>
                  <td className={`${tdCls} whitespace-nowrap`}>
                    <a
                      className="text-teal-300 hover:underline"
                      href={`https://github.com/${r.githubUsername}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      @{r.githubUsername}
                    </a>
                  </td>
                  <td className={tdCls}>
                    <Pills values={r.ohsAffiliation ? [shortAffiliation(r.ohsAffiliation)!] : null} />
                  </td>
                  <td className={`${tdCls} text-white/80`}>{r.technicalDepth ?? "—"}</td>
                  <td className={`${tdCls} whitespace-nowrap text-white/80`}>
                    {r.timeCommitment ?? "—"}
                  </td>
                  <td className={tdCls}>
                    <Pills values={r.skillsets} />
                  </td>
                  <td className={`${tdCls} whitespace-nowrap text-white/80`}>
                    {[r.city, abbrState(r.state)].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className={tdCls}>
                    <Pills values={r.parentInterests} />
                  </td>
                  <td className={`${tdCls} whitespace-nowrap text-white/50`}>
                    {r.photos?.length
                      ? `${r.photos.length} photo${r.photos.length === 1 ? "" : "s"}`
                      : "—"}
                  </td>
                  <td className={`${tdCls} whitespace-nowrap`}>
                    <div className="flex items-center gap-1">
                      <Link
                        href={`/admin/parents/${r.id}/edit`}
                        title="Edit"
                        className="rounded-md p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                      >
                        <PencilIcon />
                      </Link>
                      <DeleteButton id={r.id} name={`${r.firstName} ${r.lastName}`} />
                    </div>
                  </td>
                  <td className={`${tdCls} whitespace-nowrap text-white/50`}>
                    {new Date(r.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
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
