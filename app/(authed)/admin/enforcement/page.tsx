import Link from "next/link";
import { hasDatabase, getDb } from "@/lib/db";
import { signups } from "@/lib/db/schema/signups";
import { listAllEnforcement } from "@/lib/db/enforcement";
import { listAppLogs } from "@/lib/db/app-logs";
import { isActive } from "@/lib/enforcement";
import { EnforceForm, RevokeButton } from "./enforce-form";

export const dynamic = "force-dynamic";

function fmt(d: Date | null): string {
  return d
    ? new Date(d).toLocaleString("en-US", {
        timeZone: "America/Los_Angeles",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";
}

const KIND_CLS: Record<string, string> = {
  ban: "border-red-500/40 bg-red-500/10 text-red-300",
  mute: "border-yellow-500/40 bg-yellow-500/10 text-yellow-300",
  delete: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  note: "border-white/20 bg-white/5 text-white/60",
};

export default async function EnforcementPage({
  searchParams,
}: {
  searchParams: Promise<{ signupId?: string }>;
}) {
  const sp = await searchParams;
  if (!hasDatabase()) {
    return <p className="text-sm text-white/60">Enforcement needs a database connection.</p>;
  }

  const [actions, members, adminAudit] = await Promise.all([
    listAllEnforcement(200),
    getDb()
      .select({ id: signups.id, firstName: signups.firstName, lastName: signups.lastName, email: signups.email })
      .from(signups)
      .limit(500),
    // Admin activity, pulled from the shared audit log so moderation and every
    // other admin action live in one timeline rather than two.
    listAppLogs({ q: "admin.", limit: 100 }),
  ]);

  const target = sp.signupId ? members.find((m) => m.id === sp.signupId) : null;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-white">Enforcement</h1>
        <p className="mt-1 text-sm text-white/50">
          Mutes, bans, content deletes and notes. Timed actions lapse on their own — nothing
          has to run to un-apply them.
        </p>
      </header>

      {target ? (
        <EnforceForm
          signupId={target.id}
          subjectName={`${target.firstName} ${target.lastName}`.trim() || target.email}
        />
      ) : (
        <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <h3 className="text-sm font-semibold text-white">Pick a member</h3>
          <p className="mt-1 text-xs text-white/50">
            Choose who to act on. You can also reach this from the Enforcement column on the
            Parents list.
          </p>
          <div className="mt-3 flex max-h-64 flex-col gap-1 overflow-y-auto">
            {members
              .filter((m) => (m.firstName ?? "").trim())
              .slice(0, 200)
              .map((m) => (
                <Link
                  key={m.id}
                  href={`/admin/enforcement?signupId=${m.id}`}
                  className="truncate rounded px-2 py-1 text-sm text-white/70 hover:bg-white/10 hover:text-white"
                >
                  {m.firstName} {m.lastName}
                </Link>
              ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-white/40">
          Recent actions
        </h2>
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
          {actions.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-white/45">
              No enforcement actions yet.
            </p>
          ) : (
            actions.map((a) => (
              <div
                key={a.id}
                className="grid grid-cols-[7rem_5rem_1fr_auto] items-start gap-3 border-b border-white/8 px-3 py-2 text-sm last:border-0"
              >
                <span className="font-mono text-xs text-white/45">{fmt(a.createdAt)}</span>
                <span
                  className={`w-fit rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase ${
                    KIND_CLS[a.kind] ?? KIND_CLS.note
                  }`}
                >
                  {a.kind}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-white/80">
                    {a.subjectEmail ?? a.signupId.slice(0, 8)} — {a.reason}
                  </span>
                  <span className="block text-xs text-white/40">
                    by {a.adminEmail}
                    {a.expiresAt ? ` · until ${fmt(a.expiresAt)}` : a.kind === "mute" || a.kind === "ban" ? " · permanent" : ""}
                    {a.revokedAt ? ` · lifted ${fmt(a.revokedAt)}` : ""}
                  </span>
                </span>
                <span>{isActive(a) ? <RevokeButton actionId={a.id} /> : null}</span>
              </div>
            ))
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-white/40">
          Admin audit log
        </h2>
        <p className="mb-2 text-xs text-white/45">
          Every admin action, from the shared audit log.{" "}
          <Link href="/admin/logs?q=admin." className="text-amber-400 hover:underline">
            Open in the full log explorer →
          </Link>
        </p>
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
          {adminAudit.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-white/45">No admin actions recorded yet.</p>
          ) : (
            adminAudit.map((l) => (
              <div
                key={l.id}
                className="grid grid-cols-[7rem_1fr] gap-3 border-b border-white/8 px-3 py-2 text-sm last:border-0"
              >
                <span className="font-mono text-xs text-white/45">{fmt(l.createdAt)}</span>
                <span className="min-w-0">
                  <span className="block truncate font-mono text-xs text-amber-300/90">{l.event}</span>
                  <span className="block truncate text-white/70">{l.message ?? "—"}</span>
                  {l.actorEmail && (
                    <span className="block text-xs text-white/40">by {l.actorEmail}</span>
                  )}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
