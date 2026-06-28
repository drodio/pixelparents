import { db } from "@/db";
import { evaluations, users } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

// Batched version of preferredNameForEval for a set of evaluations: returns a
// Map evalId → preferred display name (nickname when set, else full name).
// Ids with neither are omitted. One query — use this anywhere a list of names
// is rendered (chat author lines, mention re-resolution) to avoid N+1 lookups.
export async function preferredNamesForEvals(evaluationIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(evaluationIds)].filter(Boolean);
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const rows = await db
    .select({ id: evaluations.id, fullName: evaluations.fullName, nickname: users.nickname })
    .from(evaluations)
    .leftJoin(users, eq(users.evaluationId, evaluations.id))
    .where(inArray(evaluations.id, ids));
  for (const r of rows) {
    const nick = r.nickname?.trim();
    if (nick) {
      map.set(r.id, nick); // a claim with a nickname always wins
      continue;
    }
    if (!map.has(r.id)) {
      const full = (r.fullName ?? "").trim();
      if (full) map.set(r.id, full);
    }
  }
  return map;
}

// The display name to show for an evaluation: the owner's chosen nickname
// (e.g. "DROdio") when set, else their full legal name. Used for connection
// emails / the respond page so people appear by their preferred name. Returns
// null only when neither a nickname nor a full name exists. Server-only (DB).
export async function preferredNameForEval(evaluationId: string): Promise<string | null> {
  const [evalRow] = await db
    .select({ fullName: evaluations.fullName })
    .from(evaluations)
    .where(eq(evaluations.id, evaluationId))
    .limit(1);
  const claims = await db
    .select({ nickname: users.nickname })
    .from(users)
    .where(eq(users.evaluationId, evaluationId));
  const nickname = claims.find((c) => c.nickname && c.nickname.trim())?.nickname?.trim() ?? null;
  return nickname || evalRow?.fullName || null;
}

// The name to address someone by: their nickname (e.g. "DROdio") if set, else the
// first token of their full name ("Daniel"). Falls back to "there".
export async function preferredFirstName(evaluationId: string): Promise<string> {
  const [evalRow] = await db
    .select({ fullName: evaluations.fullName })
    .from(evaluations)
    .where(eq(evaluations.id, evaluationId))
    .limit(1);
  const claims = await db
    .select({ nickname: users.nickname })
    .from(users)
    .where(eq(users.evaluationId, evaluationId));
  const nickname = claims.find((c) => c.nickname && c.nickname.trim())?.nickname?.trim() ?? null;
  if (nickname) return nickname;
  const first = (evalRow?.fullName ?? "").trim().split(/\s+/)[0];
  return first || "there";
}
