"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { applyCostMultiplier } from "@/lib/cost-multiplier";

type Job = {
  id: string;
  title: string | null;
  model: string;
  status: string;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  estimatedCents: number | null;
  actualCents: number;
  rerunOfJobId: string | null;
};

type Item = {
  id: string;
  inputRaw: string;
  linkedinUrl: string | null;
  evaluationId: string | null;
  status: string;
  error: string | null;
  evalFullName: string | null;
  evalLlmCents: number | null;
  evalExaCents: number | null;
};

function fmt(cents: number | null | undefined) {
  if (cents == null) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}
function sumCents(items: Item[], pick: (it: Item) => number | null): number {
  return items.reduce((acc, it) => acc + (pick(it) ?? 0), 0);
}

const TERMINAL = ["completed", "failed", "cancelled"];

// Live job header + progress bar for /admin/profiles/[jobId]. Polls the job,
// drives the cron tick on localhost, and shows only the not-yet-scored items
// (scored ones render in the rich profiles table below). On the job reaching a
// terminal status it refreshes the server component once to pull in new profiles.
export function JobLiveProgress({ jobId, costMultiplier }: { jobId: string; costMultiplier: number }) {
  const router = useRouter();
  const costFmt = (c: number | null | undefined) => fmt(applyCostMultiplier(c, costMultiplier));
  const [data, setData] = useState<{ job: Job; items: Item[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tickingRef = useRef(false);
  const refreshedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const isLocalhost =
      typeof window !== "undefined" &&
      /^(localhost|127\.0\.0\.1)(:|$)/.test(window.location.hostname || "");

    async function driveCronTick(status: string) {
      if (!isLocalhost) return;
      if (status !== "queued" && status !== "running") return;
      if (tickingRef.current) return;
      tickingRef.current = true;
      try {
        await fetch("/api/cron/scoring-tick");
        if (!cancelled) await poll();
      } catch {
        /* ignore — next interval retries */
      } finally {
        tickingRef.current = false;
      }
    }

    async function poll() {
      try {
        const res = await fetch(`/api/admin/jobs/${jobId}`);
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          if (!cancelled) setError(json.error || `HTTP ${res.status}`);
          return;
        }
        const json = await res.json();
        if (cancelled) return;
        setData(json);
        setError(null);
        if (TERMINAL.includes(json.job.status)) {
          if (!refreshedRef.current) {
            refreshedRef.current = true;
            router.refresh();
          }
        } else {
          void driveCronTick(json.job.status);
        }
      } catch {
        if (!cancelled) setError("network error");
      }
    }
    poll();
    const id = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [jobId, router]);

  if (error) return <div className="text-red-400 text-sm">Live progress error: {error}</div>;
  if (!data) return <div className="text-zinc-500 text-sm">Loading run status…</div>;

  const { job, items } = data;
  // Items still in-flight render as ghost rows inside ProfilesScoredTable
  // (see liveJobId on the page). Here we only need the count to decide
  // whether to keep showing the progress bar vs. collapse to the summary.
  const stillPending = items.some((it) => it.status !== "done");
  const pct =
    job.totalItems > 0
      ? Math.round(((job.completedItems + job.failedItems) / job.totalItems) * 100)
      : 0;
  const llmCents = sumCents(items, (it) => it.evalLlmCents);
  const exaCents = sumCents(items, (it) => it.evalExaCents);
  const terminal = TERMINAL.includes(job.status);

  if (terminal && !stillPending) {
    return (
      <p className="text-sm text-zinc-500 tabular-nums">
        {job.model} · {job.status} · {job.completedItems}/{job.totalItems} done · est{" "}
        {costFmt(job.estimatedCents)} / actual {costFmt(job.actualCents)}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        {job.rerunOfJobId && (
          <a href={`/admin/profiles/${job.rerunOfJobId}`} className="text-xs text-[#dfa43a] hover:underline">
            ↻ re-run of an earlier job
          </a>
        )}
        <p className="text-sm text-zinc-500 tabular-nums">
          {job.model} · {job.status} · {job.completedItems}/{job.totalItems} done
          {job.failedItems > 0 && `, ${job.failedItems} failed`} · est {costFmt(job.estimatedCents)} / actual{" "}
          {costFmt(job.actualCents)}
        </p>
        <p className="text-xs text-zinc-600 tabular-nums">
          LLM {costFmt(llmCents)} · Exa {costFmt(exaCents)}
          <span className="text-zinc-700"> (eval costs; actual also includes handle resolution)</span>
        </p>
      </div>

      <div className="h-2 bg-zinc-900 rounded-full overflow-hidden">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
