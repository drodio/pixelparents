import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/api-keys";
import { findLinkedinHandles } from "@/lib/find-linkedin-handle";
import { checkAndIncrementRateLimit, withinGlobalDailyLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Free, per-key rate-limited. Resolving a name→LinkedIn URL is a cheap search
// (~0.7¢/query, measured); only *scoring* spends credits. Kept free so it stays
// a frictionless funnel into paid scoring. Like the rest of /api/v1/*, this
// REQUIRES a valid Bearer API key — it's never reachable unauthenticated.
// Per-token daily cap — generous (10k/day ≈ $70/day at ~0.7¢) for legit devs.
const PER_DAY_LIMIT = Number(process.env.API_RESOLVE_PER_DAY_LIMIT) || 10000;
// Global circuit-breaker across ALL keys/accounts. A per-token cap alone can't
// bound spend (anyone can mint unlimited keys via free Clerk accounts), so this
// sits ABOVE any single token as a catastrophic-runaway ceiling: 50k/day ×
// ~0.7¢ ≈ $350/day absolute max. High enough to never throttle a legit 10k user.
const GLOBAL_PER_DAY = Number(process.env.RESOLVE_GLOBAL_PER_DAY) || 50000;

// GET /api/v1/resolve?name=<full name>&company=<optional company>
// Returns ranked LinkedIn candidates so the caller can pick the right person
// before spending credits to score them.
export async function GET(req: Request) {
  const key = await verifyApiKey(req.headers.get("authorization"));
  if (!key) {
    return NextResponse.json({ error: "invalid_api_key" }, { status: 401 });
  }

  const sp = new URL(req.url).searchParams;
  const name = (sp.get("name") ?? "").trim();
  const company = (sp.get("company") ?? "").trim();
  if (name.length < 2) {
    return NextResponse.json({ error: "name (>= 2 chars) required" }, { status: 400 });
  }

  if (!(await checkAndIncrementRateLimit(`resolve:${key.keyId}`, PER_DAY_LIMIT))) {
    return NextResponse.json(
      { error: "rate_limit", limit: PER_DAY_LIMIT, resetsAt: "midnight UTC" },
      { status: 429 },
    );
  }
  // Global Exa circuit-breaker — bounds total resolution searches/day.
  if (!(await withinGlobalDailyLimit("resolve", GLOBAL_PER_DAY))) {
    return NextResponse.json(
      { error: "temporarily unavailable", resetsAt: "midnight UTC" },
      { status: 503 },
    );
  }

  try {
    const { candidates } = await findLinkedinHandles(name, company || undefined);
    // Slim public shape: `url` is what /api/v1/score needs; `name` + `headline`
    // let the caller disambiguate before scoring.
    return NextResponse.json({
      candidates: candidates.map((c) => ({ url: c.url, name: c.name, headline: c.headline })),
    });
  } catch (err) {
    console.error("resolve failed", err);
    return NextResponse.json({ error: "search_failed" }, { status: 503 });
  }
}
