import { NextResponse } from "next/server";
import { getSignupByEmail, getFamilyForEmail } from "@/lib/db/signups";
import { verifiedEmailsOf } from "@/lib/verify";
import { verifyAccessToken } from "@/lib/oauth/tokens";
import {
  buildIdTokenClaims,
  candidateGradesForStudent,
  type SignupForClaims,
} from "@/lib/oauth/claims";
import { parseScopes } from "@/lib/oauth/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization");
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1]!.trim() : null;
}

// GET/POST /api/oauth/userinfo — OIDC userinfo endpoint. Verifies a Bearer access
// token WE minted (RS256, our key), then returns the scope-gated claims for the
// user: always `sub` (the pairwise subject from the token), plus exactly the
// claims their granted scopes permit — the SAME scope-gated, coarsened set the ID
// token carries (no claim the user didn't consent to; students coarsened). A bad
// or expired token → 401 with a WWW-Authenticate header per RFC 6750.
async function handle(req: Request) {
  const token = bearer(req);
  if (!token) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "Missing Bearer access token." },
      {
        status: 401,
        headers: { ...CORS, "WWW-Authenticate": "Bearer", "Cache-Control": "no-store" },
      },
    );
  }

  const verified = await verifyAccessToken(token);
  if (!verified || !verified.sub) {
    return NextResponse.json(
      { error: "invalid_token", error_description: "The access token is invalid or expired." },
      {
        status: 401,
        headers: {
          ...CORS,
          "WWW-Authenticate": 'Bearer error="invalid_token"',
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const scopes = parseScopes(verified.scope);
  const email = verified.email;

  // Rebuild the verified-identity claims from the user's signup (the SAME model the
  // ID token uses), so /userinfo reflects current state. A DB hiccup or no signup →
  // no false positives (ohs_verified absent/false).
  let signup: SignupForClaims | null = null;
  let childGrades: Array<string | null> = [];
  if (email) {
    try {
      signup = await getSignupByEmail(email);
    } catch {
      signup = null;
    }
    if (signup && scopes.includes("grade_band")) {
      try {
        const fam = await getFamilyForEmail(email);
        if (fam) {
          const verifiedEmails = verifiedEmailsOf((signup.extra ?? {}) as Record<string, unknown>);
          childGrades = candidateGradesForStudent(
            signup,
            fam.kids.map((k) => ({ grade: k.grade, studentEmail: k.studentEmail })),
            verifiedEmails,
          );
        }
      } catch {
        /* omit grade_band on lookup failure */
      }
    }
  }

  const claims = buildIdTokenClaims({
    scopes,
    clientId: verified.aud,
    email,
    signup,
    childGrades,
  });

  // `sub` is REQUIRED in a userinfo response and MUST match the ID token's sub
  // (both are the pairwise subject from the token).
  return NextResponse.json(
    { sub: verified.sub, ...claims },
    { headers: { ...CORS, "Cache-Control": "no-store" } },
  );
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
