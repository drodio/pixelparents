import { pgTable, uuid, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";

// Application audit log.
//
// Purpose: when a family reports "it didn't work", we should be able to open the
// admin log explorer and see exactly what happened to THEM — not guess from a
// screenshot. Several signup outages in this project were diagnosed only by
// driving the live site by hand, because there was no server-side record at all.
//
// Retention is 14 days (see pruneAppLogs). This is a debugging aid, not an
// archive, and short retention keeps both the table small and the amount of
// personal data we hold bounded.
export const appLogs = pgTable(
  "app_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),

    // debug | info | warn | error
    level: text("level").notNull().default("info"),
    // Dotted machine-readable name, e.g. "signup.draft.created", "bot.flagged".
    // Filterable + groupable; keep it stable so history stays comparable.
    event: text("event").notNull(),
    // Human sentence for the log list.
    message: text("message"),

    // --- who -------------------------------------------------------------
    // Best-effort identity. Any of these may be null (signup happens logged out).
    actorEmail: text("actor_email"),
    actorSignupId: uuid("actor_signup_id"),
    actorClerkId: text("actor_clerk_id"),
    // Groups every entry from one browser visit so a whole session reads as a
    // story. Client-generated, opaque, not tied to identity.
    sessionId: text("session_id"),
    // Correlates entries emitted while handling a single request/action.
    requestId: text("request_id"),

    // --- where -----------------------------------------------------------
    path: text("path"),
    method: text("method"),
    statusCode: integer("status_code"),
    durationMs: integer("duration_ms"),
    userAgent: text("user_agent"),
    // TRUNCATED ip (last octet / suffix dropped) — enough to spot one abusive
    // source, not enough to pinpoint a household. See truncateIp().
    ipPrefix: text("ip_prefix"),

    // --- what ------------------------------------------------------------
    // Arbitrary structured detail. Passed through redactContext() first, which
    // strips obvious secrets and caps the size.
    context: jsonb("context").$type<Record<string, unknown>>().default({}).notNull(),
    // Error name/message/stack when level = error.
    errorName: text("error_name"),
    errorMessage: text("error_message"),
    errorStack: text("error_stack"),
  },
  (t) => [
    // The three ways the admin explorer actually reads this: newest-first,
    // by event type, and "show me everything for this person/session".
    index("app_logs_created_at_idx").on(t.createdAt),
    index("app_logs_event_idx").on(t.event),
    index("app_logs_session_idx").on(t.sessionId),
  ],
);

export type AppLogRow = typeof appLogs.$inferSelect;
