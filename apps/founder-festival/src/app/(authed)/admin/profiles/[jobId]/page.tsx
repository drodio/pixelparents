import Link from "next/link";
import { adminGate, isSuperAdmin } from "@/lib/admin";
import { can, getViewerCostMultiplier } from "@/lib/grants";
import { applyCostMultiplier } from "@/lib/cost-multiplier";
import { isUuid } from "@/lib/canonicalize";
import { canAccessJob } from "@/lib/ownership";
import { NotAuthorized } from "@/components/admin/NotAuthorized";
import { listProfilesForJob } from "@/lib/profiles-scored";
import { fmtLocation, fmtSubjectLocation, resolveEmails, resolvePhones, profileEmailInfo, profilePhoneInfo } from "@/lib/admin-profiles-view";
import { ProfilesScoredTable, type ProfileTableRow } from "@/components/admin/ProfilesScoredTable";
import { JobLiveProgress } from "@/components/admin/JobLiveProgress";
import { authorizedOrgBadges } from "@/lib/org-badges";
import { JobTitleEditor } from "@/components/admin/JobTitleEditor";
import { RetryFailedButton } from "@/components/admin/RetryFailedButton";

export const dynamic = "force-dynamic";

export default async function AdminRunProfilesPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const gate = await adminGate();
  if (!gate.ok) return <NotAuthorized email={gate.email} />;
  // Either grant can watch a run: view_profiles (the list) or run_scoring_jobs
  // (a scoring-only admin who just created it and was redirected here).
  if (!((await can("view_profiles")) || (await can("run_scoring_jobs")))) {
    return <NotAuthorized email={null} />;
  }
  const superAdmin = await isSuperAdmin();

  const { jobId } = await params;
  if (!isUuid(jobId)) return <NotAuthorized email={null} />;
  // RBAC scope: a "theirs"-scoped role can only open its own runs.
  if (!(await canAccessJob(jobId))) return <NotAuthorized email={null} />;

  const { job, rows: profiles, unresolvedCount } = await listProfilesForJob(jobId);
  if (!job) return <NotAuthorized email={null} />;
  const canRun = await can("run_scoring_jobs");

  const claimerIds = [
    ...new Set(profiles.map((p) => p.claimerClerkUserId).filter((x): x is string => !!x)),
  ];
  const [emailById, phoneById] = await Promise.all([resolveEmails(claimerIds), resolvePhones(claimerIds)]);
  // Cost is shown ×mult for the viewer (super = 1), matching /admin/profiles.
  const costMult = await getViewerCostMultiplier();
  const orgBadges = (await authorizedOrgBadges()).map((b) => ({ id: b.id, label: b.label }));

  const rows: ProfileTableRow[] = profiles.map((p) => ({
    id: p.id,
    fullName: p.fullName,
    linkedinUrl: p.linkedinUrl,
    profileHref: p.profileHref,
    source: p.source,
    founderScore: p.founderScore,
    investorScore: p.investorScore,
    combinedScore: p.combinedScore,
    leaderboardRank: p.leaderboardRank,
    badges: p.badges,
    companyName: p.companyName,
    companyUrl: p.companyUrl,
    costCents: applyCostMultiplier(p.costCents, costMult),
    chargeCents: p.chargeCents,
    ...profileEmailInfo(p, emailById),
    ...profilePhoneInfo(p, phoneById),
    jobTitle: p.jobTitle,
    updatedAtIso: p.updatedAt.toISOString(),
    requestIp: p.requestIp,
    requestLocation: fmtLocation(p),
    subjectLocation: fmtSubjectLocation(p),
    subjectCity: p.subjectCity,
    subjectRegion: p.subjectRegion,
    subjectCountry: p.subjectCountry,
    runs: p.runs,
    status: p.status,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/admin/profiles" className="link text-sm">
            ← All profiles
          </Link>
          {canRun ? (
            <JobTitleEditor jobId={jobId} initialTitle={job.title} />
          ) : (
            <h1 className="font-display text-3xl font-bold tracking-tight mt-1">
              {job.title?.trim() || "Untitled run"}
            </h1>
          )}
          <p className="text-sm text-zinc-500 mt-1 tabular-nums">
            {profiles.length} scored
            {unresolvedCount > 0 ? ` · ${unresolvedCount} not yet scored` : ""}
            {job.failedItems > 0 ? ` · ${job.failedItems} failed` : ""}
          </p>
        </div>
        {canRun && job.failedItems > 0 && (
          <RetryFailedButton jobId={jobId} failedCount={job.failedItems} />
        )}
      </div>

      <JobLiveProgress jobId={jobId} costMultiplier={costMult} />

      {/* Show the table even when nothing has scored yet — `liveJobId` makes
          ProfilesScoredTable render ghost rows for the in-flight subjects,
          which is exactly what the empty-state used to caption in prose. */}
      <ProfilesScoredTable
        rows={rows}
        superAdmin={superAdmin}
        exportName={job.title}
        liveJobId={jobId}
        orgBadges={orgBadges}
      />
    </div>
  );
}
