import { NextResponse } from "next/server";
import { clerkClient, currentUser } from "@clerk/nextjs/server";
import { requireGrant } from "@/lib/grants";
import { grantAdminAccess } from "@/lib/admin-access";
import { isUuid } from "@/lib/canonicalize";

export const runtime = "nodejs";

type Body = { clerkUserId?: string; roleId?: string };

// Proactively grant admin to an existing Clerk user (no prior request). SECURITY:
// gated by approve_admin_requests (super-admins always hold it). The Clerk user's
// email/name/avatar are snapshotted server-side (not trusted from the client).
export async function POST(req: Request) {
  try {
    await requireGrant("approve_admin_requests");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const clerkUserId = typeof body.clerkUserId === "string" ? body.clerkUserId.trim() : "";
  if (!clerkUserId) {
    return NextResponse.json({ error: "clerkUserId required" }, { status: 400 });
  }
  const roleId = typeof body.roleId === "string" && isUuid(body.roleId) ? body.roleId : null;

  // Snapshot the target user's identity from Clerk (don't trust client values).
  let email: string | null = null;
  let name: string | null = null;
  let imageUrl: string | null = null;
  try {
    const clerk = await clerkClient();
    const u = await clerk.users.getUser(clerkUserId);
    email =
      u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress ??
      u.emailAddresses[0]?.emailAddress ??
      null;
    name = u.fullName ?? null;
    imageUrl = u.imageUrl ?? null;
  } catch {
    return NextResponse.json({ error: "no such Clerk user" }, { status: 404 });
  }

  const decider = await currentUser().catch(() => null);
  const decidedByEmail =
    decider?.primaryEmailAddress?.emailAddress?.toLowerCase() ??
    decider?.emailAddresses?.[0]?.emailAddress?.toLowerCase() ??
    null;

  const row = await grantAdminAccess({ clerkUserId, email, name, imageUrl, roleId, decidedByEmail });
  return NextResponse.json({ ok: true, status: row.status });
}
