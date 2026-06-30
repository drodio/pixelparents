import { getSql, hasDatabase } from "../db";

// ---------------------------------------------------------------------------
// Contact / bug-abuse reports data layer.
//
// `hello@pixelparents.org` is not a real mailbox, so the landing "Report a bug
// or abuse" form persists to this DB table instead of emailing a dead address.
// The table is the source of truth; admins triage it from /admin/reports.
//
// DDL is intentionally SELF-CONTAINED here (its own memoized ensureReportsTable)
// rather than added to the shared lib/db/ensure.ts — this app shares one Neon DB
// across in-flight features and a sibling `drizzle-kit push` could drop tables it
// doesn't know about. Every read/write calls ensureReportsTable() first so a cold
// instance (or a table dropped out from under us) self-heals before it queries.
// Mirrors the pattern in lib/admin.ts's ensureAdminsTable.
// ---------------------------------------------------------------------------

let ensured: Promise<void> | null = null;
export function ensureReportsTable(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      await getSql()`
        CREATE TABLE IF NOT EXISTS reports (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          category text,
          message text,
          contact_email text,
          status text DEFAULT 'open',
          created_at timestamptz DEFAULT now(),
          resolved_at timestamptz,
          resolved_by text,
          source_path text,
          request_ip text
        )
      `;
    })().catch((e) => {
      ensured = null;
      throw e;
    });
  }
  return ensured;
}

export const REPORT_STATUSES = ["open", "resolved"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export function isReportStatus(v: string): v is ReportStatus {
  return (REPORT_STATUSES as readonly string[]).includes(v);
}

export type ReportRow = {
  id: string;
  category: string | null;
  message: string | null;
  contactEmail: string | null;
  status: string;
  createdAt: Date | null;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  sourcePath: string | null;
  requestIp: string | null;
};

// Map a raw snake_case DB row (from the Neon HTTP driver) to our camelCase shape.
type RawReportRow = {
  id: string;
  category: string | null;
  message: string | null;
  contact_email: string | null;
  status: string;
  created_at: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  source_path: string | null;
  request_ip: string | null;
};

function mapRow(r: RawReportRow): ReportRow {
  return {
    id: r.id,
    category: r.category,
    message: r.message,
    contactEmail: r.contact_email,
    status: r.status,
    createdAt: r.created_at ? new Date(r.created_at) : null,
    resolvedAt: r.resolved_at ? new Date(r.resolved_at) : null,
    resolvedBy: r.resolved_by,
    sourcePath: r.source_path,
    requestIp: r.request_ip,
  };
}

export type CreateReportInput = {
  category: string;
  message: string;
  contactEmail?: string | null;
  sourcePath?: string | null;
  requestIp?: string | null;
};

// Persist a new report. Returns the inserted row's id.
export async function createReport(input: CreateReportInput): Promise<string> {
  await ensureReportsTable();
  const rows = (await getSql()`
    INSERT INTO reports (category, message, contact_email, source_path, request_ip)
    VALUES (
      ${input.category},
      ${input.message},
      ${input.contactEmail ?? null},
      ${input.sourcePath ?? null},
      ${input.requestIp ?? null}
    )
    RETURNING id
  `) as unknown as { id: string }[];
  return rows[0]!.id;
}

// List reports newest-first. Optionally filter by status.
export async function listReports(opts: { status?: ReportStatus } = {}): Promise<ReportRow[]> {
  await ensureReportsTable();
  const rows = (
    opts.status
      ? await getSql()`SELECT * FROM reports WHERE status = ${opts.status} ORDER BY created_at DESC`
      : await getSql()`SELECT * FROM reports ORDER BY created_at DESC`
  ) as unknown as RawReportRow[];
  return rows.map(mapRow);
}

// Count of reports still awaiting triage (status = 'open') — for an admin badge.
export async function openReportCount(): Promise<number> {
  if (!hasDatabase()) return 0;
  await ensureReportsTable();
  const rows = (await getSql()`
    SELECT count(*)::int AS c FROM reports WHERE status = 'open'
  `) as unknown as { c: number }[];
  return rows[0]?.c ?? 0;
}

// Flip a report between open/resolved. Stamps resolved_at/resolved_by when
// resolving, and clears them when reopening.
export async function setReportStatus(
  id: string,
  status: ReportStatus,
  by: string | null,
): Promise<void> {
  await ensureReportsTable();
  if (status === "resolved") {
    await getSql()`
      UPDATE reports
      SET status = 'resolved', resolved_at = now(), resolved_by = ${by}
      WHERE id = ${id}
    `;
  } else {
    await getSql()`
      UPDATE reports
      SET status = 'open', resolved_at = NULL, resolved_by = NULL
      WHERE id = ${id}
    `;
  }
}
