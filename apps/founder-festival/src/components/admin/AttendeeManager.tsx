"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { LeaderboardRow } from "@/lib/leaderboard";
import type { AdminAttendeeRow, AttendeeScoringStatus, ProbableMatch } from "@/lib/event-attendees-admin";
import { ScoreThemPrompt } from "@/components/ScoreThemPrompt";

function StatusChip({ status }: { status?: AttendeeScoringStatus }) {
  if (!status) return null;
  if (status === "queued") {
    return (
      <span className="shrink-0 rounded-full border border-zinc-600 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
        Queued
      </span>
    );
  }
  if (status === "scoring") {
    return (
      <span className="animate-pulse shrink-0 rounded-full border border-amber-500/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-300">
        Scoring…
      </span>
    );
  }
  if (status === "complete") {
    return (
      <span className="shrink-0 rounded-full border border-emerald-500/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-400">
        Complete
      </span>
    );
  }
  // failed
  return (
    <span className="shrink-0 rounded-full border border-red-500/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-red-400">
      Failed
    </span>
  );
}

const MIN_CHARS = 2;
const MAX_RESULTS = 8;

type StoredLearning = { html: string; method: string; generatedAt: string; status: string; error: string | null };

// Does this insight have real, generated content? Green only when it's "done"
// AND has non-empty body text (generating / failed / never-run / empty → red).
export function hasInsightContent(entry: StoredLearning | undefined): boolean {
  return !!entry && entry.status === "done" && entry.html.replace(/<[^>]*>/g, "").trim().length > 0;
}

// One status dot — green when the insight exists, red when it's missing.
function ContentDot({ filled, kind }: { filled: boolean; kind: string }) {
  const label = `${kind}: ${filled ? "present" : "missing"}`;
  return (
    <span
      title={label}
      aria-label={label}
      className={`inline-block h-[5px] w-[5px] shrink-0 rounded-full ${filled ? "bg-emerald-500" : "bg-red-500"}`}
    />
  );
}

// The two per-attendee insight dots shown next to the name: Personalized
// Learnings, then Attendee Insights.
function ContentDots({ learn, conn }: { learn: StoredLearning | undefined; conn: StoredLearning | undefined }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      <ContentDot filled={hasInsightContent(learn)} kind="Personalized Learnings" />
      <ContentDot filled={hasInsightContent(conn)} kind="Attendee Insights" />
    </span>
  );
}

const INSIGHT_PROSE =
  "prose-recap text-sm leading-relaxed text-zinc-200 [&_a]:text-[#dfa43a] [&_h3]:font-semibold [&_h3]:text-zinc-100 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5";

// Merge server-truth insight props with optimistic overrides. An optimistic
// "generating" entry WINS over the server entry until the server has something
// strictly newer than the click (its generatedAt is later) — so re-generating an
// already-"done" row shows "Generating…" immediately and keeps polling, instead
// of the stale "done" prop masking it.
function mergeInsights(
  props: Record<string, StoredLearning>,
  optimistic: Record<string, StoredLearning>,
): Record<string, StoredLearning> {
  const out: Record<string, StoredLearning> = { ...props };
  for (const [id, o] of Object.entries(optimistic)) {
    if (o.status !== "generating") continue;
    const p = props[id];
    // Optimistic "generating" wins only while the server entry is strictly OLDER
    // than the click. A missing or unparseable (NaN) prop timestamp counts as
    // older (optimistic wins); an equal-or-newer server entry wins (so a freshly
    // written "done" is never masked).
    const propTime = p ? new Date(p.generatedAt).getTime() : -Infinity;
    const optTime = new Date(o.generatedAt).getTime();
    if (!(propTime >= optTime)) out[id] = o;
  }
  return out;
}

// "3m" / "just now" — rough elapsed since a generation was submitted.
function elapsedLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  return `${m}m ago`;
}

// One collapsible Chief-insight sub-section inside an expanded attendee row
// ("Personalized Learnings" or "Attendee Insights"). Renders the live async
// status: generating (spinner), done (HTML + Re-generate), failed (error +
// retry), or never-generated (Generate). `submitting` = the submit POST is
// in flight (the brief gap before the row becomes "generating").
function InsightAccordion({
  title,
  open,
  onToggle,
  stored,
  submitting,
  onGenerate,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  stored: StoredLearning | undefined;
  submitting: boolean;
  onGenerate: () => void;
}) {
  const status = stored?.status;
  const isGenerating = submitting || status === "generating";
  const chip =
    isGenerating
      ? { cls: "border-amber-500/50 text-amber-300", text: "Generating…" }
      : status === "done"
        ? { cls: "border-emerald-500/40 text-emerald-400", text: "Generated" }
        : status === "failed"
          ? { cls: "border-red-500/50 text-red-400", text: "Failed" }
          : null;

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/40">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-zinc-200 hover:bg-zinc-800/40"
      >
        <span className="w-3 shrink-0 text-zinc-500">{open ? "▾" : "▸"}</span>
        <span className="flex-1">{title}</span>
        {chip ? (
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${chip.cls} ${isGenerating ? "animate-pulse" : ""}`}>
            {chip.text}
          </span>
        ) : (
          <span className="shrink-0 text-[10px] uppercase tracking-wide text-zinc-600">None yet</span>
        )}
      </button>
      {open && (
        <div className="border-t border-zinc-800 px-4 py-3">
          {isGenerating ? (
            <p className="text-sm text-amber-300/90">
              <span className="animate-pulse">●</span> Generating via Chief (research) — this can take several
              minutes{stored?.status === "generating" ? ` · started ${elapsedLabel(stored.generatedAt)}` : ""}. It
              keeps running even if you leave this page; the status updates automatically.
            </p>
          ) : status === "done" ? (
            <>
              <div className={INSIGHT_PROSE} dangerouslySetInnerHTML={{ __html: stored!.html }} />
              <div className="mt-2 flex items-center gap-3">
                <span className="text-[10px] uppercase tracking-wide text-zinc-600">{stored!.method}</span>
                <button type="button" onClick={onGenerate} className="text-xs text-[#dfa43a] hover:underline">
                  Re-generate
                </button>
              </div>
            </>
          ) : status === "failed" ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-red-400">Generation failed{stored?.error ? `: ${stored.error}` : "."}</p>
              <button
                type="button"
                onClick={onGenerate}
                className="self-start rounded-md border border-[#dfa43a]/60 px-2.5 py-1 text-xs text-[#dfa43a] hover:bg-[#dfa43a]/10"
              >
                Retry (Chief)
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-sm text-zinc-500">Not generated yet.</span>
              <button
                type="button"
                onClick={onGenerate}
                className="rounded-md border border-[#dfa43a]/60 px-2.5 py-1 text-xs text-[#dfa43a] hover:bg-[#dfa43a]/10"
              >
                Generate (Chief)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AttendeeManager({
  eventId,
  initialAttendees,
  canRescore,
  rescoreableCount,
  initialLearnings = {},
  initialConnections = {},
  initialScoringStatuses,
}: {
  eventId: string;
  initialAttendees: AdminAttendeeRow[];
  canRescore: boolean;
  // Exact number the re-score job will queue (matches the route's logic), so the
  // button label == what gets re-scored. Includes low-signal + name-resolved
  // profiles that the per-row "matched" flag (leaderboard-derived) excludes.
  rescoreableCount: number;
  // Stored personalized learnings keyed by evaluation id (shown in expandable rows).
  initialLearnings?: Record<string, StoredLearning>;
  // Stored "Attendee Insights" (Recommended Connections) keyed by evaluation id.
  initialConnections?: Record<string, StoredLearning>;
  initialScoringStatuses: Record<string, AttendeeScoringStatus>;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LeaderboardRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [rescoreMsg, setRescoreMsg] = useState<string | null>(null);
  const [rescoring, setRescoring] = useState(false);
  const [rescoreOneId, setRescoreOneId] = useState<string | null>(null); // per-row re-score in flight
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  // Per-attendee Chief insights. The server props (initialLearnings/Connections)
  // are the source of truth — refreshed via router.refresh() when generations
  // settle. We keep only small OPTIMISTIC overrides for the gap between a click
  // and the next refresh; props win in the merge once they catch up.
  const [learnOptimistic, setLearnOptimistic] = useState<Record<string, StoredLearning>>({});
  const [connOptimistic, setConnOptimistic] = useState<Record<string, StoredLearning>>({});
  const learnings = useMemo(() => mergeInsights(initialLearnings, learnOptimistic), [learnOptimistic, initialLearnings]);
  const connections = useMemo(() => mergeInsights(initialConnections, connOptimistic), [connOptimistic, initialConnections]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [subOpen, setSubOpen] = useState<Set<string>>(new Set()); // keys: `${evalId}:learn` | `${evalId}:conn`
  const [genId, setGenId] = useState<string | null>(null); // personalized per-row in flight
  const [genConnId, setGenConnId] = useState<string | null>(null); // connections per-row in flight
  const [genMsg, setGenMsg] = useState<string | null>(null);

  function toggleExpand(evalId: string) {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(evalId)) n.delete(evalId);
      else n.add(evalId);
      return n;
    });
  }
  function toggleSub(key: string) {
    setSubOpen((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }

  // Kick off one kind of insight for one attendee. The route SUBMITS to Chief and
  // returns immediately ("generating"); the chief-insights-sweep cron stores the
  // answer. We optimistically flip the row to "generating" and let polling pick up
  // the result.
  async function generateOne(evalId: string, kind: "learnings" | "connections"): Promise<boolean> {
    const path = kind === "connections" ? "connections" : "personalized";
    const res = await fetch(`/api/admin/events/${eventId}/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ evalId, method: "chief", async: true }),
    });
    const d = (await res.json().catch(() => ({}))) as { status?: string; error?: string };
    if (res.ok) {
      const entry: StoredLearning = { html: "", method: "chief", generatedAt: new Date().toISOString(), status: "generating", error: null };
      if (kind === "connections") setConnOptimistic((c) => ({ ...c, [evalId]: entry }));
      else setLearnOptimistic((l) => ({ ...l, [evalId]: entry }));
      return true;
    }
    setGenMsg(`Error for one attendee: ${d.error ?? res.status}`);
    return false;
  }

  async function genRow(evalId: string, kind: "learnings" | "connections") {
    const setBusy = kind === "connections" ? setGenConnId : setGenId;
    setBusy(evalId);
    setGenMsg(null);
    try {
      await generateOne(evalId, kind);
    } finally {
      setBusy(null);
    }
  }
  const [statuses, setStatuses] = useState<Record<string, AttendeeScoringStatus>>(initialScoringStatuses);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const genRef = useRef(0);

  const trimmed = query.trim();
  const active = trimmed.length >= MIN_CHARS;

  // Debounced search against the same endpoint HeaderSearch uses.
  useEffect(() => {
    if (!active) {
      genRef.current++;
      return;
    }
    const myGen = ++genRef.current;
    let cancelled = false;
    const handle = setTimeout(() => {
      setLoading(true);
      void (async () => {
        try {
          const res = await fetch(`/api/leaderboard/search?q=${encodeURIComponent(trimmed)}`);
          if (!res.ok) throw new Error(String(res.status));
          const data: { rows: LeaderboardRow[] } = await res.json();
          if (!cancelled && genRef.current === myGen) {
            setResults(data.rows);
            setLoading(false);
          }
        } catch {
          if (!cancelled && genRef.current === myGen) {
            setResults([]);
            setLoading(false);
          }
        }
      })();
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [trimmed, active]);

  // Close dropdown on outside click / Escape.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setFocused(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setFocused(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  async function refreshStatuses() {
    try {
      const res = await fetch(`/api/admin/events/${eventId}/attendees/scoring-status`);
      if (!res.ok) return;
      const data: { statuses?: Record<string, AttendeeScoringStatus> } = await res.json();
      setStatuses(data.statuses ?? {});
    } catch {
      /* non-fatal — polling will retry */
    }
  }

  // Poll every 4 s while any attendee is queued or scoring.
  useEffect(() => {
    const hasActive = Object.values(statuses).some((s) => s === "queued" || s === "scoring");
    if (!hasActive) return;

    let cancelled = false;
    const id = setInterval(() => {
      if (cancelled) return;
      void (async () => {
        try {
          const res = await fetch(`/api/admin/events/${eventId}/attendees/scoring-status`);
          if (cancelled || !res.ok) return;
          const data: { statuses?: Record<string, AttendeeScoringStatus> } = await res.json();
          if (!cancelled) setStatuses(data.statuses ?? {});
        } catch {
          /* non-fatal */
        }
      })();
    }, 4000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [statuses, eventId]);

  // Poll the lightweight insight-status endpoint every 6 s while any insight is
  // generating; when one settles (done/failed) — including ones kicked off by the
  // bulk panel — refresh so the server props carry the new HTML/status. router
  // .refresh() is not setState, so this stays lint-clean.
  useEffect(() => {
    const anyGenerating =
      Object.values(learnings).some((v) => v.status === "generating") ||
      Object.values(connections).some((v) => v.status === "generating");
    if (!anyGenerating) return;

    let cancelled = false;
    const tick = setInterval(() => {
      if (cancelled) return;
      void (async () => {
        try {
          const res = await fetch(`/api/admin/events/${eventId}/insights-status`);
          if (cancelled || !res.ok) return;
          const data = (await res.json()) as {
            learnings?: Record<string, string>;
            connections?: Record<string, string>;
          };
          const settled = (local: Record<string, StoredLearning>, srv?: Record<string, string>) =>
            Object.entries(local).some(
              ([id, v]) => v.status === "generating" && srv?.[id] && srv[id] !== "generating",
            );
          if (settled(learnings, data.learnings) || settled(connections, data.connections)) {
            router.refresh(); // a generation finished → reload to get the HTML/status
          }
        } catch {
          /* non-fatal — next tick retries */
        }
      })();
    }, 6000);

    return () => {
      cancelled = true;
      clearInterval(tick);
    };
  }, [learnings, connections, eventId, router]);

  async function add(evaluationId: string) {
    setAdding(true);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/attendees`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ evaluationId }),
      });
      if (res.ok) {
        setActionMsg(null);
        setQuery("");
        setResults(null);
        setFocused(false);
        router.refresh();
      } else {
        let errJson: { error?: string } = {};
        try { errJson = await res.json(); } catch { /* ignore */ }
        setActionMsg("Couldn’t add attendee (" + (errJson.error ?? res.status) + ")");
      }
    } catch {
      setActionMsg("Couldn’t add attendee (network error)");
    } finally {
      setAdding(false);
    }
  }

  // Link an unmatched row to a profile (Apply a probable match, or an override
  // pick). PATCHes the row's evaluationId, then refreshes.
  async function link(attendeeId: string, evaluationId: string) {
    setBusyId(attendeeId);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/attendees/${attendeeId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ evaluationId }),
      });
      if (res.ok) {
        setActionMsg(null);
        router.refresh();
      } else {
        let errJson: { error?: string } = {};
        try { errJson = await res.json(); } catch { /* ignore */ }
        setActionMsg("Couldn’t apply match (" + (errJson.error ?? res.status) + ")");
      }
    } catch {
      setActionMsg("Couldn’t apply match (network error)");
    } finally {
      setBusyId(null);
    }
  }

  async function scoreLinkedin(attendeeId: string) {
    setBusyId(attendeeId);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/attendees/${attendeeId}/score`, {
        method: "POST",
      });
      if (res.ok) {
        setActionMsg("Scoring… (refreshing shortly)");
        setTimeout(() => router.refresh(), 1500);
      } else {
        let errJson: { error?: string } = {};
        try { errJson = await res.json(); } catch { /* ignore */ }
        if (errJson.error === "insufficient_credits") {
          setActionMsg("Insufficient credits — top up at /admin/credits");
        } else {
          setActionMsg("Couldn't score LinkedIn (" + (errJson.error ?? res.status) + ")");
        }
      }
    } catch {
      setActionMsg("Couldn't score LinkedIn (network error)");
    } finally {
      setBusyId(null);
    }
  }

  // Re-score one matched attendee (per-row button) — same backend job path as
  // "Re-Score All", narrowed to this eval. Seeds the per-row status chip on success.
  async function rescoreOne(evalId: string, name: string | null) {
    if (!confirm(`Re-score ${name ?? "this attendee"}? This kicks off a background scoring job and spends credits.`)) {
      return;
    }
    setRescoreOneId(evalId);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/rescore-attendees`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ evaluationId: evalId }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        void refreshStatuses();
      } else if (json.error === "insufficient_credits") {
        setActionMsg("Insufficient credits — top up at /admin/credits.");
      } else if (json.error === "not_rescoreable") {
        setActionMsg("This attendee can't be re-scored (manual score or unmatched).");
      } else {
        setActionMsg(`Error: ${json.error ?? res.status}`);
      }
    } catch {
      setActionMsg("Error kicking off re-score.");
    } finally {
      setRescoreOneId(null);
    }
  }

  async function remove(attendeeId: string) {
    setBusyId(attendeeId);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/attendees/${attendeeId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setActionMsg(null);
        router.refresh();
      } else {
        let errJson: { error?: string } = {};
        try { errJson = await res.json(); } catch { /* ignore */ }
        setActionMsg("Couldn’t remove attendee (" + (errJson.error ?? res.status) + ")");
      }
    } catch {
      setActionMsg("Couldn’t remove attendee (network error)");
    } finally {
      setBusyId(null);
    }
  }

  async function rescoreAll() {
    if (rescoreableCount === 0) return;
    if (!confirm(`Re-score ${rescoreableCount} attendee(s)? This kicks off a background scoring job and spends credits.`)) {
      return;
    }
    setRescoring(true);
    setRescoreMsg(null);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/rescore-attendees`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (res.ok) {
        // Clear any prior message and seed the per-row chips via a fresh poll.
        setRescoreMsg(null);
        void refreshStatuses();
      } else if (json.error === "insufficient_credits") {
        setRescoreMsg("Insufficient credits — top up at /admin/credits.");
      } else {
        setRescoreMsg(`Error: ${json.error ?? res.status}`);
      }
    } catch {
      setRescoreMsg("Error kicking off re-score.");
    } finally {
      setRescoring(false);
    }
  }

  const visible = results ? results.slice(0, MAX_RESULTS) : [];
  const settledEmpty = active && !loading && results !== null && results.length === 0;
  // Evaluation ids already on the attendee list — search results matching these
  // show "Already listed" instead of "+ Add" and can't be re-added.
  const attendeeEvalIds = new Set(
    initialAttendees.map((a) => a.evaluationId).filter((id): id is string => !!id),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">
          Starts from the Luma guest list. Add people who attended but weren&apos;t on the RSVP list, or remove no-shows.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {canRescore && (
            <button
              type="button"
              onClick={rescoreAll}
              disabled={rescoring || rescoreableCount === 0}
              className="rounded-md border border-amber-500/60 px-3 py-1.5 text-sm text-amber-300 hover:bg-amber-500/10 disabled:opacity-40"
            >
              {rescoring ? "Queuing…" : `Re-Score All (${rescoreableCount})`}
            </button>
          )}
        </div>
      </div>
      {genMsg && <p className="text-sm text-zinc-400">{genMsg}</p>}
      {rescoreMsg && <p className="text-sm text-zinc-400">{rescoreMsg}</p>}
      {actionMsg && <p className="text-sm text-red-400">{actionMsg}</p>}

      {/* Add by search — same backend + ScoreThemPrompt fallback as HeaderSearch. */}
      <div ref={containerRef} className="relative">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          placeholder="Add attendee — search by name…"
          aria-label="Search attendees by name"
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none"
        />
        {focused && active && (
          <div className="absolute left-0 z-50 mt-1 w-full max-w-md overflow-hidden rounded-md border border-zinc-800 bg-[#151515] shadow-xl shadow-black/40">
            {loading && (results === null || results.length === 0) ? (
              <div className="px-3 py-3 text-sm text-zinc-500">Searching…</div>
            ) : settledEmpty ? (
              <ScoreThemPrompt name={trimmed} />
            ) : (
              <ul className="max-h-[50vh] overflow-y-auto py-1">
                {visible.map((row) => {
                  const already = attendeeEvalIds.has(row.id);
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        disabled={adding || already}
                        onClick={() => !already && add(row.id)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-zinc-800/60 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:opacity-60"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm text-zinc-100">
                          {row.fullName ?? "(unnamed)"}
                          {row.companyName && <span className="text-zinc-500">, {row.companyName}</span>}
                        </span>
                        <span className="shrink-0 font-mono text-xs tabular-nums text-zinc-400">
                          {row.combinedScore.toLocaleString("en-US")}
                        </span>
                        <span className={`shrink-0 text-xs ${already ? "text-zinc-500" : "text-[#dfa43a]"}`}>
                          {already ? "Already listed" : "+ Add"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Current attendees */}
      {initialAttendees.length === 0 ? (
        <p className="text-sm text-zinc-500">No attendees yet. Run the Luma sync or add people above.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-800 rounded-md border border-zinc-800">
          {initialAttendees.map((a) => (
            <li key={a.id} className="flex flex-col">
              <div className="flex items-center gap-3 px-3 py-2">
              {a.evaluationId ? (
                <button
                  type="button"
                  onClick={() => toggleExpand(a.evaluationId!)}
                  aria-label="Toggle attendee insights"
                  className="w-4 shrink-0 text-zinc-500 hover:text-zinc-200"
                >
                  {expanded.has(a.evaluationId) ? "▾" : "▸"}
                </button>
              ) : (
                <span className="w-4 shrink-0" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                {a.matched && a.profileHref ? (
                  <span className="flex items-center gap-2">
                    <a href={a.profileHref} target="_blank" rel="noopener noreferrer" className="truncate text-sm text-zinc-200 hover:underline">
                      {a.name ?? "(unnamed)"}
                    </a>
                    {a.evaluationId && (
                      <ContentDots learn={learnings[a.evaluationId]} conn={connections[a.evaluationId]} />
                    )}
                    <StatusChip status={statuses[a.id]} />
                  </span>
                ) : (
                  <div className="flex flex-col gap-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm text-zinc-400">{a.name ?? "(unnamed)"} · unmatched</span>
                      {a.evaluationId && (
                        <ContentDots learn={learnings[a.evaluationId]} conn={connections[a.evaluationId]} />
                      )}
                      <StatusChip status={statuses[a.id]} />
                    </span>
                    {(a.email || a.linkedinUrl) && (
                      <span className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                        {a.email && <span>{a.email}</span>}
                        {a.linkedinUrl && (
                          <a
                            href={a.linkedinUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-zinc-400 hover:underline"
                          >
                            LinkedIn
                          </a>
                        )}
                        {a.linkedinUrl && (
                          <button
                            type="button"
                            disabled={busyId === a.id}
                            onClick={() => scoreLinkedin(a.id)}
                            className="rounded border border-blue-500/50 px-1.5 py-0.5 text-blue-400 hover:bg-blue-500/10 disabled:opacity-50"
                          >
                            {busyId === a.id ? "Scoring…" : "Score this LinkedIn"}
                          </button>
                        )}
                      </span>
                    )}
                    <MatchPicker
                      attendeeName={a.name}
                      probableMatch={a.probableMatch ?? null}
                      busy={busyId === a.id}
                      onLink={(evalId) => link(a.id, evalId)}
                    />
                  </div>
                )}
              </div>
              <span className="shrink-0 rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-500">
                {a.source}
              </span>
              <span className="w-12 shrink-0 text-right font-mono text-sm tabular-nums text-zinc-300">
                {a.combinedScore != null ? a.combinedScore.toLocaleString("en-US") : "—"}
              </span>
              {canRescore && a.evaluationId && (
                <button
                  type="button"
                  disabled={rescoreOneId === a.evaluationId}
                  onClick={() => rescoreOne(a.evaluationId!, a.name)}
                  className="shrink-0 rounded border border-amber-500/50 px-1.5 py-0.5 text-xs text-amber-300 hover:bg-amber-500/10 disabled:opacity-50"
                >
                  {rescoreOneId === a.evaluationId ? "Queuing…" : "Re-score"}
                </button>
              )}
              <button
                type="button"
                disabled={busyId === a.id}
                onClick={() => remove(a.id)}
                className="shrink-0 text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
              >
                Remove
              </button>
              </div>
              {a.evaluationId && expanded.has(a.evaluationId) && (
                <div className="flex flex-col gap-2 border-t border-zinc-800 bg-zinc-900/30 px-4 py-3">
                  <InsightAccordion
                    title="Personalized Learnings"
                    open={subOpen.has(`${a.evaluationId}:learn`)}
                    onToggle={() => toggleSub(`${a.evaluationId}:learn`)}
                    stored={learnings[a.evaluationId]}
                    submitting={genId === a.evaluationId}
                    onGenerate={() => genRow(a.evaluationId!, "learnings")}
                  />
                  <InsightAccordion
                    title="Attendee Insights"
                    open={subOpen.has(`${a.evaluationId}:conn`)}
                    onToggle={() => toggleSub(`${a.evaluationId}:conn`)}
                    stored={connections[a.evaluationId]}
                    submitting={genConnId === a.evaluationId}
                    onGenerate={() => genRow(a.evaluationId!, "connections")}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Inline match control for an UNMATCHED attendee row: shows the server-suggested
// probable match with an [Apply], plus a "not right? / find a match" toggle that
// opens a name search to pick a different profile. Both Apply and a search pick
// call onLink, which PATCHes the row's evaluationId.
function MatchPicker({
  attendeeName,
  probableMatch,
  busy,
  onLink,
}: {
  attendeeName: string | null;
  probableMatch: ProbableMatch | null;
  busy: boolean;
  onLink: (evaluationId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(attendeeName ?? "");
  const [results, setResults] = useState<LeaderboardRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const genRef = useRef(0);
  const trimmed = query.trim();

  useEffect(() => {
    if (!open || trimmed.length < 2) return;
    const myGen = ++genRef.current;
    let cancelled = false;
    const h = setTimeout(() => {
      setLoading(true);
      void (async () => {
        try {
          const res = await fetch(`/api/leaderboard/search?q=${encodeURIComponent(trimmed)}`);
          const data: { rows: LeaderboardRow[] } = await res.json();
          if (!cancelled && genRef.current === myGen) {
            setResults(data.rows);
            setLoading(false);
          }
        } catch {
          if (!cancelled && genRef.current === myGen) {
            setResults([]);
            setLoading(false);
          }
        }
      })();
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(h);
    };
  }, [trimmed, open]);

  return (
    <div className="flex flex-col gap-1 text-xs">
      {!open && probableMatch && (
        <span className="flex flex-wrap items-center gap-1.5 text-zinc-500">
          Probable match:
          {probableMatch.profileHref ? (
            <a href={probableMatch.profileHref} target="_blank" rel="noopener noreferrer" className="text-zinc-300 hover:underline">
              {probableMatch.name ?? "(unnamed)"}
            </a>
          ) : (
            <span className="text-zinc-300">{probableMatch.name ?? "(unnamed)"}</span>
          )}
          {probableMatch.companyName && <span className="text-zinc-500">· {probableMatch.companyName}</span>}
          <button
            type="button"
            disabled={busy}
            onClick={() => onLink(probableMatch.evaluationId)}
            className="rounded border border-[#dfa43a]/50 px-1.5 py-0.5 text-[#dfa43a] hover:bg-[#dfa43a]/10 disabled:opacity-50"
          >
            {busy ? "Applying…" : "Apply"}
          </button>
          <button type="button" onClick={() => setOpen(true)} className="text-zinc-500 underline hover:text-zinc-300">
            not right?
          </button>
        </span>
      )}
      {!open && !probableMatch && (
        <button type="button" onClick={() => setOpen(true)} className="self-start text-zinc-500 underline hover:text-zinc-300">
          find a match
        </button>
      )}
      {open && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search profiles by name…"
              className="w-56 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-white placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
            />
            <button type="button" onClick={() => setOpen(false)} className="text-zinc-500 hover:text-zinc-300">
              cancel
            </button>
          </div>
          {trimmed.length >= 2 && (
            <ul className="flex max-h-48 w-72 flex-col overflow-y-auto rounded border border-zinc-800 bg-[#151515]">
              {loading && results === null ? (
                <li className="px-2 py-1.5 text-zinc-500">Searching…</li>
              ) : results && results.length > 0 ? (
                results.slice(0, 8).map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onLink(r.id)}
                      className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left hover:bg-zinc-800/60 disabled:opacity-50"
                    >
                      <span className="min-w-0 flex-1 truncate text-zinc-200">
                        {r.fullName ?? "(unnamed)"}
                        {r.companyName && <span className="text-zinc-500">, {r.companyName}</span>}
                      </span>
                      <span className="shrink-0 font-mono tabular-nums text-zinc-400">{r.combinedScore.toLocaleString("en-US")}</span>
                    </button>
                  </li>
                ))
              ) : (
                // No existing profile — offer to score this person (same
                // "Score them now" flow as the leaderboard/header search). After
                // scoring, come back and the search will find + link them.
                <li>
                  <ScoreThemPrompt name={trimmed} className="px-2 py-1.5 text-xs leading-relaxed text-zinc-400" />
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
