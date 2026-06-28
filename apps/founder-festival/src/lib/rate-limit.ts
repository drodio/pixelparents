import { db } from "@/db";
import { sql } from "drizzle-orm";

export async function checkAndIncrementRateLimit(
  ip: string,
  perDay: number,
): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  const result = await db.execute(sql`
    INSERT INTO rate_limit (ip, day, count)
    VALUES (${ip}, ${today}, 1)
    ON CONFLICT (ip, day)
    DO UPDATE SET count = rate_limit.count + 1
    RETURNING count
  `);
  const rows = (result as unknown as { rows?: Array<{ count: number }> }).rows
    ?? (result as unknown as Array<{ count: number }>);
  const count = Number((Array.isArray(rows) ? rows[0]?.count : 0) ?? 0);
  return count <= perDay;
}

// Global daily circuit-breaker. Caps the TOTAL number of paid operations across
// ALL callers per UTC day, independent of IP. Per-IP limits fall to IP rotation
// (IPv6, proxies, botnets); this is the backstop that actually bounds spend —
// once the day's global budget is exhausted, paid Exa/Claude work hard-stops
// until midnight UTC. `bucket` separates independent budgets (e.g. "eval" vs
// "find-handle"). Returns true while still under the limit.
export async function withinGlobalDailyLimit(
  bucket: string,
  limit: number,
): Promise<boolean> {
  // Namespaced into the same rate_limit table; the "global:" prefix can never
  // collide with a real IP, so it gets its own counter row per day.
  return checkAndIncrementRateLimit(`global:${bucket}`, limit);
}
