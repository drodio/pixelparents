import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// POST /api/account/location — the signed-in user updates their own
// city / region / country. Each field is independently optional. Empty
// string is interpreted as "clear this field" (stored as null).
//
// Validated lightly: each field is a string, trimmed, max 80 chars, no
// newlines. Heavier address validation is out of scope — users can fill in
// whatever makes sense for their region (e.g. some places have no "state").
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: { city?: string; region?: string; country?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const normalize = (raw: string | undefined): string | null => {
    if (raw == null) return null;
    // Collapse any whitespace run (including newlines) to a single space and
    // trim. Empty after that → null.
    const trimmed = String(raw).replace(/\s+/g, " ").trim();
    if (!trimmed) return null;
    if (trimmed.length > 80) {
      throw Object.assign(new Error("field exceeds 80 chars"), { status: 400 });
    }
    return trimmed;
  };

  let city: string | null;
  let region: string | null;
  let country: string | null;
  try {
    city = normalize(body.city);
    region = normalize(body.region);
    country = normalize(body.country);
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ error: err.message }, { status: err.status ?? 400 });
  }

  await db
    .update(users)
    .set({ city, region, country })
    .where(eq(users.clerkUserId, userId));

  return NextResponse.json({ ok: true, city, region, country });
}
