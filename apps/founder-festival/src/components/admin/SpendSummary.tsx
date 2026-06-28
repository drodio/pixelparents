import type { VercelCreditsResult } from "@/lib/spend/vercel-ai-gateway";
import type { RecordedSpend } from "@/lib/spend/recorded";
import { applyCostMultiplier } from "@/lib/cost-multiplier";

function fmtCents(c: number | null | undefined): string {
  if (c == null) return "—";
  return `$${(c / 100).toFixed(2)}`;
}
function fmtUsd(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

// The two cost summary cards ("AI Agents" = LLM, "Deep Research" = Exa) + the
// Vercel account balance line. Each card links to the per-source detail on this
// same page (?source=llm|exa). All costs are ×mult for the viewer (super = 1).
export function SpendSummary({
  vercel,
  recorded,
  costMult,
}: {
  vercel: VercelCreditsResult;
  recorded: RecordedSpend | null;
  costMult: number;
}) {
  const total = recorded ? applyCostMultiplier(recorded.totalCents, costMult) : null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-2xl font-bold tracking-tight">Spend</h2>
        <span className="text-sm text-zinc-400 tabular-nums">
          {total != null ? `${fmtCents(total)} total` : ""}
        </span>
      </div>
      <p className="text-xs text-zinc-500 -mt-1">
        Actual cost, summed from every eval. Each number is the real charge from
        its source. Sortable detail below.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card label="AI Agents">
          <div className="text-3xl font-bold tabular-nums">{fmtCents(applyCostMultiplier(recorded?.llmCents, costMult))}</div>
          <div className="text-xs text-zinc-500 mt-1">
            real cost from Vercel per-generation billing
            {vercel.ok && (
              <span className="block text-[10px] text-zinc-600 mt-0.5 tabular-nums">
                Vercel account: {fmtUsd(vercel.data.totalUsedUsd)} used (lifetime) ·{" "}
                {fmtUsd(vercel.data.balanceUsd)} left
              </span>
            )}
            {!vercel.ok && (
              <span className="block text-[10px] text-amber-500 mt-0.5">
                account total unavailable — {vercel.error}
              </span>
            )}
          </div>
        </Card>
        <Card label="Deep Research">
          <div className="text-3xl font-bold tabular-nums">{fmtCents(applyCostMultiplier(recorded?.exaCents, costMult))}</div>
          <div className="text-xs text-zinc-500 mt-1">
            real cost from Exa response billing
            <span className="block text-[10px] text-zinc-600 mt-0.5">
              {recorded ? `${recorded.trackedEvals} evals tracked` : ""}
            </span>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Card({
  label,
  href,
  children,
}: {
  label: string;
  href?: string;
  children: React.ReactNode;
}) {
  const inner = (
    <>
      <div className="text-[11px] uppercase tracking-[0.15em] text-zinc-500 flex items-center justify-between">
        <span>{label}</span>
        {href && <span className="text-zinc-600">→</span>}
      </div>
      <div className="mt-2 flex-1">{children}</div>
    </>
  );
  const cls = "rounded-md border border-zinc-800 bg-zinc-950 p-4 flex flex-col";
  return href ? (
    <a href={href} className={`${cls} hover:border-zinc-600 transition-colors`}>
      {inner}
    </a>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
