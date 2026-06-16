import { currentUser } from "@clerk/nextjs/server";
import { isAdminEmail } from "@/lib/admin";
import { hasDatabase } from "@/lib/db";
import { listRequests } from "@/lib/db/api-keys";
import { approve, reject } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_ORDER: Record<string, number> = { pending: 0, approved: 1, rejected: 2 };

function fmt(d: Date | null): string {
  return d ? new Date(d).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }) : "—";
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "approved"
      ? "border-emerald-500/40 text-emerald-300"
      : status === "rejected"
        ? "border-red-500/40 text-red-300"
        : "border-yellow-500/40 text-yellow-300";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold uppercase ${cls}`}>
      {status}
    </span>
  );
}

export default async function ApiRequestsPage() {
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? undefined;
  if (!(await isAdminEmail(email))) return null;

  if (!hasDatabase()) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">API Requests</h2>
        <section className="rounded-lg border border-white/10 p-6 text-sm text-white/50">
          <code>DATABASE_URL</code> isn&apos;t configured.
        </section>
      </div>
    );
  }

  const requests = (await listRequests()).sort(
    (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9),
  );

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">API Requests</h2>
      {requests.length === 0 ? (
        <section className="rounded-lg border border-white/10 p-6 text-sm text-white/50">
          No requests yet.
        </section>
      ) : (
        <div className="flex flex-col gap-3">
          {requests.map((r) => (
            <section
              key={r.id}
              className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-4"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-semibold">{r.name}</span>
                <span className="text-sm text-white/50">{r.email}</span>
                <span className="ml-auto">
                  <StatusBadge status={r.status} />
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-white/70">{r.intendedUse}</p>
              <p className="text-xs text-white/40">
                Requested {fmt(r.createdAt)}
                {r.status !== "pending" &&
                  ` · ${r.status} ${fmt(r.decidedAt)}${r.decidedBy ? ` by ${r.decidedBy}` : ""}`}
                {r.rejectReason ? ` · reason: ${r.rejectReason}` : ""}
                {r.keyHash ? " · key revealed" : ""}
              </p>

              {r.status === "pending" && (
                <div className="flex flex-wrap items-end gap-3">
                  <form action={approve}>
                    <input type="hidden" name="id" value={r.id} />
                    <button
                      type="submit"
                      className="rounded-full bg-emerald-500 px-4 py-1.5 text-sm font-semibold text-black transition hover:bg-emerald-400"
                    >
                      Approve
                    </button>
                  </form>
                  <form action={reject} className="flex items-end gap-2">
                    <input type="hidden" name="id" value={r.id} />
                    <input
                      name="reason"
                      placeholder="Reason (optional)"
                      maxLength={500}
                      className="rounded-md border border-white/15 bg-black/40 px-3 py-1.5 text-sm text-white outline-none focus:border-red-400/60"
                    />
                    <button
                      type="submit"
                      className="rounded-full border border-red-500/50 px-4 py-1.5 text-sm font-semibold text-red-300 transition hover:bg-red-500/10"
                    >
                      Reject
                    </button>
                  </form>
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
