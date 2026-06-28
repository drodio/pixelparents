// Pure helpers for the public event recap. Side-effect free + unit tested; the
// DB queries that use these live in src/lib/events.ts and the page components.
import { markdownToHtml } from "@/lib/markdown";

export type EventTiming = { startsAt: Date; endsAt: Date | null };

// An event is "past" once its end (or start, if no end) is before now. Past
// events render the recap; upcoming events render the apply flow.
export function isPastEvent(e: EventTiming, now: Date = new Date()): boolean {
  const end = e.endsAt ?? e.startsAt;
  return end.getTime() < now.getTime();
}

export type PhotoVisibility = "public" | "claimed" | "attendees";

// Filter a photo list for a given viewer. Non-attendees see only "public"
// photos; attendees (RSVP'd + claimed, resolved upstream) see everything.
// (Legacy 2-tier helper, kept for back-compat; the recap now uses canViewPhoto
// for the 3-tier public/claimed/attendees model with a blurred-lock teaser.)
export function visiblePhotos<T extends { visibility: string }>(
  photos: T[],
  viewer: { isAttendee: boolean },
): T[] {
  if (viewer.isAttendee) return photos;
  return photos.filter((p) => p.visibility === "public");
}

// Can a viewer see a photo of the given visibility?
//   public    → everyone
//   claimed   → anyone with a claimed profile (attendees are always claimed)
//   attendees → only people who attended this event
// Unknown/legacy values are treated as public.
export function canViewPhoto(
  visibility: string,
  viewer: { isClaimed: boolean; isAttendee: boolean },
): boolean {
  if (visibility === "attendees") return viewer.isAttendee;
  if (visibility === "claimed") return viewer.isClaimed || viewer.isAttendee;
  return true;
}

// Label shown over a locked (blurred) photo the viewer can't access.
export function photoLockLabel(visibility: string): string {
  if (visibility === "attendees") return "Private photo for event attendees";
  return "Private photo for Festival members"; // claimed tier
}

// Minimal defense-in-depth sanitizer for admin-authored recap HTML (TipTap
// output). Authorship is admin-only, so this just strips the obvious script /
// inline-handler vectors rather than implementing a full allowlist parser.
export function sanitizeRecapHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script>/gi, "")
    .replace(/<\s*style[^>]*>[\s\S]*?<\s*\/\s*style>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}

// Normalize an event description for HTML rendering. The field can hold three
// shapes over time: WYSIWYG HTML (from the admin editor), markdown / plain text
// (from Luma import or older rows). Returns sanitized HTML for either: HTML is
// sanitized as-is; markdown/plain is run through markdownToHtml first. Used by
// both the public render and the admin editor's initial content.
export function descriptionToHtml(desc: string | null | undefined): string {
  if (!desc || !desc.trim()) return "";
  const looksHtml = /<[a-z][\s\S]*>/i.test(desc);
  return sanitizeRecapHtml(looksHtml ? desc : markdownToHtml(desc));
}
