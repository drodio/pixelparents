import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/db";
import { evaluations, creditBalances, creditLedger } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getBalanceCents } from "@/lib/credits";
import { IS_PROD_DB } from "../setup";

// P1-4: the find-email cron's per-row body had the post-charge DB writes OUTSIDE
// any try/catch. One row's store failure rejected the whole runPool batch
// (abandoning up to 49 already-claimed rows) AND left a billable row charged but
// undelivered. processFindEmailRow isolates each row: on a store failure after a
// charge it REFUNDS and returns instead of throwing.

// Force a "valid" AMF hit, and let the store throw, so we exercise the
// charged-then-store-fails path deterministically.
vi.mock("@/lib/anymailfinder", () => ({ findPersonEmail: vi.fn() }));
vi.mock("@/lib/profile-emails", () => ({ upsertProfileEmail: vi.fn() }));

import { findPersonEmail } from "@/lib/anymailfinder";
import { upsertProfileEmail } from "@/lib/profile-emails";
import { processFindEmailRow } from "@/app/api/cron/find-email-tick/route";

function rand() {
  return Math.random().toString(36).slice(2, 8);
}

async function seedBillableRow(balanceCents: number) {
  const queuedBy = "user_fe_" + rand();
  await db.insert(creditBalances).values({ clerkUserId: queuedBy, balanceCents });
  const [ev] = await db
    .insert(evaluations)
    .values({
      linkedinUrl: "https://linkedin.com/in/fe-" + rand(),
      fullName: "FE Test",
      score: 1,
      founderScore: 1,
      investorScore: 0,
      signalQuality: "high",
      source: "url",
    })
    .returning();
  return {
    row: {
      id: ev.id,
      fullName: "FE Test",
      linkedinUrl: ev.linkedinUrl,
      domain: "acme.com",
      queuedBy,
      billable: true,
    },
    queuedBy,
    evalId: ev.id,
  };
}

describe.skipIf(IS_PROD_DB)("processFindEmailRow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refunds the charge and does NOT throw when the store fails after charging", async () => {
    const { row, queuedBy } = await seedBillableRow(100);
    vi.mocked(findPersonEmail).mockResolvedValue({ email: "found@acme.com", status: "valid" });
    vi.mocked(upsertProfileEmail).mockRejectedValue(new Error("transient db blip"));

    // Must not throw (that's what abandoned the batch).
    const res = await processFindEmailRow(row, "fake-key");

    expect(res).toEqual({ found: 0, chargedCents: 0 });
    // Charged 5¢ then refunded → back to 100.
    expect(await getBalanceCents(queuedBy)).toBe(100);
    const ledger = await db.select().from(creditLedger).where(eq(creditLedger.clerkUserId, queuedBy));
    expect(ledger.some((r) => r.reason === "find_email_debit")).toBe(true);
    expect(ledger.some((r) => r.reason === "refund")).toBe(true);
  });

  it("stores + charges on the happy path", async () => {
    const { row, queuedBy, evalId } = await seedBillableRow(100);
    vi.mocked(findPersonEmail).mockResolvedValue({ email: "found@acme.com", status: "valid" });
    vi.mocked(upsertProfileEmail).mockResolvedValue(undefined as never);

    const res = await processFindEmailRow(row, "fake-key");

    expect(res).toEqual({ found: 1, chargedCents: 5 });
    expect(await getBalanceCents(queuedBy)).toBe(95);
    const [ev] = await db.select().from(evaluations).where(eq(evaluations.id, evalId)).limit(1);
    expect(ev.foundEmail).toBe("found@acme.com");
    expect(ev.foundEmailStatus).toBe("valid");
    expect(vi.mocked(upsertProfileEmail)).toHaveBeenCalledOnce();
  });

  it("marks not_found (no charge) on an AMF miss", async () => {
    const { row, queuedBy } = await seedBillableRow(100);
    vi.mocked(findPersonEmail).mockResolvedValue({ email: null, status: "not_found" });

    const res = await processFindEmailRow(row, "fake-key");

    expect(res).toEqual({ found: 0, chargedCents: 0 });
    expect(await getBalanceCents(queuedBy)).toBe(100); // never charged
  });
});
