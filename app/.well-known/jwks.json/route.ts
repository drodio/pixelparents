import { NextResponse } from "next/server";
import { publicJwks, OAuthKeyError } from "@/lib/oauth/keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /.well-known/jwks.json — the provider's PUBLIC signing key(s). A client
// verifies our ID-token signatures by fetching this and matching on `kid`. If the
// signing key isn't configured we return a clean 503 (not a crash); CORS-open and
// cacheable for clients that cache JWKS by `kid`.
export async function GET() {
  try {
    const jwks = await publicJwks();
    return NextResponse.json(jwks, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (e) {
    if (e instanceof OAuthKeyError) {
      return NextResponse.json(
        { error: "provider_not_configured", error_description: e.message },
        { status: 503, headers: { "Access-Control-Allow-Origin": "*" } },
      );
    }
    throw e;
  }
}
