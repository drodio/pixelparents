import { getSql, getDb, hasDatabase } from "@/lib/db";
import { ensureFamiliesSchema, ensureDirectoryIndex } from "@/lib/db/ensure";
import { children, type ChildRow, type SignupRow } from "@/lib/db/schema/signups";
import { isStudentAccount } from "@/lib/family-display";
import { buildDirectoryCard, isDirectoryVisible, isFamilyVerified } from "@/lib/directory";
import { getDirectorySignups } from "@/lib/db/signups";
import { createNotification } from "@/lib/db/notifications";

// "A new family shares your interest in X" notifications.
//
// When a member NEWLY shares an interest with existing members (signup completion,
// or an interests edit), we notify the EXISTING members who already list that
// interest. This is deliberately conservative on two axes, both documented below:
//
//   • DEDUPE — a per-(recipient, source family, interest) ledger row makes each
//     pairing notify AT MOST ONCE, ever. Editing interests back and forth, or a
//     second cold start re-running the emit, can't re-notify the same pair for the
//     same interest. The ledger is keyed on the SOURCE FAMILY (family_id) not the
//     source signup, so a two-parent family sharing one interest can't double-hit a
//     recipient via each co-parent.
//
//   • FAN-OUT CAP — a popular interest (say 200 families list "Chess") must not
//     spam a new member's arrival to all 200. We cap the NUMBER OF RECIPIENTS PER
//     INTEREST at MAX_RECIPIENTS_PER_INTEREST and the TOTAL recipients across all of
//     a member's interests at MAX_TOTAL_RECIPIENTS. Recipients are chosen
//     deterministically (fewest existing interest_match notifications first, then
//     oldest signup) so the newest/least-notified members are favored and the choice
//     is stable across retries.
//
// PII: the notification carries ONLY the source family's coarsened display name
// (students = first name only, from buildDirectoryCard) + a /directory/<token> link
// when they share a profile, and the interest label. Never an email/phone/child
// name — the same convention documented at the top of lib/db/notifications.ts.
//
// ATTRIBUTION: the ledger records who/what generated the notification
// (source_signup_id + generated_by) so a later audit can trace every emitted row.

// Cap: at most this many EXISTING members are notified about any single interest a
// newly-joined member shares. Keeps a popular interest from fanning out to everyone.
export const MAX_RECIPIENTS_PER_INTEREST = 8;
// Cap: at most this many total notifications across ALL of the member's interests
// in one emit, so a member listing 30 popular interests can't blast the community.
export const MAX_TOTAL_RECIPIENTS = 20;

// Normalize an interest to its canonical match key (same rule as lib/interests.ts:
// trim + lowercase). Overlap + the dedupe ledger both key on this so "Chess" and
// "chess" are the SAME interest but "Yegge" and "Linus" are never conflated.
function interestKey(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const v = s.trim().toLowerCase();
  return v || null;
}

// Self-healing guard for the interest_match dedupe ledger (same rationale as the
// guards in lib/db/ensure.ts + lib/db/notifications.ts: this app shares one Neon DB
// with features that run their own partial `drizzle-kit push`, and there's no
// migrate-on-deploy, so a new table won't exist until a human migrates — by which
// point every emit would throw). Created idempotently on first use per cold start;
// EVERY access path calls this first (the country-column P0 lesson).
let ensured: Promise<void> | null = null;
export function ensureInterestMatchLedger(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      const sql = getSql();
      await sql.transaction([
        sql`
        CREATE TABLE IF NOT EXISTS interest_match_notifications (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          created_at timestamptz NOT NULL DEFAULT now(),
          -- The family that was notified (a signups.id; recipient of the notification).
          recipient_signup_id uuid NOT NULL,
          -- The NEW family whose arrival triggered it (attribution: who generated it).
          source_family_id uuid NOT NULL,
          source_signup_id uuid NOT NULL,
          -- The canonical interest key (trim+lowercase) the two share.
          interest_key text NOT NULL,
          -- What generated this row (attribution). e.g. 'signup_complete', 'interests_edit'.
          generated_by text NOT NULL DEFAULT 'system'
        )
      `,
        // The dedupe key: one notification per (recipient, source family, interest).
        // A UNIQUE index makes the INSERT ... ON CONFLICT DO NOTHING the atomic guard.
        sql`
        CREATE UNIQUE INDEX IF NOT EXISTS interest_match_notifications_uniq
          ON interest_match_notifications (recipient_signup_id, source_family_id, interest_key)
      `,
      ]);
    })().catch((e) => {
      ensured = null;
      throw e;
    });
  }
  return ensured;
}

// Claim a (recipient, source family, interest) pairing in the ledger. Returns true
// when THIS call inserted the row (i.e. it's the first time → notify), false when a
// row already existed (already notified → skip). The unique index + ON CONFLICT DO
// NOTHING makes this race-safe across concurrent cold starts.
async function claimPairing(input: {
  recipientSignupId: string;
  sourceFamilyId: string;
  sourceSignupId: string;
  interestKey: string;
  generatedBy: string;
}): Promise<boolean> {
  const rows = (await getSql()`
    INSERT INTO interest_match_notifications
      (recipient_signup_id, source_family_id, source_signup_id, interest_key, generated_by)
    VALUES (${input.recipientSignupId}, ${input.sourceFamilyId}, ${input.sourceSignupId},
            ${input.interestKey}, ${input.generatedBy})
    ON CONFLICT (recipient_signup_id, source_family_id, interest_key) DO NOTHING
    RETURNING id
  `) as Array<{ id: string }>;
  return rows.length > 0;
}

// Group children by family for buildDirectoryCard.
function groupKidsByFamily(kids: ChildRow[]): Map<string, ChildRow[]> {
  const m = new Map<string, ChildRow[]>();
  for (const k of kids) {
    const arr = m.get(k.familyId);
    if (arr) arr.push(k);
    else m.set(k.familyId, [k]);
  }
  return m;
}
// Group STUDENT accounts by family (to resolve a child to its own student account).
function groupStudentsByFamily(rows: SignupRow[]): Map<string, SignupRow[]> {
  const m = new Map<string, SignupRow[]>();
  for (const r of rows) {
    if (!isStudentAccount(r)) continue;
    const arr = m.get(r.familyId);
    if (arr) arr.push(r);
    else m.set(r.familyId, [r]);
  }
  return m;
}

// Emit "A new family shares your interest in X" notifications for the family that
// just joined / edited interests. Best-effort by contract: callers wrap in after()
// or try/catch. DB-less → no-op. See the module header for the dedupe + fan-out
// cap policy. `generatedBy` is recorded in the ledger for attribution.
export async function notifyInterestMatches(input: {
  // The signup whose interests newly changed (the "source" / new family).
  source: SignupRow;
  generatedBy?: string;
}): Promise<number> {
  if (!hasDatabase()) return 0;
  const { source } = input;
  const generatedBy = input.generatedBy ?? "system";

  // The source must itself be a verified family, or it shouldn't be matching against
  // (or notifying) anyone — mirrors the directory verification gate.
  if (!isFamilyVerified(source)) return 0;

  try {
    await Promise.all([
      ensureFamiliesSchema(),
      ensureDirectoryIndex(),
      ensureInterestMatchLedger(),
    ]);

    const [allRows, kids] = await Promise.all([
      getDirectorySignups(),
      getDb().select().from(children).orderBy(children.createdAt),
    ]);
    const kidsByFamily = groupKidsByFamily(kids);
    const studentsByFamily = groupStudentsByFamily(allRows);
    const currentYear = new Date().getFullYear();

    // The source's shared interests (opt-in gated + coarsened, same as the card).
    const sourceCard = buildDirectoryCard(
      source,
      kidsByFamily.get(source.familyId) ?? [],
      new Map(),
      0,
      currentYear,
      studentsByFamily.get(source.familyId) ?? [],
    );
    const sourceLabel = sourceCard.name || "A new family";
    const sourceLink = sourceCard.token ? `/directory/${sourceCard.token}` : null;

    // Source interest keys → the display label to use in the notification body
    // (source's own spelling). Keyed so we match case-insensitively.
    const sourceKeys = new Map<string, string>();
    for (const i of sourceCard.interests) {
      const k = interestKey(i);
      if (k && !sourceKeys.has(k)) sourceKeys.set(k, i.trim());
    }
    if (sourceKeys.size === 0) return 0;

    // Candidate recipients = the directory-visible set, EXCLUDING the source's own
    // family. For each, compute which of the source's interests they also list.
    const excludeFamily = source.familyId;
    type Recipient = {
      signupId: string;
      existingNotifs: number; // fairness key — filled after we know the pool
      createdAtMs: number;
      matchedKeys: string[];
    };
    const recipients: Recipient[] = [];
    for (const row of allRows) {
      if (!isDirectoryVisible(row)) continue;
      if (row.familyId && row.familyId === excludeFamily) continue;
      if (row.id === source.id) continue;
      const card = buildDirectoryCard(
        row,
        kidsByFamily.get(row.familyId) ?? [],
        new Map(),
        0,
        currentYear,
        studentsByFamily.get(row.familyId) ?? [],
      );
      const candKeys = new Set<string>();
      for (const i of card.interests) {
        const k = interestKey(i);
        if (k) candKeys.add(k);
      }
      const matchedKeys = [...sourceKeys.keys()].filter((k) => candKeys.has(k));
      if (matchedKeys.length === 0) continue;
      const created =
        row.createdAt instanceof Date
          ? row.createdAt.getTime()
          : Date.parse(String(row.createdAt));
      recipients.push({
        signupId: row.id,
        existingNotifs: 0,
        createdAtMs: Number.isFinite(created) ? created : 0,
        matchedKeys,
      });
    }
    if (recipients.length === 0) return 0;

    // Fairness ordering: notify members with the FEWEST existing interest_match
    // notifications first (so a heavily-notified member isn't hit again while a
    // quiet one is skipped), tie-broken by oldest signup for determinism. One count
    // query over the whole recipient pool.
    const ids = recipients.map((r) => r.signupId);
    const counts = (await getSql()`
      SELECT recipient_signup_id AS id, count(*)::int AS n
      FROM notifications
      WHERE type = 'interest_match' AND recipient_signup_id = ANY(${ids})
      GROUP BY recipient_signup_id
    `) as Array<{ id: string; n: number }>;
    const byId = new Map(counts.map((c) => [c.id, c.n]));
    for (const r of recipients) r.existingNotifs = byId.get(r.signupId) ?? 0;
    recipients.sort((a, b) => {
      if (a.existingNotifs !== b.existingNotifs) return a.existingNotifs - b.existingNotifs;
      return a.createdAtMs - b.createdAtMs;
    });

    // Walk recipients (fairest first) and emit, honoring BOTH caps: per-interest and
    // total. For a recipient sharing multiple interests we notify on ONE interest
    // (their first matched, in the source's key order) to avoid stacking several
    // near-identical cards on one person — that single notification still says which
    // interest, and additional shared interests show on the directory profile.
    const perInterestCount = new Map<string, number>();
    let total = 0;
    let emitted = 0;

    for (const r of recipients) {
      if (total >= MAX_TOTAL_RECIPIENTS) break;
      // Pick the first matched interest (source key order) that still has cap room.
      const chosenKey = [...sourceKeys.keys()].find(
        (k) =>
          r.matchedKeys.includes(k) &&
          (perInterestCount.get(k) ?? 0) < MAX_RECIPIENTS_PER_INTEREST,
      );
      if (!chosenKey) continue; // every interest this recipient shares is capped out
      const label = sourceKeys.get(chosenKey)!;

      // Dedupe: claim the (recipient, source family, interest) pairing first. If it
      // was already claimed (already notified once), skip — don't re-notify.
      const claimed = await claimPairing({
        recipientSignupId: r.signupId,
        sourceFamilyId: source.familyId,
        sourceSignupId: source.id,
        interestKey: chosenKey,
        generatedBy,
      });
      if (!claimed) continue;

      await createNotification({
        recipientSignupId: r.signupId,
        type: "interest_match",
        title: "A family shares your interest",
        body: `${sourceLabel} shares your interest in ${label}.`,
        link: sourceLink,
      });

      perInterestCount.set(chosenKey, (perInterestCount.get(chosenKey) ?? 0) + 1);
      total += 1;
      emitted += 1;
    }

    return emitted;
  } catch (err) {
    console.error("notifyInterestMatches failed:", err);
    return 0;
  }
}
