import { NextResponse } from "next/server";
import { discoveryDocument, issuerUrl } from "@/lib/oauth/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /.well-known/openid-configuration — the OIDC discovery document. A standard
// OIDC client (Auth.js, openid-client) fetches this to learn our endpoints,
// supported scopes, signing algorithm, and PKCE method, so it can integrate with
// zero hand-written config. Cacheable (slow-changing); CORS-open (read by
// browser-side clients).
export async function GET() {
  const doc = discoveryDocument(issuerUrl());
  return NextResponse.json(doc, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
