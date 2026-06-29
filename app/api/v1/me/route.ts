import { authorize } from "@/lib/api/authorize";
import { apiJson, corsPreflight } from "@/lib/api/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/v1/me — confirms the key is valid. Reaching a 200 here means the key
// is approved and active (verifyApiKey only accepts approved, non-revoked keys).
export async function GET(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) return auth.res;
  return apiJson(req, { status: "approved" });
}

export function OPTIONS() {
  return corsPreflight();
}
