"use client";

import { useEffect, useRef, useState } from "react";

type Person = { id: string; name: string };
type AiOut = { html: string; ms: number; inputTokens: number; outputTokens: number; estCostUsd: number; model: string };
type ChiefOut = { html: string; ms: number; calls: number; credits: { total: number; ingress: number; egress: number } | null };

// Admin eval: generate personalized learnings for a chosen person via BOTH the AI
// Gateway and Chief, side by side, with cost/latency metrics so the delta is clear.
export function PersonalizedEval({ eventId }: { eventId: string }) {
  const [query, setQuery] = useState("DROdio");
  const [results, setResults] = useState<Person[]>([]);
  const [person, setPerson] = useState<Person | null>(null);
  const [ai, setAi] = useState<AiOut | null>(null);
  const [chief, setChief] = useState<ChiefOut | null>(null);
  const [busy, setBusy] = useState<"" | "ai" | "chief">("");
  const [err, setErr] = useState<string | null>(null);
  const gen = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || person) return;
    const my = ++gen.current;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/leaderboard/search?q=${encodeURIComponent(q)}`);
        const d = (await res.json()) as { rows?: Array<{ id: string; fullName?: string }> };
        if (gen.current === my) setResults((d.rows ?? []).filter((r) => r.fullName).slice(0, 6).map((r) => ({ id: r.id, name: r.fullName! })));
      } catch { /* ignore */ }
    }, 250);
    return () => clearTimeout(t);
  }, [query, person]);

  async function run(method: "ai" | "chief") {
    if (!person) return;
    setBusy(method);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/personalized`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ evalId: person.id, method }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `failed (${res.status})`);
      if (method === "ai") setAi(d);
      else setChief(d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy("");
    }
  }

  const prose =
    "prose-recap mt-2 leading-relaxed text-zinc-200 [&_a]:text-[#dfa43a] [&_h3]:font-semibold [&_h3]:text-zinc-100 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5";

  return (
    <div className="flex flex-col gap-5">
      {/* Person picker */}
      <div className="flex flex-col gap-1">
        <label className="text-sm text-zinc-400">Generate for</label>
        {person ? (
          <div className="flex items-center gap-3">
            <span className="rounded-md border border-[#dfa43a]/50 bg-[#dfa43a]/10 px-3 py-1 text-sm text-[#dfa43a]">{person.name}</span>
            <button type="button" onClick={() => { setPerson(null); setAi(null); setChief(null); }} className="text-xs text-zinc-500 hover:text-zinc-300">change</button>
          </div>
        ) : (
          <div className="relative max-w-sm">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name…"
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
            />
            {results.length > 0 && (
              <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-zinc-700 bg-zinc-900 shadow-xl">
                {results.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => { setPerson(r); setResults([]); }} className="block w-full px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800">{r.name}</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={!person || busy !== ""} onClick={() => run("ai")} className="rounded-md bg-[#dfa43a] px-4 py-2 text-sm font-medium text-black disabled:opacity-50">
          {busy === "ai" ? "Generating (AI)…" : "Generate · AI Gateway"}
        </button>
        <button type="button" disabled={!person || busy !== ""} onClick={() => run("chief")} className="rounded-md border border-[#dfa43a] px-4 py-2 text-sm font-medium text-[#dfa43a] disabled:opacity-50">
          {busy === "chief" ? "Generating (Chief)… can take minutes" : "Generate · Chief (research)"}
        </button>
      </div>
      {err && <p className="text-sm text-red-400">{err}</p>}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
          <h3 className="font-display text-lg font-semibold">AI Gateway · {ai?.model ?? "opus"}</h3>
          {ai ? (
            <>
              <p className="mt-1 text-xs text-zinc-500">
                {ai.inputTokens.toLocaleString()} in + {ai.outputTokens.toLocaleString()} out tokens ·
                est. <span className="text-zinc-300">${ai.estCostUsd.toFixed(4)}</span> · {(ai.ms / 1000).toFixed(1)}s
              </p>
              <div className={prose} dangerouslySetInnerHTML={{ __html: ai.html }} />
            </>
          ) : (
            <p className="mt-2 text-sm text-zinc-500">Not generated yet.</p>
          )}
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
          <h3 className="font-display text-lg font-semibold">Chief · research</h3>
          {chief ? (
            <>
              <p className="mt-1 text-xs text-zinc-500">
                {chief.calls} API call · {(chief.ms / 1000).toFixed(1)}s ·{" "}
                {chief.credits
                  ? <>credits <span className="text-zinc-300">{chief.credits.total.toLocaleString()}</span> ({chief.credits.ingress.toLocaleString()} in + {chief.credits.egress.toLocaleString()} out)</>
                  : "credits not reported"}
              </p>
              <div className={prose} dangerouslySetInnerHTML={{ __html: chief.html }} />
            </>
          ) : (
            <p className="mt-2 text-sm text-zinc-500">Not generated yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
