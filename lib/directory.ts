import { canViewProfile, coerceShareVisibility, shareFieldsOrDefault } from "@/lib/share";
import { childAge } from "@/lib/directory-filters";
import { builderStatusOf } from "@/lib/builder";
import { isStudentAccount } from "@/lib/family-display";
import type { SignupRow, ChildRow } from "@/lib/db/schema/signups";

// Build a public GitHub profile URL from a stored handle. Returns null for a
// blank/whitespace handle so the showcase can fall back to "no link".
function githubUrlFromUsername(handle: string | null | undefined): string | null {
  const h = handle?.trim();
  return h ? `https://github.com/${h}` : null;
}

// A child's display name = first name + the family/parent surname, EXCEPT when the
// first-name field already contains the surname (some families typed the full name
// into it) — then we don't double it ("Devina Odio" stays, not "Devina Odio Odio").
export function childFullName(first: string, last: string | null | undefined): string {
  const fn = (first ?? "").trim();
  const ln = (last ?? "").trim();
  if (!ln || fn.toLowerCase().includes(ln.toLowerCase())) return fn;
  return `${fn} ${ln}`;
}

// Re-export the pure, client-safe filter helpers so server code and tests can
// keep importing them from "@/lib/directory". The client imports them straight
// from "@/lib/directory-filters" to avoid pulling node:crypto (via lib/share)
// into the browser bundle.
export { childAge, haversineMiles, geocodeLocation } from "@/lib/directory-filters";

// One card's worth of data for the OHS directory / community showcase. Every
// field present here is one the member opted into sharing — phone/email are NEVER
// included (detail-only on /p). Plain/serializable so a server component can hand
// it to the client.
export type DirectoryCard = {
  token: string;
  name: string;
  firstName: string;
  location: string | null;
  // Children the parent chose to share (name/grade/interests/derived age). Empty
  // when the "children" field wasn't shared. `age` is null when neither a
  // birthYear nor a numeric grade is available to derive it from. `name` is the
  // child's full name (first + the family/parent surname) for display.
  children: { firstName: string; name: string; grade: string | null; interests: string[]; age: number | null }[];
  // Deduped parent + child interests the parent chose to share — drives the
  // chips and the interest filter. Empty when neither field was shared.
  interests: string[];
  // Self-reported technical skillsets (recruitment profile). Shown as chips on
  // the showcase card; non-PII, gated behind the "interests" share field.
  skillsets: string[];
  heroUrl: string | null;
  thumbUrls: string[];
  // "Builder" status, derived from the parent's extra (builderStatusOf): true if
  // a GitHub commit check found commits OR an admin/family set the manual flag.
  // `contributions` is the last counted commit total (0 when unknown). NOT gated
  // behind a share field — it's a community-recognition badge, not PII.
  isBuilder: boolean;
  contributions: number;
  // True for a STUDENT account (extra.accountType === "student"). Drives the
  // minor-privacy coarsening: a student card never exposes precise location
  // (no city — region/country at most) and never shows children.
  isStudent: boolean;
  // Opt-in professional links, gated behind a NEW, default-OFF "links" share
  // field so they never appear unless the member explicitly enables them.
  // linkedinUrl is the stored profile URL; githubUrl is derived from the public
  // GitHub username. Null when not shared / not provided.
  linkedinUrl: string | null;
  githubUrl: string | null;
};

// Families that signed up BEFORE this cutoff are grandfathered into the directory
// so the live directory isn't suddenly emptied; everyone who joins after must
// verify (approvalStatus="approved", set by the student-email flow, an admin, or
// API approval) to be listed. The date is a fixed compare, so a grandfathered
// family NEVER drops out over time — only genuinely new (post-cutoff) unverified
// families are gated. Set generously past the rollout window; drop it entirely for
// a hard gate once existing families have had a chance to verify.
export const VERIFICATION_CUTOFF = Date.parse("2026-08-01T00:00:00Z");

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
    // Kids/students are NOT standalone cards — a student account appears only as a
    // (full) name on their linked parent's card, never as its own directory entry.
    !isStudentAccount(row) &&
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
  // A STUDENT account is a minor — coarsen their card regardless of what they
  // opted to share: never a precise city, never the children list. (They still
  // only appear at all when isDirectoryVisible passes the same opt-in gate.)
  const isStudent = isStudentAccount(row);

  // Location: parents may show "City, State". Students are coarsened to the
  // region/country only — at most the state (or country), never the city.
  const location = fields.has("location")
    ? isStudent
      ? row.state || row.country || null
      : [row.city, row.state].filter(Boolean).join(", ") || null
    : null;

  const parentInterests = fields.has("interests") ? row.parentInterests ?? [] : [];

  // Skillsets ride along with the "interests" opt-in (both are self-reported,
  // non-PII profile facets). Empty when interests weren't shared.
  const skillsets = fields.has("interests")
    ? (row.skillsets ?? []).map((s) => s?.trim()).filter((s): s is string => Boolean(s))
    : [];

  // Students never expose the children list (a minor isn't a "parent of").
  const sharedChildren =
    fields.has("children") && !isStudent
      ? familyKids.map((k) => ({
          firstName: k.firstName,
          // Full name = child's first + the card owner's (parent's) surname (e.g.
          // "Ansh Vasani"), without doubling an already-present surname.
          name: childFullName(k.firstName, row.lastName),
          grade: k.grade ?? null,
          interests: k.interests ?? [],
          age: childAge(k, currentYear),
        }))
      : [];

  // Combined interest set for chips + filtering: parent + child interests, but
  // only those whose source field was shared. Deduped case-insensitively,
  // keeping the first-seen display label. (Student cards hide children, so no
  // child interests are mixed in for them.)
  const childInterests =
    fields.has("children") && !isStudent
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

  const { isBuilder, contributions } = builderStatusOf(
    (row.extra ?? {}) as Record<string, unknown>,
  );

  // Professional links are NEW fields, default-OFF: only surface them behind an
  // explicit "links" opt-in (added to SHARE_FIELDS, absent from
  // DEFAULT_SHARE_FIELDS). Coarsening doesn't apply — a LinkedIn/GitHub link is
  // a deliberate professional share, not location PII.
  const showLinks = fields.has("links");
  const linkedinUrl = showLinks ? row.linkedinUrl?.trim() || null : null;
  const githubUrl = showLinks ? githubUrlFromUsername(row.githubUsername) : null;

  // For students, surname is omitted from the displayed name (first name only —
  // a minor-privacy measure). Parents keep their full name.
  const name = isStudent
    ? row.firstName
    : [row.firstName, row.lastName].filter(Boolean).join(" ");

  return {
    token: row.shareToken!,
    name,
    firstName: row.firstName,
    location,
    children: sharedChildren,
    interests: Array.from(interestByKey.values()),
    skillsets,
    heroUrl: photoUrls[0] ?? null,
    thumbUrls: photoUrls.slice(1, 1 + maxThumbs),
    isBuilder,
    contributions,
    isStudent,
    linkedinUrl,
    githubUrl,
  };
}
