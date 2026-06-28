import { NextResponse } from "next/server";
import { requireGrant } from "@/lib/grants";
import { listSponsors, createSponsor } from "@/lib/sponsors";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireGrant("manage_events");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json({ sponsors: await listSponsors() });
}

type Body = { name?: string; blurb?: string | null; websiteUrl?: string | null };

export async function POST(req: Request) {
  try {
    await requireGrant("manage_events");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = (await req.json()) as Body;
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const sponsor = await createSponsor({ name, blurb: body.blurb ?? null, websiteUrl: body.websiteUrl ?? null });
  return NextResponse.json({ ok: true, sponsor });
}
