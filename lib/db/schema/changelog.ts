import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// One row per shipped change (auto-generated from commits via an LLM, or seeded).
export const changelogEntries = pgTable(
  "changelog_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(), // URL anchor, e.g. "abc1234-secret-share-url"
    shippedAt: timestamp("shipped_at", { withTimezone: true }).notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    bullets: jsonb("bullets").$type<string[]>().default([]).notNull(),
    changeType: text("change_type").notNull(), // feature | enhancement | bug_fix
    categories: jsonb("categories").$type<string[]>().default([]).notNull(),
    // The commit author(s) an entry credits: display name + GitHub login (login
    // may be null for commits not linked to a GH account — then show just name).
    authors: jsonb("authors")
      .$type<{ name: string; login: string | null }[]>()
      .default([])
      .notNull(),
    commitSha: text("commit_sha"), // representative (newest) sha for the entry
    // Every commit sha this entry aggregates — the dedupe key so overlapping
    // cron windows never re-post the same commits under a new entry.
    commitShas: jsonb("commit_shas").$type<string[]>().default([]).notNull(),
    notifiedAt: timestamp("notified_at", { withTimezone: true }), // email sent?
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    slugUnique: uniqueIndex("changelog_entries_slug_unique").on(t.slug),
    shaUnique: uniqueIndex("changelog_entries_commit_sha_unique").on(t.commitSha),
    shippedIdx: index("changelog_entries_shipped_at_idx").on(t.shippedAt),
  }),
);

// Open email subscribe (no account required — this is a public changelog).
export const changelogSubscribers = pgTable(
  "changelog_subscribers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    // Per-subscriber capability token for one-click unsubscribe links.
    unsubscribeToken: uuid("unsubscribe_token").defaultRandom().notNull(),
  },
  (t) => ({
    emailUnique: uniqueIndex("changelog_subscribers_email_unique").on(t.email),
  }),
);

export type ChangelogEntryRow = typeof changelogEntries.$inferSelect;
