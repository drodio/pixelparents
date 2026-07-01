"use server";

import { currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createRequest, revealOrRotateKey } from "@/lib/db/api-keys";
import { getSignupByEmail, updateSignupLinkedin } from "@/lib/db/signups";
import { primaryEmail } from "@/lib/clerk";
import { notifyAdminNewApiRequest, notifyApiRequestReceived } from "@/lib/email";
import { apiRequestSchema } from "@/lib/validation";
import { validateLinkedinUrl } from "./linkedin";

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
  const { created } = await createRequest({
    clerkUserId: user.id,
    name,
    email,
    intendedUse: parsed.data.intended_use,
  });
  // Only notify on a genuinely new request — don't re-email on a duplicate submit.
  if (created) {
    await notifyAdminNewApiRequest({ name, email, intendedUse: parsed.data.intended_use });
    if (email) await notifyApiRequestReceived({ to: email, name });
  }
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

export type LinkedinState = { error?: string; url?: string | null; ok?: boolean };

// Add/edit the signed-in parent's LinkedIn URL from the account page. Lets
// accounts that predate the signup-form LinkedIn field fill it in themselves,
// no admin needed. Authorization is fully server-derived (verifiedCaller-style):
// the caller is resolved from the Clerk session → primary email → their own
// signup row, so a user can only ever edit their OWN linkedin_url — no client
// id is trusted. The URL is validated (http(s)-only) before it's persisted; an
// empty submission clears the field.
export async function updateLinkedin(
  _prev: LinkedinState,
  formData: FormData,
): Promise<LinkedinState> {
  const user = await currentUser();
  if (!user) return { error: "You need to be signed in." };

  const email = primaryEmail(user);
  if (!email) return { error: "We couldn't find your account email." };

  const signup = await getSignupByEmail(email);
  if (!signup) {
    return {
      error:
        "We couldn't find your family signup. Complete the signup form first, then add your LinkedIn here.",
    };
  }

  const parsed = validateLinkedinUrl(formData.get("linkedin_url"));
  if (!parsed.ok) return { error: parsed.error };

  const saved = await updateSignupLinkedin(signup.id, parsed.value);
  if (!saved) return { error: "Something went wrong saving your LinkedIn. Please try again." };

  revalidatePath("/account");
  return { ok: true, url: parsed.value };
}
