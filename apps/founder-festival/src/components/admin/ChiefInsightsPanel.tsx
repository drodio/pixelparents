"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Attendee = { evaluationId: string; name: string | null };

// "Run Chief to generate insights" — bulk generation for an event's matched
// attendees. Two tools share one sequential runner (Chief is slow + credit-
// metered): Personalized Learnings and Recommended Connections ("Attendee
// Insights"). Each skips attendees that already have that kind, then refreshes
// the page so the new results show in the attendee rows below.
export function ChiefInsightsPanel({
  eventId,
  attendees,
  haveLearnings,
  haveConnections,
}: {
  eventId: string;
  attendees: Attendee[];
  haveLearnings: string[];
  haveConnections: string[];
}) {
  const router = useRouter();
  const [running, setRunning] = useState<null | "learnings" | "connections">(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const matched = attendees.filter((a) => a.evaluationId);
  const learnedSet = new Set(haveLearnings);
  const connectedSet = new Set(haveConnections);

  async function run(kind: "learnings" | "connections") {
    if (running) return;
    const path = kind === "connections" ? "connections" : "personalized";
    const have = kind === "connections" ? connectedSet : learnedSet;
    const todo = matched.filter((a) => !have.has(a.evaluationId));
    const label = kind === "connections" ? "attendee insights" : "personalized learnings";
    if (todo.length === 0) {
      setMsg(`All matched attendees already have ${label}.`);
      return;
    }
    setRunning(kind);
    setMsg(null);
    setProgress({ done: 0, total: todo.length });
    let ok = 0;
    let fail = 0;
    // Each request only SUBMITS to Chief (fast); the chief-insights-sweep cron
    // generates in the background. So we kick them all off, then the attendee
    // rows show live "Generating…" status and update as answers land.
    for (let i = 0; i < todo.length; i++) {
      try {
        const res = await fetch(`/api/admin/events/${eventId}/${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ evalId: todo[i]!.evaluationId, method: "chief", async: true }),
        });
        if (res.ok) ok++;
        else fail++;
      } catch {
        fail++;
      }
      setProgress({ done: i + 1, total: todo.length });
    }
    setRunning(null);
    setProgress(null);
    setMsg(
      `Submitted ${ok} ${label} to Chief${fail ? `, ${fail} failed to submit` : ""}. ` +
        `They generate in the background (a few minutes each) — watch each attendee's row for live status.`,
    );
    router.refresh(); // show the rows as "Generating…"
  }

  const btn =
    "rounded-md border border-[#dfa43a]/60 px-3 py-1.5 text-sm text-[#dfa43a] hover:bg-[#dfa43a]/10 disabled:opacity-40";

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-zinc-500">
        Submits a Chief (research) generation for every matched attendee, skipping anyone who already
        has that insight or is mid-generation. It runs in the background (a few minutes each) — you can
        leave this page. Each attendee&apos;s row below shows live status (Personalized Learnings ·
        Attendee Insights).
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => run("learnings")} disabled={running !== null} className={btn}>
          {running === "learnings" && progress
            ? `Submitting ${progress.done}/${progress.total}…`
            : "Generate Personalized Learnings"}
        </button>
        <button type="button" onClick={() => run("connections")} disabled={running !== null} className={btn}>
          {running === "connections" && progress
            ? `Submitting ${progress.done}/${progress.total}…`
            : "Recommended Connections"}
        </button>
        <span className="text-xs text-zinc-600">
          {matched.length} matched · {learnedSet.size} w/ learnings · {connectedSet.size} w/ insights
        </span>
      </div>
      {msg && <p className="text-sm text-zinc-400">{msg}</p>}
    </div>
  );
}
