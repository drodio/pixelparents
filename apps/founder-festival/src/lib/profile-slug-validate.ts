// Pure validators for the claimed-user editor of (nickname, slugKind, slug).
// No DB imports — kept separate from src/lib/profile-slug-edit.ts so unit
// tests don't have to load the Neon client at import time.

export type SlugKind = "founder" | "investor";

// Slugs that would collide with existing or near-future routes if a user
// tried to claim them. Block on the slug only — the role segment is always
// founder|investor so no collision there.
const RESERVED_SLUGS = new Set<string>([
  "founder",
  "investor",
  "api",
  "profile",
  "admin",
  "dev",
  "developers",
  "account",
  "claim",
  "claim-callback",
  "setup",
  "leaderboard",
  "pricing",
  "about",
  "settings",
  "login",
  "logout",
  "signin",
  "signup",
  "sign-in",
  "sign-up",
  "new",
  "edit",
  "delete",
  "null",
  "undefined",
]);

export type SlugValidationError =
  | "slug_empty"
  | "slug_too_long"
  | "slug_invalid_chars"
  | "slug_reserved";

export function validateSlug(input: unknown): { ok: true; value: string } | { ok: false; error: SlugValidationError } {
  if (typeof input !== "string") return { ok: false, error: "slug_empty" };
  const trimmed = input.trim().toLowerCase();
  if (trimmed.length === 0) return { ok: false, error: "slug_empty" };
  if (trimmed.length > 64) return { ok: false, error: "slug_too_long" };
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmed)) return { ok: false, error: "slug_invalid_chars" };
  if (RESERVED_SLUGS.has(trimmed)) return { ok: false, error: "slug_reserved" };
  return { ok: true, value: trimmed };
}

export type NicknameValidationError = "nickname_too_long" | "nickname_invalid_chars";

export function validateNickname(
  input: unknown,
): { ok: true; value: string | null } | { ok: false; error: NicknameValidationError } {
  // null / undefined / "" / whitespace-only → clears the nickname.
  if (input === null || input === undefined) return { ok: true, value: null };
  if (typeof input !== "string") return { ok: false, error: "nickname_invalid_chars" };
  const trimmed = input.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (trimmed.length > 32) return { ok: false, error: "nickname_too_long" };
  // No control characters; everything else (Unicode letters, marks,
  // numbers, punctuation, symbols, spaces) is fine — users get to pick
  // how they're addressed.
  if (/[\x00-\x1f\x7f]/.test(trimmed)) return { ok: false, error: "nickname_invalid_chars" };
  return { ok: true, value: trimmed };
}

export function validateSlugKind(input: unknown): { ok: true; value: SlugKind } | { ok: false; error: "role_invalid" } {
  if (input === "founder" || input === "investor") return { ok: true, value: input };
  return { ok: false, error: "role_invalid" };
}
