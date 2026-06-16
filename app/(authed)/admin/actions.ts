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
