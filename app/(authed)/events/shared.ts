import type { EventRow } from "@/lib/db/schema/events";
import type { CalendarEvent } from "@/lib/events/calendar";

function toIso(value: unknown): string {
  const d = value instanceof Date ? value : new Date(value as string);
  return Number.isFinite(d.getTime()) ? d.toISOString() : new Date().toISOString();
}

function toIsoOrNull(value: unknown): string | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value as string);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

// Project a DB EventRow + per-viewer facts into the plain, serializable
// CalendarEvent the client components consume. Keeps the Date→ISO + source
// coercion in one place so the page and the detail route stay consistent.
export function toCalendarEvent(
  row: EventRow,
  opts: {
    counts?: { going: number; interested: number };
    myRsvp: "going" | "interested" | null;
    canEdit: boolean;
  },
): CalendarEvent {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    startsAt: toIso(row.startsAt),
    endsAt: toIsoOrNull(row.endsAt),
    isOnline: Boolean(row.isOnline),
    allDay: Boolean(row.allDay),
    location: row.location ?? null,
    onlineUrl: row.onlineUrl ?? null,
    source: row.source === "ohs" ? "ohs" : "user",
    authorLabel: row.authorLabel ?? null,
    goingCount: opts.counts?.going ?? 0,
    interestedCount: opts.counts?.interested ?? 0,
    canEdit: opts.canEdit,
    myRsvp: opts.myRsvp,
  };
}
