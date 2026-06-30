import { currentUser } from "@clerk/nextjs/server";
import { isAdminEmail } from "@/lib/admin";
import { hasDatabase } from "@/lib/db";
import { listPendingClients } from "@/lib/oauth/store";
import { requestsMinorData } from "@/lib/oauth/config";
import { approveApp, rejectApp } from "./actions";

export const dynamic = "force-dynamic";

function fmt(d: string | null): string {
  return d ? new Date(d).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }) : "—";
}

// Admin review queue for "Sign in with Pixel Parents" apps awaiting approval. Apps
// whose owner has approved API access go live automatically and never appear here;
// this is for per-app approval (and rejecting apps over-reaching for minors' data).
export default async function AdminOAuthAppsPage() {
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? undefined;
  if (!(await isAdminEmail(email))) return null;

  if (!hasDatabase()) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Sign-in Apps</h2>
        <section className="rounded-lg border border-white/10 p-6 text-sm text-white/50">
          <code>DATABASE_URL</code> isn&apos;t configured.
        </section>
      </div>
    );
  }

  const pending = await listPendingClients();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold">Sign-in Apps</h2>
        <p className="mt-1 text-sm text-white/55">
          Apps awaiting approval. Approving lets them sign users in. Apps requesting OHS
          students&apos; data are flagged for extra scrutiny.
        </p>
      </div>

      {pending.length === 0 ? (
        <section className="rounded-lg border border-white/10 p-6 text-sm text-white/50">
          No apps awaiting approval.
        </section>
      ) : (
        <div className="flex flex-col gap-3">
          {pending.map((a) => {
            const minor = requestsMinorData(a.allowed_scopes);
            return (
              <section
                key={a.id}
                className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-4"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-semibold">{a.name}</span>
                  <code className="font-mono text-xs text-white/50">{a.client_id}</code>
                  {minor && (
                    <span className="ml-auto rounded-full border border-amber-400/40 px-2 py-0.5 text-[11px] font-semibold uppercase text-amber-300">
                      requests minor data
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {a.allowed_scopes.map((s) => (
                    <span
                      key={s}
                      className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[11px] text-white/60"
                    >
                      {s}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-white/40">
                  Redirects: {a.redirect_uris.join(", ") || "none"} · registered {fmt(a.created_at)}
                </p>

                <div className="flex flex-wrap items-end gap-3">
                  <form action={approveApp}>
                    <input type="hidden" name="id" value={a.id} />
                    <button
                      type="submit"
                      className="rounded-full bg-emerald-500 px-4 py-1.5 text-sm font-semibold text-black transition hover:bg-emerald-400"
                    >
                      Approve
                    </button>
                  </form>
                  <form action={rejectApp} className="flex items-end gap-2">
                    <input type="hidden" name="id" value={a.id} />
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
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
