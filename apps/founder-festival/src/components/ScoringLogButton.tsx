"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ScoreDetail,
  type ScoreDetailData,
  type ScoreDetailMeta,
  type RecommendationsData,
  type Row,
} from "./ScoreDetail";
import { useMounted } from "@/lib/use-mounted";

// "Scoring Log" entry in the profile admin pill. Opens a modal table of every
// recorded scoring run (newest first); clicking a row rebuilds the Score Detail
// modal from that run's snapshot. Superadmin-only data — the API enforces it.

export type ScoringRunDTO = {
  id: string;
  evaluationId: string;
  createdAt: string;
  founderScore: number;
  investorScore: number;
  score: number;
  signalQuality: string;
  companyStage: string | null;
  source: string;
  sourceCode: string | null;
  model: string | null;
  costTotalCents: number | null;
  snapshot: {
    linkedinUrl: string;
    breakdown: {
      founder: Row[];
      investor: Row[];
    };
    recommendations: unknown;
    exaGrounding: unknown;
    profile: unknown;
    meta?: ScoreDetailMeta | null;
  };
};

export function runToDetailData(run: ScoringRunDTO): ScoreDetailData {
  return {
    evaluationId: run.evaluationId,
    linkedinUrl: run.snapshot?.linkedinUrl ?? "",
    profile: run.snapshot?.profile ?? null,
    grounding: run.snapshot?.exaGrounding ?? null,
    founderBreakdown: run.snapshot?.breakdown?.founder ?? [],
    investorBreakdown: run.snapshot?.breakdown?.investor ?? [],
    founderScore: run.founderScore,
    investorScore: run.investorScore,
    combinedScore: run.score,
    signalQuality: run.signalQuality,
    companyStage: run.companyStage,
    source: run.source,
    sourceCode: run.sourceCode,
    // A run is a point-in-time fact, so created === updated for the detail view.
    createdAt: run.createdAt,
    updatedAt: run.createdAt,
    recommendations: (run.snapshot?.recommendations ?? null) as RecommendationsData | null,
    meta: run.snapshot?.meta ?? null,
  };
}

function fmtCost(cents: number | null): string {
  if (cents === null || cents === undefined) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ScoringLogButton({
  evaluationId,
  autoOpen,
}: {
  evaluationId: string;
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(autoOpen ?? false);
  const [runs, setRuns] = useState<ScoringRunDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Starts true on autoOpen so the modal shows "Loading…" immediately without a
  // synchronous setState in the mount effect below.
  const [loading, setLoading] = useState(autoOpen ?? false);
  const [selected, setSelected] = useState<ScoringRunDTO | null>(null);
  // See ScoreDetail: the pill's backdrop-blur clips fixed children, so the modal
  // must portal to <body>. useMounted guards SSR (createPortal needs document).
  const mounted = useMounted();

  // No SYNCHRONOUS setState — the first statement is an await — so this is safe
  // to call straight from an effect (no cascading-render lint violation). All
  // state updates happen after the fetch resolves.
  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/profile/${evaluationId}/scoring-runs`);
      const data: { ok?: boolean; runs?: ScoringRunDTO[]; error?: string } = await res
        .json()
        .catch(() => ({}));
      if (!res.ok || !data.ok || !data.runs) {
        setError(data.error ?? "Couldn't load scoring log.");
        return;
      }
      setRuns(data.runs);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [evaluationId]);

  // Kick the fetch once when the component mounted already-open (autoOpen via
  // ?debug=1). The normal path fetches from the click handler instead. load()
  // only setStates after the fetch resolves, so there's no cascading render;
  // the lint rule can't see through the async boundary (same pattern as
  // DeveloperConsole.tsx).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (autoOpen) void load();
  }, [autoOpen, load]);

  function openLog() {
    setOpen(true);
    if (runs === null) {
      setLoading(true);
      void load();
    }
  }

  function close() {
    setOpen(false);
    setSelected(null);
  }

  return (
    <>
      <button onClick={openLog} className="link text-xs sm:text-sm cursor-pointer">
        Scoring Log
      </button>

      {open && selected && (
        <ScoreDetail
          data={runToDetailData(selected)}
          onClose={close}
          onBack={() => setSelected(null)}
        />
      )}

      {open && !selected && mounted && createPortal(
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start justify-center p-4 sm:p-8 overflow-y-auto"
          onClick={close}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#1c1c1c] border border-zinc-800 rounded-lg max-w-2xl w-full my-8 p-6 sm:p-8 flex flex-col gap-6 text-zinc-100"
          >
            <div className="flex justify-between items-center">
              <h2 className="font-display text-2xl font-bold">Scoring Log</h2>
              <button onClick={close} className="text-zinc-500 hover:text-zinc-200 text-sm">
                Close ✕
              </button>
            </div>

            {loading && <p className="text-sm text-zinc-400">Loading…</p>}
            {error && <p className="text-sm text-red-400">{error}</p>}
            {!loading && !error && runs && runs.length === 0 && (
              <p className="text-sm text-zinc-400 italic">
                No scoring runs recorded yet. The next re-score will appear here.
              </p>
            )}

            {!loading && !error && runs && runs.length > 0 && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-[0.15em] text-zinc-500 border-b border-zinc-800">
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="py-2 px-2 font-medium text-right">Founder</th>
                    <th className="py-2 px-2 font-medium text-right">Investor</th>
                    <th className="py-2 px-2 font-medium text-right">Combined</th>
                    <th className="py-2 px-2 font-medium">Signal</th>
                    <th className="py-2 pl-2 font-medium text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr
                      key={run.id}
                      onClick={() => setSelected(run)}
                      className="border-b border-zinc-800/60 cursor-pointer hover:bg-white/5 transition-colors"
                    >
                      <td className="py-2 pr-3 text-zinc-200">{fmtDate(run.createdAt)}</td>
                      <td className="py-2 px-2 text-right font-mono text-zinc-300 tabular-nums">
                        {run.founderScore.toLocaleString()}
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-zinc-300 tabular-nums">
                        {run.investorScore.toLocaleString()}
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-zinc-100 tabular-nums">
                        {run.score.toLocaleString()}
                      </td>
                      <td className="py-2 px-2 text-zinc-400">{run.signalQuality}</td>
                      <td className="py-2 pl-2 text-right font-mono text-zinc-400 tabular-nums">
                        {fmtCost(run.costTotalCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {!loading && !error && runs && runs.length > 0 && (
              <p className="text-xs text-zinc-500">
                Click a row to see that run&apos;s full score detail.
              </p>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
