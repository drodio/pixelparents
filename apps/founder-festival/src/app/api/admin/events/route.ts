import { NextResponse } from "next/server";
import { requireGrant } from "@/lib/grants";
import { db } from "@/db";
import { events } from "@/db/schema";
import { currentUser } from "@clerk/nextjs/server";

export const runtime = "nodejs";

type Body = {
  slug: string; title: string;
  hostName: string | null; hostEmail: string | null;
  startsAt: string; endsAt: string | null;
  venue: string | null; capacity: number | null;
  approvalMode: "manual" | "auto" | "hybrid";
  description: string | null;
  criteria: {
    side: "founder" | "investor" | "either";
    founderScoreMin: number; investorScoreMin: number;
    stages: string[];
  };
};

export async function POST(req: Request) {
  try {
    await requireGrant("create_events");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const user = await currentUser();
  const body = (await req.json()) as Body;
  if (!body.slug || !body.title || !body.startsAt) {
    return NextResponse.json({ error: "slug, title, startsAt required" }, { status: 400 });
  }
  if (!/^[a-z0-9-]+$/.test(body.slug)) {
    return NextResponse.json({ error: "slug must be lowercase a-z, 0-9, -" }, { status: 400 });
  }
  const [row] = await db.insert(events).values({
    slug: body.slug,
    title: body.title,
    hostName: body.hostName,
    hostEmail: body.hostEmail,
    startsAt: new Date(body.startsAt),
    endsAt: body.endsAt ? new Date(body.endsAt) : null,
    venue: body.venue,
    capacity: body.capacity,
    status: "open",
    approvalMode: body.approvalMode,
    description: body.description,
    criteria: body.criteria,
    // Lowercased so it matches getViewerEmail() for "theirs"-scoped enforcement.
    createdByEmail: user?.emailAddresses[0]?.emailAddress?.toLowerCase() ?? null,
  }).returning();
  return NextResponse.json({ id: row.id, slug: row.slug });
}
