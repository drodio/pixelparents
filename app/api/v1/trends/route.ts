import { authorize } from "@/lib/api/authorize";
import { getTrends, type TrendInterval } from "@/lib/db/aggregates";
import { apiJson, corsPreflight } from "@/lib/api/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/v1/trends?interval=week|month — requires an approved key. Signup
// counts bucketed over time (plus a running cumulative). Counts only, no PII.
export async function GET(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) return auth.res;

  const raw = new URL(req.url).searchParams.get("interval");
  if (raw != null && raw !== "week" && raw !== "month") {
    return apiJson(
      req,
      { error: "invalid_interval", messages: ["interval must be 'week' or 'month'"] },
      { status: 400 },
    );
  }
  const interval: TrendInterval = raw === "month" ? "month" : "week";
  return apiJson(req, await getTrends(interval), { cacheSeconds: 300, private: true });
}

export function OPTIONS() {
  return corsPreflight();
}
