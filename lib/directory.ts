import { canViewProfile, coerceShareVisibility, shareFieldsOrDefault } from "@/lib/share";
import { childAge } from "@/lib/directory-filters";
import { builderStatusOf } from "@/lib/builder";
import { isStudentAccount, isAlumAccount } from "@/lib/family-display";
import { verifiedEmailsOf } from "@/lib/verify";
import { curatedEnrichmentOf, type StoredEnrichment } from "@/lib/enrichment/profile";
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
  // True for an ALUM account (graduated OHS student — an adult member). Drives the
  // directory's Parents/Students/Alumni perspective. Never both isStudent + isAlum.
  isAlum: boolean;
  // Opt-in professional links, gated behind a NEW, default-OFF "links" share
  // field so they never appear unless the member explicitly enables them.
  // linkedinUrl is the stored profile URL; githubUrl is derived from the public
  // GitHub username. Null when not shared / not provided.
  linkedinUrl: string | null;
  githubUrl: string | null;
  // Curated, shareable slice of the member's auto-built profile (bio / expertise
  // / how-they-can-help). Gated behind the NEW, default-OFF "profile_enrichment"
  // share field. NEVER includes the raw fact dump or the source-status roster —
  // those stay owner-only (see the family page). Null when not shared / empty.
  enrichment: {
    bio: string;
    expertiseTags: string[];
    canHelpWith: string[];
  } | null;
};

// A member's expertise signals for the asks matcher: the UNION of their curated
// enrichment expertiseTags (owner edits merged in by curatedEnrichmentOf), their
// self-reported skillsets, and their parent interests. De-duplicated
// case-insensitively, keeping the first-seen display label. Pure — used both to
// build matcher candidates (lib/db/asks.ts) and as the richness proxy
// (signalCount) for the matcher's deterministic tiebreak. NOTE: this reads the
// member's RAW signals for MATCHING only; it does NOT imply any are shown on a
// card — card rendering still routes through the share-field gates.
export function expertiseSignalsOf(row: Pick<SignupRow, "skillsets" | "parentInterests" | "extra">): string[] {
  const stored = ((row.extra ?? {}) as Record<string, unknown>).enrichment as
    | StoredEnrichment
    | null
    | undefined;
  const curated = curatedEnrichmentOf(stored);
  const all = [
    ...(curated?.expertiseTags ?? []),
    ...((row.skillsets ?? []).filter((s): s is string => typeof s === "string")),
    ...((row.parentInterests ?? []).filter((s): s is string => typeof s === "string")),
  ];
  const byKey = new Map<string, string>();
  for (const t of all) {
    const v = t.trim();
    if (!v) continue;
    const k = v.toLowerCase();
    if (!byKey.has(k)) byKey.set(k, v);
  }
  return Array.from(byKey.values());
}

// The shape needed to resolve a child to its linked student account: a signup row
// that carries the `extra` blob (for accountType + verified emails) and the
// expertise-signal source fields. SignupRow satisfies this.
export type StudentAccountForLink = Pick<
  SignupRow,
  "extra" | "skillsets" | "parentInterests"
>;

// Resolve a child row to the family's linked STUDENT account, if any. A child is
// the SAME person as a student account when the child's `studentEmail` matches one
// of that account's verified OHS emails (case-insensitively). Returns the matching
// student account, or null when the child has no email or no account matches.
// Mirrors the join in lib/family-display.buildFamilyDisplay (single source of the
// linking rule), but kept here so the directory card builder can reuse it.
export function linkedStudentAccountForChild<T extends StudentAccountForLink>(
  child: Pick<ChildRow, "studentEmail">,
  familyStudentAccounts: T[],
): T | null {
  const key = child.studentEmail?.trim().toLowerCase();
  if (!key) return null;
  for (const acct of familyStudentAccounts) {
    const verified = verifiedEmailsOf((acct.extra ?? {}) as Record<string, unknown>);
    if (verified.some((e) => e.trim().toLowerCase() === key)) return acct;
  }
  return null;
}

// The interests to DISPLAY for a child, aggregating in the linked student
// account's accurate expertise signals. The child row carries kid-interest tags
// the parent typed on the family form; when that child is ALSO a real student
// account, that account's `expertiseSignalsOf` (enrichment expertise + skillsets +
// interests) is the fuller, more accurate set. We return the de-duplicated UNION
// (child interests first, then any new student signals) so the Directory shows the
// complete picture and nothing the parent entered is lost. A child with no linked
// student account is returned unchanged. Pure; reuses expertiseSignalsOf — does NOT
// hand-roll the student signal extraction.
export function aggregatedChildInterests(
  child: Pick<ChildRow, "studentEmail" | "interests">,
  familyStudentAccounts: StudentAccountForLink[],
): string[] {
  const childInterests = (child.interests ?? []).filter(
    (s): s is string => typeof s === "string",
  );
  const linked = linkedStudentAccountForChild(child, familyStudentAccounts);
  if (!linked) return childInterests;
  const studentSignals = expertiseSignalsOf(linked);
  const byKey = new Map<string, string>();
  for (const t of [...childInterests, ...studentSignals]) {
    const v = t.trim();
    if (!v) continue;
    const k = v.toLowerCase();
    if (!byKey.has(k)) byKey.set(k, v);
  }
  return Array.from(byKey.values());
}

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

// Whether a member has a profile they've opted to SHARE with OHS families —
// independent of whether they also earn a standalone directory grid card. This is
// EVERYTHING isDirectoryVisible checks EXCEPT the `!isStudentAccount` exclusion: a
// student CAN share a profile (and link to it from a board post / responder card),
// they just don't appear as their own card in the directory grid. Use this — NOT
// isDirectoryVisible — whenever you want to know "does a link to this member's
// profile resolve?" rather than "does this member belong in the directory grid?".
export function hasShareableProfile(row: SignupRow): boolean {
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
  // The family's STUDENT accounts (extra.accountType === "student"), used to
  // resolve a rendered child to its own student account so the card shows the
  // child's accurate, aggregated tag set (kid interests UNION the student
  // account's expertise signals). Defaults to [] so existing callers/tests keep
  // their behavior (a child with no linked account renders its interests as-is).
  familyStudentAccounts: SignupRow[] = [],
): DirectoryCard {
  const fields = new Set(shareFieldsOrDefault(row.shareFields));
  // A STUDENT account is a minor — coarsen their card regardless of what they
  // opted to share: never a precise city, never the children list. (They still
  // only appear at all when isDirectoryVisible passes the same opt-in gate.)
  const isStudent = isStudentAccount(row);
  const isAlum = isAlumAccount(row);

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
          // When this child is also a real student account, show the de-duplicated
          // UNION of their kid-interest tags and the student account's accurate
          // expertise signals — not just the kid-form interests. Unchanged for an
          // unlinked child.
          interests: aggregatedChildInterests(k, familyStudentAccounts),
          age: childAge(k, currentYear),
        }))
      : [];

  // Combined interest set for chips + filtering: parent + child interests, but
  // only those whose source field was shared. Deduped case-insensitively,
  // keeping the first-seen display label. (Student cards hide children, so no
  // child interests are mixed in for them.) Child interests are the SAME
  // aggregated (kid + linked-student) set used for the per-child rows above.
  const childInterests =
    fields.has("children") && !isStudent
      ? familyKids.flatMap((k) => aggregatedChildInterests(k, familyStudentAccounts))
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

  // Auto-built profile (curated info only) — behind the NEW, default-OFF
  // "profile_enrichment" share field. We expose ONLY the curated bio/expertise/
  // help (with the owner's edits merged in by curatedEnrichmentOf); the raw facts
  // + source-status roster are intentionally never projected onto a card.
  const stored = ((row.extra ?? {}) as Record<string, unknown>).enrichment as
    | StoredEnrichment
    | null
    | undefined;
  const curated = fields.has("profile_enrichment") ? curatedEnrichmentOf(stored) : null;
  const enrichment = curated
    ? {
        bio: curated.bio,
        expertiseTags: curated.expertiseTags,
        canHelpWith: curated.canHelpWith,
      }
    : null;

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
    isAlum,
    linkedinUrl,
    githubUrl,
    enrichment,
  };
}
