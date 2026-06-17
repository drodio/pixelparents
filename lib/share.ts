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
