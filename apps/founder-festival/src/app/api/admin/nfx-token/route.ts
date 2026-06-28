import { NextResponse } from "next/server";
import { getTokenExpiry } from "@/lib/nfx-token";
import { setNfxToken } from "@/lib/nfx-token-store";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// One-click NFX token refresh. The admin bookmarklet (shown on /admin/nfx-refresh)
// captures the live NFX JWT from signal.nfx.com's own API calls and POSTs it here.
//
// Auth is a SHARED SECRET (NFX_TOKEN_REFRESH_SECRET), NOT a Clerk session — the
// bookmarklet runs on the signal.nfx.com origin and can't carry our cookie. The
// secret is only ever rendered on the Clerk-super-admin-gated /admin/nfx-refresh
// page, so it isn't broadly exposed. CORS is scoped to the NFX origin.

const ALLOWED_ORIGIN = "https://signal.nfx.com";

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

// Constant-time-ish secret compare (avoid early-exit length leak on the hot path).
function secretOk(provided: unknown): boolean {
  const expected = process.env.NFX_TOKEN_REFRESH_SECRET;
  if (!expected || typeof provided !== "string" || provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  return diff === 0;
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(req: Request) {
  const headers = corsHeaders();
  let body: { token?: unknown; secret?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400, headers });
  }

  if (!secretOk(body.secret)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403, headers });
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  const info = getTokenExpiry(token);
  if (!info) {
    return NextResponse.json(
      { ok: false, error: "not_a_readable_jwt" },
      { status: 400, headers },
    );
  }
  if (info.expired) {
    return NextResponse.json(
      { ok: false, error: "token_already_expired", expiresAt: info.expiresAt },
      { status: 400, headers },
    );
  }

  try {
    await setNfxToken(token);
  } catch {
    return NextResponse.json({ ok: false, error: "store_failed" }, { status: 500, headers });
  }

  return NextResponse.json(
    { ok: true, expiresAt: info.expiresAt, daysLeft: Math.floor(info.daysLeft) },
    { status: 200, headers },
  );
}
