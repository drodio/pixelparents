// Pure transforms from a Luma guest (see src/lib/luma.ts) into the values we
// store in the event_attendees table. The DB-touching matching + upsert lives
// in src/lib/event-attendees-sync.ts; everything here is side-effect free and
// unit-tested.

import { normalizeEmail } from "@/lib/profile-emails";
import { linkedinUrlFromGuest, type LumaGuest } from "@/lib/luma";

export type AttendeeApprovalStatus = "approved" | "pending" | "declined";

// The insert/upsert shape for event_attendees. evaluationId is filled in by the
// sync step (email → profile match); the mapper always leaves it null.
export type AttendeeValues = {
  eventId: string;
  evaluationId: string | null;
  lumaGuestApiId: string;
  lumaUserApiId: string | null;
  email: string | null;
  name: string | null;
  linkedinUrl: string | null;
  approvalStatus: AttendeeApprovalStatus;
  registeredAt: Date | null;
  checkedInAt: Date | null;
  lumaUrl: string | null;
};

// Map Luma's approval_status to our enum. Anything we don't recognize (e.g.
// "waitlist", null) is treated as pending so it never leaks into the
// approved-attendee set used for gating/analytics.
export function mapApprovalStatus(s: string | null | undefined): AttendeeApprovalStatus {
  const v = (s ?? "").trim().toLowerCase();
  if (v === "approved" || v === "declined") return v;
  return "pending";
}

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function displayName(g: LumaGuest): string | null {
  if (g.name && g.name.trim()) return g.name.trim();
  const joined = [g.user_first_name, g.user_last_name]
    .filter((p) => p && p.trim())
    .join(" ")
    .trim();
  return joined || null;
}

export function lumaGuestToAttendeeValues(
  g: LumaGuest,
  ctx: { eventId: string; lumaUrl: string | null },
): AttendeeValues {
  const email = g.email && g.email.trim() ? normalizeEmail(g.email) : null;
  return {
    eventId: ctx.eventId,
    evaluationId: null,
    lumaGuestApiId: g.api_id,
    lumaUserApiId: g.user_api_id ?? null,
    email,
    name: displayName(g),
    linkedinUrl: linkedinUrlFromGuest(g),
    approvalStatus: mapApprovalStatus(g.approval_status),
    registeredAt: parseDate(g.registered_at),
    checkedInAt: parseDate(g.checked_in_at),
    lumaUrl: ctx.lumaUrl,
  };
}
