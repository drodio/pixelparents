import { NextResponse } from "next/server";
import { requireGrant } from "@/lib/grants";
import { canAccessEvent } from "@/lib/ownership";
import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/db";
import { eventApplicants } from "@/db/schema";
import { eq } from "drizzle-orm";
import { transitionApplicant, type ApplicantStatus } from "@/lib/events";

export const runtime = "nodejs";

type Body = { status?: ApplicantStatus; adminNote?: string; reason?: string };

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; applicantId: string }> }) {
  try {
    await requireGrant("manage_events");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id, applicantId } = await ctx.params;
  // RBAC scope: a "theirs"-scoped role can only manage applicants on its events.
  if (!(await canAccessEvent(id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const user = await currentUser();
  const actor = user?.emailAddresses[0]?.emailAddress ?? "admin";
  const body = (await req.json()) as Body;

  if (body.adminNote !== undefined) {
    await db
      .update(eventApplicants)
      .set({ adminNote: body.adminNote, updatedAt: new Date() })
      .where(eq(eventApplicants.id, applicantId));
  }
  if (body.status) {
    await transitionApplicant({
      applicantId,
      toStatus: body.status,
      reason: body.reason ?? `manual:${actor}`,
      actorEmail: actor,
    });
  }
  return NextResponse.json({ ok: true });
}
