"use server";

import { currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { isAdminEmail } from "@/lib/admin";
import { isReportStatus, setReportStatus } from "@/lib/db/reports";

async function requireAdmin(): Promise<string> {
  const u = await currentUser();
  const email = u?.primaryEmailAddress?.emailAddress ?? undefined;
  if (!(await isAdminEmail(email))) throw new Error("Not authorized");
  return email!;
}

// Mark a report resolved or reopen it. Driven by the status hidden field on the
// admin page's per-row form.
export async function updateStatus(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  if (!id || !isReportStatus(status)) return;
  await setReportStatus(id, status, admin);
  revalidatePath("/admin/reports");
}
