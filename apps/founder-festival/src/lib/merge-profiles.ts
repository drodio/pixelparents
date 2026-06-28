// Merge true-duplicate profiles into one (the admin "Merge all into this profile"
// action). Option A semantics: the WINNER keeps all of its own data (scores,
// identity, slug). Each LOSER's real-world RELATIONSHIPS are repointed to the
// winner, then the loser is deleted (its own scored data + any leftover rows are
// cleaned by deleteEvaluationsCascade).
//
// We explicitly repoint the relationships that actually matter on a duplicate —
// claims, the verified email, event attendance, and photo credit. Rarer links
// (host/sponsor seats, connection requests, chat, family) are NOT repointed; the
// cascade deletes them with the loser. That's the safe trade: a duplicate's stray
// chat post is acceptable to drop, and it keeps the merge SQL small + predictable
// (no interactive transaction is available on the Neon HTTP driver).
//
// Ordering: repoints first, delete LAST — so a mid-way failure leaves the loser
// intact (recoverable), never a half-deleted profile.

import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { evaluations } from "@/db/schema";
import { deleteEvaluationsCascade } from "./profile-delete-cascade";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidList = (ids: string[]) => sql.raw(ids.map((i) => `'${i}'::uuid`).join(","));

export type MergeResult = { ok: boolean; merged?: number; error?: string };

export async function mergeProfiles(winnerId: string, loserIdsRaw: string[]): Promise<MergeResult> {
  const losers = [...new Set(loserIdsRaw)].filter((l) => l && l !== winnerId);
  // Hard guard: every id MUST be a real UUID — these get interpolated into raw
  // SQL below, so non-uuid input is rejected (no injection surface).
  if (!UUID.test(winnerId) || !losers.every((l) => UUID.test(l))) return { ok: false, error: "bad_id" };
  if (losers.length === 0) return { ok: false, error: "no_losers" };

  const [winner] = await db.select({ id: evaluations.id }).from(evaluations).where(eq(evaluations.id, winnerId)).limit(1);
  if (!winner) return { ok: false, error: "winner_not_found" };

  const ids = uuidList(losers);
  const w = sql.raw(`'${winnerId}'::uuid`);

  // 1) Claims — clerk_user_id is unique, so a user has at most one row; just
  //    repoint it to the winner.
  await db.execute(sql`UPDATE users SET evaluation_id = ${w} WHERE evaluation_id IN (${ids})`);

  // 2) Verified emails — unique (evaluation_id, email). Drop any loser email the
  //    winner already has, then repoint the rest (so the conflict email now maps
  //    only to the winner).
  await db.execute(sql`
    DELETE FROM profile_emails t
    WHERE t.evaluation_id IN (${ids})
      AND EXISTS (SELECT 1 FROM profile_emails wm WHERE wm.evaluation_id = ${w} AND wm.email = t.email)`);
  await db.execute(sql`UPDATE profile_emails SET evaluation_id = ${w} WHERE evaluation_id IN (${ids})`);

  // 3) Event attendance + 4) photo credit — nullable links, no eval-unique key.
  await db.execute(sql`UPDATE event_attendees SET evaluation_id = ${w} WHERE evaluation_id IN (${ids})`);
  await db.execute(sql`UPDATE event_photos SET uploaded_by_evaluation_id = ${w} WHERE uploaded_by_evaluation_id IN (${ids})`);

  // 5) Preserve old URLs: add each loser's slug as an alias pointing at the
  //    winner so /profile/<kind>/<loser-slug> still resolves (the kind comes
  //    from the eval). alias_slug is the PK → skip any slug already aliased.
  await db.execute(sql`
    INSERT INTO profile_slug_aliases (alias_slug, evaluation_id)
    SELECT e.slug, ${w} FROM evaluations e
    WHERE e.id IN (${ids}) AND e.slug IS NOT NULL
    ON CONFLICT DO NOTHING`);

  // 6) Delete the losers (own-data + any non-repointed relationship rows + eval).
  await deleteEvaluationsCascade(losers);
  return { ok: true, merged: losers.length };
}
