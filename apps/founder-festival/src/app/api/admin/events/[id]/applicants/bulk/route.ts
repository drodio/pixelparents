import { NextResponse } from "next/server";
import { requireGrant } from "@/lib/grants";
import { canAccessEvent } from "@/lib/ownership";
import { currentUser } from "@clerk/nextjs/server";
import { bulkTransition, type ApplicantStatus } from "@/lib/events";

export const runtime = "nodejs";

type Body = { applicantIds: string[]; status: ApplicantStatus; reason?: string };

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireGrant("manage_events");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  // RBAC scope: a "theirs"-scoped role can only manage applicants on its events.
  if (!(await canAccessEvent(id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const user = await currentUser();
  const actor = user?.emailAddresses[0]?.emailAddress ?? "admin";
  const body = (await req.json()) as Body;
  if (!Array.isArray(body.applicantIds) || body.applicantIds.length === 0) {
    return NextResponse.json({ error: "applicantIds required" }, { status: 400 });
  }
  const n = await bulkTransition({
    applicantIds: body.applicantIds,
    toStatus: body.status,
    reason: body.reason ?? `bulk:${actor}`,
    actorEmail: actor,
  });
  return NextResponse.json({ ok: true, count: n });
}
