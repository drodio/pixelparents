"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { checkBotId } from "botid/server";
import { currentUser } from "@clerk/nextjs/server";
import { getDb } from "@/lib/db";
import { signups, children, type Photo } from "@/lib/db/schema/signups";
import { familySchema, childSchema } from "@/lib/validation";
import { isAdminEmail } from "@/lib/admin";

// A signed-in admin editing a family profile must never be bot-blocked.
async function isAdminRequest(): Promise<boolean> {
  try {
    const user = await currentUser();
    const email =
      user?.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ??
      user?.emailAddresses[0]?.emailAddress ??
      null;
    return await isAdminEmail(email);
  } catch {
    return false;
  }
}

export type FamilyState = {
  ok: boolean;
  errors?: Record<string, string>;
  message?: string;
  savedChildName?: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseStringArray(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 50);
  } catch {
    return [];
  }
}

function parsePhotos(value: FormDataEntryValue | null): Photo[] {
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (p): p is Photo =>
          p && typeof p.url === "string" && typeof p.pathname === "string",
      )
      .slice(0, 200);
  } catch {
    return [];
  }
}

export async function saveFamily(
  _prev: FamilyState,
  formData: FormData,
): Promise<FamilyState> {
  const verification = await checkBotId();
  if (verification.isBot && !(await isAdminRequest())) {
    const reason = (verification as { classificationReason?: string }).classificationReason;
    console.warn("saveFamily bot-blocked:", reason ?? "(no reason)");
    return { ok: false, message: "Submission blocked — please try again." };
  }

  const id = String(formData.get("signupId") ?? "");
  const intent = String(formData.get("intent") ?? "done");

  if (!UUID_RE.test(id)) {
    return { ok: false, message: "We couldn't find your signup. Please start again." };
  }
  if (intent === "skip") {
    redirect("/signup/welcome");
  }

  const family = familySchema.safeParse({
    city: formData.get("city") ?? "",
    state: formData.get("state") ?? "",
    parentInterests: parseStringArray(formData.get("parentInterests")),
  });
  if (!family.success) {
    return { ok: false, message: "Please check the family fields and try again." };
  }

  const childFirst = String(formData.get("childFirstName") ?? "").trim();
  const isChildUpdate = intent === "update-child";
  const wantsChild = isChildUpdate || intent === "add-another" || childFirst.length > 0;

  let child: ReturnType<typeof childSchema.safeParse> | null = null;
  if (wantsChild) {
    child = childSchema.safeParse({
      firstName: childFirst,
      grade: formData.get("childGrade") ?? "",
      birthYear: formData.get("childBirthYear") || undefined,
      interests: parseStringArray(formData.get("childInterests")),
      notes: formData.get("childNotes") ?? "",
    });
    if (!child.success) {
      const errors: Record<string, string> = {};
      for (const issue of child.error.issues) {
        const key = "child_" + String(issue.path[0] ?? "form");
        if (!errors[key]) errors[key] = issue.message;
      }
      return { ok: false, errors };
    }
  }

  const photos = parsePhotos(formData.get("photos"));
  const childPhotos = parsePhotos(formData.get("childPhotos"));

  const db = getDb();
  try {
    await db
      .update(signups)
      .set({
        city: family.data.city || null,
        state: family.data.state || null,
        parentInterests: family.data.parentInterests?.length
          ? family.data.parentInterests
          : null,
        photos,
      })
      .where(eq(signups.id, id));

    if (child?.success) {
      const values = {
        firstName: child.data.firstName,
        grade: child.data.grade || null,
        birthYear: child.data.birthYear ?? null,
        interests: child.data.interests?.length ? child.data.interests : null,
        notes: child.data.notes || null,
        photos: childPhotos,
      };
      if (isChildUpdate) {
        const childId = String(formData.get("childId") ?? "");
        if (!UUID_RE.test(childId)) {
          return { ok: false, message: "Couldn't find that child to update." };
        }
        const updated = await db
          .update(children)
          .set(values)
          .where(and(eq(children.id, childId), eq(children.signupId, id)))
          .returning({ id: children.id });
        if (updated.length === 0) {
          return { ok: false, message: "Couldn't find that child to update." };
        }
      } else {
        await db.insert(children).values({ signupId: id, ...values });
      }
    }

    // Refresh the server-rendered "Children you've added" list + pre-filled
    // fields so an edit/add shows immediately (no manual reload).
    revalidatePath("/signup/thanks");
  } catch (err) {
    console.error("saveFamily failed:", err);
    return { ok: false, message: "Something went wrong saving your info. Please try again." };
  }

  if (intent === "add-another" || intent === "update-child") {
    return { ok: true, savedChildName: child?.success ? child.data.firstName : undefined };
  }

  redirect("/signup/welcome");
}
