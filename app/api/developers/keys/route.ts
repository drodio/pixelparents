import { NextResponse } from "next/server";
import { issueApiKey } from "@/lib/db/api-keys";
import { notifyKeyRequest } from "@/lib/email";
import { keyRequestSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/developers/keys — self-serve a 'public'-tier key. Returns the raw
// key exactly once; only its hash is stored. Notifies DROdio (best-effort) so he
// can choose to upgrade the key to 'approved'.
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_request", message: "Request body must be JSON." },
      { status: 400 },
    );
  }

  const parsed = keyRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { name, email, intended_use, label } = parsed.data;

  let issued;
  try {
    issued = await issueApiKey({ name, email, intendedUse: intended_use, label });
  } catch {
    return NextResponse.json(
      { error: "service_unavailable", message: "Could not issue a key right now. Try again shortly." },
      { status: 503 },
    );
  }

  await notifyKeyRequest({ name, email, intendedUse: intended_use, prefix: issued.prefix });

  return NextResponse.json(
    {
      id: issued.id,
      api_key: issued.raw, // shown once — store it now; we keep only the hash
      prefix: issued.prefix,
      tier: issued.tier,
      created_at: issued.createdAt,
      note: "Save this key now — it won't be shown again. It works on the public endpoints immediately; richer endpoints unlock after approval.",
    },
    { status: 201 },
  );
}
