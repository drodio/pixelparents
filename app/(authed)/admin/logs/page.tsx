import Link from "next/link";
import { hasDatabase } from "@/lib/db";
import { listAppLogs, appLogStats, pruneAppLogs, listAppLogEvents } from "@/lib/db/app-logs";
import { LOG_RETENTION_DAYS, LOG_LEVELS } from "@/lib/logging";
import type { AppLogRow } from "@/lib/db/schema/app-logs";

export const dynamic = "force-dynamic";

function fmt(d: Date | null): string {
  return d
    ? new Date(d).toLocaleString("en-US", {
        timeZone: "America/Los_Angeles",
        hour12: false,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "—";
}

const LEVEL_CLS: Record<string, string> = {
  error: "border-red-500/40 bg-red-500/10 text-red-300",
  warn: "border-yellow-500/40 bg-yellow-500/10 text-yellow-300",
  info: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  debug: "border-white/20 bg-white/5 text-white/50",
};

function LevelBadge({ level }: { level: string }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase ${
        LEVEL_CLS[level] ?? LEVEL_CLS.info
      }`}
    >
      {level}
    </span>
  );
}

// One expandable row. <details> keeps this a server component — no client JS
// needed just to inspect an entry.
function LogRow({ row }: { row: AppLogRow }) {
  const hasDetail =
    Object.keys(row.context ?? {}).length > 0 || row.errorStack || row.errorMessage;
  return (
    <details className="group border-b border-white/8 open:bg-white/[0.02]">
      <summary className="grid cursor-pointer grid-cols-[9.5rem_4.5rem_1fr] items-start gap-3 px-3 py-2 text-sm hover:bg-white/[0.04] sm:grid-cols-[11rem_5rem_14rem_1fr]">
        <span className="font-mono text-xs text-white/45">{fmt(row.createdAt)}</span>
        <LevelBadge level={row.level} />
        <span className="truncate font-mono text-xs text-amber-300/90">{row.event}</span>
        <span className="col-span-3 truncate text-white/75 sm:col-span-1">
          {row.message ?? row.errorMessage ?? "—"}
        </span>
      </summary>

      <div className="space-y-3 px-3 pb-4 pt-1 text-xs">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
          {[
            ["Actor", row.actorEmail ?? row.actorClerkId ?? "—"],
            ["Signup id", row.actorSignupId ?? "—"],
            ["Session", row.sessionId ?? "—"],
            ["Request", row.requestId ?? "—"],
            ["Path", row.path ?? "—"],
            ["Method", row.method ?? "—"],
            ["Status", row.statusCode ?? "—"],
            ["Duration", row.durationMs != null ? `${row.durationMs}ms` : "—"],
            ["IP prefix", row.ipPrefix ?? "—"],
            ["User agent", row.userAgent ?? "—"],
          ].map(([k, v]) => (
            <div key={String(k)} className="min-w-0">
              <dt className="text-white/35">{k}</dt>
              <dd className="truncate font-mono text-white/70" title={String(v)}>
                {String(v)}
              </dd>
            </div>
          ))}
        </dl>

        {row.errorMessage && (
          <div>
            <div className="mb-1 text-white/35">
              Error{row.errorName ? ` (${row.errorName})` : ""}
            </div>
            <pre className="overflow-x-auto rounded-lg border border-red-500/20 bg-red-500/[0.06] p-3 text-[11px] text-red-200">
              {row.errorMessage}
              {row.errorStack ? `\n\n${row.errorStack}` : ""}
            </pre>
          </div>
        )}

        {Object.keys(row.context ?? {}).length > 0 && (
          <div>
            <div className="mb-1 text-white/35">Context</div>
            <pre className="overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-3 text-[11px] text-white/70">
              {JSON.stringify(row.context, null, 2)}
            </pre>
          </div>
        )}

        {!hasDetail && <p className="text-white/35">No additional detail.</p>}

        {row.sessionId && (
          <Link
            href={`/admin/logs?sessionId=${encodeURIComponent(row.sessionId)}`}
            className="inline-block text-amber-400 hover:underline"
          >
            → See everything from this session
          </Link>
        )}
      </div>
    </details>
  );
}

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;

  if (!hasDatabase()) {
    return <p className="text-sm text-white/60">Logs need a database connection.</p>;
  }

  // Opportunistic retention sweep — keeps the table bounded without a cron.
  // Best-effort: a failure here must never take the page down.
  void pruneAppLogs().catch(() => {});

  const limit = Math.min(Math.max(Number(sp.limit ?? 200) || 200, 1), 1000);
  const query = {
    level: sp.level || undefined,
    event: sp.event || undefined,
    q: sp.q || undefined,
    actorEmail: sp.actorEmail || undefined,
    sessionId: sp.sessionId || undefined,
    limit,
  };

  const [rows, stats, events] = await Promise.all([
    listAppLogs(query),
    appLogStats(),
    listAppLogEvents(),
  ]);

  // Preserve the active filters in the export link so "export" always means
  // "export what I'm looking at".
  const exportQs = new URLSearchParams(
    Object.entries({ ...sp, limit: String(limit) }).filter(([, v]) => v) as [string, string][],
  );

  const inputCls =
    "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white placeholder-white/30 outline-none focus:border-amber-400/60";

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white">Logs</h1>
          <p className="mt-1 text-sm text-white/50">
            Every recorded event across all users and sessions. Retained{" "}
            {LOG_RETENTION_DAYS} days, then pruned automatically.
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href={`/admin/logs/export?format=csv&${exportQs}`}
            className="rounded-full border border-white/20 px-4 py-1.5 text-sm font-medium text-white/80 hover:bg-white/10"
          >
            Export CSV
          </a>
          <a
            href={`/admin/logs/export?format=json&${exportQs}`}
            className="rounded-full border border-white/20 px-4 py-1.5 text-sm font-medium text-white/80 hover:bg-white/10"
          >
            Export JSON
          </a>
        </div>
      </header>

      {/* Last-24h summary so a spike is obvious without running a query. */}
      <section className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 text-white/70">
          {stats.total} events (24h)
        </span>
        {stats.byLevel.map((l) => (
          <Link
            key={l.level}
            href={`/admin/logs?level=${l.level}`}
            className="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 text-white/70 hover:bg-white/10"
          >
            {l.level}: {l.n}
          </Link>
        ))}
        {stats.topEvents.slice(0, 6).map((e) => (
          <Link
            key={e.event}
            href={`/admin/logs?event=${encodeURIComponent(e.event)}`}
            className="rounded-full border border-amber-400/25 bg-amber-400/[0.06] px-3 py-1 font-mono text-amber-200/80 hover:bg-amber-400/15"
          >
            {e.event} · {e.n}
          </Link>
        ))}
      </section>

      {/* GET form so every filtered view is a shareable URL. */}
      <form method="GET" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Search text…" className={inputCls} />
        <input
          name="actorEmail"
          defaultValue={sp.actorEmail ?? ""}
          placeholder="Actor email…"
          className={inputCls}
        />
        <select name="level" defaultValue={sp.level ?? ""} className={inputCls}>
          <option value="">All levels</option>
          {LOG_LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <select name="event" defaultValue={sp.event ?? ""} className={inputCls}>
          <option value="">All events</option>
          {events.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <button
            type="submit"
            className="flex-1 rounded-lg bg-amber-400 px-4 py-1.5 text-sm font-semibold text-black hover:bg-amber-300"
          >
            Filter
          </button>
          <Link
            href="/admin/logs"
            className="rounded-lg border border-white/20 px-4 py-1.5 text-sm text-white/70 hover:bg-white/10"
          >
            Clear
          </Link>
        </div>
      </form>

      {sp.sessionId && (
        <p className="text-sm text-white/60">
          Filtered to session <code className="text-amber-300">{sp.sessionId}</code>.{" "}
          <Link href="/admin/logs" className="text-amber-400 hover:underline">
            Clear
          </Link>
        </p>
      )}

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
        <div className="hidden grid-cols-[11rem_5rem_14rem_1fr] gap-3 border-b border-white/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-white/35 sm:grid">
          <span>Time (PT)</span>
          <span>Level</span>
          <span>Event</span>
          <span>Message</span>
        </div>
        {rows.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-white/45">
            No log entries match these filters.
          </p>
        ) : (
          rows.map((r) => <LogRow key={r.id} row={r} />)
        )}
      </section>

      <p className="text-xs text-white/35">
        Showing {rows.length} entries (limit {limit}). Click any row for the full payload.
        Secrets are redacted and IPs truncated before storage.
      </p>
    </div>
  );
}
