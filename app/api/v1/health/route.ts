import { hasDatabase } from "@/lib/db";
import { apiJson, corsPreflight, API_VERSION } from "@/lib/api/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/v1/health — unauthenticated liveness + version probe (for uptime
// monitors). No data, so no key required.
export async function GET(req: Request) {
  return apiJson(
    req,
    {
      status: "ok",
      version: API_VERSION,
      database: hasDatabase() ? "ready" : "pending",
      time: new Date().toISOString(),
    },
    { cacheSeconds: 15 },
  );
}

export function OPTIONS() {
  return corsPreflight();
}
