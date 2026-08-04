import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";

// A request to join an EXISTING family.
//
// Until now the only way to end up in someone's family was an emailed invite
// token: the inviter sends a link, the invitee signs up through it. That breaks
// down in the two cases people actually hit —
//
//   1. A student signs up, and their parent ALREADY has a GoPixel account. The
//      old flow forced the student to "invite" a parent who is already a member.
//   2. Two people who both already have accounts want to be one family.
//
// Both are the same operation: move one family into another. It is deliberately
// TWO-SIDED — the requester asks, the target approves — because approving grants
// mutual access to each other's profile and children. Nothing links silently.
export const familyLinkRequests = pgTable(
  "family_link_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),

    // Who asked. Their whole family moves on approval.
    fromSignupId: uuid("from_signup_id").notNull(),
    fromFamilyId: uuid("from_family_id").notNull(),

    // Who was asked. Stored as the typed email so a request can be raised before
    // we know the row; toSignupId is resolved at request time when it exists.
    toEmail: text("to_email").notNull(),
    toSignupId: uuid("to_signup_id"),

    // pending | approved | declined | cancelled
    status: text("status").notNull().default("pending"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    // Who actioned it (the approver's signup id) — useful in a multi-parent family.
    decidedBySignupId: uuid("decided_by_signup_id"),
  },
  (t) => [
    // "my inbox" (by email), "my outbox" (by requester), and dedupe checks.
    index("family_link_to_email_idx").on(t.toEmail),
    index("family_link_from_idx").on(t.fromSignupId),
    index("family_link_status_idx").on(t.status),
  ],
);

export type FamilyLinkRequestRow = typeof familyLinkRequests.$inferSelect;
