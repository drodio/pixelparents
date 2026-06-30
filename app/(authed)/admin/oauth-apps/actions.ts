"use server";

import { currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { isAdminEmail } from "@/lib/admin";
import { decideClient } from "@/lib/oauth/store";

// Admin decisions on "Sign in with Pixel Parents" apps. Most apps go live
// automatically when the owning developer's API access is approved; this queue is
// for explicitly approving (or rejecting) a registered app — the lever for extra
// scrutiny on apps requesting minor-data scopes (role / grade_band / ohs_verified).

async function requireAdmin(): Promise<string> {
  const u = await currentUser();
  const email = u?.primaryEmailAddress?.emailAddress ?? undefined;
  if (!(await isAdminEmail(email))) throw new Error("Not authorized");
  return email!;
}

export async function approveApp(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await decideClient(id, "approved", admin, null);
  revalidatePath("/admin/oauth-apps");
}

export async function rejectApp(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const reason = String(formData.get("reason") ?? "").trim() || null;
  await decideClient(id, "rejected", admin, reason);
  revalidatePath("/admin/oauth-apps");
}
