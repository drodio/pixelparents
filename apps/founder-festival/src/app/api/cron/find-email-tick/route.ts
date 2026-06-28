// GET /api/cron/find-email-tick  (Vercel cron, every minute)
//
// Drains the Find Email queue: claims a batch of rows the admin marked via
// POST /api/admin/profiles/find-email, runs AnyMailFinder concurrently, and stores
// results. A "valid" hit → found_email (+ $0.05 debit to the queuer when billable);
// a definitive miss → found_email_status='not_found' (so it's never re-queued); a
// transient error leaves the row untouched (re-queueable). Lookups average ~6s, so
// CONCURRENCY keeps a BATCH well within maxDuration.

import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { evaluations } from "@/db/schema";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { findPersonEmail } from "@/lib/anymailfinder";
import { findEmailOutcome } from "@/lib/find-email-logic";
import { upsertProfileEmail } from "@/lib/profile-emails";
import { reserveCreditsFor, refundCredits } from "@/lib/credits";
import { reportServerError } from "@/lib/report-server-error";
import { runPool } from "@/lib/concurrency";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BATCH = 50; // rows per tick; ≈ BATCH/CONCURRENCY × ~6s wall-clock (~30s here)
const CONCURRENCY = 10;
const CHARGE_CENTS = 5;

type Claimed = {
  id: string;
  fullName: string | null;
  linkedinUrl: string | null;
  domain: string | null;
  queuedBy: string | null;
  billable: boolean | null;
};

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const apiKey = process.env.ANYMAILFINDER_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "not_configured" }, { status: 500 });

  // Atomically claim a batch: clear find_email_queued_at (so overlapping ticks grab
  // DISJOINT rows via FOR UPDATE SKIP LOCKED) and RETURN everything we need to process.
  const claimRes = await db.execute(sql`
    UPDATE evaluations SET find_email_queued_at = NULL
    WHERE id IN (
      SELECT id FROM evaluations
      WHERE find_email_queued_at IS NOT NULL
      ORDER BY find_email_queued_at ASC
      LIMIT ${BATCH}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id::text AS id, full_name AS "fullName", linkedin_url AS "linkedinUrl",
              (profile->>'primaryCompanyDomain') AS domain,
              find_email_queued_by AS "queuedBy", find_email_billable AS billable
  `);
  const claimed = ((claimRes as unknown as { rows?: Claimed[] }).rows
    ?? (claimRes as unknown as Claimed[])) as Claimed[];
  if (!Array.isArray(claimed) || claimed.length === 0) {
    return NextResponse.json({ claimed: 0, found: 0, chargedCents: 0 });
  }

  let found = 0;
  let chargedCents = 0;

  await runPool(claimed, CONCURRENCY, async (e) => {
    const r = await processFindEmailRow(e, apiKey);
    found += r.found;
    chargedCents += r.chargedCents;
  });

  return NextResponse.json({ claimed: claimed.length, found, chargedCents });
}

// Process ONE claimed row: look up the email, charge a billable hit, and store it.
//
// RELIABILITY (P1-4): everything after the AnyMailFinder lookup used to run with
// NO try/catch directly inside the runPool callback. A single failed DB write
// (e.g. a transient Neon blip on the upsert) would reject the worker's promise →
// Promise.all → the WHOLE tick threw, abandoning up to BATCH-1 other rows that
// had already been claimed (find_email_queued_at nulled) — and, worse, leaving a
// billable row CHARGED but with no email delivered. This function isolates each
// row: it never throws, and on a store failure after a charge it REFUNDS so we
// never bill for an undelivered email. The row stays claimed for manual re-queue,
// matching the existing transient-AMF-failure behavior.
export async function processFindEmailRow(
  e: Claimed,
  apiKey: string,
): Promise<{ found: number; chargedCents: number }> {
  // No usable signal → automatic miss.
  if (!e.domain && !e.linkedinUrl) {
    await db.update(evaluations).set({ foundEmailStatus: "not_found" }).where(eq(evaluations.id, e.id));
    return { found: 0, chargedCents: 0 };
  }
  let amf;
  try {
    amf = e.domain
      ? await findPersonEmail({ apiKey, fullName: e.fullName, domain: e.domain })
      : await findPersonEmail({ apiKey, linkedinUrl: e.linkedinUrl });
  } catch (err) {
    // Transient (network / 429 / 401 / timeout): leave the row untouched so the
    // admin can re-queue it. NOT marked not_found.
    await reportServerError(err, { route: "/api/cron/find-email-tick" });
    return { found: 0, chargedCents: 0 };
  }

  // superAdmin:true → we ignore findEmailOutcome's charge math and bill via `billable`.
  const outcome = findEmailOutcome(amf, { superAdmin: true });
  if (!outcome.store || !outcome.email) {
    await db.update(evaluations).set({ foundEmailStatus: "not_found" }).where(eq(evaluations.id, e.id));
    return { found: 0, chargedCents: 0 };
  }

  // Charge + store under one try (see the P1-4 note above).
  let reservedCents = 0;
  try {
    // Charge billable rows on a hit; if the queuer is out of credits, don't store
    // (never hand out an email we couldn't charge for).
    if (e.billable) {
      const reserved = await reserveCreditsFor(e.queuedBy ?? "", CHARGE_CENTS, "find_email_debit");
      if (!reserved) {
        await db.update(evaluations).set({ foundEmailStatus: "not_found" }).where(eq(evaluations.id, e.id));
        return { found: 0, chargedCents: 0 };
      }
      reservedCents = CHARGE_CENTS;
    }

    await db
      .update(evaluations)
      .set({
        // found_email* are retained for the cron's own dedup + audit; the unified
        // read source is now profile_emails (see upsert below + the A6 backfill).
        foundEmail: outcome.email,
        foundEmailStatus: "valid",
        foundEmailAt: new Date(),
        foundEmailBy: e.queuedBy,
      })
      .where(eq(evaluations.id, e.id));
    // Unify into the multi-email model: AnyMailFinder hits are "unverified".
    await upsertProfileEmail(e.id, outcome.email, "unverified", "anymailfinder", e.queuedBy);
    return { found: 1, chargedCents: reservedCents };
  } catch (err) {
    await reportServerError(err, { route: "/api/cron/find-email-tick" });
    // Never bill for an email we failed to deliver.
    if (reservedCents > 0) {
      await refundCredits(e.queuedBy ?? "", reservedCents, null).catch(() => {});
    }
    return { found: 0, chargedCents: 0 };
  }
}
