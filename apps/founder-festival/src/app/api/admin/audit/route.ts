import { NextResponse } from "next/server";
import { and, desc, lt } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLog } from "@/db/schema";
import { requireSuperAdminApi, logAdminAction } from "@/lib/admin-api";

export const dynamic = "force-dynamic";

// GET /api/admin/audit?limit=&before=<ISO> — super-admin reads the recent audit
// trail, newest first. Keyset pagination via `before` (the created_at of the last
// row you saw). Super-admin only; the read itself is audited.
export async function GET(req: Request) {
  const gate = await requireSuperAdminApi(req);
  if (gate instanceof NextResponse) return gate;

  const sp = new URL(req.url).searchParams;
  const limit = Math.min(200, Math.max(1, Number(sp.get("limit")) || 50));
  const beforeRaw = sp.get("before");
  const before = beforeRaw ? new Date(beforeRaw) : null;
  const validBefore = before && !Number.isNaN(before.getTime()) ? before : null;

  const rows = await db
    .select({
      id: adminAuditLog.id,
      clerkUserId: adminAuditLog.clerkUserId,
      email: adminAuditLog.email,
      method: adminAuditLog.method,
      path: adminAuditLog.path,
      status: adminAuditLog.status,
      tokenType: adminAuditLog.tokenType,
      ip: adminAuditLog.ip,
      userAgent: adminAuditLog.userAgent,
      meta: adminAuditLog.meta,
      createdAt: adminAuditLog.createdAt,
    })
    .from(adminAuditLog)
    .where(validBefore ? and(lt(adminAuditLog.createdAt, validBefore)) : undefined)
    .orderBy(desc(adminAuditLog.createdAt))
    .limit(limit);

  const results = rows.map((r) => ({
    id: r.id,
    clerk_user_id: r.clerkUserId,
    email: r.email,
    method: r.method,
    path: r.path,
    status: r.status,
    token_type: r.tokenType,
    ip: r.ip,
    user_agent: r.userAgent,
    meta: r.meta,
    created_at: r.createdAt.toISOString(),
  }));
  const next_cursor =
    rows.length === limit ? rows[rows.length - 1]!.createdAt.toISOString() : null;

  await logAdminAction({
    clerkUserId: gate.userId,
    email: gate.email,
    status: 200,
    request: gate,
    meta: { action: "audit_list", count: results.length },
  });

  return NextResponse.json({ results, next_cursor });
}
