import { getSql } from "./db";

// OHS-directory access approval, stored in signups.extra:
//   approvalStatus: "pending" | "approved" | "denied"
//   approvalBy:     first name of the admin who acted (for "already X by Y")
//   approvalAt:     ISO timestamp of the decision
export type ApprovalStatus = "pending" | "approved" | "denied";

// Read the directory-access approval status off a signup's `extra` jsonb. A
// missing/unknown value is treated as "pending" (the default for older rows that
// predate the approval model). Pure + safe to call from server components.
export function readApprovalStatus(
  extra: Record<string, unknown> | null | undefined,
): ApprovalStatus {
  const v = extra?.approvalStatus;
  return v === "approved" || v === "denied" ? v : "pending";
}

export type ApprovalDecision = {
  // "done" = this call recorded the decision; "already" = another admin (or this
  // one) had already acted, so we left the existing decision untouched.
  outcome: "done" | "already";
  status: ApprovalStatus;
  by: string | null;
};

// Atomically record an approve/deny decision. The WHERE clause only matches a row
// still in the "pending" state (treating a missing approvalStatus as pending), so
// the FIRST admin to act wins and concurrent clicks can't clobber each other —
// the single UPDATE row-locks the row. If 0 rows update, someone already decided;
// we read back the existing decision so the caller can show "already X by Y".
export async function recordApprovalDecision(
  id: string,
  decision: "approved" | "denied",
  byFirstName: string,
  atIso: string,
): Promise<ApprovalDecision> {
  const sql = getSql();
  const updated = (await sql`
    UPDATE signups
    SET extra = jsonb_set(jsonb_set(jsonb_set(
          COALESCE(extra, '{}'::jsonb),
          '{approvalStatus}', to_jsonb(${decision}::text), true),
          '{approvalBy}', to_jsonb(${byFirstName}::text), true),
          '{approvalAt}', to_jsonb(${atIso}::text), true)
    WHERE id = ${id}
      AND COALESCE(extra->>'approvalStatus', 'pending') = 'pending'
    RETURNING extra->>'approvalStatus' AS status, extra->>'approvalBy' AS by
  `) as Array<{ status: string; by: string | null }>;

  if (updated.length > 0) {
    return { outcome: "done", status: updated[0].status as ApprovalStatus, by: updated[0].by };
  }

  // Already decided (or row missing) — read the current decision to report it.
  const current = (await sql`
    SELECT extra->>'approvalStatus' AS status, extra->>'approvalBy' AS by
    FROM signups WHERE id = ${id} LIMIT 1
  `) as Array<{ status: string | null; by: string | null }>;

  if (current.length === 0) {
    return { outcome: "already", status: "pending", by: null };
  }
  return {
    outcome: "already",
    status: (current[0].status as ApprovalStatus) ?? "pending",
    by: current[0].by,
  };
}
