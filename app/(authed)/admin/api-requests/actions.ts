"use server";

import { currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { isAdminEmail } from "@/lib/admin";
import { approveRequest, getRequestById, rejectRequest } from "@/lib/db/api-keys";
import { notifyApiDecision } from "@/lib/email";

async function requireAdmin(): Promise<string> {
  const u = await currentUser();
  const email = u?.primaryEmailAddress?.emailAddress ?? undefined;
  if (!(await isAdminEmail(email))) throw new Error("Not authorized");
  return email!;
}

export async function approve(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const row = await getRequestById(id);
  await approveRequest(id, admin);
  if (row) await notifyApiDecision({ to: row.email, name: row.name, approved: true });
  revalidatePath("/admin/api-requests");
}

export async function reject(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const row = await getRequestById(id);
  await rejectRequest(id, admin, reason);
  if (row) await notifyApiDecision({ to: row.email, name: row.name, approved: false, reason });
  revalidatePath("/admin/api-requests");
}
