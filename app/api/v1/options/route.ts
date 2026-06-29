import { authorize } from "@/lib/api/authorize";
import { getInterestsPool } from "@/lib/db/aggregates";
import { OPTIONS as OPTION_TAXONOMIES } from "@/lib/options";
import { apiJson, corsPreflight } from "@/lib/api/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/v1/options — requires an approved key. Non-PII reference data: the
// static option taxonomies plus the live distinct-interests pool.
export async function GET(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) return auth.res;
  return apiJson(
    req,
    { ...OPTION_TAXONOMIES, interests: await getInterestsPool() },
    { cacheSeconds: 300, private: true },
  );
}

export function OPTIONS() {
  return corsPreflight();
}
