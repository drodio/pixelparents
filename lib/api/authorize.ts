import { NextResponse } from "next/server";
import { verifyApiKey, type VerifiedKey } from "@/lib/db/api-keys";

type AuthResult =
  | { ok: true; key: VerifiedKey }
  | { ok: false; res: NextResponse };

// Single gate for every /api/v1 endpoint. There's one tier now: a key works iff
// it's been approved (and not revoked). verifyApiKey enforces that.
//   - missing/unknown/revoked/unapproved key → 401 unauthorized
//   - DB unreachable                          → 503 service_unavailable
export async function authorize(req: Request): Promise<AuthResult> {
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
        {
          error: "unauthorized",
          message: "Missing or invalid API key. Request access at /developers.",
        },
        { status: 401 },
      ),
    };
  }

  return { ok: true, key };
}
