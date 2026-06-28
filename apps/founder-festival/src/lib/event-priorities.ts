import { db } from "@/db";
import { eventPriorities } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { isPriorityCategory } from "./event-priorities-shared";

// The pure taxonomy/colors/types live in "./event-priorities-shared" (no DB
// import) so client components can use them without bundling the Neon client.
// Re-exported here so server-side callers can keep importing from one place.
export {
  PRIORITY_CATEGORIES,
  CATEGORY_COLORS,
  isPriorityCategory,
} from "./event-priorities-shared";
export type { PriorityCategory, PriorityInput } from "./event-priorities-shared";
import type { PriorityInput } from "./event-priorities-shared";

export type EventPriority = typeof eventPriorities.$inferSelect;

export async function getEventPriorities(eventId: string): Promise<EventPriority[]> {
  return db
    .select()
    .from(eventPriorities)
    .where(eq(eventPriorities.eventId, eventId))
    .orderBy(asc(eventPriorities.sortOrder), asc(eventPriorities.createdAt));
}

// Replace an event's priorities with the given list (order = array order).
// Unknown categories are coerced to "tactical" so a bad client can't store junk.
export async function setEventPriorities(eventId: string, items: PriorityInput[]): Promise<void> {
  const clean = items
    .map((it) => ({ text: it.text.trim(), category: isPriorityCategory(it.category) ? it.category : "tactical" }))
    .filter((it) => it.text.length > 0);
  await db.delete(eventPriorities).where(eq(eventPriorities.eventId, eventId));
  if (clean.length === 0) return;
  await db.insert(eventPriorities).values(
    clean.map((it, i) => ({ eventId, text: it.text, category: it.category, sortOrder: i })),
  );
}
