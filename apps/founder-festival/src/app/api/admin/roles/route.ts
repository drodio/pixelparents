import { NextResponse } from "next/server";
import { requireGrant } from "@/lib/grants";
import { createRole } from "@/lib/admin-roles";

export const runtime = "nodejs";

type Body = {
  name?: string;
  grants?: string[];
  costMultiplier?: number;
  usersScope?: string;
  eventsScope?: string;
};

export async function POST(req: Request) {
  try {
    await requireGrant("create_roles");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  let body: Body;
  try { body = (await req.json()) as Body; } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const grants = Array.isArray(body.grants) ? body.grants.filter((g) => typeof g === "string") : [];
  try {
    const role = await createRole({
      name,
      grants,
      costMultiplier: body.costMultiplier,
      usersScope: body.usersScope,
      eventsScope: body.eventsScope,
    });
    return NextResponse.json({ role });
  } catch {
    return NextResponse.json({ error: "could not create role (name may be taken)" }, { status: 409 });
  }
}
