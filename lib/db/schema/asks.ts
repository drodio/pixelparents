import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { signups } from "./signups";

// The OHS "asks → expertise-matching" connector. A verified OHS family posts an
// ASK (a request for help, tagged with the expertise they're looking for); other
// verified members can OFFER to help. The matcher (lib/ask-matching.ts) ranks
// candidate helpers by overlap between an ask's expertiseTags and a member's
// expertise signals — but that's pure/DB-free; these tables are just the store.
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

  // The signup that authored the ask (the asker). FK so a card can be built for
  // them; clerk id is captured too so server actions can authorize the asker.
  authorSignupId: uuid("author_signup_id")
    .notNull()
    .references(() => signups.id, { onDelete: "cascade" }),
  authorClerkId: text("author_clerk_id"),

  title: text("title").notNull(),
  body: text("body").notNull(),
  // The expertise the asker is looking for — drives the matcher + the tag facet.
  expertiseTags: text("expertise_tags").array(),

  // open → still seeking help; matched → the asker accepted a response; closed →
  // the asker withdrew it. Default 'open'.
  status: text("status").notNull().default("open"),
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
