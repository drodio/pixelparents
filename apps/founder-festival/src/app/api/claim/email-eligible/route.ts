import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { evaluations } from "@/db/schema";
import { isUuid } from "@/lib/canonicalize";
import { matchConfidence, type MatchProfile } from "@/lib/identity-match";
import { checkAndIncrementRateLimit } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/request-ip";

export const maxDuration = 10;

// POST /api/claim/email-eligible  { e: <evalId>, email: <string> }
//
// Pre-check for the email claim flow: would this email verify the claimant as
// the subject of eval `e`? Reuses the exact email tiers in matchConfidence
// (Tier 1: equals the profile's publicEmail; Tier 2: domain matches the
// company domain AND local-part matches the name). Lets the Claim modal reject
// a non-matching email (e.g. a personal gmail) BEFORE creating any Clerk
// account, instead of sending a sign-in/up link that can never claim.
//
// Returns only { eligible: boolean } — no profile internals — and is lightly
// rate-limited so it can't be used to enumerate which emails match a profile.
const PER_DAY_LIMIT = Number(process.env.EMAIL_ELIGIBLE_PER_DAY_LIMIT) || 200;

export async function POST(req: Request) {
  let body: { e?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const e = body.e;
  const email = (body.email ?? "").trim();
  if (!isUuid(e)) return NextResponse.json({ error: "invalid eval id" }, { status: 400 });
  if (!email.includes("@")) return NextResponse.json({ eligible: false });

  const ip = getRequestIp(req.headers);
  if (!(await checkAndIncrementRateLimit(`ee:${ip}`, PER_DAY_LIMIT))) {
    return NextResponse.json({ error: "rate limit" }, { status: 429 });
  }

  const [row] = await db
    .select({
      fullName: evaluations.fullName,
      profile: evaluations.profile,
    })
    .from(evaluations)
    .where(eq(evaluations.id, e))
    .limit(1);
  if (!row) return NextResponse.json({ eligible: false });

  const blob = (row.profile as MatchProfile | null) ?? null;
  const profile: MatchProfile | null = blob
    ? {
        fullName: row.fullName ?? blob.fullName,
        primaryCompanyDomain: blob.primaryCompanyDomain,
        publicEmail: blob.publicEmail,
        githubUsername: blob.githubUsername,
      }
    : row.fullName
      ? { fullName: row.fullName }
      : null;

  // linkedinUrl is unused by the email tiers; pass empty string.
  const result = matchConfidence({ provider: "email", email }, "", profile);
  return NextResponse.json({ eligible: result.kind === "match" });
}
