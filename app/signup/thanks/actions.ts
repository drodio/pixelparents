"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { signups, children, type Photo } from "@/lib/db/schema/signups";
import { canonicalizeAgainstPool } from "@/lib/interests";
import { isStudentAccount } from "@/lib/family-display";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// --- Student → parent link status --------------------------------------------

// Whether a STUDENT account has satisfied the "kid accounts require a linked
// parent" rule, and enough context for the thanks page to show family status and
// gate the student's "Finish". A parent is considered LINKED once another
// (non-student) member shares the family; PENDING once the student has sent at
// least one parent invite (counted via the shared coParentInvitesSent counter).
export type StudentParentLinkStatus = {
  // True only for a student account — callers (the parent path) get isStudent:false.
  isStudent: boolean;
  // A non-student member already joined this family (the parent linked up).
  hasLinkedParent: boolean;
  // The student has sent at least one parent invite (awaiting them to join).
  hasPendingInvite: boolean;
  // First name(s) of any non-student family members, for a friendly status line.
  linkedParentNames: string[];
};

export async function getStudentParentLinkStatus(
  signupId: string,
): Promise<StudentParentLinkStatus> {
  const empty: StudentParentLinkStatus = {
    isStudent: false,
    hasLinkedParent: false,
    hasPendingInvite: false,
    linkedParentNames: [],
  };
  if (!UUID_RE.test(signupId)) return empty;
  try {
    const [self] = await getDb()
      .select({ familyId: signups.familyId, extra: signups.extra })
      .from(signups)
      .where(eq(signups.id, signupId))
      .limit(1);
    if (!self) return empty;
    if (!isStudentAccount({ extra: self.extra as Record<string, unknown> | null })) {
      return empty;
    }

    // Other members of the same family (excludes the student themselves).
    const others = await getDb()
      .select({ firstName: signups.firstName, extra: signups.extra })
      .from(signups)
      .where(and(eq(signups.familyId, self.familyId), ne(signups.id, signupId)));

    const parents = others.filter(
      (m) => !isStudentAccount({ extra: m.extra as Record<string, unknown> | null }),
    );
    const extra = (self.extra ?? {}) as Record<string, unknown>;
    const invitesSent = Number(extra.coParentInvitesSent ?? 0) || 0;

    return {
      isStudent: true,
      hasLinkedParent: parents.length > 0,
      hasPendingInvite: invitesSent > 0,
      linkedParentNames: parents
        .map((p) => (p.firstName ?? "").trim())
        .filter((n) => n.length > 0),
    };
  } catch (err) {
    console.error("getStudentParentLinkStatus failed:", err);
    return empty;
  }
}

// --- Auto-save: live child list (add / patch / remove) -----------------------

function sanitizePhotos(input: unknown): Photo[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((p): p is Photo => p && typeof p.url === "string" && typeof p.pathname === "string")
    .map((p): Photo => ({
      url: p.url,
      pathname: p.pathname,
      contentType: typeof p.contentType === "string" ? p.contentType : undefined,
      width: typeof p.width === "number" ? p.width : undefined,
      height: typeof p.height === "number" ? p.height : undefined,
      caption:
        typeof p.caption === "string" && p.caption.trim() ? p.caption.slice(0, 2000) : undefined,
    }))
    .slice(0, 200);
}

// Add an empty child row to a signup; the form then auto-saves its fields.
// The child is tagged with both the creating parent's signupId (provenance) and
// the family's familyId (the sharing key — co-parents see it too).
export async function addChild(signupId: string): Promise<{ id: string } | { error: string }> {
  if (!UUID_RE.test(signupId)) return { error: "bad id" };
  try {
    const [parent] = await getDb()
      .select({ familyId: signups.familyId })
      .from(signups)
      .where(eq(signups.id, signupId))
      .limit(1);
    if (!parent) return { error: "not found" };
    const [row] = await getDb()
      .insert(children)
      .values({ signupId, familyId: parent.familyId, firstName: "" })
      .returning({ id: children.id });
    revalidatePath("/signup/thanks");
    return { id: row.id };
  } catch (err) {
    console.error("addChild failed:", err);
    return { error: "failed" };
  }
}

export type ChildPatch = Partial<{
  firstName: string;
  grade: string;
  birthYear: number | null;
  interests: string[];
  notes: string;
  studentEmail: string;
  photos: Photo[];
  // Parent's 16+ certification for unmasking the student's own contact. Only
  // 'certified' | 'none' flow through here (a parent certifies or revokes); the
  // student's own 'pending' REQUEST goes through requestChildAge16 (session-auth).
  // Stamped with the acting parent's signupId + timestamp for attribution.
  age16Certified: boolean;
}>;

// Resolve the family a signup belongs to (null if the id is unknown). Children
// are shared per-family, so edits are authorized by family membership — any
// parent in the family can edit any of the family's children, even one another
// co-parent originally added.
async function familyIdForSignup(signupId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ familyId: signups.familyId })
    .from(signups)
    .where(eq(signups.id, signupId))
    .limit(1);
  return row?.familyId ?? null;
}

// Patch one child. Authorized by family membership: the child must belong to the
// same family as `signupId` (so co-parents can edit shared children). No bot
// re-check — the signup already exists (created behind BotID in step 1).
export async function patchChild(
  childId: string,
  signupId: string,
  patch: ChildPatch,
): Promise<{ ok: boolean }> {
  if (!UUID_RE.test(childId) || !UUID_RE.test(signupId)) return { ok: false };
  const familyId = await familyIdForSignup(signupId);
  if (!familyId) return { ok: false };
  const set: Record<string, unknown> = {};
  if ("firstName" in patch) set.firstName = String(patch.firstName ?? "").trim().slice(0, 100);
  if ("grade" in patch) set.grade = String(patch.grade ?? "").trim().slice(0, 40) || null;
  if ("birthYear" in patch) {
    const y = Number(patch.birthYear);
    set.birthYear = Number.isInteger(y) && y >= 1980 && y <= 2100 ? y : null;
  }
  if ("notes" in patch) set.notes = String(patch.notes ?? "").trim().slice(0, 2000) || null;
  if ("studentEmail" in patch) {
    set.studentEmail = String(patch.studentEmail ?? "").trim().toLowerCase().slice(0, 254) || null;
  }
  if ("interests" in patch) {
    const s = (patch.interests ?? [])
      .filter((x): x is string => typeof x === "string")
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 50);
    // Fold incoming interests onto whatever spelling is already in the pool so
    // we don't add a case-variant of an existing interest ("mountain biking" ->
    // "Mountain Biking"). Brand-new interests racing in two casings can still
    // both land; getInterestPool collapses them for display and the scrub script
    // reconciles the rows.
    set.interests = s.length ? await canonicalizeAgainstPool(s) : null;
  }
  if ("photos" in patch) set.photos = sanitizePhotos(patch.photos);
  if ("age16Certified" in patch) {
    // A parent certifies (true) or revokes (false). Attribution: stamp who (the
    // acting parent's signupId) + when on certify; clear both on revoke.
    if (patch.age16Certified) {
      set.age16Status = "certified";
      set.age16CertifiedBy = signupId;
      set.age16CertifiedAt = new Date();
    } else {
      set.age16Status = "none";
      set.age16CertifiedBy = null;
      set.age16CertifiedAt = null;
    }
  }
  if (Object.keys(set).length === 0) return { ok: true };
  try {
    await getDb()
      .update(children)
      .set(set)
      .where(and(eq(children.id, childId), eq(children.familyId, familyId)));
    return { ok: true };
  } catch (err) {
    console.error("patchChild failed:", err);
    return { ok: false };
  }
}

export async function removeChild(childId: string, signupId: string): Promise<{ ok: boolean }> {
  if (!UUID_RE.test(childId) || !UUID_RE.test(signupId)) return { ok: false };
  const familyId = await familyIdForSignup(signupId);
  if (!familyId) return { ok: false };
  try {
    await getDb()
      .delete(children)
      .where(and(eq(children.id, childId), eq(children.familyId, familyId)));
    revalidatePath("/signup/thanks");
    return { ok: true };
  } catch (err) {
    console.error("removeChild failed:", err);
    return { ok: false };
  }
}
