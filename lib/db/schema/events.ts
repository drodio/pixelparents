import { pgTable, uuid, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { signups } from "./signups";

// The OHS "Events" calendar. A verified OHS family — parent OR student — creates
// an event (a meetup, study group, info session, etc.) that shows on a shared
// month-grid calendar. The OHS school-year calendar is ALSO imported in here as
// read-only `source = 'ohs'` events so families see school dates alongside their
// own. Every member can RSVP (going / interested); the creator + any per-event
// admins they add can edit. OHS-imported events are never editable.
//
// Three tables:
//   events        — the event itself (user-created OR ohs-imported)
//   event_admins  — extra signups who may edit a given user event (the creator
//                   is always an admin via the FK + an event_admins row)
//   event_rsvps   — one row per (event, signup) recording going | interested
//
// Per the project's schema-drift P0 lesson, all three are ALSO created
// idempotently in lib/db/ensure.ts (ensureEventsSchema) and EVERY read/write path
// in lib/db/events.ts calls it first (the country-column P0 lesson: a brand-new
// table won't exist until a human migrates — by which point every read/write
// would throw — so we self-heal on the first op per cold start).

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),

  title: text("title").notNull(),
  description: text("description"),

  // The event window. `endsAt` is optional (a point-in-time event has no end);
  // for an all-day / multi-day OHS event we store start-of-first-day → end-of-
  // last-day so the calendar can span it. Both are timestamptz (UTC instants).
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }),

  // Online vs in-person. When online, `onlineUrl` carries the meeting link;
  // otherwise `location` carries a human place string. Both are optional so a
  // bare "save the date" event is still valid.
  isOnline: boolean("is_online").notNull().default(false),
  location: text("location"),
  onlineUrl: text("online_url"),

  // All-day flag: OHS school-year events (and user "all day" events) span whole
  // days and render without a time. Drives the .ics VALUE=DATE encoding.
  allDay: boolean("all_day").notNull().default(false),

  // 'user' → created in-app by a verified family; 'ohs' → imported from the
  // Stanford OHS school-year calendar (read-only, not editable).
  source: text("source").notNull().default("user"),

  // The signup that created a USER event (FK so we can authorize + show "by X").
  // NULL for OHS-imported events. Clerk id captured too so server actions can
  // re-derive the author without a join.
  authorSignupId: uuid("author_signup_id").references(() => signups.id, {
    onDelete: "cascade",
  }),
  authorClerkId: text("author_clerk_id"),

  // A human label for the author line. For OHS events this is the constant
  // "OHS (Automatically Added)"; for user events it's the creator's display name
  // (captured at write time so the card needs no extra join just to render).
  authorLabel: text("author_label"),

  // Stable de-dup key for OHS imports: a slug derived from the event's date +
  // title. The importer UPSERTs on this so re-running never creates duplicates.
  // NULL for user events.
  externalKey: text("external_key"),
});

// Per-event admins: signups (besides the author) who may edit/delete the event.
// The creator is inserted here at create time so a single membership check covers
// "can edit". OHS events get no admins (no editing at all).
export const eventAdmins = pgTable("event_admins", {
  eventId: uuid("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  signupId: uuid("signup_id")
    .notNull()
    .references(() => signups.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// One RSVP per (event, signup). `status` is 'going' | 'interested'. Removing an
// RSVP deletes the row. A unique (event_id, signup_id) constraint enforces "one
// RSVP per member per event" (an upsert flips the status in place).
export const eventRsvps = pgTable("event_rsvps", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  signupId: uuid("signup_id")
    .notNull()
    .references(() => signups.id, { onDelete: "cascade" }),
  // 'going' | 'interested'.
  status: text("status").notNull().default("going"),
});

export type EventRow = typeof events.$inferSelect;
export type EventAdminRow = typeof eventAdmins.$inferSelect;
export type EventRsvpRow = typeof eventRsvps.$inferSelect;
