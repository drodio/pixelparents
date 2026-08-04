import { currentUser } from "@clerk/nextjs/server";
import { primaryEmail } from "@/lib/clerk";
import { isAdminEmail } from "@/lib/admin";
import { listAppLogs } from "@/lib/db/app-logs";
import { toCsv } from "@/lib/logging";

export const dynamic = "force-dynamic";

// Columns, in a deliberate order: when → who → where → what.
const COLUMNS = [
  "createdAt",
  "level",
  "event",
  "message",
  "actorEmail",
  "actorSignupId",
  "actorClerkId",
  "sessionId",
  "requestId",
  "path",
  "method",
  "statusCode",
  "durationMs",
  "userAgent",
  "ipPrefix",
  "errorName",
  "errorMessage",
  "errorStack",
  "context",
];

// Export the CURRENT filtered view as CSV or JSON.
//
// Re-checks admin here rather than trusting the (authed)/admin layout: a route
// handler is independently addressable, so the layout's gate does not protect
// it. This endpoint returns real member emails, so it must gate itself.
export async function GET(req: Request) {
  const user = await currentUser();
  const email = primaryEmail(user);
  if (!email || !(await isAdminEmail(email))) {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(req.url);
  const p = url.searchParams;
  const format = p.get("format") === "json" ? "json" : "csv";

  const rows = await listAppLogs({
    level: p.get("level") || undefined,
    event: p.get("event") || undefined,
    q: p.get("q") || undefined,
    actorEmail: p.get("actorEmail") || undefined,
    sessionId: p.get("sessionId") || undefined,
    // Exports are allowed to be larger than a page view, still bounded.
    limit: Math.min(Math.max(Number(p.get("limit") ?? 1000) || 1000, 1), 1000),
  });

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const flat = rows.map((r) => ({
    ...r,
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : "",
    context: JSON.stringify(r.context ?? {}),
  })) as unknown as Record<string, unknown>[];

  if (format === "json") {
    return new Response(JSON.stringify(rows, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="gopixel-logs-${stamp}.json"`,
        // Never cache: this is per-admin data behind an auth check.
        "cache-control": "no-store",
      },
    });
  }

  return new Response(toCsv(flat, COLUMNS), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="gopixel-logs-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
