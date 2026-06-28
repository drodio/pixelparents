import { db } from "@/db";
import { evaluations, scoreItems } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { PendingItemRow } from "@/components/admin/PendingItemRow";
import { adminGate } from "@/lib/admin";
import { can } from "@/lib/grants";
import { NotAuthorized } from "@/components/admin/NotAuthorized";
import { getProfileConflicts } from "@/lib/pending-items";
import { ProfileConflictCard } from "@/components/admin/ProfileConflictCard";

export const dynamic = "force-dynamic";

export default async function PendingItemsPage() {
  const gate = await adminGate();
  if (!gate.ok) return <NotAuthorized email={gate.email} />;
  // RBAC: the Pending Items section is gated on manage_pending (supers get it).
  if (!(await can("manage_pending"))) return <NotAuthorized email={null} />;
  // Pending = score_items rows that were modified by an owner and are waiting
  // for admin review. Join to evaluations so the admin can see whose row this
  // is and click through to the full /profile page if they want more context.
  const rows = await db
    .select({
      item: scoreItems,
      evalFullName: evaluations.fullName,
      evalLinkedinUrl: evaluations.linkedinUrl,
    })
    .from(scoreItems)
    .leftJoin(evaluations, eq(scoreItems.evaluationId, evaluations.id))
    .where(eq(scoreItems.status, "pending"))
    .orderBy(desc(scoreItems.updatedAt))
    .limit(200);

  // Group by evaluation so the admin can review one person at a time.
  const grouped = new Map<
    string,
    { fullName: string | null; linkedinUrl: string; items: typeof rows }
  >();
  for (const r of rows) {
    const key = r.item.evaluationId;
    if (!grouped.has(key)) {
      grouped.set(key, {
        fullName: r.evalFullName,
        linkedinUrl: r.evalLinkedinUrl ?? "",
        items: [],
      });
    }
    grouped.get(key)!.items.push(r);
  }

  // Profile conflicts: one verified email → ≥2 evaluations (duplicate / mis-linked
  // profiles, e.g. the Patricia Liu case).
  const conflicts = await getProfileConflicts();
  const totalPending = grouped.size + conflicts.length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold tracking-tight">
          Pending items
        </h1>
        <span className="text-sm">
          {totalPending === 0 ? (
            <span className="text-zinc-400">nothing pending</span>
          ) : (
            <span className="font-bold text-red-500">{totalPending} pending</span>
          )}
        </span>
      </div>

      {conflicts.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-xl font-semibold">
            Profile conflicts{" "}
            <span className="text-sm font-normal text-zinc-500">
              — one email maps to multiple profiles (duplicate or mis-linked)
            </span>
          </h2>
          <div className="flex flex-col gap-4">
            {conflicts.map((c) => (
              <ProfileConflictCard key={c.email} email={c.email} profiles={c.profiles} />
            ))}
          </div>
        </section>
      )}

      {grouped.size > 0 && conflicts.length > 0 && (
        <h2 className="font-display text-xl font-semibold mt-2">Owner-edited score rows</h2>
      )}

      {rows.length === 0 && conflicts.length === 0 ? (
        <p className="text-zinc-500 italic py-12 text-center">
          Nothing pending. Owner-edited score items and profile conflicts (one email
          on multiple profiles) show up here for admin attention.
        </p>
      ) : rows.length === 0 ? null : (
        <div className="flex flex-col gap-8">
          {[...grouped.entries()].map(([evalId, group]) => (
            <section key={evalId} className="flex flex-col gap-3">
              <header className="flex items-baseline gap-3 border-b border-zinc-800 pb-2">
                <h2 className="font-display text-xl font-semibold">
                  {group.fullName ?? "(unknown)"}
                </h2>
                <a
                  href={`/profile?e=${evalId}`}
                  className="link text-xs"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  view on /profile →
                </a>
              </header>
              <ul className="flex flex-col gap-2">
                {group.items.map((r) => (
                  <PendingItemRow
                    key={r.item.id}
                    item={{
                      id: r.item.id,
                      rubric: r.item.rubric,
                      reason: r.item.reason,
                      points: r.item.points,
                      originalReason: r.item.originalReason,
                      originalPoints: r.item.originalPoints,
                      confidence: r.item.confidence,
                    }}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
