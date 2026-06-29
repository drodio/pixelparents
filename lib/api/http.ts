import { NextResponse } from "next/server";
import { createHash } from "node:crypto";

// Shared response helpers for the public v1 API: a consistent JSON envelope with
// CORS (Bearer-token API, so cross-origin browser apps are fine), a version
// header, slow-changing-cache headers, and weak-ETag / 304 support.

export const API_VERSION = "1.0.0";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

function weakEtag(body: string): string {
  return `W/"${createHash("sha1").update(body).digest("base64url").slice(0, 27)}"`;
}

type JsonOpts = { cacheSeconds?: number; private?: boolean; status?: number };

// JSON response with CORS + version + (optional) caching. When `cacheSeconds` is
// set and the client's If-None-Match matches, returns 304 (no body).
export function apiJson(req: Request, data: unknown, opts: JsonOpts = {}): NextResponse {
  const body = JSON.stringify(data);
  const etag = weakEtag(body);
  const headers: Record<string, string> = {
    ...CORS_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "X-API-Version": API_VERSION,
    ETag: etag,
    "Cache-Control":
      opts.cacheSeconds != null
        ? `${opts.private ? "private" : "public"}, max-age=${opts.cacheSeconds}`
        : "no-store",
  };
  if (opts.cacheSeconds != null && req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers });
  }
  return new NextResponse(body, { status: opts.status ?? 200, headers });
}

// 204 response for CORS preflight (export as `OPTIONS` from each route).
export function corsPreflight(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
