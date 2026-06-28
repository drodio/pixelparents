import { randomBytes } from "node:crypto";

// The fields a parent can choose to expose on their secret share page. Name and
// the "shared by" identity always show — these are the optional extras.
export const SHARE_FIELDS = [
  { key: "location", label: "City & state" },
  { key: "interests", label: "Parent interests" },
  { key: "photos", label: "Photos" },
  { key: "children", label: "Children (name, grade, interests, notes)" },
  { key: "phone", label: "Phone number" },
  { key: "email", label: "Email address" },
] as const;

export type ShareFieldKey = (typeof SHARE_FIELDS)[number]["key"];

// Visibility tiers for the /p share page.
export type ShareVisibility = "ohs" | "private";

export const SHARE_VISIBILITY = [
  { value: "ohs", label: "OHS Families" },
  { value: "private", label: "Just me" },
] as const satisfies ReadonlyArray<{ value: ShareVisibility; label: string }>;

export function isShareVisibility(v: unknown): v is ShareVisibility {
  return v === "ohs" || v === "private";
}

// Coerce a stored share_visibility value to a current tier. Legacy "link"
// (the removed "anyone with the link" tier) downgrades to "ohs" so those
// profiles stay shared with OHS families but are no longer publicly viewable.
export function coerceShareVisibility(raw: unknown): ShareVisibility {
  if (raw === "ohs") return "ohs";
  if (raw === "link") return "ohs"; // legacy downgrade
  return "private";
}

// Can a viewer see a profile at the given visibility? Pure + unit-tested so the
// security-critical gate can't silently regress.
export function canViewProfile(
  visibility: ShareVisibility,
  opts: { isOwner: boolean; isOhsFamily: boolean },
): boolean {
  if (visibility === "ohs") return opts.isOwner || opts.isOhsFamily;
  return opts.isOwner; // "private"
}

const VALID_KEYS = new Set<string>(SHARE_FIELDS.map((f) => f.key));

// Sensible default when a parent first enables sharing: profile yes, contact no.
export const DEFAULT_SHARE_FIELDS: ShareFieldKey[] = [
  "location",
  "interests",
  "photos",
  "children",
];

// 32 url-safe chars — same unguessable-token recipe as the developer API keys.
export function generateShareToken(): string {
  return randomBytes(24).toString("base64url");
}

// Coerce whatever is stored into a clean, valid field-key list. Only a true
// null/undefined (never chosen yet) falls back to the defaults — an explicit
// empty selection is honored, so a parent can hide everything but their name.
export function shareFieldsOrDefault(stored: string[] | null | undefined): ShareFieldKey[] {
  if (stored == null) return [...DEFAULT_SHARE_FIELDS];
  return stored.filter((k): k is ShareFieldKey => VALID_KEYS.has(k));
}

// Keep only known field keys (used when persisting a parent's selection).
export function sanitizeShareFields(input: unknown): ShareFieldKey[] {
  if (!Array.isArray(input)) return [];
  return input.filter((k): k is ShareFieldKey => typeof k === "string" && VALID_KEYS.has(k));
}
