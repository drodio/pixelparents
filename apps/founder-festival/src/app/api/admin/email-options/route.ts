import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/lib/admin";
import { setEmailSignatureText } from "@/lib/email-signature";

export const runtime = "nodejs";

// Save the global email signature ("Email options"). Super-admin only — this
// signature is appended to every outgoing email.
export async function POST(req: Request) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  let body: { value?: unknown };
  try {
    body = (await req.json()) as { value?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (typeof body.value !== "string") {
    return NextResponse.json({ error: "value must be a string" }, { status: 400 });
  }
  // Cap length defensively — a signature should never be huge.
  if (body.value.length > 5000) {
    return NextResponse.json({ error: "signature too long" }, { status: 400 });
  }
  await setEmailSignatureText(body.value);
  return NextResponse.json({ ok: true });
}
