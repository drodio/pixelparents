import { fetchWithTimeout } from "@/lib/fetch-timeout";
// Thin client for the Luma public API (https://docs.lu.ma/reference).
// Auth is a single calendar-scoped key in LUMA_API_KEY; every request sends it
// as the x-luma-api-key header. We only use read endpoints here (listing /
// fetching events); any write/create lives behind explicit admin actions.

import { canonicalizeLinkedinUrl } from "@/lib/canonicalize";

const BASE = "https://api.lu.ma/public/v1";

function apiKey(): string {
  const k = process.env.LUMA_API_KEY;
  if (!k) throw new Error("LUMA_API_KEY is not set");
  return k;
}

async function lumaGet<T>(path: string): Promise<T> {
  const res = await fetchWithTimeout(`${BASE}${path}`, {
    headers: { "x-luma-api-key": apiKey(), accept: "application/json" },
    // Always hit Luma fresh — this backs an admin sync, not a hot path.
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Luma ${path} → ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

// The fields we rely on from a Luma event object (it returns more; we keep the
// subset we map into our events table). geo_address_json is loosely typed
// because the public API only reliably fills `address` for API-created events.
export type LumaEvent = {
  api_id: string;
  name: string;
  description?: string | null;
  cover_url?: string | null;
  url?: string | null; // e.g. https://luma.com/founder-qoeu
  start_at: string;
  end_at?: string | null;
  timezone?: string | null;
  visibility?: string | null;
  meeting_url?: string | null;
  geo_address_json?: {
    address?: string | null;
    full_address?: string | null;
    // Often present on Luma-hosted events; used to build a short "City, ST".
    city?: string | null;
    region?: string | null;
    country?: string | null;
  } | null;
};

type ListEventsResponse = {
  entries: Array<{ event?: LumaEvent } & Partial<LumaEvent>>;
  has_more: boolean;
  next_cursor?: string | null;
};

// List every event on the calendar, following pagination. Each entry carries
// the event fields both at the top level and (sometimes) under `.event`; we
// normalize to the flat LumaEvent.
export async function listLumaEvents(): Promise<LumaEvent[]> {
  const out: LumaEvent[] = [];
  let cursor: string | null | undefined;
  // Guard against an unbounded loop if the API ever misbehaves.
  for (let page = 0; page < 50; page++) {
    const qs = cursor ? `?pagination_cursor=${encodeURIComponent(cursor)}` : "";
    const data = await lumaGet<ListEventsResponse>(`/calendar/list-events${qs}`);
    for (const entry of data.entries ?? []) {
      const ev = (entry.event ?? (entry as LumaEvent));
      if (ev?.api_id) out.push(ev);
    }
    if (!data.has_more || !data.next_cursor) break;
    cursor = data.next_cursor;
  }
  return out;
}

// A guest (registrant) on a Luma event, from /event/get-guests. The API returns
// many more fields; we keep the subset we map into event_attendees. The match
// key into our profiles is `email` (lowercased). approval_status is the RSVP
// state ("approved" | "pending" | "declined"). checked_in_at is set only if the
// guest was scanned at the door (null otherwise).
export type LumaGuest = {
  api_id: string; // gst-…
  approval_status?: string | null;
  email?: string | null;
  name?: string | null;
  user_first_name?: string | null;
  user_last_name?: string | null;
  user_api_id?: string | null; // usr-… (stable Luma person id)
  registered_at?: string | null;
  checked_in_at?: string | null;
  // Registration form answers — Luma returns these for paid/custom-question events.
  // Loosely typed: the actual shape may include more fields; we only need label/question/answer.
  registration_answers?: Array<{ label?: string | null; question?: string | null; answer?: string | null }> | null;
};

// Best-effort normalize a raw LinkedIn answer string to a full URL, then
// canonicalize it. Handles: full URLs, linkedin.com/in/x, /in/x, in/x, bare handles.
function normalizeLinkedinAnswer(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  let candidate: string;
  if (/^https?:\/\//i.test(s)) candidate = s;
  else if (/^(www\.)?linkedin\.com\//i.test(s)) candidate = `https://${s.replace(/^www\./i, "")}`;
  else if (/^\/?in\/[^/\s]+/i.test(s)) candidate = `https://linkedin.com/${s.replace(/^\//, "")}`;
  else candidate = s;
  return canonicalizeLinkedinUrl(candidate);
}

// Best-effort extract of a registrant's LinkedIn URL from Luma registration
// answers: an answer whose label/question mentions "linkedin", or whose value
// itself looks like a LinkedIn handle/url. Returns null when none is present
// (the API may not return registration answers at all — degrade gracefully).
export function linkedinUrlFromGuest(g: LumaGuest): string | null {
  const answers = g.registration_answers ?? [];
  for (const a of answers ?? []) {
    const label = `${a?.label ?? ""} ${a?.question ?? ""}`.toLowerCase();
    const ans = (a?.answer ?? "").trim();
    if (!ans) continue;
    const looksLinkedin =
      label.includes("linkedin") || /linkedin\.com\/in\//i.test(ans) || /^\/?in\/[^/\s]+/i.test(ans);
    if (!looksLinkedin) continue;
    const norm = normalizeLinkedinAnswer(ans);
    if (norm) return norm;
  }
  return null;
}

type GetGuestsResponse = {
  entries: Array<{ guest?: LumaGuest } & Partial<LumaGuest>>;
  has_more: boolean;
  next_cursor?: string | null;
};

// List every guest on a single Luma event, following pagination. Each entry
// carries the guest fields both at the top level and (usually) under `.guest`;
// we normalize to the flat LumaGuest, preferring the nested object.
export async function listLumaGuests(eventApiId: string): Promise<LumaGuest[]> {
  const out: LumaGuest[] = [];
  let cursor: string | null | undefined;
  for (let page = 0; page < 50; page++) {
    const params = new URLSearchParams({ event_api_id: eventApiId });
    if (cursor) params.set("pagination_cursor", cursor);
    const data = await lumaGet<GetGuestsResponse>(`/event/get-guests?${params.toString()}`);
    for (const entry of data.entries ?? []) {
      const g = (entry.guest ?? (entry as LumaGuest));
      if (g?.api_id) out.push(g);
    }
    if (!data.has_more || !data.next_cursor) break;
    cursor = data.next_cursor;
  }
  return out;
}

// The lu.ma slug — the last path segment of the public URL (e.g.
// "founder-qoeu" from "https://luma.com/founder-qoeu"). Used as our row slug.
export function lumaSlugFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const path = new URL(url).pathname.replace(/^\/+|\/+$/g, "");
    const seg = path.split("/").pop() ?? "";
    return /^[a-z0-9-]+$/i.test(seg) ? seg.toLowerCase() : null;
  } catch {
    return null;
  }
}
