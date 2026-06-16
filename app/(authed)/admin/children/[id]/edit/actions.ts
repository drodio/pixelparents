"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { currentUser } from "@clerk/nextjs/server";
import { getDb } from "@/lib/db";
import { children } from "@/lib/db/schema/signups";
import { isAdminEmail } from "@/lib/admin";
import { childSchema } from "@/lib/validation";

export type ChildEditState = { ok: boolean; errors?: Record<string, string>; message?: string };

function parseInterests(v: FormDataEntryValue | null): string[] {
  return String(v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50);
}

export async function updateChild(
  _prev: ChildEditState,
  formData: FormData,
): Promise<ChildEditState> {
  const u = await currentUser();
  if (!(await isAdminEmail(u?.primaryEmailAddress?.emailAddress))) {
    return { ok: false, message: "Forbidden — not an admin." };
  }
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, message: "Missing record id." };

  const parsed = childSchema.safeParse({
    firstName: formData.get("firstName") ?? "",
    grade: formData.get("grade") ?? "",
    interests: parseInterests(formData.get("interests")),
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!errors[key]) errors[key] = issue.message;
    }
    return { ok: false, errors };
  }
  const d = parsed.data;

  try {
    await getDb()
      .update(children)
      .set({
        firstName: d.firstName,
        grade: d.grade || null,
        interests: d.interests?.length ? d.interests : null,
        notes: d.notes || null,
      })
      .where(eq(children.id, id));
  } catch (err) {
    console.error("updateChild failed:", err);
    return { ok: false, message: "Save failed. Please try again." };
  }

  redirect("/admin/children");
}
