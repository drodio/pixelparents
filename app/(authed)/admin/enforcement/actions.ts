"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@clerk/nextjs/server";
import { primaryEmail } from "@/lib/clerk";
import { isAdminEmail } from "@/lib/admin";
import { recordEnforcement, revokeEnforcement } from "@/lib/db/enforcement";

// Admin-only moderation actions.
//
// Each re-derives the admin from the SESSION and re-checks isAdminEmail. The
// `(authed)/admin` layout also gates, but a server action is independently
// addressable — the layout does not protect it — so the check has to live here
// too. Every call is attributed to the acting admin's email and mirrored into
// the audit log by recordEnforcement/revokeEnforcement.
async function requireAdmin(): Promise<string | null> {
  const user = await currentUser();
  const email = primaryEmail(user);
  if (!email || !(await isAdminEmail(email))) return null;
  return email;
}

export async function applyEnforcementAction(input: {
  signupId: string;
  kind: string;
  reason: string;
  // null = permanent. Ignored for delete/note.
  durationHours: number | null;
  targetType?: string | null;
  targetId?: string | null;
}): Promise<{ ok: boolean; message: string }> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: "Admins only." };

  const res = await recordEnforcement({
    signupId: input.signupId,
    kind: input.kind,
    reason: input.reason,
    adminEmail: admin,
    durationHours: input.durationHours,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
  });
  revalidatePath("/admin");
  revalidatePath("/admin/enforcement");
  return res;
}

export async function revokeEnforcementAction(
  actionId: string,
): Promise<{ ok: boolean; message: string }> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: "Admins only." };
  const res = await revokeEnforcement(actionId, admin);
  revalidatePath("/admin");
  revalidatePath("/admin/enforcement");
  return res;
}
