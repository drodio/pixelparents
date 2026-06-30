import { currentUser } from "@clerk/nextjs/server";
import { isAdminEmail } from "@/lib/admin";
import { hasDatabase } from "@/lib/db";
import { listReports } from "@/lib/db/reports";
import { updateStatus } from "./actions";

export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<string, string> = {
  bug: "Bug",
  abuse: "Abuse",
  other: "Other",
};

function fmt(d: Date | null): string {
  return d ? new Date(d).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }) : "—";
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "resolved"
      ? "border-emerald-500/40 text-emerald-300"
      : "border-yellow-500/40 text-yellow-300";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold uppercase ${cls}`}>
      {status}
    </span>
  );
}

function CategoryBadge({ category }: { category: string | null }) {
  const label = (category && CATEGORY_LABELS[category]) || category || "—";
  const cls =
    category === "abuse"
      ? "border-red-500/40 text-red-300"
      : category === "bug"
        ? "border-sky-500/40 text-sky-300"
        : "border-white/20 text-white/60";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold uppercase ${cls}`}>
      {label}
    </span>
  );
}

export default async function ReportsPage() {
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? undefined;
  if (!(await isAdminEmail(email))) return null;

  if (!hasDatabase()) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Reports</h2>
        <section className="rounded-lg border border-white/10 p-6 text-sm text-white/50">
          <code>DATABASE_URL</code> isn&apos;t configured.
        </section>
      </div>
    );
  }

  const reports = await listReports();
  const openCount = reports.filter((r) => r.status !== "resolved").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-semibold">Reports</h2>
        {openCount > 0 && (
          <span className="rounded-full border border-yellow-500/40 px-2 py-0.5 text-xs font-semibold text-yellow-300">
            {openCount} open
          </span>
        )}
      </div>
      <p className="text-sm text-white/50">
        Bug and abuse reports submitted from the public contact form.
      </p>

      {reports.length === 0 ? (
        <section className="rounded-lg border border-white/10 p-6 text-sm text-white/50">
          No reports yet.
        </section>
      ) : (
        <div className="flex flex-col gap-3">
          {reports.map((r) => {
            const resolved = r.status === "resolved";
            return (
              <section
                key={r.id}
                className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-4"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <CategoryBadge category={r.category} />
                  {r.contactEmail ? (
                    <a
                      href={`mailto:${r.contactEmail}`}
                      className="text-sm text-amber-400 underline decoration-amber-400/60 underline-offset-2 hover:text-amber-300"
                    >
                      {r.contactEmail}
                    </a>
                  ) : (
                    <span className="text-sm text-white/40">No contact provided</span>
                  )}
                  <span className="ml-auto">
                    <StatusBadge status={r.status} />
                  </span>
                </div>

                <p className="whitespace-pre-wrap text-sm text-white/70">{r.message}</p>

                <p className="text-xs text-white/40">
                  Submitted {fmt(r.createdAt)}
                  {resolved &&
                    ` · resolved ${fmt(r.resolvedAt)}${r.resolvedBy ? ` by ${r.resolvedBy}` : ""}`}
                  {r.sourcePath ? ` · from ${r.sourcePath}` : ""}
                </p>

                <div className="flex items-center gap-3">
                  <form action={updateStatus}>
                    <input type="hidden" name="id" value={r.id} />
                    <input
                      type="hidden"
                      name="status"
                      value={resolved ? "open" : "resolved"}
                    />
                    {resolved ? (
                      <button
                        type="submit"
                        className="rounded-full border border-white/20 px-4 py-1.5 text-sm font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
                      >
                        Reopen
                      </button>
                    ) : (
                      <button
                        type="submit"
                        className="rounded-full bg-emerald-500 px-4 py-1.5 text-sm font-semibold text-black transition hover:bg-emerald-400"
                      >
                        Mark resolved
                      </button>
                    )}
                  </form>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
