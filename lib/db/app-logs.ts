import { and, desc, eq, gte, lte, or, ilike, sql } from "drizzle-orm";
import { getDb, getSql } from "@/lib/db";
import { appLogs, type AppLogRow } from "@/lib/db/schema/app-logs";
import {
  safeContext,
  coerceLevel,
  truncateIp,
  LOG_RETENTION_DAYS,
  type LogLevel,
} from "@/lib/logging";

// Self-healing DDL, matching every other table in this repo: there is NO
// migrate-on-deploy here, so a new table must create itself on first use or the
// feature is dead until a human runs a migration. (The `country` column incident
// is the cautionary tale — see CLAUDE.md.)
let ensured: Promise<void> | null = null;

export function ensureAppLogsTable(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      const db = getSql();
      await db.transaction([
        db`
          CREATE TABLE IF NOT EXISTS app_logs (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            created_at timestamptz NOT NULL DEFAULT now(),
            level text NOT NULL DEFAULT 'info',
            event text NOT NULL,
            message text,
            actor_email text,
            actor_signup_id uuid,
            actor_clerk_id text,
            session_id text,
            request_id text,
            path text,
            method text,
            status_code integer,
            duration_ms integer,
            user_agent text,
            ip_prefix text,
            context jsonb NOT NULL DEFAULT '{}'::jsonb,
            error_name text,
            error_message text,
            error_stack text
          )
        `,
        db`CREATE INDEX IF NOT EXISTS app_logs_created_at_idx ON app_logs (created_at DESC)`,
        db`CREATE INDEX IF NOT EXISTS app_logs_event_idx ON app_logs (event)`,
        db`CREATE INDEX IF NOT EXISTS app_logs_session_idx ON app_logs (session_id)`,
        db`CREATE INDEX IF NOT EXISTS app_logs_actor_email_idx ON app_logs (actor_email)`,
      ]);
    })().catch((e) => {
      ensured = null;
      throw e;
    });
  }
  return ensured;
}

export type LogInput = {
  event: string;
  level?: LogLevel | string;
  message?: string | null;
  actorEmail?: string | null;
  actorSignupId?: string | null;
  actorClerkId?: string | null;
  sessionId?: string | null;
  requestId?: string | null;
  path?: string | null;
  method?: string | null;
  statusCode?: number | null;
  durationMs?: number | null;
  userAgent?: string | null;
  ip?: string | null;
  context?: unknown;
  error?: unknown;
};

// Write one entry.
//
// NEVER THROWS, and never blocks the caller on failure. Logging is an observer:
// if it broke the thing it is observing, it would be worse than having no logs
// at all. Callers may `void logEvent(...)` without a catch.
export async function logEvent(input: LogInput): Promise<void> {
  try {
    await ensureAppLogsTable();
    const err = input.error;
    const asError =
      err instanceof Error
        ? err
        : err
          ? new Error(typeof err === "string" ? err : JSON.stringify(err))
          : null;

    await getDb()
      .insert(appLogs)
      .values({
        level: coerceLevel(input.level),
        event: input.event.slice(0, 200),
        message: input.message?.slice(0, 2_000) ?? null,
        actorEmail: input.actorEmail?.slice(0, 200) ?? null,
        actorSignupId: input.actorSignupId ?? null,
        actorClerkId: input.actorClerkId?.slice(0, 200) ?? null,
        sessionId: input.sessionId?.slice(0, 100) ?? null,
        requestId: input.requestId?.slice(0, 100) ?? null,
        path: input.path?.slice(0, 500) ?? null,
        method: input.method?.slice(0, 10) ?? null,
        statusCode: input.statusCode ?? null,
        durationMs: input.durationMs ?? null,
        userAgent: input.userAgent?.slice(0, 500) ?? null,
        ipPrefix: truncateIp(input.ip),
        context: safeContext(input.context ?? {}),
        errorName: asError?.name?.slice(0, 200) ?? null,
        errorMessage: asError?.message?.slice(0, 2_000) ?? null,
        errorStack: asError?.stack?.slice(0, 10_000) ?? null,
      });
  } catch (e) {
    // Last resort only — never rethrow.
    console.error("logEvent failed (non-fatal):", e);
  }
}

export type LogQuery = {
  level?: string;
  event?: string;
  // Free-text across message / event / actor / path.
  q?: string;
  actorEmail?: string;
  sessionId?: string;
  since?: Date;
  until?: Date;
  limit?: number;
  offset?: number;
};

// Read entries for the admin explorer, newest first.
export async function listAppLogs(query: LogQuery = {}): Promise<AppLogRow[]> {
  await ensureAppLogsTable();
  const limit = Math.min(Math.max(query.limit ?? 100, 1), 1_000);
  const offset = Math.max(query.offset ?? 0, 0);

  const where = [];
  if (query.level) where.push(eq(appLogs.level, query.level));
  if (query.event) where.push(ilike(appLogs.event, `%${query.event}%`));
  if (query.actorEmail) where.push(ilike(appLogs.actorEmail, `%${query.actorEmail}%`));
  if (query.sessionId) where.push(eq(appLogs.sessionId, query.sessionId));
  if (query.since) where.push(gte(appLogs.createdAt, query.since));
  if (query.until) where.push(lte(appLogs.createdAt, query.until));
  if (query.q) {
    const like = `%${query.q}%`;
    where.push(
      or(
        ilike(appLogs.message, like),
        ilike(appLogs.event, like),
        ilike(appLogs.actorEmail, like),
        ilike(appLogs.path, like),
        ilike(appLogs.errorMessage, like),
      )!,
    );
  }

  return getDb()
    .select()
    .from(appLogs)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(appLogs.createdAt))
    .limit(limit)
    .offset(offset);
}

// Counts per event + per level, for the explorer's summary strip.
export async function appLogStats(since?: Date): Promise<{
  total: number;
  byLevel: { level: string; n: number }[];
  topEvents: { event: string; n: number }[];
}> {
  await ensureAppLogsTable();
  const db = getSql();
  const cutoff = since ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [total, byLevel, topEvents] = await Promise.all([
    db`SELECT count(*)::int AS n FROM app_logs WHERE created_at >= ${cutoff}`,
    db`SELECT level, count(*)::int AS n FROM app_logs WHERE created_at >= ${cutoff} GROUP BY level ORDER BY n DESC`,
    db`SELECT event, count(*)::int AS n FROM app_logs WHERE created_at >= ${cutoff} GROUP BY event ORDER BY n DESC LIMIT 15`,
  ]);
  return {
    total: (total[0]?.n as number) ?? 0,
    byLevel: byLevel as { level: string; n: number }[],
    topEvents: topEvents as { event: string; n: number }[],
  };
}

// Delete anything past the retention window. Called opportunistically from the
// admin page so it needs no cron; cheap because created_at is indexed.
export async function pruneAppLogs(): Promise<number> {
  await ensureAppLogsTable();
  const rows = await getSql()`
    DELETE FROM app_logs
    WHERE created_at < now() - (${LOG_RETENTION_DAYS} || ' days')::interval
    RETURNING 1
  `;
  return rows.length;
}

// Distinct event names, for the filter dropdown.
export async function listAppLogEvents(): Promise<string[]> {
  await ensureAppLogsTable();
  const rows = await getSql()`
    SELECT DISTINCT event FROM app_logs
    WHERE created_at >= now() - interval '${sql.raw(String(LOG_RETENTION_DAYS))} days'
    ORDER BY event ASC LIMIT 200
  `;
  return rows.map((r) => String(r.event));
}
