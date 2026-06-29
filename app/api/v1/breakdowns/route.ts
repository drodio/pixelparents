import { authorize } from "@/lib/api/authorize";
import { getBreakdowns } from "@/lib/db/aggregates";
import { parseFilters } from "@/lib/api/filters";
import { apiJson, corsPreflight } from "@/lib/api/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/v1/breakdowns — requires an approved key. Aggregate COUNTS by
// dimension only; never individual rows or any PII. Optional filters scope the
// population; when filtering, buckets below K_ANON are suppressed.
export async function GET(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) return auth.res;

  const { filters, errors } = parseFilters(new URL(req.url).searchParams);
  if (errors.length) {
    return apiJson(req, { error: "invalid_filter", messages: errors }, { status: 400 });
  }
  return apiJson(req, await getBreakdowns(filters), { cacheSeconds: 60, private: true });
}

export function OPTIONS() {
  return corsPreflight();
}
