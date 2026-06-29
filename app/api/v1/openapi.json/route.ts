import { openapiSpec } from "@/lib/api/openapi";
import { apiJson, corsPreflight } from "@/lib/api/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/v1/openapi.json — unauthenticated machine-readable API spec.
export async function GET(req: Request) {
  return apiJson(req, openapiSpec(), { cacheSeconds: 3600 });
}

export function OPTIONS() {
  return corsPreflight();
}
