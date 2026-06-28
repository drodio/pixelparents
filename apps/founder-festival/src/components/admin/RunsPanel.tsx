import { RerunButton } from "@/components/admin/RerunButton";
import { LocalTime } from "@/components/LocalTime";
import { applyCostMultiplier } from "@/lib/cost-multiplier";

export type RunRow = {
  id: string;
  title: string | null;
  model: string;
  status: string;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  estimatedCents: number | null;
  actualCents: number;
  createdAt: Date;
};

function fmtCents(c: number | null | undefined): string {
  if (c == null) return "—";
  return `$${(c / 100).toFixed(2)}`;
}

// Collapsible list of scoring runs (so queued/running jobs with no scored
// profiles yet are still findable). Native <details>; open if any job is active.
export function RunsPanel({
  jobs,
  canRun,
  costMult,
}: {
  jobs: RunRow[];
  canRun: boolean;
  costMult: number;
}) {
  const hasActive = jobs.some((j) => j.status === "queued" || j.status === "running");
  return (
    <details open={hasActive} className="border border-zinc-800 rounded-md">
      <summary className="cursor-pointer select-none px-4 py-2 text-sm text-zinc-300 hover:text-white">
        Runs ({jobs.length})
      </summary>
      <div className="overflow-x-auto border-t border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3">Title</th>
              <th className="text-left px-4 py-3">Model</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Progress</th>
              <th className="text-right px-4 py-3">Est / Actual</th>
              <th className="text-left px-4 py-3">Created</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 ? (
              <tr className="border-t border-zinc-800">
                <td colSpan={7} className="px-4 py-6 text-zinc-500 text-sm">No runs yet.</td>
              </tr>
            ) : (
              jobs.map((j) => (
                <tr key={j.id} className="border-t border-zinc-800 hover:bg-zinc-900">
                  <td className="px-4 py-3">
                    <a href={`/admin/profiles/${j.id}`} className="text-white hover:text-zinc-300">
                      {j.title ?? <span className="text-zinc-500">untitled</span>}
                    </a>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-400">{j.model}</td>
                  <td className="px-4 py-3"><StatusPill status={j.status} /></td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {j.completedItems + j.failedItems} / {j.totalItems}
                    {j.failedItems > 0 && <span className="text-red-400 ml-2">({j.failedItems} failed)</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-400 tabular-nums">
                    {fmtCents(applyCostMultiplier(j.estimatedCents, costMult))} / {fmtCents(applyCostMultiplier(j.actualCents, costMult))}
                  </td>
                  <td className="px-4 py-3 text-zinc-500"><LocalTime iso={j.createdAt.toISOString()} /></td>
                  <td className="px-4 py-3 text-right">
                    {canRun && ["completed", "failed", "cancelled"].includes(j.status) && (
                      <RerunButton jobId={j.id} totalItems={j.totalItems} />
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function StatusPill({ status }: { status: string }) {
  const color =
    status === "completed"
      ? "text-emerald-400 border-emerald-400/30 bg-emerald-400/10"
      : status === "running"
        ? "text-blue-400 border-blue-400/30 bg-blue-400/10"
        : status === "failed"
          ? "text-red-400 border-red-400/30 bg-red-400/10"
          : status === "cancelled"
            ? "text-zinc-400 border-zinc-600 bg-zinc-800"
            : "text-amber-400 border-amber-400/30 bg-amber-400/10";
  return <span className={`px-2 py-0.5 rounded-md border text-xs ${color}`}>{status}</span>;
}
