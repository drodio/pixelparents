import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db";
import { signups } from "@/lib/db/schema/signups";
import { isAdminEmail } from "@/lib/admin";
import { getSignupByEmail } from "@/lib/db/signups";
import { recordApprovalDecision, type ApprovalStatus } from "@/lib/approval";
import { abbrState } from "@/lib/options";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function builderLabel(v: unknown): string {
  switch (v) {
    case "builder": return "Yes: Technical";
    case "aspiring": return "Yes: Curious";
    case "no": return "No";
    default: return "—";
  }
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-2 py-1.5">
      <span className="text-sm text-white/50">{label}</span>
      <span className="text-sm text-white/90">{value || <span className="text-white/30">—</span>}</span>
    </div>
  );
}

export default async function VerifyProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ action?: string }>;
}) {
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? undefined;
  if (!(await isAdminEmail(email))) {
    return <p className="text-sm text-white/60">You don&rsquo;t have access to this page.</p>;
  }

  const { id } = await params;
  const { action } = await searchParams;
  if (!hasDatabase() || !UUID_RE.test(id)) {
    return <p className="text-sm text-white/60">Record not found.</p>;
  }

  const [row] = await getDb().select().from(signups).where(eq(signups.id, id)).limit(1);
  if (!row) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-white/60">That submission no longer exists.</p>
        <Link href="/admin" className="text-sm text-amber-400 hover:underline">← Back to Parents</Link>
      </div>
    );
  }

  const applicantName = `${row.firstName} ${row.lastName}`.trim();

  // Resolve THIS admin's first name for the "by" attribution (Clerk first, then
  // their own signup, then a generic fallback).
  let adminFirst = (user?.firstName ?? "").trim();
  if (!adminFirst && email) {
    try {
      adminFirst = (await getSignupByEmail(email))?.firstName?.trim() ?? "";
    } catch {
      /* best-effort */
    }
  }
  if (!adminFirst) adminFirst = "An admin";

  // If the link carries an action, record the decision (atomic, first-wins).
  let justActed: { outcome: "done" | "already"; status: ApprovalStatus; by: string | null } | null = null;
  if (action === "approve" || action === "deny") {
    justActed = await recordApprovalDecision(
      id,
      action === "approve" ? "approved" : "denied",
      adminFirst,
      new Date().toISOString(),
    );
  }

  const extra = (row.extra ?? {}) as Record<string, unknown>;
  const status: ApprovalStatus = justActed
    ? justActed.status
    : ((extra.approvalStatus as ApprovalStatus) ?? "pending");
  const decidedBy = justActed ? justActed.by : ((extra.approvalBy as string) ?? null);

  const statusBadge =
    status === "approved" ? (
      <span className="rounded-md bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300">Approved</span>
    ) : status === "denied" ? (
      <span className="rounded-md bg-red-500/15 px-2.5 py-1 text-xs font-medium text-red-300">Denied</span>
    ) : (
      <span className="rounded-md bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-300">Pending</span>
    );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/admin" className="text-sm text-amber-400 hover:underline">← Back to Parents</Link>
        <h2 className="mt-2 text-xl font-semibold">Verify — {applicantName}</h2>
      </div>

      {/* Outcome banner after clicking an approve/deny link. */}
      {justActed && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            justActed.outcome === "done"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
              : "border-white/15 bg-white/5 text-white/80"
          }`}
        >
          {justActed.outcome === "done"
            ? `You ${status === "approved" ? "approved" : "denied"} ${applicantName}. Thanks — this is now resolved for all admins.`
            : `Already ${status === "approved" ? "approved" : "denied"}${decidedBy ? ` by ${decidedBy}` : ""}.`}
        </div>
      )}

      <div className="flex items-center gap-3">
        <span className="text-sm text-white/50">Status:</span>
        {statusBadge}
        {status !== "pending" && decidedBy && (
          <span className="text-sm text-white/50">by {decidedBy}</span>
        )}
      </div>

      <div className="rounded-xl border border-white/10 p-5">
        <Row label="Name" value={applicantName} />
        <Row label="Email" value={row.email} />
        <Row label="Phone" value={row.phone} />
        <Row label="GitHub" value={row.githubUsername ? `@${row.githubUsername}` : null} />
        <Row label="Affiliation" value={row.ohsAffiliation} />
        <Row label="Builder?" value={builderLabel(extra.builderInterest)} />
        <Row label="Tech depth" value={row.technicalDepth} />
        <Row label="Time/week" value={row.timeCommitment} />
        <Row label="Skillsets" value={row.skillsets?.length ? row.skillsets.join(", ") : null} />
        <Row
          label="Location"
          value={[row.city, abbrState(row.state)].filter(Boolean).join(", ") || null}
        />
        <Row
          label="Parent interests"
          value={row.parentInterests?.length ? row.parentInterests.join(", ") : null}
        />
      </div>

      {/* Action buttons — only while still pending. These are plain links so they
          match the one-click approve/deny links sent to admins by email. */}
      {status === "pending" ? (
        <div className="flex items-center gap-3">
          <Link
            href={`/admin/verify/${id}?action=approve`}
            className="rounded-full bg-emerald-500/20 px-5 py-2 text-sm font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/30"
          >
            Approve
          </Link>
          <Link
            href={`/admin/verify/${id}?action=deny`}
            className="rounded-full bg-red-500/20 px-5 py-2 text-sm font-semibold text-red-200 transition-colors hover:bg-red-500/30"
          >
            Deny
          </Link>
          <Link
            href={`/admin/parents/${id}/edit`}
            className="rounded-full border border-white/20 px-5 py-2 text-sm text-white/80 transition-colors hover:bg-white/10"
          >
            Edit full profile
          </Link>
        </div>
      ) : (
        <Link
          href={`/admin/parents/${id}/edit`}
          className="self-start rounded-full border border-white/20 px-5 py-2 text-sm text-white/80 transition-colors hover:bg-white/10"
        >
          Edit full profile
        </Link>
      )}
    </div>
  );
}
