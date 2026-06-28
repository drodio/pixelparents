import { currentUser } from "@clerk/nextjs/server";
import { adminGate, isSuperAdmin } from "@/lib/admin";
import { getViewerCostMultiplier } from "@/lib/grants";
import { NotAuthorized } from "@/components/admin/NotAuthorized";
import { getVercelCredits } from "@/lib/spend/vercel-ai-gateway";
import { getRecordedSpend, listEvalCosts } from "@/lib/spend/recorded";
import { SpendSummary } from "@/components/admin/SpendSummary";
import { SpendDetailTable } from "@/components/admin/SpendDetailTable";
import { RevenueTable } from "@/components/admin/RevenueTable";
import { getRevenueSummary, getSpentCents } from "@/lib/revenue";
import { getBalanceCents } from "@/lib/credits";
import { CREDIT_PACKS } from "@/lib/credit-packs";
import { AdminCredits } from "@/components/admin/AdminCredits";

const fmtUsd = (c: number) => `$${(c / 100).toFixed(2)}`;

// The "Credits & Spend" view — role-aware. Rendered by both /admin/spend and the
// /admin/credits alias.
//  - Regular admin: their OWN credits, total spent, packs, and activity ledger.
//  - Super admin: Revenue (all users' Stripe purchases) over Spend (the whole
//    system's actual AI cost, ×1, broken down + sortable detail).
export async function CreditsAndSpendView({
  search,
}: {
  search: { topup?: string; source?: string };
}) {
  const gate = await adminGate();
  if (!gate.ok) return <NotAuthorized email={gate.email} />;
  const superAdmin = await isSuperAdmin();

  // ---- Regular admin: own credits only (never global revenue or true cost) ----
  if (!superAdmin) {
    const user = await currentUser();
    const [balanceCents, spentCents] = user
      ? await Promise.all([getBalanceCents(user.id), getSpentCents(user.id)])
      : [0, 0];
    return (
      <AdminCredits
        balanceCents={balanceCents}
        spentCents={spentCents}
        topup={search.topup ?? null}
        packs={CREDIT_PACKS.map((p) => ({ id: p.id, label: p.label, cents: p.cents }))}
      />
    );
  }

  // ---- Super admin: revenue + global spend ----
  const costMult = await getViewerCostMultiplier(); // 1 for super admins
  const [revenue, vercel, recorded, evalRows] = await Promise.all([
    getRevenueSummary(),
    getVercelCredits(),
    getRecordedSpend().catch(() => null),
    listEvalCosts(500),
  ]);

  const revenueRows = revenue.rows.map((r) => ({
    clerkUserId: r.clerkUserId,
    label: r.label,
    kind: r.kind,
    purchasedNetCents: r.purchasedNetCents,
    refundedCents: r.refundedCents,
    remainingCents: r.remainingCents,
  }));
  const spendRows = evalRows.map((r) => ({
    id: r.id,
    fullName: r.fullName,
    model: r.model,
    llmCents: r.llmCents,
    exaCents: r.exaCents,
    totalCents: r.totalCents,
    llmSource: r.llmSource,
    createdAtIso: r.createdAt.toISOString(),
  }));

  return (
    <div className="flex flex-col gap-8">
      <h1 className="font-display text-3xl font-bold tracking-tight">Credits &amp; Spend</h1>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-2xl font-bold tracking-tight">Revenue</h2>
          <span className="text-sm text-zinc-400 tabular-nums">{fmtUsd(revenue.totalNetCents)} net</span>
        </div>
        <p className="text-xs text-zinc-500 -mt-1">
          All Stripe credit purchases, net of refunds. {fmtUsd(revenue.totalRemainingCents)} remaining
          across {revenue.rows.length} {revenue.rows.length === 1 ? "user" : "users"}.
        </p>
        <RevenueTable rows={revenueRows} hasRefunds={revenue.hasRefunds} />
      </section>

      <section className="flex flex-col gap-3">
        <SpendSummary vercel={vercel} recorded={recorded} costMult={costMult} />
        <SpendDetailTable rows={spendRows} costMult={costMult} />
      </section>
    </div>
  );
}
