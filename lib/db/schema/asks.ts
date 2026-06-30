import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { signups } from "./signups";

// The OHS "Exchange" connector (evolved from the one-directional "Asks" board).
// A verified OHS family — parent OR student — posts a POST that is either an ASK
// ("I need help with X") or an OFFER ("I can help with X"), tagged with the
// relevant expertise. Other verified members respond: on an Ask they OFFER help,
// on an Offer they REQUEST it. The matcher (lib/ask-matching.ts) ranks candidate
// helpers by overlap between a post's expertiseTags and a member's expertise
// signals — but that's pure/DB-free; these tables are just the store.
//
// NOTE: the TABLE is still named `asks` (it may already exist in prod — we add
// columns, never rename the table). The user-facing rename to "Exchange" is what
// matters. A `kind` column distinguishes 'ask' vs 'offer'.
//
// Both tables key off the AUTHOR/RESPONDER's signup row (FK) so we can render a
// directory-style card for them, AND carry the clerk_user_id captured at write
// time so the server actions can re-derive the caller's identity without a join.
// Per the project's schema-drift P0 lesson, these are ALSO created idempotently
// in lib/db/ensure.ts (ensureAsksSchema) and every read/write path calls it.

export const asks = pgTable("asks", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),

  // The signup that authored the post. FK so a card can be built for them; clerk
  // id is captured too so server actions can authorize the author.
  authorSignupId: uuid("author_signup_id")
    .notNull()
    .references(() => signups.id, { onDelete: "cascade" }),
  authorClerkId: text("author_clerk_id"),

  // 'ask' → "I need help with X"; 'offer' → "I can help with X". Default 'ask'
  // for parity with the original one-directional board.
  kind: text("kind").notNull().default("ask"),

  title: text("title").notNull(),
  body: text("body").notNull(),
  // The relevant expertise — drives the matcher + the tag facet.
  expertiseTags: text("expertise_tags").array(),

  // 'low' | 'normal' | 'high'. How time-sensitive the post is; sortable facet.
  urgency: text("urgency").notNull().default("normal"),

  // Optional expiry: after this instant the post is treated as expired (flagged /
  // droppable in the UI). NULL → never expires.
  validUntil: timestamp("valid_until", { withTimezone: true }),

  // open → still active; matched → the author accepted a response; resolved →
  // the author marked it done; closed → withdrawn. Default 'open'.
  status: text("status").notNull().default("open"),

  // Set when the author marks the post resolved; cleared when reopened.
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const askResponses = pgTable("ask_responses", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),

  // The ask this offer is for.
  askId: uuid("ask_id")
    .notNull()
    .references(() => asks.id, { onDelete: "cascade" }),

  // The signup offering to help. FK so the asker sees a card for them; clerk id
  // captured so the responder can be authorized on later actions.
  responderSignupId: uuid("responder_signup_id")
    .notNull()
    .references(() => signups.id, { onDelete: "cascade" }),
  responderClerkId: text("responder_clerk_id"),

  // The ~2-sentence offer + the format the helper proposes.
  offer: text("offer").notNull(),
  // async | zoom | dinner | other.
  proposes: text("proposes").notNull().default("async"),

  // offered → awaiting the asker's decision; accepted/declined → the asker
  // decided. Default 'offered'.
  status: text("status").notNull().default("offered"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
});

export type AskRow = typeof asks.$inferSelect;
export type AskResponseRow = typeof askResponses.$inferSelect;
