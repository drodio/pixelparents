import { getSql, hasDatabase } from "@/lib/db";

// ---------------------------------------------------------------------------
// In-app FEEDBACK data layer.
//
// Backs the always-reachable "Send feedback" widget pinned in the sidebar (and
// the help menu). Daniel's note: the landing feedback link was too hard to find,
// so feedback now has a persistent, obvious home inside the app. Feedback is the
// source of truth here; admins triage it from /admin/feedback.
//
// DDL is intentionally SELF-CONTAINED (its own memoized ensureFeedbackTable)
// rather than added to the shared lib/db/ensure.ts — this app shares one Neon DB
// across in-flight features and a sibling `drizzle-kit push` could drop tables it
// doesn't know about. Every read/write calls ensureFeedbackTable() first so a cold
// instance (or a table dropped out from under us) self-heals before it queries.
// Mirrors the pattern in lib/db/reports.ts + lib/db/notifications.ts.
// ---------------------------------------------------------------------------

// The max stored message length. The submit action caps user input to this; the
// data layer clamps again as defense-in-depth so an oversized message can never
// reach the DB regardless of caller.
export const MAX_FEEDBACK_MESSAGE = 2000;

// Clamp/normalize a raw message to what we're willing to store: trim, collapse
// nothing (preserve the author's line breaks), and hard-cap the length. Returns
// the cleaned string ("" when there's nothing meaningful) — a pure helper so the
// action and any test can reason about it in isolation.
export function sanitizeFeedbackMessage(raw: string): string {
  const trimmed = (raw ?? "").trim();
  if (trimmed.length === 0) return "";
  return trimmed.slice(0, MAX_FEEDBACK_MESSAGE);
}

let ensured: Promise<void> | null = null;
export function ensureFeedbackTable(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      await getSql()`
        CREATE TABLE IF NOT EXISTS feedback (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          author_signup_id uuid,
          author_clerk_id text,
          message text NOT NULL,
          page_path text,
          status text NOT NULL DEFAULT 'new',
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `;
      // Triage reads newest-first — back it with an index on created_at.
      await getSql()`
        CREATE INDEX IF NOT EXISTS feedback_created_at_idx
          ON feedback (created_at DESC)
      `;
    })().catch((e) => {
      ensured = null;
      throw e;
    });
  }
  return ensured;
}

export const FEEDBACK_STATUSES = ["new", "reviewed", "resolved"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export function isFeedbackStatus(v: unknown): v is FeedbackStatus {
  return typeof v === "string" && (FEEDBACK_STATUSES as readonly string[]).includes(v);
}

export type FeedbackRow = {
  id: string;
  authorSignupId: string | null;
  authorClerkId: string | null;
  message: string;
  pagePath: string | null;
  status: string;
  createdAt: Date | null;
};

// Map a raw snake_case DB row (from the Neon HTTP driver) to our camelCase shape.
type RawFeedbackRow = {
  id: string;
  author_signup_id: string | null;
  author_clerk_id: string | null;
  message: string;
  page_path: string | null;
  status: string;
  created_at: string | null;
};

function mapRow(r: RawFeedbackRow): FeedbackRow {
  return {
    id: r.id,
    authorSignupId: r.author_signup_id,
    authorClerkId: r.author_clerk_id,
    message: r.message,
    pagePath: r.page_path,
    status: r.status,
    createdAt: r.created_at ? new Date(r.created_at) : null,
  };
}

export type CreateFeedbackInput = {
  message: string;
  authorSignupId?: string | null;
  authorClerkId?: string | null;
  pagePath?: string | null;
};

// Persist a feedback note. The message is clamped again here as defense-in-depth.
// Returns the inserted row's id.
export async function createFeedback(input: CreateFeedbackInput): Promise<string> {
  await ensureFeedbackTable();
  const message = sanitizeFeedbackMessage(input.message);
  const rows = (await getSql()`
    INSERT INTO feedback (author_signup_id, author_clerk_id, message, page_path)
    VALUES (
      ${input.authorSignupId ?? null},
      ${input.authorClerkId ?? null},
      ${message},
      ${input.pagePath ?? null}
    )
    RETURNING id
  `) as unknown as { id: string }[];
  return rows[0]!.id;
}

// List feedback newest-first. Optionally filter by status. DB-less → [].
export async function listFeedback(
  opts: { status?: FeedbackStatus } = {},
): Promise<FeedbackRow[]> {
  if (!hasDatabase()) return [];
  await ensureFeedbackTable();
  const rows = (
    opts.status
      ? await getSql()`SELECT * FROM feedback WHERE status = ${opts.status} ORDER BY created_at DESC`
      : await getSql()`SELECT * FROM feedback ORDER BY created_at DESC`
  ) as unknown as RawFeedbackRow[];
  return rows.map(mapRow);
}

// Count of feedback still awaiting triage (status = 'new') — for an admin badge.
// DB-less or table-missing → 0 (self-healing; the badge just doesn't show).
export async function countOpenFeedback(): Promise<number> {
  if (!hasDatabase()) return 0;
  await ensureFeedbackTable();
  const rows = (await getSql()`
    SELECT count(*)::int AS c FROM feedback WHERE status = 'new'
  `) as unknown as { c: number }[];
  return rows[0]?.c ?? 0;
}

// Move a feedback row to a new triage status (new/reviewed/resolved).
export async function setFeedbackStatus(id: string, status: FeedbackStatus): Promise<void> {
  await ensureFeedbackTable();
  await getSql()`UPDATE feedback SET status = ${status} WHERE id = ${id}`;
}
