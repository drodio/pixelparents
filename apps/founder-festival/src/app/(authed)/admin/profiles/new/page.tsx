import { NewJobForm } from "@/components/admin/NewJobForm";
import { getEstimateCents, HANDLE_RESOLVE_CENTS, adminGate } from "@/lib/admin";
import { can, getViewerCostMultiplier } from "@/lib/grants";
import { applyCostMultiplier } from "@/lib/cost-multiplier";
import { NotAuthorized } from "@/components/admin/NotAuthorized";

export const dynamic = "force-dynamic";

export default async function NewJobPage() {
  const gate = await adminGate();
  if (!gate.ok) return <NotAuthorized email={gate.email} />;
  if (!(await can("run_scoring_jobs"))) return <NotAuthorized email={null} />;
  const [sonnet, opus] = await Promise.all([
    getEstimateCents("sonnet"),
    getEstimateCents("opus"),
  ]);
  const costMult = await getViewerCostMultiplier();
  const show = (c: number) => applyCostMultiplier(c, costMult) ?? c;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl font-bold tracking-tight">Score Founders &amp; Investors</h1>
      <NewJobForm
        perEvalCents={{ sonnet: show(sonnet), opus: show(opus) }}
        resolveCents={show(HANDLE_RESOLVE_CENTS)}
      />
    </div>
  );
}
