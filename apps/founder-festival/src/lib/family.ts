import { db } from "@/db";
import { evaluations, familyMembers, familyMemberViewers, users } from "@/db/schema";
import { and, desc, eq, ilike, inArray, ne, sql } from "drizzle-orm";
import {
  familyBadgeOrder,
  isRelationship,
  isVisibility,
  isPublicShare,
  publicShareBadgeLabel,
  relationshipToFamilyFilter,
  type FamilyFilter,
  type FamilyMemberDTO,
  type PublicShare,
  type Visibility,
} from "./family-constants";

// The claimed evaluation owned by this Clerk user (high/medium-confidence claim),
// or null if they haven't claimed a profile. Gates the whole Kids & Family
// surface — only owners see/manage their list.
export async function getOwnerEvaluationId(clerkUserId: string): Promise<string | null> {
  const [row] = await db
    .select({ evaluationId: users.evaluationId })
    .from(users)
    .where(
      and(
        eq(users.clerkUserId, clerkUserId),
        // Owner-grade only: managing a family belongs to the verified owner of
        // the profile, not a medium (name-only) claimer.
        eq(users.matchConfidence, "high"),
      ),
    )
    .limit(1);
  return row?.evaluationId ?? null;
}

// Normalize free-text interest tags: trim, drop empties, cap length, dedupe
// case-insensitively (first casing wins), cap count.
function normalizeInterests(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const t = v.trim().slice(0, 60);
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= 20) break;
  }
  return out;
}

export type FamilyInput = {
  relationship: string;
  relationshipOther?: string | null;
  firstName: string;
  lastName?: string | null;
  birthdate?: string | null;
  interests?: string[];
  visibility?: string;
  publicShare?: string;
  viewerEvalIds?: string[];
};

// Validate + coerce raw input into the columns we store. Throws on a bad
// relationship / empty first name so the API returns a 400.
function coerce(input: FamilyInput) {
  const relationship = isRelationship(input.relationship) ? input.relationship : null;
  if (!relationship) throw new Error("invalid relationship");
  const firstName = (input.firstName ?? "").trim();
  if (!firstName) throw new Error("first name required");
  const visibility: Visibility =
    input.visibility && isVisibility(input.visibility) ? input.visibility : "specific";
  const publicShare: PublicShare =
    input.publicShare && isPublicShare(input.publicShare) ? input.publicShare : "none";
  return {
    relationship,
    relationshipOther:
      relationship === "other" ? (input.relationshipOther ?? "").trim().slice(0, 80) || null : null,
    firstName: firstName.slice(0, 80),
    lastName: (input.lastName ?? "").trim().slice(0, 80) || null,
    birthdate: input.birthdate && /^\d{4}-\d{2}-\d{2}$/.test(input.birthdate) ? input.birthdate : null,
    interests: normalizeInterests(input.interests),
    visibility,
    publicShare,
  };
}

// Replace a member's viewer allow-list (only meaningful when visibility =
// "specific"). Excludes the owner's own eval + dupes; FK enforces existence.
async function setViewers(
  familyMemberId: string,
  ownerEvaluationId: string,
  viewerEvalIds: string[],
): Promise<void> {
  await db.delete(familyMemberViewers).where(eq(familyMemberViewers.familyMemberId, familyMemberId));
  const ids = [...new Set((viewerEvalIds ?? []).filter((id) => id && id !== ownerEvaluationId))].slice(0, 200);
  if (ids.length === 0) return;
  await db
    .insert(familyMemberViewers)
    .values(ids.map((viewerEvaluationId) => ({ familyMemberId, viewerEvaluationId })))
    .onConflictDoNothing();
}

export async function createFamilyMember(evaluationId: string, input: FamilyInput): Promise<string> {
  const c = coerce(input);
  const [row] = await db
    .insert(familyMembers)
    .values({ evaluationId, ...c })
    .returning({ id: familyMembers.id });
  const id = row!.id;
  if (c.visibility === "specific") await setViewers(id, evaluationId, input.viewerEvalIds ?? []);
  return id;
}

// Update a member the caller owns. Returns false if the member isn't theirs.
export async function updateFamilyMember(
  memberId: string,
  evaluationId: string,
  input: FamilyInput,
): Promise<boolean> {
  const c = coerce(input);
  const res = await db
    .update(familyMembers)
    .set({ ...c, updatedAt: new Date() })
    .where(and(eq(familyMembers.id, memberId), eq(familyMembers.evaluationId, evaluationId)))
    .returning({ id: familyMembers.id });
  if (res.length === 0) return false;
  await setViewers(memberId, evaluationId, c.visibility === "specific" ? input.viewerEvalIds ?? [] : []);
  return true;
}

export async function deleteFamilyMember(memberId: string, evaluationId: string): Promise<boolean> {
  const res = await db
    .delete(familyMembers)
    .where(and(eq(familyMembers.id, memberId), eq(familyMembers.evaluationId, evaluationId)))
    .returning({ id: familyMembers.id });
  return res.length > 0;
}

// The stored blob URL for a member the caller owns (null if not theirs / no
// photo). Used by the auth-gated serve route — the URL never reaches the client.
export async function getOwnedPhotoUrl(memberId: string, evaluationId: string): Promise<string | null> {
  const [row] = await db
    .select({ photoUrl: familyMembers.photoUrl })
    .from(familyMembers)
    .where(and(eq(familyMembers.id, memberId), eq(familyMembers.evaluationId, evaluationId)))
    .limit(1);
  return row?.photoUrl ?? null;
}

export async function setPhotoUrl(
  memberId: string,
  evaluationId: string,
  url: string | null,
): Promise<boolean> {
  const res = await db
    .update(familyMembers)
    .set({ photoUrl: url, updatedAt: new Date() })
    .where(and(eq(familyMembers.id, memberId), eq(familyMembers.evaluationId, evaluationId)))
    .returning({ id: familyMembers.id });
  return res.length > 0;
}

function toDTO(
  m: typeof familyMembers.$inferSelect,
  viewers: Array<{ evaluationId: string; name: string }>,
): FamilyMemberDTO {
  return {
    id: m.id,
    relationship: m.relationship,
    relationshipOther: m.relationshipOther,
    firstName: m.firstName,
    lastName: m.lastName,
    birthdate: m.birthdate ? String(m.birthdate).slice(0, 10) : null, // normalize to YYYY-MM-DD
    interests: m.interests ?? [],
    // Cache-buster keyed to updatedAt (bumped on every photo change) so a newly
    // uploaded photo shows immediately — the URL changes, so the browser fetches
    // the new bytes instead of serving the cached old image at the same URL.
    photoHref: m.photoUrl
      ? `/api/account/family/${m.id}/photo?v=${new Date(m.updatedAt).getTime()}`
      : null,
    visibility: (m.visibility as Visibility) ?? "specific",
    publicShare: isPublicShare(m.publicShare ?? "") ? (m.publicShare as PublicShare) : "none",
    viewers,
  };
}

// Public family badges for an owner's profile — just the chosen disclosure
// labels (e.g. "Daughter", "12 year old son"), never names/photos/birthdates.
// Deploy-safe: returns [] if the column/table isn't present yet. Order: newest
// first (matches the account list).
export type PublicFamilyBadge = { label: string; filterKey: FamilyFilter | null };

export async function getPublicFamilyBadges(evaluationId: string): Promise<PublicFamilyBadge[]> {
  try {
    const rows = await db
      .select({
        relationship: familyMembers.relationship,
        relationshipOther: familyMembers.relationshipOther,
        birthdate: familyMembers.birthdate,
        publicShare: familyMembers.publicShare,
      })
      .from(familyMembers)
      .where(and(eq(familyMembers.evaluationId, evaluationId), ne(familyMembers.publicShare, "none")))
      .orderBy(desc(familyMembers.createdAt));
    // Group for display: partner/spouse, then kids, then pets, then other.
    // JS sort is stable, so newest-first (the SQL order) holds within each group.
    return [...rows]
      .sort((a, b) => familyBadgeOrder(a.relationship) - familyBadgeOrder(b.relationship))
      .map((r) => {
        const label = publicShareBadgeLabel(
          r.relationship,
          r.relationshipOther,
          r.birthdate ? String(r.birthdate).slice(0, 10) : null,
          r.publicShare,
        );
        return label ? { label, filterKey: relationshipToFamilyFilter(r.relationship) } : null;
      })
      .filter((b): b is PublicFamilyBadge => b !== null);
  } catch (e) {
    console.error("getPublicFamilyBadges: family tables unavailable?", e);
    return [];
  }
}

// All of an owner's family members (+ each one's viewer allow-list), newest
// first. Two batched queries (members, then viewers joined to names).
export async function listFamilyMembersForOwner(evaluationId: string): Promise<FamilyMemberDTO[]> {
  const members = await db
    .select()
    .from(familyMembers)
    .where(eq(familyMembers.evaluationId, evaluationId))
    .orderBy(desc(familyMembers.createdAt));
  if (members.length === 0) return [];
  const ids = members.map((m) => m.id);
  const viewerRows = await db
    .select({
      familyMemberId: familyMemberViewers.familyMemberId,
      evaluationId: evaluations.id,
      name: evaluations.fullName,
    })
    .from(familyMemberViewers)
    .innerJoin(evaluations, eq(evaluations.id, familyMemberViewers.viewerEvaluationId))
    .where(inArray(familyMemberViewers.familyMemberId, ids));
  const byMember = new Map<string, Array<{ evaluationId: string; name: string }>>();
  for (const v of viewerRows) {
    const arr = byMember.get(v.familyMemberId) ?? [];
    arr.push({ evaluationId: v.evaluationId, name: v.name ?? "Unknown" });
    byMember.set(v.familyMemberId, arr);
  }
  return members.map((m) => toDTO(m, byMember.get(m.id) ?? []));
}

// Deploy-safe account loader. Returns available=false when the user isn't a
// claimed owner OR the family tables don't exist yet (prod, before the manual
// migration) — so the account page can simply hide the section instead of 500ing.
export async function loadFamilyForAccount(
  clerkUserId: string,
): Promise<{ available: boolean; ownerEvaluationId: string | null; members: FamilyMemberDTO[] }> {
  const ownerEvaluationId = await getOwnerEvaluationId(clerkUserId);
  if (!ownerEvaluationId) return { available: false, ownerEvaluationId: null, members: [] };
  try {
    const members = await listFamilyMembersForOwner(ownerEvaluationId);
    return { available: true, ownerEvaluationId, members };
  } catch (e) {
    // Most likely the tables don't exist yet on this environment.
    console.error("loadFamilyForAccount: family tables unavailable?", e);
    return { available: false, ownerEvaluationId, members: [] };
  }
}

// Global interest suggestion pool — distinct tags across everyone's members,
// most common first. Powers the pill picker ("from what other people inputted").
export async function getInterestSuggestions(limit = 100): Promise<string[]> {
  const result = await db.execute(sql`
    SELECT s AS interest, COUNT(*)::int AS count
    FROM ${familyMembers}, unnest(${familyMembers.interests}) AS s
    GROUP BY s
    ORDER BY count DESC, s ASC
    LIMIT ${limit}
  `);
  const rows =
    (result as unknown as { rows?: Array<{ interest: string }> }).rows ??
    (result as unknown as Array<{ interest: string }>);
  return (Array.isArray(rows) ? rows : []).map((r) => r.interest).filter(Boolean);
}

// Claimed users matching `q` by name, for the "specific users" viewer picker.
// Excludes the owner themselves. Returns at most 10.
export async function searchClaimableViewers(
  q: string,
  excludeEvaluationId: string,
): Promise<Array<{ evaluationId: string; name: string }>> {
  const needle = `%${q.trim().replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  const rows = await db
    .selectDistinct({ evaluationId: evaluations.id, name: evaluations.fullName })
    .from(users)
    .innerJoin(evaluations, eq(evaluations.id, users.evaluationId))
    .where(
      and(
        // Only verified (high) owners can be picked as family viewers.
        eq(users.matchConfidence, "high"),
        ilike(evaluations.fullName, needle),
        ne(evaluations.id, excludeEvaluationId),
      ),
    )
    .limit(10);
  return rows.map((r) => ({ evaluationId: r.evaluationId, name: r.name ?? "Unknown" }));
}
