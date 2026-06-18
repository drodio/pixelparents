"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { children, type Photo } from "@/lib/db/schema/signups";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
export async function addChild(signupId: string): Promise<{ id: string } | { error: string }> {
  if (!UUID_RE.test(signupId)) return { error: "bad id" };
  try {
    const [row] = await getDb()
      .insert(children)
      .values({ signupId, firstName: "" })
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
  photos: Photo[];
}>;

// Patch one child, scoped by (childId, signupId). No bot re-check — the signup
// already exists (created behind BotID in step 1).
export async function patchChild(
  childId: string,
  signupId: string,
  patch: ChildPatch,
): Promise<{ ok: boolean }> {
  if (!UUID_RE.test(childId) || !UUID_RE.test(signupId)) return { ok: false };
  const set: Record<string, unknown> = {};
  if ("firstName" in patch) set.firstName = String(patch.firstName ?? "").trim().slice(0, 100);
  if ("grade" in patch) set.grade = String(patch.grade ?? "").trim().slice(0, 40) || null;
  if ("birthYear" in patch) {
    const y = Number(patch.birthYear);
    set.birthYear = Number.isInteger(y) && y >= 1980 && y <= 2100 ? y : null;
  }
  if ("notes" in patch) set.notes = String(patch.notes ?? "").trim().slice(0, 2000) || null;
  if ("interests" in patch) {
    const s = (patch.interests ?? [])
      .filter((x): x is string => typeof x === "string")
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 50);
    set.interests = s.length ? s : null;
  }
  if ("photos" in patch) set.photos = sanitizePhotos(patch.photos);
  if (Object.keys(set).length === 0) return { ok: true };
  try {
    await getDb()
      .update(children)
      .set(set)
      .where(and(eq(children.id, childId), eq(children.signupId, signupId)));
    return { ok: true };
  } catch (err) {
    console.error("patchChild failed:", err);
    return { ok: false };
  }
}

export async function removeChild(childId: string, signupId: string): Promise<{ ok: boolean }> {
  if (!UUID_RE.test(childId) || !UUID_RE.test(signupId)) return { ok: false };
  try {
    await getDb()
      .delete(children)
      .where(and(eq(children.id, childId), eq(children.signupId, signupId)));
    revalidatePath("/signup/thanks");
    return { ok: true };
  } catch (err) {
    console.error("removeChild failed:", err);
    return { ok: false };
  }
}
