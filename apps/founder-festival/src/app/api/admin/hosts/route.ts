import { NextResponse } from "next/server";
import { requireGrant } from "@/lib/grants";
import { listHosts, createHost } from "@/lib/hosts";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireGrant("manage_events");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json({ hosts: await listHosts() });
}

type Body = { name?: string; blurb?: string | null; url?: string | null };

export async function POST(req: Request) {
  try {
    await requireGrant("manage_events");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = (await req.json()) as Body;
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const host = await createHost({ name, blurb: body.blurb ?? null, url: body.url ?? null });
  return NextResponse.json({ ok: true, host });
}
