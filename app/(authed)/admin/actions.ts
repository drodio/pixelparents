"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { currentUser } from "@clerk/nextjs/server";
import { getDb } from "@/lib/db";
import { signups, children } from "@/lib/db/schema/signups";
import { addAdmin, removeAdmin, isAdminEmail, isEnvAdmin } from "@/lib/admin";

async function callerEmail(): Promise<string | null> {
  const u = await currentUser();
  return u?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? null;
}

// Promote or revoke an admin by email. proxy.ts guarantees the caller is signed
// in; this additionally re-checks they're an admin (never trust the client) and
// refuses to touch env-defined superadmins.
export async function setAdmin(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const make = String(formData.get("make") ?? "") === "true";

  const caller = await callerEmail();
  if (!(await isAdminEmail(caller))) {
    throw new Error("Forbidden: not an admin");
  }
  if (!email) return;
  // Env superadmins are managed via ADMIN_EMAILS, not the DB — leave them alone.
  if (isEnvAdmin(email)) return;

  if (make) {
    await addAdmin(email, caller);
  } else {
    await removeAdmin(email);
  }
  revalidatePath("/admin");
}

// Delete a signup (children cascade via the FK). Admin-only.
export async function deleteSignup(formData: FormData): Promise<void> {
  const caller = await callerEmail();
  if (!(await isAdminEmail(caller))) {
    throw new Error("Forbidden: not an admin");
  }
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  await getDb().delete(signups).where(eq(signups.id, id));
  revalidatePath("/admin");
  revalidatePath("/admin/children");
}

// Set (or clear) the caption + @-mention tags on one of a family's photos.
// Admin-only; tags a family's photo on their behalf. Caption is stored with
// @[Name](childId) markers (see lib/mentions.ts).
export async function setPhotoCaption(
  signupId: string,
  pathname: string,
  caption: string,
): Promise<void> {
  const caller = await callerEmail();
  if (!(await isAdminEmail(caller))) {
    throw new Error("Forbidden: not an admin");
  }
  const db = getDb();
  const clean = caption.trim() ? caption.slice(0, 2000) : undefined;

  // The photo may be a family photo (signups.photos) or one of the family's
  // children's photos (children.photos) — find and update whichever holds it.
  const [row] = await db
    .select({ photos: signups.photos })
    .from(signups)
    .where(eq(signups.id, signupId))
    .limit(1);
  if (row && (row.photos ?? []).some((p) => p.pathname === pathname)) {
    const photos = (row.photos ?? []).map((p) =>
      p.pathname === pathname ? { ...p, caption: clean } : p,
    );
    await db.update(signups).set({ photos }).where(eq(signups.id, signupId));
    revalidatePath("/admin");
    return;
  }

  const kids = await db
    .select({ id: children.id, photos: children.photos })
    .from(children)
    .where(eq(children.signupId, signupId));
  for (const k of kids) {
    if ((k.photos ?? []).some((p) => p.pathname === pathname)) {
      const photos = (k.photos ?? []).map((p) =>
        p.pathname === pathname ? { ...p, caption: clean } : p,
      );
      await db.update(children).set({ photos }).where(eq(children.id, k.id));
      break;
    }
  }
  revalidatePath("/admin");
}

// Delete a single child. Admin-only.
export async function deleteChild(formData: FormData): Promise<void> {
  const caller = await callerEmail();
  if (!(await isAdminEmail(caller))) {
    throw new Error("Forbidden: not an admin");
  }
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  await getDb().delete(children).where(eq(children.id, id));
  revalidatePath("/admin/children");
  revalidatePath("/admin");
}
