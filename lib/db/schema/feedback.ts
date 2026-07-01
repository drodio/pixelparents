import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";

// One row per in-app feedback submission from the sidebar "Send feedback" widget.
//
// This is DISTINCT from the public `reports` table (bug/abuse contact form):
// feedback is a lightweight, always-reachable "how's it going / here's an idea"
// channel from a SIGNED-IN, verified family — so it carries the author's signup
// id + Clerk id (for admin follow-up) and the page they were on, but never any
// PII in the message beyond what the author types.
//
// NOTE: the Drizzle table is defined here for schema-barrel/type visibility, but
// the runtime queries in lib/db/feedback.ts use a self-contained self-heal DDL
// (ensureFeedbackTable) rather than the shared ensure.ts — same rationale as
// reports.ts / notifications.ts (one shared Neon DB; a sibling drizzle-kit push
// must not drop tables it doesn't know about).
export const feedback = pgTable(
  "feedback",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // The author's signup id (a signups.id uuid) — the same identity the
    // community/notifications surfaces authorize on. Nullable so a signed-in user
    // without a signup row can still send feedback (we won't block them).
    authorSignupId: uuid("author_signup_id"),
    // The author's Clerk user id — a stable handle for admin follow-up even if the
    // signup row changes. Never an email/phone (no PII on the row).
    authorClerkId: text("author_clerk_id"),
    message: text("message").notNull(),
    // The in-app path the feedback was sent from (window.location.pathname), so
    // admins know which surface the note is about.
    pagePath: text("page_path"),
    // Triage lifecycle: new -> reviewed -> resolved.
    status: text("status").notNull().default("new"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    // Admin triage reads newest-first; back it with a descending index.
    createdIdx: index("feedback_created_at_idx").on(t.createdAt),
  }),
);

export type FeedbackRow = typeof feedback.$inferSelect;
