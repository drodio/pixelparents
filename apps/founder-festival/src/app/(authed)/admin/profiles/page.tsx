import Link from "next/link";
import { adminGate, isSuperAdmin, getEstimateCents } from "@/lib/admin";
import { can, getViewerCostMultiplier, getViewerScopes, getViewerEmail } from "@/lib/grants";
import { applyCostMultiplier } from "@/lib/cost-multiplier";
import { NotAuthorized } from "@/components/admin/NotAuthorized";
import { listScoredProfilesPage, countScoredProfiles, type ScoredProfileRow } from "@/lib/profiles-scored";
import { buildProfileTableRows } from "@/lib/admin-profiles-rows";
import { refreshAvgCostStat, getAvgCostCents } from "@/lib/app-stats";
import { ProfilesScoredTable } from "@/components/admin/ProfilesScoredTable";
import { db } from "@/db";
import { scoringJobs } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { RunsPanel } from "@/components/admin/RunsPanel";
import { RescoreAllButton } from "@/components/admin/RescoreAllButton";
import { authorizedOrgBadges } from "@/lib/org-badges";

export const dynamic = "force-dynamic";

function fmtCents(c: number | null | undefined): string {
  if (c == null) return "—";
  return `$${(c / 100).toFixed(2)}`;
}

export default async function AdminProfilesPage() {
  const gate = await adminGate();
  if (!gate.ok) return <NotAuthorized email={gate.email} />;
  // RBAC: the Profiles section is gated on view_profiles (super-admins get it).
  if (!(await can("view_profiles"))) return <NotAuthorized email={null} />;
  // Score Detail exposes raw scoring grounding — super-admin (drodio) only.
  const superAdmin = await isSuperAdmin();

  // RBAC scope: a "theirs"-scoped role only sees profiles from bulk jobs it
  // created (matched by email). null email while scoped → "" (matches nothing).
  const scopes = await getViewerScopes();
  const scopedToMine = scopes.users === "theirs";
  const ownerEmail = scopedToMine ? (await getViewerEmail()) ?? "" : null;
  // First page server-rendered; the table infinite-scrolls the rest via
  // /api/admin/profiles/list. Initial page of 200 keeps the header cost stats
  // (summed over loaded rows) consistent with the prior behavior.
  const INITIAL_PAGE = 200;
  const profiles: ScoredProfileRow[] = await listScoredProfilesPage(null, INITIAL_PAGE, ownerEmail);

  // Average cost: refresh on load (so it reflects existing data + stays current
  // for the developer API to read from app_stats), then read the value.
  let avgCostCents: number | null = null;
  try {
    avgCostCents = await refreshAvgCostStat();
  } catch {
    avgCostCents = await getAvgCostCents().catch(() => null);
  }

  const totalCost = profiles.reduce((a, p) => a + (p.costCents ?? 0), 0);
  const totalCharge = profiles.reduce((a, p) => a + p.chargeCents, 0);
  // Cost figures are ×mult for the viewer (super = 1). Charge is real billed
  // revenue (what a developer actually paid) and stays un-multiplied.
  const costMult = await getViewerCostMultiplier();
  const showCost = (c: number | null) => fmtCents(applyCostMultiplier(c, costMult));

  const canRun = await can("run_scoring_jobs");
  const [jobs, totalProfiles, sonnetCents, opusCents] = await Promise.all([
    // Scope the runs list to the viewer's own jobs when "theirs"-scoped.
    db
      .select()
      .from(scoringJobs)
      .where(ownerEmail !== null ? eq(scoringJobs.createdByEmail, ownerEmail) : undefined)
      .orderBy(desc(scoringJobs.createdAt))
      .limit(50),
    countScoredProfiles(ownerEmail),
    getEstimateCents("sonnet"),
    getEstimateCents("opus"),
  ]);

  // Shared serializer (page + pagination API can't drift). Cost is ×mult for the
  // viewer (super = 1); charge stays un-multiplied.
  const rows = await buildProfileTableRows(profiles, costMult);
  // Org badges this viewer may bulk-apply (super → all; else their assignments).
  const orgBadges = (await authorizedOrgBadges()).map((b) => ({ id: b.id, label: b.label }));
  // Cursor for the table's first "load more" — null when the first page is everything.
  const lastProfile = profiles[profiles.length - 1];
  const initialNextCursor =
    lastProfile && profiles.length < totalProfiles
      ? `${lastProfile.updatedAt.toISOString()}|${lastProfile.id}`
      : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Profiles scored</h1>
          <p className="text-sm text-zinc-500 mt-1 tabular-nums">
            {totalProfiles.toLocaleString("en-US")} profiles · avg cost {showCost(avgCostCents)} · total
            cost {showCost(totalCost)} · total charged {fmtCents(totalCharge)}
          </p>
          {scopedToMine && (
            <p className="text-xs text-zinc-600 mt-1 max-w-2xl">
              Showing only profiles from bulk jobs you created.
            </p>
          )}
        </div>
        {canRun && (
          <Link
            href="/admin/profiles/new"
            className="shrink-0 rounded-md bg-white text-black font-medium px-4 py-2 text-sm hover:bg-zinc-200"
          >
            + New Bulk Scoring Job
          </Link>
        )}
      </div>

      {canRun && (
        <div className="flex flex-col gap-2">
          {/* Re-Run All is cross-tenant — hidden for "theirs"-scoped admins. */}
          {!scopedToMine && (
            <div className="flex justify-end">
              <RescoreAllButton
                count={totalProfiles}
                centsPerProfile={{ sonnet: sonnetCents, opus: opusCents }}
              />
            </div>
          )}
          <RunsPanel jobs={jobs} canRun={canRun} costMult={costMult} />
        </div>
      )}

      {totalProfiles === 0 ? (
        <p className="text-sm text-zinc-500 italic">No profiles scored yet.</p>
      ) : (
        <ProfilesScoredTable
          rows={rows}
          superAdmin={superAdmin}
          initialNextCursor={initialNextCursor}
          totalCount={totalProfiles}
          orgBadges={orgBadges}
        />
      )}
    </div>
  );
}
