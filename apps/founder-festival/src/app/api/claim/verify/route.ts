import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/db";
import { evaluations, users } from "@/db/schema";
import { isUuid } from "@/lib/canonicalize";
import { matchConfidence, type MatchProfile, type MatchSignal } from "@/lib/identity-match";
import { checkAndIncrementRateLimit } from "@/lib/rate-limit";

export const maxDuration = 10;
export const dynamic = "force-dynamic";

const PER_DAY_LIMIT = Number(process.env.CLAIM_VERIFY_PER_DAY_LIMIT) || 100;

// POST /api/claim/verify  { e: <evalId>, attest?: boolean }
//
// Verify-to-own for an EXISTING medium (LinkedIn name-only) claimer — the one
// path that lifts a name-only match to owning ("high") confidence after the
// claim already exists:
//   1. Tries every VERIFIED Clerk email against the eval's email tiers (exact
//      publicEmail, or company-domain + name). Match → high, signal=email-*.
//   2. Else, when `attest` is true, accepts the user's explicit "this LinkedIn
//      profile is mine" attestation → high, signal=linkedin-url-attested. This
//      is the deliberately weaker path (product decision); every use is written
//      to users.verifiedSignal AND logged so it's auditable.
//   3. Else returns { confidence:"medium", canAttest:true, linkedinUrl } so the
//      UI can offer the attestation step.
//
// Owning rights elsewhere come ONLY from matchConfidence="high"
// (isOwningConfidence) — this endpoint never grants anything weaker.
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { e?: string; attest?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const evalId = body.e;
  if (!isUuid(evalId)) return NextResponse.json({ error: "invalid eval id" }, { status: 400 });

  // Per-user cap (this requires auth, so abuse is bounded; the cap stops a
  // compromised session from hammering the attestation path).
  if (!(await checkAndIncrementRateLimit(`cv:${userId}`, PER_DAY_LIMIT))) {
    return NextResponse.json({ error: "rate limit" }, { status: 429 });
  }

  // Must already have claimed this eval through the normal flow.
  const [claim] = await db
    .select({ matchConfidence: users.matchConfidence })
    .from(users)
    .where(and(eq(users.clerkUserId, userId), eq(users.evaluationId, evalId)))
    .limit(1);
  if (!claim) return NextResponse.json({ error: "no claim to verify" }, { status: 400 });
  if (claim.matchConfidence === "high") {
    return NextResponse.json({ confidence: "high", via: "already" });
  }

  const [row] = await db
    .select({
      fullName: evaluations.fullName,
      profile: evaluations.profile,
      linkedinUrl: evaluations.linkedinUrl,
    })
    .from(evaluations)
    .where(eq(evaluations.id, evalId))
    .limit(1);
  if (!row) return NextResponse.json({ error: "eval not found" }, { status: 404 });

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

  async function upgrade(signal: MatchSignal, via: string) {
    await db
      .update(users)
      .set({ matchConfidence: "high", verifiedSignal: signal, verifiedVia: via, verifiedAt: new Date() })
      .where(and(eq(users.clerkUserId, userId!), eq(users.evaluationId, evalId!)));
  }

  // 1) Secure path: any verified Clerk email that matches the eval.
  const user = await currentUser().catch(() => null);
  const verifiedEmails = (user?.emailAddresses ?? [])
    .filter((a) => a.verification?.status === "verified")
    .map((a) => a.emailAddress);
  for (const email of verifiedEmails) {
    const result = matchConfidence({ provider: "email", email }, "", profile);
    if (result.kind === "match") {
      await upgrade(result.signal, "email");
      return NextResponse.json({ confidence: "high", via: "email" });
    }
  }

  // 2) Weaker path (product decision): explicit LinkedIn-URL self-attestation.
  if (body.attest === true) {
    await upgrade("linkedin-url-attested", "linkedin-attestation");
    // Durable audit lives on users.verifiedSignal; log too for observability.
    console.warn(
      `[claim-verify] linkedin-url attestation accepted: clerkUserId=${userId} eval=${evalId} linkedin=${row.linkedinUrl ?? "?"}`,
    );
    return NextResponse.json({ confidence: "high", via: "attestation" });
  }

  // 3) Can't auto-verify via email — offer the attestation step.
  return NextResponse.json({ confidence: "medium", canAttest: true, linkedinUrl: row.linkedinUrl ?? null });
}
