import { canViewProfile, coerceShareVisibility, shareFieldsOrDefault } from "@/lib/share";
import { childAge } from "@/lib/directory-filters";
import type { SignupRow, ChildRow } from "@/lib/db/schema/signups";

// Re-export the pure, client-safe filter helpers so server code and tests can
// keep importing them from "@/lib/directory". The client imports them straight
// from "@/lib/directory-filters" to avoid pulling node:crypto (via lib/share)
// into the browser bundle.
export { childAge, haversineMiles, geocodeLocation } from "@/lib/directory-filters";

// One card's worth of data for the OHS directory. Every field present here is one
// the parent opted into sharing — phone/email are NEVER included (detail-only on
// /p). Plain/serializable so a server component can hand it to the client.
export type DirectoryCard = {
  token: string;
  name: string;
  firstName: string;
  location: string | null;
  // Children the parent chose to share (name/grade/interests/derived age). Empty
  // when the "children" field wasn't shared. `age` is null when neither a
  // birthYear nor a numeric grade is available to derive it from.
  children: { firstName: string; grade: string | null; interests: string[]; age: number | null }[];
  // Deduped parent + child interests the parent chose to share — drives the
  // chips and the interest filter. Empty when neither field was shared.
  interests: string[];
  heroUrl: string | null;
  thumbUrls: string[];
};

// Families that signed up BEFORE student-email verification shipped are
// grandfathered into the directory so the live directory isn't suddenly emptied;
// everyone who joins after must verify (approvalStatus="approved", set by the
// student-email flow or an admin) to be listed. Drop this cutoff for a hard gate
// once existing families have had a chance to verify.
export const VERIFICATION_CUTOFF = Date.parse("2026-06-30T00:00:00Z");

// A family counts as verified for the directory if an admin/student-email flow
// approved them, OR they predate verification (grandfathered).
export function isFamilyVerified(row: Pick<SignupRow, "extra" | "createdAt">): boolean {
  const extra = (row.extra ?? {}) as Record<string, unknown>;
  if (extra.approvalStatus === "approved") return true;
  const created =
    row.createdAt instanceof Date ? row.createdAt.getTime() : Date.parse(String(row.createdAt));
  return Number.isFinite(created) && created < VERIFICATION_CUTOFF;
}

// Inclusion gate for the OHS directory. The visibility decision routes through
// the SAME unit-tested canViewProfile the /p page uses (single source of truth),
// so the directory can't silently diverge if the gate's semantics change. The
// sharing preconditions (enabled, has a token, non-blank name to drop auto-save
// drafts) wrap that decision, and the family must be verified (or grandfathered).
export function isDirectoryVisible(row: SignupRow): boolean {
  return (
    row.shareEnabled === true &&
    Boolean(row.shareToken) &&
    Boolean(row.firstName?.trim()) &&
    isFamilyVerified(row) &&
    canViewProfile(coerceShareVisibility(row.shareVisibility), {
      isOwner: false,
      isOhsFamily: true,
    })
  );
}

// The ordered photo pathnames for a card (family photos first, then each shared
// child's), gated behind the "photos" field. The first is the hero; the rest are
// thumbnails. Returns [] when photos weren't shared.
export function directoryPhotoPaths(
  row: SignupRow,
  familyKids: ChildRow[],
): string[] {
  const fields = new Set(shareFieldsOrDefault(row.shareFields));
  if (!fields.has("photos")) return [];
  return [
    ...(row.photos ?? []).map((p) => p.pathname),
    ...familyKids.flatMap((k) => (k.photos ?? []).map((p) => p.pathname)),
  ];
}

// Project a signup + its family's children into a card, exposing ONLY the fields
// the parent opted into via shareFieldsOrDefault. Pure: callers presign photos
// and pass the pathname→url map in (plus currentYear for age derivation).
// Assumes isDirectoryVisible(row) is true (so shareToken is set).
export function buildDirectoryCard(
  row: SignupRow,
  familyKids: ChildRow[],
  urlByPath: Map<string, string>,
  maxThumbs: number,
  currentYear: number,
): DirectoryCard {
  const fields = new Set(shareFieldsOrDefault(row.shareFields));

  const location = fields.has("location")
    ? [row.city, row.state].filter(Boolean).join(", ") || null
    : null;

  const parentInterests = fields.has("interests") ? row.parentInterests ?? [] : [];

  const sharedChildren = fields.has("children")
    ? familyKids.map((k) => ({
        firstName: k.firstName,
        grade: k.grade ?? null,
        interests: k.interests ?? [],
        age: childAge(k, currentYear),
      }))
    : [];

  // Combined interest set for chips + filtering: parent + child interests, but
  // only those whose source field was shared. Deduped case-insensitively,
  // keeping the first-seen display label.
  const childInterests = fields.has("children")
    ? familyKids.flatMap((k) => k.interests ?? [])
    : [];
  const interestByKey = new Map<string, string>();
  for (const i of [...parentInterests, ...childInterests]) {
    const t = i?.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (!interestByKey.has(key)) interestByKey.set(key, t);
  }

  const photoUrls = directoryPhotoPaths(row, familyKids)
    .map((path) => urlByPath.get(path))
    .filter((u): u is string => Boolean(u));

  return {
    token: row.shareToken!,
    name: [row.firstName, row.lastName].filter(Boolean).join(" "),
    firstName: row.firstName,
    location,
    children: sharedChildren,
    interests: Array.from(interestByKey.values()),
    heroUrl: photoUrls[0] ?? null,
    thumbUrls: photoUrls.slice(1, 1 + maxThumbs),
  };
}
