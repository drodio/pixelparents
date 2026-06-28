import { NextResponse } from "next/server";
import { db } from "@/db";
import { evaluations } from "@/db/schema";
import { sql } from "drizzle-orm";
import { checkAndIncrementRateLimit, withinGlobalDailyLimit } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/request-ip";

// Invite codes are operator-chosen secrets that grant a leaderboard score, so
// the redeem endpoint is a brute-force target. Every attempt (success OR fail)
// burns one slot, so an attacker gets only a small number of guesses per IP per
// day, and a hard global cap bounds a distributed attack. Tune via env.
// (Codes should also be high-entropy — see scripts/insert-code.ts.)
const ATTEMPTS_PER_IP_PER_DAY = Number(process.env.REDEEM_PER_DAY_LIMIT) || 15;
const ATTEMPTS_GLOBAL_PER_DAY = Number(process.env.REDEEM_GLOBAL_PER_DAY) || 300;

export async function POST(req: Request) {
  let body: { code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const code = body.code?.trim();
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });

  // Throttle BEFORE touching the codes table — count every guess so failed
  // brute-force attempts exhaust the budget and lock the attacker out for the
  // day. Legitimate redeemers succeed in 1–2 tries, well under the cap.
  const ip = getRequestIp(req.headers);
  if (!(await checkAndIncrementRateLimit(`redeem:${ip}`, ATTEMPTS_PER_IP_PER_DAY))) {
    return NextResponse.json(
      { error: "too many attempts", resetsAt: "midnight UTC" },
      { status: 429 },
    );
  }
  if (!(await withinGlobalDailyLimit("redeem", ATTEMPTS_GLOBAL_PER_DAY))) {
    return NextResponse.json(
      { error: "too many attempts", resetsAt: "midnight UTC" },
      { status: 429 },
    );
  }

  // Atomic claim against bypass_codes
  const result = await db.execute(sql`
    UPDATE bypass_codes
       SET uses_count = uses_count + 1
     WHERE lower(code) = lower(${code})
       AND revoked_at IS NULL
       AND (expires_at IS NULL OR expires_at > NOW())
       AND uses_count < max_uses
     RETURNING id, assigned_score, code
  `);
  const rows = (result as unknown as { rows?: Array<{ id: string; assigned_score: number | null; code: string }> }).rows
    ?? (result as unknown as Array<{ id: string; assigned_score: number | null; code: string }>);
  const row = Array.isArray(rows) ? rows[0] : undefined;
  if (!row) return NextResponse.json({ error: "invalid or used code" }, { status: 400 });

  const placeholderUrl = `code:${row.id}`;
  const score = row.assigned_score ?? 0;
  const [evalRow] = await db
    .insert(evaluations)
    .values({
      linkedinUrl: placeholderUrl,
      score,
      founderScore: 0,
      investorScore: 0,
      signalQuality: "medium",
      breakdown: { founder: [], investor: [] },
      source: "code",
      sourceCode: row.code,
    })
    .returning();

  return NextResponse.json({ evaluationId: evalRow!.id, assignedScore: score, status: "redeemed" });
}
