import { currentUser } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { desc } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db";
import { signups, children, type ChildRow } from "@/lib/db/schema/signups";
import { isAdminEmail, isEnvAdmin, dbAdminEmails } from "@/lib/admin";
import { setAdmin } from "./actions";

// Reads live auth + DB on every request — never statically cached.
export const dynamic = "force-dynamic";

function Shell({ children: c }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-full max-w-[1400px] flex-col gap-6 p-6 sm:p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Admin</h1>
        <UserButton />
      </header>
      {c}
    </main>
  );
}

function list(values?: string[] | null): string {
  return values && values.length ? values.join(", ") : "—";
}

export default async function AdminPage() {
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? undefined;

  if (!(await isAdminEmail(email))) {
    return (
      <Shell>
        <section className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-6 text-sm">
          You&rsquo;re signed in as <strong>{email ?? "unknown"}</strong>, but
          this account isn&rsquo;t an admin. Ask an existing admin to add your
          email.
        </section>
      </Shell>
    );
  }

  if (!hasDatabase()) {
    return (
      <Shell>
        <section className="rounded-lg border border-white/10 p-6 text-sm">
          <code>DATABASE_URL</code> isn&rsquo;t configured, so there are no
          submissions to show yet.
        </section>
      </Shell>
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

  const th = "px-3 py-2 text-left font-medium text-white/60 whitespace-nowrap";
  const td = "px-3 py-2 align-top border-t border-white/10";

  return (
    <Shell>
      <p className="text-sm text-white/60">
        {rows.length} submission{rows.length === 1 ? "" : "s"} · {kids.length}{" "}
        child{kids.length === 1 ? "" : "ren"} · {adminSet.size} DB admin
        {adminSet.size === 1 ? "" : "s"}
      </p>

      {rows.length === 0 ? (
        <section className="rounded-lg border border-white/10 p-6 text-sm">
          No submissions yet.
        </section>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-white/5">
              <tr>
                <th className={th}>Submitted</th>
                <th className={th}>Name</th>
                <th className={th}>Contact</th>
                <th className={th}>GitHub</th>
                <th className={th}>Affiliation</th>
                <th className={th}>Tech depth</th>
                <th className={th}>Time</th>
                <th className={th}>Skillsets</th>
                <th className={th}>Location</th>
                <th className={th}>Parent interests</th>
                <th className={th}>Children</th>
                <th className={th}>Photos</th>
                <th className={th}>Admin</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const lower = r.email.toLowerCase();
                const envAdmin = isEnvAdmin(r.email);
                const dbAdmin = adminSet.has(lower);
                const myKids = kidsBySignup.get(r.id) ?? [];
                return (
                  <tr key={r.id} className="hover:bg-white/[0.03]">
                    <td className={`${td} whitespace-nowrap text-white/60`}>
                      {new Date(r.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                    <td className={`${td} whitespace-nowrap font-medium`}>
                      {r.firstName} {r.lastName}
                    </td>
                    <td className={td}>
                      <a className="underline" href={`mailto:${r.email}`}>
                        {r.email}
                      </a>
                      <div className="text-white/60">{r.phone}</div>
                    </td>
                    <td className={`${td} whitespace-nowrap`}>
                      <a
                        className="underline"
                        href={`https://github.com/${r.githubUsername}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        @{r.githubUsername}
                      </a>
                    </td>
                    <td className={td}>{r.ohsAffiliation ?? "—"}</td>
                    <td className={td}>{r.technicalDepth ?? "—"}</td>
                    <td className={`${td} whitespace-nowrap`}>
                      {r.timeCommitment ?? "—"}
                    </td>
                    <td className={td}>{list(r.skillsets)}</td>
                    <td className={`${td} whitespace-nowrap`}>
                      {[r.city, r.state].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className={td}>{list(r.parentInterests)}</td>
                    <td className={td}>
                      {myKids.length === 0
                        ? "—"
                        : myKids.map((k) => (
                            <div key={k.id}>
                              {k.firstName}
                              {k.grade ? ` (${k.grade})` : ""}
                              {k.interests?.length
                                ? ` — ${k.interests.join(", ")}`
                                : ""}
                            </div>
                          ))}
                    </td>
                    <td className={`${td} whitespace-nowrap text-white/60`}>
                      {r.photos?.length ? `📷 ${r.photos.length}` : "—"}
                    </td>
                    <td className={`${td} whitespace-nowrap`}>
                      {envAdmin ? (
                        <span className="rounded bg-emerald-500/15 px-2 py-1 text-xs text-emerald-300">
                          Superadmin
                        </span>
                      ) : (
                        <form action={setAdmin} className="flex items-center gap-2">
                          <input type="hidden" name="email" value={r.email} />
                          <input
                            type="hidden"
                            name="make"
                            value={dbAdmin ? "false" : "true"}
                          />
                          {dbAdmin && (
                            <span className="rounded bg-emerald-500/15 px-2 py-1 text-xs text-emerald-300">
                              Admin
                            </span>
                          )}
                          <button
                            type="submit"
                            className={`rounded border px-2 py-1 text-xs transition-colors ${
                              dbAdmin
                                ? "border-red-500/30 text-red-300 hover:bg-red-500/10"
                                : "border-white/20 text-white/80 hover:bg-white/10"
                            }`}
                          >
                            {dbAdmin ? "Revoke" : "Make admin"}
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
