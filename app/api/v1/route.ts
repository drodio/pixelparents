import { apiJson, corsPreflight, API_VERSION } from "@/lib/api/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ENDPOINTS = [
  { method: "GET", path: "/api/v1", auth: false, description: "This index." },
  { method: "GET", path: "/api/v1/health", auth: false, description: "Liveness + version." },
  { method: "GET", path: "/api/v1/openapi.json", auth: false, description: "OpenAPI 3.1 spec." },
  { method: "GET", path: "/api/v1/me", auth: true, description: "Confirm your key is valid." },
  { method: "GET", path: "/api/v1/stats", auth: true, description: "Totals (filterable)." },
  { method: "GET", path: "/api/v1/breakdowns", auth: true, description: "Counts by dimension (filterable)." },
  {
    method: "GET",
    path: "/api/v1/trends",
    auth: true,
    description: "Signups over time (?interval=week|month).",
  },
  { method: "GET", path: "/api/v1/options", auth: true, description: "Taxonomies + interests pool." },
  { method: "POST", path: "/api/mcp", auth: true, description: "MCP server (AI-agent tools)." },
];

// GET /api/v1 — unauthenticated discovery index for the public API.
export async function GET(req: Request) {
  return apiJson(
    req,
    {
      name: "GoPixel API",
      version: API_VERSION,
      description: "High-level, non-PII community stats — counts and taxonomies only.",
      documentation: "https://gopixel.org/developers",
      authentication: {
        scheme: "Bearer",
        header: "Authorization: Bearer <your-key>",
        request_access: "https://gopixel.org/developers",
      },
      endpoints: ENDPOINTS,
    },
    { cacheSeconds: 300 },
  );
}

export function OPTIONS() {
  return corsPreflight();
}
