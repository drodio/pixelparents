"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@clerk/nextjs/server";
import { primaryEmail } from "@/lib/clerk";
import { getSignupByEmail } from "@/lib/db/signups";
import { isFamilyVerified } from "@/lib/directory";
import { isStudentAccount } from "@/lib/family-display";
import type { SignupRow } from "@/lib/db/schema/signups";
import {
  createEvent,
  updateEvent,
  deleteEvent,
  getEventById,
  isEventAdmin,
  addEventAdmin,
  removeEventAdmin,
  setRsvp,
  countEventsByAuthorSince,
  searchSignupsByName,
  getSignupById,
  type RsvpStatus,
  type MemberSuggestion,
} from "@/lib/db/events";
import {
  validateEventTitle,
  validateEventDescription,
  validateLocation,
  validateOnlineUrl,
  resolveInstant,
  validateRange,
} from "@/lib/events/validate";

// Server actions for the Events calendar. Every action authorizes ENTIRELY
// server-side from the Clerk session (never a client-supplied identity), and
// every actor must be a VERIFIED OHS family. Anyone — parent OR student — can
// create events. Only the author + per-event admins can edit/delete; OHS events
// (source='ohs') are never editable. RSVPs are open to any verified member.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Per-author event rate limit: at most N new events in a rolling window.
const EVENT_RATE_LIMIT = 10;
const EVENT_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

// Resolve the signed-in caller to their VERIFIED OHS family signup, or null. The
// identity is derived from the Clerk session; a client can never supply it.
async function verifiedCaller(): Promise<{ user: SignupRow; clerkId: string } | null> {
  const user = await currentUser();
  if (!user) return null;
  const email = primaryEmail(user);
  if (!email) return null;
  const signup = await getSignupByEmail(email);
  if (!signup) return null;
  if (!isFamilyVerified(signup)) return null;
  return { user: signup, clerkId: user.id };
}

// The display label for an event author — students show first name only (mirrors
// the directory's minor-privacy coarsening).
function authorLabelFor(s: SignupRow): string {
  if (isStudentAccount(s)) return s.firstName;
  const full = [s.firstName, s.lastName].filter(Boolean).join(" ");
  return full || s.firstName;
}

type EventFormInput = {
  title: string;
  description: string | null;
  // The form sends a date + time pair (local) + the client's timezone offset so we
  // can resolve a correct UTC instant. allDay events ignore the time fields.
  startDate: string;
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
  tzOffsetMinutes: number;
  isOnline: boolean;
  location: string | null;
  onlineUrl: string | null;
  allDay: boolean;
};

// Validate + normalize the shared create/edit form payload into DB-ready values.
function validateEventForm(input: EventFormInput):
  | { ok: true; value: {
      title: string;
      description: string | null;
      startsAt: Date;
      endsAt: Date | null;
      isOnline: boolean;
      location: string | null;
      onlineUrl: string | null;
      allDay: boolean;
    } }
  | { ok: false; error: string } {
  const title = validateEventTitle(input.title);
  if (!title.ok) return { ok: false, error: title.error };

  const description = validateEventDescription(input.description);
  if (!description.ok) return { ok: false, error: description.error };

  const allDay = Boolean(input.allDay);
  // For all-day events we ignore the time and offset (anchor at UTC midnight) so
  // the stored date is the calendar day the user picked, regardless of zone.
  const start = resolveInstant(
    input.startDate,
    allDay ? "" : input.startTime,
    allDay ? 0 : input.tzOffsetMinutes,
  );
  const end = input.endDate
    ? resolveInstant(input.endDate, allDay ? "" : input.endTime, allDay ? 0 : input.tzOffsetMinutes)
    : null;
  const range = validateRange(start, end);
  if (!range.ok) return { ok: false, error: range.error };

  const isOnline = Boolean(input.isOnline);
  let location: string | null = null;
  let onlineUrl: string | null = null;
  if (isOnline) {
    const u = validateOnlineUrl(input.onlineUrl);
    if (!u.ok) return { ok: false, error: u.error };
    onlineUrl = u.value;
  } else {
    const l = validateLocation(input.location);
    if (!l.ok) return { ok: false, error: l.error };
    location = l.value;
  }

  return {
    ok: true,
    value: {
      title: title.value,
      description: description.value,
      startsAt: range.value.startsAt,
      endsAt: range.value.endsAt,
      isOnline,
      location,
      onlineUrl,
      allDay,
    },
  };
}

export async function createEventAction(input: EventFormInput): Promise<ActionResult> {
  const caller = await verifiedCaller();
  if (!caller) return { ok: false, error: "You must be a verified OHS family to create an event." };

  const v = validateEventForm(input);
  if (!v.ok) return v;

  const recent = await countEventsByAuthorSince(caller.user.id, Date.now() - EVENT_RATE_WINDOW_MS);
  if (recent >= EVENT_RATE_LIMIT) {
    return { ok: false, error: "You've created a lot of events recently — please try again later." };
  }

  try {
    const event = await createEvent({
      authorSignupId: caller.user.id,
      authorClerkId: caller.clerkId,
      authorLabel: authorLabelFor(caller.user),
      ...v.value,
    });
    revalidatePath("/events");
    return { ok: true, id: event.id };
  } catch (err) {
    console.error("createEventAction failed:", err);
    return { ok: false, error: "Couldn't create the event. Please try again." };
  }
}

export async function updateEventAction(input: { id: string } & EventFormInput): Promise<ActionResult> {
  if (!UUID_RE.test(input.id)) return { ok: false, error: "Unknown event." };

  const caller = await verifiedCaller();
  if (!caller) return { ok: false, error: "You must be a verified OHS family." };

  // Authorization: the event must exist, be a USER event, and the caller must be
  // an admin of it (author or added admin). OHS events are never editable.
  const existing = await getEventById(input.id);
  if (!existing) return { ok: false, error: "Unknown event." };
  if (existing.source !== "user") {
    return { ok: false, error: "OHS calendar events can't be edited." };
  }
  if (!(await isEventAdmin(input.id, caller.user.id))) {
    return { ok: false, error: "You can only edit events you organize." };
  }

  const v = validateEventForm(input);
  if (!v.ok) return v;

  try {
    const updated = await updateEvent({ id: input.id, ...v.value });
    if (!updated) return { ok: false, error: "Couldn't save your changes." };
    revalidatePath("/events");
    revalidatePath(`/events/${input.id}`);
    return { ok: true, id: updated.id };
  } catch (err) {
    console.error("updateEventAction failed:", err);
    return { ok: false, error: "Couldn't save your changes. Please try again." };
  }
}

export async function deleteEventAction(input: { id: string }): Promise<ActionResult> {
  if (!UUID_RE.test(input.id)) return { ok: false, error: "Unknown event." };

  const caller = await verifiedCaller();
  if (!caller) return { ok: false, error: "You must be a verified OHS family." };

  const existing = await getEventById(input.id);
  if (!existing) return { ok: false, error: "Unknown event." };
  if (existing.source !== "user") return { ok: false, error: "OHS calendar events can't be deleted." };
  if (!(await isEventAdmin(input.id, caller.user.id))) {
    return { ok: false, error: "You can only delete events you organize." };
  }

  try {
    const ok = await deleteEvent(input.id);
    if (!ok) return { ok: false, error: "Couldn't delete the event." };
    revalidatePath("/events");
    return { ok: true };
  } catch (err) {
    console.error("deleteEventAction failed:", err);
    return { ok: false, error: "Couldn't delete the event. Please try again." };
  }
}

// Set/clear the caller's RSVP. `status` is 'going' | 'interested' | null (toggle off).
export async function rsvpAction(input: { eventId: string; status: RsvpStatus | null }): Promise<ActionResult> {
  if (!UUID_RE.test(input.eventId)) return { ok: false, error: "Unknown event." };
  if (input.status !== null && input.status !== "going" && input.status !== "interested") {
    return { ok: false, error: "Invalid RSVP." };
  }

  const caller = await verifiedCaller();
  if (!caller) return { ok: false, error: "You must be a verified OHS family to RSVP." };

  const existing = await getEventById(input.eventId);
  if (!existing) return { ok: false, error: "Unknown event." };

  try {
    await setRsvp(input.eventId, caller.user.id, input.status);
    revalidatePath("/events");
    revalidatePath(`/events/${input.eventId}`);
    return { ok: true };
  } catch (err) {
    console.error("rsvpAction failed:", err);
    return { ok: false, error: "Couldn't record your RSVP. Please try again." };
  }
}

// Live autocomplete for the "add admin" input: returns EXISTING signed-up accounts
// whose name matches the prefix. Verified-only caller; never leaks PII beyond a
// display name (no email/phone). The detail page maps the returned signupId back
// to add via addEventAdminAction (so only a real account can be added).
export async function searchMembersAction(input: {
  query: string;
}): Promise<{ ok: true; results: MemberSuggestion[] } | { ok: false; error: string }> {
  const caller = await verifiedCaller();
  if (!caller) return { ok: false, error: "You must be a verified OHS family." };
  const q = (input.query ?? "").trim();
  if (q.length < 2) return { ok: true, results: [] };
  try {
    const results = await searchSignupsByName(q, 8);
    return { ok: true, results };
  } catch (err) {
    console.error("searchMembersAction failed:", err);
    return { ok: false, error: "Couldn't search members." };
  }
}

// Add a per-event admin by signup id. Caller must already be an admin of a USER
// event; the target must be an existing, verified account.
export async function addEventAdminAction(input: {
  eventId: string;
  signupId: string;
}): Promise<ActionResult> {
  if (!UUID_RE.test(input.eventId) || !UUID_RE.test(input.signupId)) {
    return { ok: false, error: "Unknown event or member." };
  }

  const caller = await verifiedCaller();
  if (!caller) return { ok: false, error: "You must be a verified OHS family." };

  const existing = await getEventById(input.eventId);
  if (!existing) return { ok: false, error: "Unknown event." };
  if (existing.source !== "user") return { ok: false, error: "OHS events have no admins." };
  if (!(await isEventAdmin(input.eventId, caller.user.id))) {
    return { ok: false, error: "Only event organizers can add admins." };
  }

  // The target must be an existing, verified account.
  const target = await getSignupByEmailOrIdGuard(input.signupId);
  if (!target) return { ok: false, error: "That account can't be added." };

  try {
    await addEventAdmin(input.eventId, input.signupId);
    revalidatePath(`/events/${input.eventId}`);
    return { ok: true };
  } catch (err) {
    console.error("addEventAdminAction failed:", err);
    return { ok: false, error: "Couldn't add that admin. Please try again." };
  }
}

// Remove a per-event admin. The author can't be removed (the page never offers
// it). Caller must be an admin of the event.
export async function removeEventAdminAction(input: {
  eventId: string;
  signupId: string;
}): Promise<ActionResult> {
  if (!UUID_RE.test(input.eventId) || !UUID_RE.test(input.signupId)) {
    return { ok: false, error: "Unknown event or member." };
  }

  const caller = await verifiedCaller();
  if (!caller) return { ok: false, error: "You must be a verified OHS family." };

  const existing = await getEventById(input.eventId);
  if (!existing) return { ok: false, error: "Unknown event." };
  if (existing.source !== "user") return { ok: false, error: "OHS events have no admins." };
  if (!(await isEventAdmin(input.eventId, caller.user.id))) {
    return { ok: false, error: "Only event organizers can manage admins." };
  }
  // Never strip the author's own admin row.
  if (existing.authorSignupId && existing.authorSignupId === input.signupId) {
    return { ok: false, error: "The event creator is always an organizer." };
  }

  try {
    await removeEventAdmin(input.eventId, input.signupId);
    revalidatePath(`/events/${input.eventId}`);
    return { ok: true };
  } catch (err) {
    console.error("removeEventAdminAction failed:", err);
    return { ok: false, error: "Couldn't remove that admin. Please try again." };
  }
}

// Confirm a signupId refers to an existing, verified account before adding it as
// an admin (so only a real, verified member can be added). Returns the row or null.
async function getSignupByEmailOrIdGuard(signupId: string): Promise<SignupRow | null> {
  const row = await getSignupById(signupId);
  if (!row) return null;
  if (!isFamilyVerified(row)) return null;
  return row;
}
