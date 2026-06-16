"use server";

import { currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createRequest, revealOrRotateKey } from "@/lib/db/api-keys";
import { notifyAdminNewApiRequest } from "@/lib/email";
import { apiRequestSchema } from "@/lib/validation";

function identity(user: NonNullable<Awaited<ReturnType<typeof currentUser>>>) {
  const email = user.primaryEmailAddress?.emailAddress ?? "";
  const name =
    user.fullName ||
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    email ||
    "Unknown";
  return { email, name };
}

export type RequestState = { error?: string; ok?: boolean };

export async function submitRequest(
  _prev: RequestState,
  formData: FormData,
): Promise<RequestState> {
  const user = await currentUser();
  if (!user) return { error: "You need to be signed in." };

  const parsed = apiRequestSchema.safeParse({
    intended_use: formData.get("intended_use"),
  });
  if (!parsed.success) {
    return { error: "Please tell us a bit about what you want to build." };
  }

  const { email, name } = identity(user);
  await createRequest({
    clerkUserId: user.id,
    name,
    email,
    intendedUse: parsed.data.intended_use,
  });
  await notifyAdminNewApiRequest({ name, email, intendedUse: parsed.data.intended_use });
  revalidatePath("/account");
  return { ok: true };
}

export type RevealState = { error?: string; raw?: string };

export async function revealKey(): Promise<RevealState> {
  const user = await currentUser();
  if (!user) return { error: "You need to be signed in." };
  const key = await revealOrRotateKey(user.id);
  if (!key) {
    return {
      error:
        "No key to reveal — your request isn't approved yet, or your key was already shown once. Use Regenerate to get a fresh one.",
    };
  }
  revalidatePath("/account");
  return { raw: key.raw };
}

export async function regenerateKey(): Promise<RevealState> {
  const user = await currentUser();
  if (!user) return { error: "You need to be signed in." };
  const key = await revealOrRotateKey(user.id, { rotate: true });
  if (!key) return { error: "Your request isn't approved." };
  revalidatePath("/account");
  return { raw: key.raw };
}
