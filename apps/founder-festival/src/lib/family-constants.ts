// DB-free Kids & Family constants + helpers, safe to import from client
// components (the add/edit form, the section list) without dragging `@/db` into
// the browser bundle. Server query code lives in `@/lib/family`.

export const RELATIONSHIP_OPTIONS = [
  { value: "daughter", label: "Daughter" },
  { value: "son", label: "Son" },
  { value: "child", label: "Child" },
  { value: "partner", label: "Partner" },
  { value: "spouse", label: "Spouse" },
  { value: "dog", label: "Dog" },
  { value: "cat", label: "Cat" },
  { value: "pet", label: "Pet" },
  { value: "family-member", label: "Family Member" },
  { value: "other", label: "Other" },
] as const;

export type Relationship = (typeof RELATIONSHIP_OPTIONS)[number]["value"];

export const RELATIONSHIP_VALUES = RELATIONSHIP_OPTIONS.map((o) => o.value);

// Leaderboard "Family & Kids" filter taxonomy. Each option maps to a set of
// stored relationships; a profile matches when it has a PUBLIC family member
// (public_share <> 'none') with one of those relationships. Shared by the
// leaderboard filter (parse + SQL + UI) and the clickable profile family badges.
export const FAMILY_FILTER_OPTIONS = [
  { value: "children", label: "Children", relationships: ["son", "daughter", "child"] },
  { value: "spouse", label: "Spouse", relationships: ["spouse"] },
  { value: "partner", label: "Partner", relationships: ["partner"] },
  { value: "dog", label: "Dog", relationships: ["dog"] },
  { value: "cat", label: "Cat", relationships: ["cat"] },
  { value: "pet", label: "Other pet", relationships: ["pet"] },
] as const;

export type FamilyFilter = (typeof FAMILY_FILTER_OPTIONS)[number]["value"];
export const FAMILY_FILTER_VALUES = FAMILY_FILTER_OPTIONS.map((o) => o.value);
export const FAMILY_FILTER_LABELS = Object.fromEntries(
  FAMILY_FILTER_OPTIONS.map((o) => [o.value, o.label]),
) as Record<FamilyFilter, string>;

export function isFamilyFilter(v: string): v is FamilyFilter {
  return (FAMILY_FILTER_VALUES as readonly string[]).includes(v);
}

// Which filter bucket a stored relationship belongs to (for making a profile's
// family badge clickable → the right leaderboard filter). Null if not bucketed.
export function relationshipToFamilyFilter(rel: string): FamilyFilter | null {
  return FAMILY_FILTER_OPTIONS.find((o) => (o.relationships as readonly string[]).includes(rel))?.value ?? null;
}

// Display order for the public family badges on a profile: partner/spouse
// first, then kids, then pets, then anything else. Lower sorts earlier.
export function familyBadgeOrder(relationship: string): number {
  if (relationship === "partner" || relationship === "spouse") return 0;
  if (relationship === "son" || relationship === "daughter" || relationship === "child") return 1;
  if (relationship === "dog" || relationship === "cat" || relationship === "pet") return 2;
  return 3;
}

// The stored relationships covered by a set of selected family filters.
export function familyFilterRelationships(filters: FamilyFilter[]): string[] {
  const set = new Set<string>();
  for (const f of filters) {
    const opt = FAMILY_FILTER_OPTIONS.find((o) => o.value === f);
    opt?.relationships.forEach((r) => set.add(r));
  }
  return [...set];
}

export function isRelationship(v: string): v is Relationship {
  return (RELATIONSHIP_VALUES as readonly string[]).includes(v);
}

// Human label for a stored relationship; for "other" the caller passes the
// free-text override (relationshipOther) which wins when present.
export function relationshipLabel(rel: string, other?: string | null): string {
  if (rel === "other" && other?.trim()) return other.trim();
  return RELATIONSHIP_OPTIONS.find((o) => o.value === rel)?.label ?? rel;
}

export type Visibility = "all_claimed" | "specific";

// "all_claimed" = every claimed user; "specific" = only the chosen viewers
// (empty = private to the owner).
export function isVisibility(v: string): v is Visibility {
  return v === "all_claimed" || v === "specific";
}

// Current age from an ISO/`YYYY-MM-DD` birthdate string. Null when no birthdate.
export function computeAge(birthdate: string | null | undefined): number | null {
  if (!birthdate) return null;
  const d = new Date(birthdate);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 150 ? age : null;
}

// How (if at all) a family member is disclosed on the owner's PUBLIC profile.
// Separate from `Visibility` (which gates the full record among claimed users).
//   none             → not shown publicly (default)
//   age_relationship → "12 year old daughter" (needs a birthdate)
//   relationship     → "Daughter"
//   generic          → "Child" (offered only for child relationships)
export type PublicShare = "none" | "age_relationship" | "relationship" | "generic";

export const PUBLIC_SHARE_VALUES: PublicShare[] = ["none", "age_relationship", "relationship", "generic"];

export function isPublicShare(v: string): v is PublicShare {
  return (PUBLIC_SHARE_VALUES as readonly string[]).includes(v);
}

const CHILD_RELATIONSHIPS = new Set(["daughter", "son", "child"]);

// The badge label for a member's chosen publicShare, or null when not shared (or
// the choice no longer applies — e.g. age picked but birthdate later removed, or
// "generic" on a non-child relationship).
export function publicShareBadgeLabel(
  relationship: string,
  relationshipOther: string | null | undefined,
  birthdate: string | null | undefined,
  share: string,
): string | null {
  if (!isPublicShare(share) || share === "none") return null;
  const relLabel = relationshipLabel(relationship, relationshipOther);
  if (share === "age_relationship") {
    const age = computeAge(birthdate);
    return age != null ? `${age} year old ${relLabel.toLowerCase()}` : null;
  }
  if (share === "relationship") return relLabel;
  if (share === "generic") return CHILD_RELATIONSHIPS.has(relationship) ? "Child" : null;
  return null;
}

// Options for the "Share publicly on my profile" picker, given the member's
// relationship + birthdate. Always offers "none"; the age option only when a
// birthdate yields an age; "generic" (Child) only for child relationships.
export function publicShareOptions(
  relationship: string,
  relationshipOther: string | null | undefined,
  birthdate: string | null | undefined,
): Array<{ value: PublicShare; label: string }> {
  const relLabel = relationshipLabel(relationship, relationshipOther);
  const age = computeAge(birthdate);
  const out: Array<{ value: PublicShare; label: string }> = [
    { value: "none", label: "Do not display publicly" },
  ];
  if (age != null) out.push({ value: "age_relationship", label: `${age} year old ${relLabel.toLowerCase()}` });
  out.push({ value: "relationship", label: relLabel });
  if (CHILD_RELATIONSHIPS.has(relationship)) out.push({ value: "generic", label: "Child" });
  return out;
}

// One family member as returned to the owner's account UI. `photoHref` is the
// auth-gated serve route (never the raw blob URL); `viewerEvalIds` lists the
// allow-listed claimed profiles when visibility = "specific".
export type FamilyMemberDTO = {
  id: string;
  relationship: Relationship | string;
  relationshipOther: string | null;
  firstName: string;
  lastName: string | null;
  birthdate: string | null; // YYYY-MM-DD
  interests: string[];
  photoHref: string | null;
  visibility: Visibility;
  publicShare: PublicShare;
  viewers: Array<{ evaluationId: string; name: string }>;
};
