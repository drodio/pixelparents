import { NextResponse } from "next/server";
import { runEval, lookupCachedEval } from "@/lib/eval-pipeline";
import { checkAndIncrementRateLimit, withinGlobalDailyLimit } from "@/lib/rate-limit";
import { getRequestIp, getRequestGeo } from "@/lib/request-ip";
import { isValidLinkedinUrl } from "@/lib/canonicalize";

// See /api/rescore: heavy profiles can exceed 60s and get killed mid-eval,
// surfacing a bare "Network error" client-side. 180s headroom (max is 300).
export const maxDuration = 180;

// Configurable via env so the operator can tune for traffic. Default high
// enough that active testing doesn't hit the wall, but tight enough that an
// abuser can't drain Exa+Claude credits.
const PER_DAY_LIMIT = Number(process.env.EVAL_PER_DAY_LIMIT) || 25;
// Global daily ceiling on fresh evals across ALL callers — the backstop when an
// attacker rotates IPs to beat the per-IP limit. /api/rescore shares this
// budget (it's the same Exa+Claude spend). Tune via env.
const GLOBAL_PER_DAY = Number(process.env.EVAL_GLOBAL_PER_DAY) || 800;

export async function POST(req: Request) {
  let body: { linkedinUrl?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const url = body.linkedinUrl;
  if (!url || !isValidLinkedinUrl(url)) {
    return NextResponse.json({ error: "invalid linkedin url" }, { status: 400 });
  }

  // Cache hit costs nothing — return without consuming a rate-limit slot. The
  // `cached` flag lets the client skip the theatrical progress animation and go
  // straight to the results page (the data was already computed).
  const cached = await lookupCachedEval(url);
  if (cached) {
    return NextResponse.json({ ...cached, cached: true });
  }

  // Fresh evals (Exa + Claude) are gated.
  const ip = getRequestIp(req.headers);
  const allowed = await checkAndIncrementRateLimit(ip, PER_DAY_LIMIT);
  if (!allowed) {
    return NextResponse.json(
      { error: "rate limit", limit: PER_DAY_LIMIT, resetsAt: "midnight UTC" },
      { status: 429 },
    );
  }
  // Global circuit-breaker — bounds total daily spend even under IP rotation.
  if (!(await withinGlobalDailyLimit("eval", GLOBAL_PER_DAY))) {
    return NextResponse.json(
      { error: "temporarily unavailable", resetsAt: "midnight UTC" },
      { status: 503 },
    );
  }

  try {
    // Record the requester's IP + approximate location so /admin/profiles can
    // track who triggered this (paid) fresh score and from where.
    const result = await runEval(url, "url", { requester: getRequestGeo(req.headers) });
    return NextResponse.json(result);
  } catch (err) {
    console.error("eval failed", err);
    return NextResponse.json({ error: "eval failed" }, { status: 503 });
  }
}
