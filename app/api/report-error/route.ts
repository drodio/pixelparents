import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { primaryEmail } from "@/lib/clerk";
import { createReport } from "@/lib/db/reports";
import { buildErrorReport, type ErrorReportRequest } from "./message";

// One-tap "Report this bug" endpoint. The error screens (app/error.tsx and the
// bare app/global-error.tsx) POST { url, message, digest } here when a user taps
// "Report this bug". We resolve WHO reported it server-side via Clerk (never from
// the client), assemble a concise, secret-free message, and persist it via the
// existing createReport() so it lands in /admin/reports triage as category
// "auto-error".
//
// Contract: this is best-effort and MUST NOT throw back to the client. A hard
// error may have taken out Clerk/DB context, and the report button lives inside
// an already-broken page — so every failure path still returns { ok: true }. The
// user just wanted to tell us; we don't surface plumbing failures to them.

export const runtime = "nodejs";
// Never cache — every POST is a fresh side-effecting write.
export const dynamic = "force-dynamic";

// Best-effort client IP from the usual proxy headers (same precedence as the
// landing report form). Purely for admin triage; null when unknown.
function clientIp(request: Request): string | null {
  const xff = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (xff) return xff;
  const real = request.headers.get("x-real-ip")?.trim();
  return real || null;
}

export async function POST(request: Request) {
  let body: ErrorReportRequest = {};
  try {
    const parsed = (await request.json()) as unknown;
    if (parsed && typeof parsed === "object") {
      body = parsed as ErrorReportRequest;
    }
  } catch {
    // Malformed/empty body — fall through with an empty body; the assembler
    // handles missing fields. Still best-effort.
  }

  // Resolve the reporter identity from the session, never the client. On a hard
  // error the Clerk context may be gone (esp. from global-error, which replaces
  // the root layout and its providers), so treat any failure as "signed-out".
  let reporterLabel: string | null = null;
  try {
    const user = await currentUser();
    if (user) {
      reporterLabel = primaryEmail(user) ?? user.id ?? null;
    }
  } catch {
    reporterLabel = null;
  }

  const record = buildErrorReport({
    body,
    reporterLabel,
    requestIp: clientIp(request),
  });

  try {
    await createReport(record);
  } catch (err) {
    // Log for our own observability; still tell the client we're good so the
    // button can show its "Thanks — reported." state on an already-broken page.
    console.error("report-error: createReport failed:", err);
  }

  return NextResponse.json({ ok: true });
}
