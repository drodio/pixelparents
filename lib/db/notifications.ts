import { and, desc, eq, sql } from "drizzle-orm";
import { pgTable, text, timestamp, uuid, boolean } from "drizzle-orm/pg-core";
import { getSql, getDb, hasDatabase } from "@/lib/db";

// Data layer for in-app NOTIFICATIONS. Deliberately self-contained: this module
// owns its OWN self-heal DDL (mirroring lib/admin.ts's ensureAdminsTable) rather
// than touching the shared lib/db/ensure.ts / lib/db/schema barrel. The app
// shares one Neon DB across in-flight features and a sibling `drizzle-kit push`
// could drop tables it doesn't know about, so we (idempotently) create the table
// on first notification operation per cold start, and EVERY read/write calls the
// ensure fn first (the country-column P0 lesson: new tables must be self-healed
// AND every access path must guard with the ensure fn).
//
// Recipients are keyed by `recipient_signup_id` (a signups.id uuid) — the same id
// the community/events surfaces already authorize on — so a notification targets
// a verified family member, not a raw Clerk identity. No PII is stored in a
// notification: title/body carry only a display name (the same coarsened label
// the in-app cards already show) and a `link` into the in-app page; never an
// email, phone, or child's full name.

// The canonical notification types. Kept as a const tuple so the type icon map
// and the isNotificationType guard stay in lockstep, and so callers can't emit a
// typo'd type. New event sources should add a member here.
export const NOTIFICATION_TYPES = [
  "community_response", // someone responded to your ask/offer
  "community_connected", // your response was accepted → you're connected
  "community_mention", // you were @-mentioned in a post body or response
  "event_rsvp", // someone RSVP'd to an event you organize
  "board_contribution", // a new contribution landed on a resource board you follow
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export function isNotificationType(v: unknown): v is NotificationType {
  return typeof v === "string" && (NOTIFICATION_TYPES as readonly string[]).includes(v);
}

// Pure formatting for the bell's unread-count BADGE. The bell renders the badge
// from an integer count; this is the single source of truth for how that count
// is presented (capped so a large number never blows out the 16px icon rail), and
// for whether a badge shows at all. Negative/NaN counts coerce to "no badge".
export function formatUnreadBadge(count: number, cap = 9): { show: boolean; label: string } {
  const n = Number.isFinite(count) ? Math.floor(count) : 0;
  if (n <= 0) return { show: false, label: "" };
  return { show: true, label: n > cap ? `${cap}+` : String(n) };
}

// Pure copy for the notifications-center header SUBTITLE. Single source of truth
// so the three states can be reasoned about (and unit-tested) in isolation:
//   - unread > 0            → "N unread" (NEVER "all caught up" while unread exist)
//   - unread 0, total > 0   → "You're all caught up."
//   - no notifications yet  → a description of every source that lands here
// The last string mirrors the empty-state copy and covers ALL emitted sources
// (posts, connections, mentions, events, boards) so no source implies it isn't
// covered. Counts are coerced defensively (negative/NaN → 0).
export function notificationsSubtitle(unread: number, total: number): string {
  const u = Number.isFinite(unread) ? Math.max(0, Math.floor(unread)) : 0;
  const t = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
  if (u > 0) return `${u} unread`;
  if (t > 0) return "You're all caught up.";
  return "Updates about your posts, connections, events, and boards show up here.";
}

export type NotificationRow = {
  id: string;
  recipientSignupId: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: Date;
};

// Self-healing guard for the `notifications` table. Created idempotently on first
// notification operation per cold start (same rationale as ensureAdminsTable).
let ensured: Promise<void> | null = null;
export function ensureNotificationsTable(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      await getSql()`
        CREATE TABLE IF NOT EXISTS notifications (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          recipient_signup_id uuid NOT NULL,
          type text NOT NULL,
          title text NOT NULL,
          body text,
          link text,
          read boolean NOT NULL DEFAULT false,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `;
      // Hot path is "my unread, newest first" — back it with a composite index.
      await getSql()`
        CREATE INDEX IF NOT EXISTS notifications_recipient_created_idx
          ON notifications (recipient_signup_id, created_at DESC)
      `;
    })().catch((e) => {
      ensured = null;
      throw e;
    });
  }
  return ensured;
}

// --- Writes -------------------------------------------------------------------

// Emit a notification. Best-effort by contract: callers wrap this in try/catch or
// after() so a notification never blocks or fails the underlying action. We still
// guard hasDatabase() so a DB-less environment is a silent no-op rather than a
// throw. Returns the new id, or null when skipped.
export async function createNotification(input: {
  recipientSignupId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
}): Promise<string | null> {
  if (!hasDatabase()) return null;
  // Defense in depth: an unknown/typo'd type is dropped rather than persisted.
  if (!isNotificationType(input.type)) return null;
  // A notification with no recipient is meaningless — skip rather than insert junk.
  if (!input.recipientSignupId) return null;

  await ensureNotificationsTable();
  const [row] = await getDb()
    .insert(notificationsTable)
    .values({
      recipientSignupId: input.recipientSignupId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
    })
    .returning({ id: notificationsTable.id });
  return row?.id ?? null;
}

// Mark a single notification read — SCOPED to the recipient (the WHERE clause is
// the authorization: a notification owned by someone else matches 0 rows → no-op).
// Returns true if a row flipped (the caller owned it), false otherwise.
export async function markRead(id: string, recipientSignupId: string): Promise<boolean> {
  if (!hasDatabase()) return false;
  await ensureNotificationsTable();
  const updated = await getDb()
    .update(notificationsTable)
    .set({ read: true })
    .where(
      and(
        eq(notificationsTable.id, id),
        eq(notificationsTable.recipientSignupId, recipientSignupId),
      ),
    )
    .returning({ id: notificationsTable.id });
  return updated.length > 0;
}

// Mark ALL of a recipient's unread notifications read. Returns the count flipped.
export async function markAllRead(recipientSignupId: string): Promise<number> {
  if (!hasDatabase()) return 0;
  await ensureNotificationsTable();
  const updated = await getDb()
    .update(notificationsTable)
    .set({ read: true })
    .where(
      and(
        eq(notificationsTable.recipientSignupId, recipientSignupId),
        eq(notificationsTable.read, false),
      ),
    )
    .returning({ id: notificationsTable.id });
  return updated.length;
}

// --- Reads --------------------------------------------------------------------

// A recipient's notifications, newest first, capped (the center shows a recent
// window; older ones age out of the list, not the table). DB-less → empty list.
export async function listNotifications(
  recipientSignupId: string,
  limit = 50,
): Promise<NotificationRow[]> {
  if (!hasDatabase() || !recipientSignupId) return [];
  await ensureNotificationsTable();
  return getDb()
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.recipientSignupId, recipientSignupId))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(limit);
}

// How many UNREAD notifications a recipient has — backs the bell badge. DB-less
// or no recipient → 0 (the bell renders with no badge).
export async function unreadCount(recipientSignupId: string): Promise<number> {
  if (!hasDatabase() || !recipientSignupId) return 0;
  await ensureNotificationsTable();
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.recipientSignupId, recipientSignupId),
        eq(notificationsTable.read, false),
      ),
    );
  return row?.n ?? 0;
}

// --- Local Drizzle table handle ----------------------------------------------
//
// Defined HERE (not in the shared lib/db/schema barrel) so this feature stays
// self-contained per the build directive. The column mapping matches the DDL
// above; getDb() is schema-typed for the shared barrel, but Drizzle accepts an
// ad-hoc pgTable for these queries all the same.
const notificationsTable = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  recipientSignupId: uuid("recipient_signup_id").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  link: text("link"),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
