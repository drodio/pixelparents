import { clerkClient } from "@clerk/nextjs/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { creditLedger, creditBalances, adminAccess, apiKeys } from "@/db/schema";

// Revenue = real money users paid us via Stripe (credit topups), net of refunds
// and chargebacks. Distinct from "spend" (our actual AI cost). Super-admin only.

export type PurchaserKind = "admin" | "api" | "user";

export type RevenueUserRow = {
  clerkUserId: string;
  label: string; // email → name → clerk id
  kind: PurchaserKind;
  purchasedNetCents: number; // gross topups − refunds
  refundedCents: number;
  remainingCents: number; // current balance
};

export type RevenueSummary = {
  totalNetCents: number;
  totalRefundedCents: number;
  totalRemainingCents: number;
  hasRefunds: boolean;
  rows: RevenueUserRow[];
};

// One purchaser's ledger aggregates (cents). `grossTopupCents` = Σ topups;
// `refundedCents` = Σ of refunded/charged-back amounts (a positive number).
export type LedgerAgg = {
  clerkUserId: string;
  grossTopupCents: number;
  refundedCents: number;
};

export type Identity = { label: string; kind: PurchaserKind };

// Pure assembly: aggregates + balances + identities → the dashboard summary.
// Rows are sorted by net purchased, descending. Unit-tested without a DB.
export function buildRevenueSummary(
  aggs: LedgerAgg[],
  balances: Map<string, number>,
  identities: Map<string, Identity>,
): RevenueSummary {
  const rows: RevenueUserRow[] = aggs.map((a) => {
    const id = identities.get(a.clerkUserId);
    return {
      clerkUserId: a.clerkUserId,
      label: id?.label ?? a.clerkUserId,
      kind: id?.kind ?? "user",
      purchasedNetCents: a.grossTopupCents - a.refundedCents,
      refundedCents: a.refundedCents,
      remainingCents: balances.get(a.clerkUserId) ?? 0,
    };
  });
  rows.sort((x, y) => y.purchasedNetCents - x.purchasedNetCents);
  return {
    totalNetCents: rows.reduce((s, r) => s + r.purchasedNetCents, 0),
    totalRefundedCents: rows.reduce((s, r) => s + r.refundedCents, 0),
    totalRemainingCents: rows.reduce((s, r) => s + r.remainingCents, 0),
    hasRefunds: rows.some((r) => r.refundedCents > 0),
    rows,
  };
}

// Resolve clerk ids → { label, kind }. Admins come from admin_access (no Clerk
// call needed); the rest are looked up in Clerk in batches and tagged "api" if
// they hold an API key, else "user". Failures fall back to the clerk id.
export async function resolveIdentities(ids: string[]): Promise<Map<string, Identity>> {
  const out = new Map<string, Identity>();
  if (ids.length === 0) return out;

  const admins = await db
    .select({ clerkUserId: adminAccess.clerkUserId, email: adminAccess.email, name: adminAccess.name })
    .from(adminAccess)
    .where(inArray(adminAccess.clerkUserId, ids));
  for (const a of admins) {
    out.set(a.clerkUserId, { label: a.email || a.name || a.clerkUserId, kind: "admin" });
  }

  const remaining = ids.filter((id) => !out.has(id));
  if (remaining.length > 0) {
    const apiOwners = new Set(
      (
        await db
          .select({ clerkUserId: apiKeys.clerkUserId })
          .from(apiKeys)
          .where(inArray(apiKeys.clerkUserId, remaining))
      ).map((r) => r.clerkUserId),
    );
    try {
      const client = await clerkClient();
      // getUserList caps at 100 ids per call; chunk to be safe.
      for (let i = 0; i < remaining.length; i += 100) {
        const chunk = remaining.slice(i, i + 100);
        const res = await client.users.getUserList({ userId: chunk, limit: 100 });
        for (const u of res.data) {
          const email =
            u.primaryEmailAddress?.emailAddress ??
            u.emailAddresses?.[0]?.emailAddress ??
            null;
          const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.username || null;
          out.set(u.id, {
            label: email || name || u.id,
            kind: apiOwners.has(u.id) ? "api" : "user",
          });
        }
      }
    } catch {
      // Clerk unavailable — leave unresolved ids to fall back to the clerk id.
    }
    for (const id of remaining) {
      if (!out.has(id)) out.set(id, { label: id, kind: apiOwners.has(id) ? "api" : "user" });
    }
  }
  return out;
}

// Full revenue summary across ALL purchasers. Super-admin only — never expose to
// a regular admin.
export async function getRevenueSummary(): Promise<RevenueSummary> {
  const aggRows = await db
    .select({
      clerkUserId: creditLedger.clerkUserId,
      gross: sql<number>`COALESCE(SUM(${creditLedger.deltaCents}) FILTER (WHERE ${creditLedger.reason} = 'topup'), 0)`,
      // stripe_refund deltas are negative; negate to a positive "refunded" amount.
      refunded: sql<number>`COALESCE(-SUM(${creditLedger.deltaCents}) FILTER (WHERE ${creditLedger.reason} = 'stripe_refund'), 0)`,
    })
    .from(creditLedger)
    .groupBy(creditLedger.clerkUserId)
    .having(sql`SUM(${creditLedger.deltaCents}) FILTER (WHERE ${creditLedger.reason} = 'topup') > 0`);

  const aggs: LedgerAgg[] = aggRows.map((r) => ({
    clerkUserId: r.clerkUserId,
    grossTopupCents: Number(r.gross),
    refundedCents: Number(r.refunded),
  }));

  const ids = aggs.map((a) => a.clerkUserId);
  const balances = new Map<string, number>();
  if (ids.length > 0) {
    const balRows = await db
      .select({ clerkUserId: creditBalances.clerkUserId, cents: creditBalances.balanceCents })
      .from(creditBalances)
      .where(inArray(creditBalances.clerkUserId, ids));
    for (const b of balRows) balances.set(b.clerkUserId, b.cents);
  }

  const identities = await resolveIdentities(ids);
  return buildRevenueSummary(aggs, balances, identities);
}

// Total a single user has been CHARGED (their own spend) — Σ of debit reasons.
// Used for the regular-admin "Total spent" figure (exact, not capped to recent
// ledger rows). Returns a positive cents number.
export async function getSpentCents(clerkUserId: string): Promise<number> {
  const [row] = await db
    .select({
      spent: sql<number>`COALESCE(-SUM(${creditLedger.deltaCents}), 0)`,
    })
    .from(creditLedger)
    .where(
      and(
        eq(creditLedger.clerkUserId, clerkUserId),
        inArray(creditLedger.reason, ["score_debit", "find_email_debit"]),
      ),
    );
  return Number(row?.spent ?? 0);
}
