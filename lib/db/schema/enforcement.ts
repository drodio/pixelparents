import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";

// Moderation actions taken against an account.
//
// Parent feedback (Aug 2026) raised advertising/spam and "what stops
// retaliation". Reports alone don't answer that — an admin needs to be able to
// ACT, the action needs to expire on its own where appropriate, and the history
// has to be visible so a repeat offender is obvious rather than rediscovered
// every time.
//
// Kinds:
//   mute   — cannot post anywhere; can still read and be contacted.
//   ban    — loses platform access entirely.
//   delete — a single piece of content removed (no account restriction).
//   note   — an admin observation, no restriction. Keeps context with the record.
//
// `expiresAt = NULL` means PERMANENT. A timed action simply lapses; nothing has
// to run to un-apply it, because activeRestriction() compares against now(). A
// cron that failed would otherwise leave someone muted forever.
export const enforcementActions = pgTable(
  "enforcement_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),

    // Who it was applied to.
    signupId: uuid("signup_id").notNull(),
    // Denormalised so history survives even if the signup row is later removed.
    subjectEmail: text("subject_email"),

    // mute | ban | delete | note
    kind: text("kind").notNull(),
    // NULL = permanent. Ignored for delete/note.
    expiresAt: timestamp("expires_at", { withTimezone: true }),

    // Required: why. An unexplained ban is indefensible if challenged.
    reason: text("reason").notNull(),
    // For kind=delete: what was removed, so the record is meaningful.
    targetType: text("target_type"),
    targetId: text("target_id"),

    // Who did it.
    adminEmail: text("admin_email").notNull(),

    // Set when an admin lifts a restriction early.
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedByEmail: text("revoked_by_email"),
  },
  (t) => [
    index("enforcement_signup_idx").on(t.signupId),
    index("enforcement_kind_idx").on(t.kind),
    index("enforcement_created_idx").on(t.createdAt),
  ],
);

export type EnforcementActionRow = typeof enforcementActions.$inferSelect;
