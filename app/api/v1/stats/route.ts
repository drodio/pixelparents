import { authorize } from "@/lib/api/authorize";
import { getStats } from "@/lib/db/aggregates";
import { parseFilters } from "@/lib/api/filters";
import { apiJson, corsPreflight } from "@/lib/api/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/v1/stats — requires an approved key. Ultra-abstract totals.
// Optional filters (e.g. ?state=CA&tech_depth=10x%20Developer) scope the
// population; filtered totals below K_ANON are suppressed (null) to prevent
// de-anonymization of small subpopulations.
export async function GET(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) return auth.res;

  const { filters, errors } = parseFilters(new URL(req.url).searchParams);
  if (errors.length) {
    return apiJson(req, { error: "invalid_filter", messages: errors }, { status: 400 });
  }
  return apiJson(req, await getStats(filters), { cacheSeconds: 60, private: true });
}

export function OPTIONS() {
  return corsPreflight();
}
