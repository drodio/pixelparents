import { pgTable, uuid, text, timestamp, jsonb, index, integer, primaryKey } from "drizzle-orm/pg-core";
import { askResponses } from "./asks";
import { signups } from "./signups";

// The Community "Exchange thread" — a real back-and-forth on a single response.
//
// When a member RESPONDS to a post (an OFFER on an Ask, or a REQUEST on an Offer),
// the two parties — the POST AUTHOR and the RESPONDER — can now have a threaded
// conversation on that response instead of only accept/decline. Each row is one
// message in that thread: a `comment` (public or private), or an `event_proposal`
// (a proposed calendar event the OTHER party can turn into a real /events entry).
//
// NOTE (schema-drift P0 lesson): this table is ALSO created idempotently in a
// self-contained self-heal DDL (lib/db/exchange-thread.ts's ensureThreadTables) —
// NOT in the shared lib/db/ensure.ts — because the app shares one Neon DB across
// in-flight features and a sibling `drizzle-kit push` could DROP a table it
// doesn't know about. Every read/write path calls that ensure fn first. This
// schema file is the Drizzle mirror for type-safety / documentation.

export const responseMessages = pgTable(
  "response_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),

    // The response this message belongs to. Cascade so deleting a response (or its
    // parent ask) tears the whole thread down with it.
    responseId: uuid("response_id")
      .notNull()
      .references(() => askResponses.id, { onDelete: "cascade" }),
    // Denormalized ask id (for building /community/:id links + revalidation without
    // an extra join on the hot path).
    askId: uuid("ask_id").notNull(),

    // The message author's signup + clerk id (captured at write time so the server
    // can re-derive/authorize without a join). One of the two parties.
    authorSignupId: uuid("author_signup_id")
      .notNull()
      .references(() => signups.id, { onDelete: "cascade" }),
    authorClerkId: text("author_clerk_id"),

    // 'comment' → a chat message; 'event_proposal' → a proposed calendar event;
    // 'poll' → a public-input poll (always visibility='public').
    kind: text("kind").notNull().default("comment"),

    // 'public' → visible to anyone viewing the post; 'private' → visible ONLY to
    // the two parties of this response.
    visibility: text("visibility").notNull().default("public"),

    // The comment text, or the note attached to an event proposal.
    body: text("body"),

    // --- Event-proposal fields (used only when kind = 'event_proposal') ---------
    // {title, startsAt (ISO), endsAt (ISO|null), isOnline, location, onlineUrl, allDay}
    proposedEvent: jsonb("proposed_event"),
    // The created events row once accepted (turns the proposal into a real event).
    eventId: uuid("event_id"),
    // 'proposed' | 'accepted' | 'declined'.
    eventStatus: text("event_status"),

    // --- Poll fields (used only when kind = 'poll') -----------------------------
    // {question, options[] (immutable after creation), closed?}. Votes live in the
    // separate poll_votes table (one row per member).
    poll: jsonb("poll"),
  },
  (t) => [index("response_messages_response_created_idx").on(t.responseId, t.createdAt)],
);

export type ResponseMessageRow = typeof responseMessages.$inferSelect;

// One vote per member per poll (PK enforces it). A member re-voting the same
// option retracts; a different option moves the vote. Cascades with the poll
// message. Mirrors the self-heal DDL in lib/db/exchange-thread.ts.
export const pollVotes = pgTable(
  "poll_votes",
  {
    messageId: uuid("message_id")
      .notNull()
      .references(() => responseMessages.id, { onDelete: "cascade" }),
    voterSignupId: uuid("voter_signup_id")
      .notNull()
      .references(() => signups.id, { onDelete: "cascade" }),
    optionIndex: integer("option_index").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.messageId, t.voterSignupId] }),
    index("poll_votes_message_idx").on(t.messageId),
  ],
);

export type PollVoteRow = typeof pollVotes.$inferSelect;
