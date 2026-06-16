import { NextResponse } from "next/server";
import { tierSatisfies, type Tier } from "@/lib/api-keys";
import { verifyApiKey, type VerifiedKey } from "@/lib/db/api-keys";

type AuthResult =
  | { ok: true; key: VerifiedKey }
  | { ok: false; res: NextResponse };

// Single gate for every /api/v1 endpoint: verify the bearer key, then check it
// satisfies the endpoint's required tier.
//   - missing/unknown/revoked key        → 401 unauthorized
//   - public key hitting an approved path → 403 approval_required
//   - DB unreachable                      → 503 service_unavailable
export async function authorize(req: Request, required: Tier): Promise<AuthResult> {
  let key: VerifiedKey | null;
  try {
    key = await verifyApiKey(req.headers.get("authorization"));
  } catch {
    return {
      ok: false,
      res: NextResponse.json(
        { error: "service_unavailable", message: "Could not verify the API key right now." },
        { status: 503 },
      ),
    };
  }

  if (!key) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: "unauthorized", message: "Missing or invalid API key. Get one at /developers." },
        { status: 401 },
      ),
    };
  }

  if (!tierSatisfies(key.tier, required)) {
    return {
      ok: false,
      res: NextResponse.json(
        {
          error: "approval_required",
          message:
            "This endpoint needs an approved key. Your key works on the public endpoints now; approval unlocks the rest. See /developers.",
        },
        { status: 403 },
      ),
    };
  }

  return { ok: true, key };
}
