import { NextResponse } from "next/server";
import { decideConnectionRequestByToken, introduceConnection } from "@/lib/attendee-connections";

export const runtime = "nodejs";

// POST /api/connections/respond { token, decision } — decide a request via its
// email token. Public: the unguessable token is the authorization. Only acts on
// still-pending requests (idempotent / safe to retry).
export async function POST(req: Request) {
  const { token, decision } = (await req.json()) as { token?: string; decision?: string };
  if (!token || (decision !== "approved" && decision !== "denied")) {
    return NextResponse.json({ error: "token + decision required" }, { status: 400 });
  }
  const row = await decideConnectionRequestByToken(token, decision);
  if (!row) {
    return NextResponse.json({ error: "This request was already handled or the link is invalid." }, { status: 404 });
  }
  if (row.status === "approved") {
    try {
      await introduceConnection(row, new URL(req.url).origin);
    } catch (err) {
      console.error("[connections/respond] intro email failed:", err);
    }
  }
  return NextResponse.json({ ok: true, status: row.status });
}
