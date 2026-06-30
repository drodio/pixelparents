import { NextResponse } from "next/server";
import { authenticateClient, revokeRefreshToken } from "@/lib/oauth/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

function readClientCreds(
  req: Request,
  body: URLSearchParams,
): { clientId: string | null; clientSecret: string | null } {
  const authz = req.headers.get("authorization");
  if (authz?.toLowerCase().startsWith("basic ")) {
    try {
      const decoded = Buffer.from(authz.slice(6).trim(), "base64").toString("utf8");
      const idx = decoded.indexOf(":");
      if (idx >= 0) {
        return {
          clientId: decodeURIComponent(decoded.slice(0, idx)),
          clientSecret: decodeURIComponent(decoded.slice(idx + 1)),
        };
      }
    } catch {
      /* fall through */
    }
  }
  return { clientId: body.get("client_id"), clientSecret: body.get("client_secret") };
}

// POST /api/oauth/revoke — RFC 7009 token revocation. The client authenticates,
// then presents a `token` (a refresh token) to revoke. Per RFC 7009 §2.2 the
// endpoint returns 200 even for an unknown/already-revoked token (revocation is
// idempotent; we never leak whether a token existed). Revoking a refresh token
// burns its whole grant chain. (Access tokens are stateless short-lived JWTs; we
// accept token_type_hint=access_token but there's nothing to revoke server-side —
// they expire in 15 minutes.)
export async function POST(req: Request) {
  let body: URLSearchParams;
  try {
    const ct = req.headers.get("content-type") ?? "";
    body = ct.includes("application/json")
      ? new URLSearchParams((await req.json()) as Record<string, string>)
      : new URLSearchParams(await req.text());
  } catch {
    return NextResponse.json(
      { error: "invalid_request" },
      { status: 400, headers: { ...CORS, "Cache-Control": "no-store" } },
    );
  }

  const { clientId, clientSecret } = readClientCreds(req, body);
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "invalid_client" },
      { status: 401, headers: { ...CORS, "Cache-Control": "no-store" } },
    );
  }
  const client = await authenticateClient(clientId, clientSecret);
  if (!client) {
    return NextResponse.json(
      { error: "invalid_client" },
      { status: 401, headers: { ...CORS, "Cache-Control": "no-store" } },
    );
  }

  const token = body.get("token");
  if (token) {
    // Scope the revoke to the authenticated client so one app can't revoke
    // another's tokens. Unknown token → no-op (idempotent success).
    await revokeRefreshToken(token, client.client_id);
  }

  // RFC 7009: 200 OK with empty body regardless.
  return new NextResponse(null, { status: 200, headers: { ...CORS, "Cache-Control": "no-store" } });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
