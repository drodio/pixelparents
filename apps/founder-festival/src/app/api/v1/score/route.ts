import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/api-keys";
import { fetchScorePayload } from "@/lib/api/score-payload";
import { isValidLinkedinUrl } from "@/lib/canonicalize";
import { checkAndIncrementRateLimit, withinGlobalDailyLimit } from "@/lib/rate-limit";
import { getEstimateCents } from "@/lib/admin";
import { applyMarkup } from "@/lib/credit-pricing";
import { reserveCredits, refundCredits, linkDebitEvaluation, getBalanceCents } from "@/lib/credits";
import { runEval } from "@/lib/eval-pipeline";

export const dynamic = "force-dynamic";

// Per-key daily cap on free lookups — stops the whole scored DB being scraped
// for free. Env-tunable; conservative default.
const PER_DAY_LIMIT = Number(process.env.API_LOOKUP_PER_DAY_LIMIT) || 1000;
// Global daily cap on PAID fresh scorings across ALL keys/accounts — the real
// backstop on our Exa+Claude spend. Per-key limits + balances aren't enough
// because anyone can mint unlimited free Clerk accounts → unlimited keys. Own
// bucket so paying customers and the free funnel don't throttle each other.
const SCORE_GLOBAL_PER_DAY = Number(process.env.API_SCORE_GLOBAL_PER_DAY) || 1000;

export async function GET(req: Request) {
  const key = await verifyApiKey(req.headers.get("authorization"));
  if (!key) {
    return NextResponse.json({ error: "invalid_api_key" }, { status: 401 });
  }

  const linkedinUrl = new URL(req.url).searchParams.get("linkedin_url");
  if (!linkedinUrl || !isValidLinkedinUrl(linkedinUrl)) {
    return NextResponse.json({ error: "invalid linkedin_url" }, { status: 400 });
  }

  if (!(await checkAndIncrementRateLimit(`apikey:${key.keyId}`, PER_DAY_LIMIT))) {
    return NextResponse.json(
      { error: "rate_limit", limit: PER_DAY_LIMIT, resetsAt: "midnight UTC" },
      { status: 429 },
    );
  }

  const payload = await fetchScorePayload(linkedinUrl);
  if (!payload) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(payload);
}

// POST /api/v1/score  { linkedin_url, mode?: "cached_only" | "score_if_needed" }
// Cache hit → free. Miss + cached_only → 404. Miss + score_if_needed → reserve
// the marked-up measured cost (see credit-pricing.ts), score, refund on failure.
export async function POST(req: Request) {
  const key = await verifyApiKey(req.headers.get("authorization"));
  if (!key) return NextResponse.json({ error: "invalid_api_key" }, { status: 401 });

  let body: { linkedin_url?: string; mode?: string } = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const url = body.linkedin_url;
  if (!url || !isValidLinkedinUrl(url)) {
    return NextResponse.json({ error: "invalid linkedin_url" }, { status: 400 });
  }
  if (!(await checkAndIncrementRateLimit(`apikey:${key.keyId}`, PER_DAY_LIMIT))) {
    return NextResponse.json({ error: "rate_limit", resetsAt: "midnight UTC" }, { status: 429 });
  }

  // Free cache hit regardless of mode.
  const cached = await fetchScorePayload(url);
  if (cached) return NextResponse.json(cached);

  if (body.mode !== "score_if_needed") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Global circuit-breaker — only paid (miss + score_if_needed) attempts count,
  // so cache hits stay free and uncapped. Hard-stops runaway spend regardless of
  // how many keys/accounts/credits an attacker amasses. Trips BEFORE any reserve
  // or scoring, so nothing is charged when it fires.
  if (!(await withinGlobalDailyLimit("api-score", SCORE_GLOBAL_PER_DAY))) {
    return NextResponse.json(
      { error: "temporarily_unavailable", resetsAt: "midnight UTC" },
      { status: 503 },
    );
  }

  // Paid path.
  const price = applyMarkup(await getEstimateCents("sonnet"));
  const reservation = await reserveCredits(key.clerkUserId, price);
  if (!reservation) {
    const balance = await getBalanceCents(key.clerkUserId);
    return NextResponse.json(
      { error: "payment_required", price_cents: price, balance_cents: balance, topup_url: `${new URL(req.url).origin}/developers` },
      { status: 402 },
    );
  }
  try {
    // Edge case (accepted for v1): if a concurrent request scored this same
    // brand-new URL in the gap after our cache check, runEval returns that
    // cached eval and we still charge the full price. No double-spend/oversell;
    // just a rare overcharge on a same-URL race. Revisit if it ever matters.
    const result = await runEval(url, "url", { model: "sonnet" });
    await linkDebitEvaluation(reservation.ledgerId, result.evaluationId);
    const payload = await fetchScorePayload(url, { cached: false, chargedCents: price });
    return NextResponse.json(payload);
  } catch (err) {
    console.error("paid score failed", err);
    await refundCredits(key.clerkUserId, price, null);
    return NextResponse.json({ error: "scoring_failed" }, { status: 503 });
  }
}
