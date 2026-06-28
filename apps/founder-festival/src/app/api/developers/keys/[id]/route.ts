import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { isUuid } from "@/lib/canonicalize";

export const dynamic = "force-dynamic";

// Soft-revoke (set revoked_at) one of the caller's OWN keys. Ownership is
// enforced in the WHERE clause (clerk_user_id = the signed-in user) so a caller
// can never revoke someone else's key. Idempotent: already-revoked or unknown
// ids return 404. We soft-revoke rather than hard-delete so the audit trail and
// any usage history tied to the key row survive.
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const revoked = await db
    .update(apiKeys)
    .set({ revokedAt: sql`NOW()` })
    .where(
      and(
        eq(apiKeys.id, id),
        eq(apiKeys.clerkUserId, userId),
        isNull(apiKeys.revokedAt),
      ),
    )
    .returning({ id: apiKeys.id });

  if (revoked.length === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
