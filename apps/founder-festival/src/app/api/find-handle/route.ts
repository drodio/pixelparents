import { NextResponse } from "next/server";
import { findLinkedinHandles, type FoundCandidate } from "@/lib/find-linkedin-handle";
import { checkAndIncrementRateLimit, withinGlobalDailyLimit } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/request-ip";

export const maxDuration = 30;

const PER_DAY_LIMIT = Number(process.env.FIND_HANDLE_PER_DAY_LIMIT) || 50;
// Global daily ceiling across ALL callers — backstop against IP rotation.
const GLOBAL_PER_DAY = Number(process.env.FIND_HANDLE_GLOBAL_PER_DAY) || 1500;

export type { FoundCandidate };

export async function POST(req: Request) {
  let body: { name?: string; company?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const name = (body.name ?? "").trim();
  const company = (body.company ?? "").trim();
  if (name.length < 2) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  const ip = getRequestIp(req.headers);
  const allowed = await checkAndIncrementRateLimit(`fh:${ip}`, PER_DAY_LIMIT);
  if (!allowed) {
    return NextResponse.json(
      { error: "rate limit", limit: PER_DAY_LIMIT, resetsAt: "midnight UTC" },
      { status: 429 },
    );
  }
  if (!(await withinGlobalDailyLimit("find-handle", GLOBAL_PER_DAY))) {
    return NextResponse.json(
      { error: "temporarily unavailable", resetsAt: "midnight UTC" },
      { status: 503 },
    );
  }

  try {
    // This standalone resolution search is a real Exa cost with no eval row to
    // attach it to, so it is not written to evaluations.pricing. It is captured
    // by the authoritative live Exa usage path (admin-api) when EXA_SERVICE_KEY
    // is set; the counts-based dashboard total does not include it.
    const { candidates } = await findLinkedinHandles(name, company);
    return NextResponse.json({ candidates });
  } catch (err) {
    console.error("find-handle failed", err);
    return NextResponse.json({ error: "search failed" }, { status: 503 });
  }
}
