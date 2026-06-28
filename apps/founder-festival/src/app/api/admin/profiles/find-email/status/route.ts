// POST /api/admin/profiles/find-email/status
//
// Body: { evaluationIds: string[] }  (the ids the client queued)
// Polled by the Tools bar while the find-email-tick cron drains the queue.
// Returns how many of those ids are still queued, plus the emails found so far so
// the table can fill them in live.
//
// Returns: { remaining: number, found: { id, email }[] }

import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { evaluations } from "@/db/schema";
import { adminGate } from "@/lib/admin";
import { can } from "@/lib/grants";

export const dynamic = "force-dynamic";

type Body = { evaluationIds?: unknown };

export async function POST(req: Request) {
  const gate = await adminGate();
  if (!gate.ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!(await can("view_profiles"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const ids = Array.isArray(body.evaluationIds)
    ? body.evaluationIds.filter((x): x is string => typeof x === "string")
    : [];
  if (ids.length === 0) return NextResponse.json({ remaining: 0, found: [] });

  const rows = await db
    .select({
      id: evaluations.id,
      foundEmail: evaluations.foundEmail,
      queuedAt: evaluations.findEmailQueuedAt,
    })
    .from(evaluations)
    .where(inArray(evaluations.id, ids));

  const remaining = rows.filter((r) => r.queuedAt != null).length;
  const found = rows
    .filter((r) => r.foundEmail != null)
    .map((r) => ({ id: r.id, email: r.foundEmail as string }));

  return NextResponse.json({ remaining, found });
}
