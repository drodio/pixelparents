import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { requireGrant } from "@/lib/grants";
import { approvedClerkUserIds } from "@/lib/admin-access";

export const runtime = "nodejs";

const PAGE = 50;

// List Clerk users for the "Add admin" picker. No `q` → a page of all users
// (newest first, paginated via `offset`). With `q` → Clerk search by name/email.
// Each result is flagged `alreadyAdmin` if they hold an approved admin_access row.
// SECURITY: gated by approve_admin_requests (super-admins always hold it).
export async function GET(req: Request) {
  try {
    await requireGrant("approve_admin_requests");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? "0") || 0);

  const clerk = await clerkClient();
  const res = q
    ? await clerk.users.getUserList({ query: q, limit: PAGE })
    : await clerk.users.getUserList({ limit: PAGE, offset, orderBy: "-created_at" });

  const users = res.data.map((u) => ({
    id: u.id,
    name: u.fullName ?? null,
    email:
      u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress ??
      u.emailAddresses[0]?.emailAddress ??
      null,
    imageUrl: u.imageUrl ?? null,
  }));

  const approved = await approvedClerkUserIds(users.map((u) => u.id));

  return NextResponse.json({
    users: users.map((u) => ({ ...u, alreadyAdmin: approved.has(u.id) })),
    totalCount: res.totalCount,
    // For "load more" in list mode (search mode returns a single page).
    nextOffset: q ? null : offset + users.length,
    hasMore: q ? false : offset + users.length < res.totalCount,
  });
}
