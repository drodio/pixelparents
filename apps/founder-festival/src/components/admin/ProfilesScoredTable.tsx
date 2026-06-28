"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaLinkedin } from "react-icons/fa";
import { LocalTime } from "@/components/LocalTime";
import { collectFilterLabels, rowMatchesFilter } from "@/lib/profile-filter";

export type ProfileTableRow = {
  id: string;
  fullName: string | null;
  linkedinUrl: string;
  profileHref: string;
  source: "web" | "bulk" | "api";
  founderScore: number;
  investorScore: number;
  combinedScore: number;
  leaderboardRank: number | null;
  badges: string[];
  companyName: string | null;
  companyUrl: string | null;
  costCents: number | null;
  chargeCents: number;
  claimed: boolean; // true once a Clerk user has claimed this profile
  emails: string | null; // comma-joined address(es), verified-first; null when none
  emailStatus: "verified" | "unverified" | null; // status of the primary email
  // ALL emails (claimer + operator + anymailfinder), verified-first — powers the
  // dynamic "Email N" / "Email N Status" CSV columns.
  list: { email: string; status: "verified" | "unverified" }[];
  // Phone: claimer's Clerk-verified number when claimed, else operator-provided.
  phone: string | null;
  phoneStatus: "verified" | "provided" | null;
  jobTitle: string | null;
  updatedAtIso: string;
  requestIp: string | null;
  requestLocation: string | null; // scorer-IP "City, CA, US" or null
  subjectLocation: string | null; // the subject's own location, joined, or null
  subjectCity: string | null;
  subjectRegion: string | null;
  subjectCountry: string | null;
  runs: { jobId: string; title: string | null }[]; // bulk runs this profile is in
  status?: string; // per-run item status; only set by the single-run view
};

type SortKey =
  | "name" | "source" | "founder" | "investor" | "combined" | "rank"
  | "cost" | "charge" | "user" | "email" | "emailStatus" | "when" | "ip" | "location";

const SOURCE_STYLE: Record<ProfileTableRow["source"], string> = {
  web: "text-blue-400 border-blue-400/30 bg-blue-400/10",
  bulk: "text-violet-400 border-violet-400/30 bg-violet-400/10",
  api: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
};

// Per-item status colors for the single-run view's Status column.
const STATUS_STYLE: Record<string, string> = {
  done: "text-emerald-400",
  scoring: "text-amber-400",
  resolving: "text-amber-400",
  resolved: "text-amber-400",
  pending: "text-zinc-500",
  skipped: "text-zinc-500",
  failed: "text-red-400",
};

// Friendly per-item labels for the live status pill shown beside a row's
// LinkedIn icon while a (re-)scoring run is in flight. 'done' is intentionally
// absent — finished rows drop the pill and just show their (refreshed) score.
const LIVE_STATUS_LABEL: Record<string, string> = {
  pending: "queued",
  resolved: "queued",
  resolving: "resolving…",
  scoring: "scoring…",
  failed: "failed",
  skipped: "skipped",
};

function fmtCents(c: number | null | undefined): string {
  if (c == null) return "—";
  return `$${(c / 100).toFixed(2)}`;
}

// Sort value per column. null sorts last regardless of direction.
function sortValue(r: ProfileTableRow, key: SortKey): number | string | null {
  switch (key) {
    case "name": return r.fullName;
    case "source": return r.source;
    case "founder": return r.founderScore;
    case "investor": return r.investorScore;
    case "combined": return r.combinedScore;
    case "rank": return r.leaderboardRank;
    case "cost": return r.costCents;
    case "charge": return r.chargeCents;
    case "user": return r.claimed ? "Claimed" : "Unclaimed";
    case "email": return r.emails;
    case "emailStatus": return r.emailStatus;
    case "when": return Date.parse(r.updatedAtIso);
    case "ip": return r.requestIp;
    case "location": return r.requestLocation;
  }
}

// Build a CSV of the rows in their current (sorted) order. Includes badges
// regardless of the show/hide display toggle — it's a data export.
function toCsv(rows: ProfileTableRow[]): string {
  // Dynamic email columns: one "Email N" / "Email N Status" pair up to the most
  // emails any row has (verified-first). Rows with fewer leave the pairs blank.
  const maxEmails = rows.reduce((m, r) => Math.max(m, r.list.length), 0);
  const emailHeaders: string[] = [];
  for (let i = 1; i <= maxEmails; i++) emailHeaders.push(`Email ${i}`, `Email ${i} Status`);

  const headers = [
    "Name", "First Name", "Last Name", "Company", "Job Title", "LinkedIn", "Festival Profile", "Source", "Founder", "Investor", "Combined", "Rank",
    "Cost (USD)", "Charge (USD)", "User",
    ...emailHeaders,
    "Phone", "Phone Status",
    "Subject City", "Subject State", "Subject Country",
    "Date Scored", "IP", "Scored-From Location", "Badges",
  ];
  const esc = (v: string | number | null): string => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // profileHref is a relative path (/profile/...) → emit a full URL. Use the
  // current origin (festival.so in prod), falling back to the canonical domain.
  const base = typeof window !== "undefined" ? window.location.origin : "https://festival.so";
  const lines = [headers.join(",")];
  for (const r of rows) {
    const emailCells: string[] = [];
    for (let i = 0; i < maxEmails; i++) {
      const e = r.list[i];
      emailCells.push(
        e ? e.email : "",
        e ? (e.status === "verified" ? "Verified" : "Unverified") : "",
      );
    }
    // Split the full name → first = first token, last = the rest.
    const nameParts = (r.fullName ?? "").trim().split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] ?? "";
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";
    lines.push(
      [
        r.fullName ?? "",
        firstName,
        lastName,
        r.companyName ?? "",
        r.jobTitle ?? "",
        r.linkedinUrl,
        `${base}${r.profileHref}`,
        r.source,
        r.founderScore,
        r.investorScore,
        r.combinedScore,
        r.leaderboardRank ?? "",
        r.costCents == null ? "" : (r.costCents / 100).toFixed(2),
        (r.chargeCents / 100).toFixed(2),
        r.claimed ? "Claimed" : "Unclaimed",
        ...emailCells,
        r.phone ?? "",
        r.phoneStatus === "verified" ? "Verified" : r.phoneStatus === "provided" ? "Provided" : "",
        r.subjectCity ?? "",
        r.subjectRegion ?? "",
        r.subjectCountry ?? "",
        r.updatedAtIso,
        r.requestIp ?? "",
        r.requestLocation ?? "",
        r.badges.join("; "),
      ]
        .map(esc)
        .join(","),
    );
  }
  return lines.join("\n");
}

function compare(a: number | string | null, b: number | string | null, dir: "asc" | "desc"): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1; // nulls last
  if (b == null) return -1;
  const r = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));
  return dir === "desc" ? -r : r;
}

// Module-level (not defined during render) so it doesn't reset state per render.
// Only the ACTIVE column shows a ▼ (desc) / ▲ (asc) arrow.
function SortableTh({
  k,
  label,
  align = "left",
  sortKey,
  dir,
  onSort,
}: {
  k: SortKey;
  label: string;
  align?: "left" | "right";
  sortKey: SortKey;
  dir: "asc" | "desc";
  onSort: (k: SortKey) => void;
}) {
  const active = k === sortKey;
  return (
    <th className={`py-2 pr-4 font-normal ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 hover:text-zinc-200 ${active ? "text-zinc-200" : ""}`}
      >
        {label}
        {active && <span className="text-[9px]">{dir === "desc" ? "▼" : "▲"}</span>}
      </button>
    </th>
  );
}

// Pending (in-flight) item rendered as a ghost row at the top of the table
// while a job is still scoring. Has only the info we know up front: the
// scoring_job_items.id (React key + dedupe), the operator's input string,
// optional LinkedIn URL (when the row was a URL-shape input), an optional
// resolved full name (set once handle resolution lands), and the current
// per-item status. As `rows` (the scored set) grows via router.refresh(),
// items finished there fall out of `pendingItems` on the next poll.
export type PendingItem = {
  id: string;
  inputRaw: string;
  linkedinUrl: string | null;
  evalFullName: string | null;
  status: string;
  error: string | null;
};

// Org (host/sponsor) badges the viewer is authorized to bulk-apply. Empty for
// admins with no host/sponsor assignment and no super-admin.
export type ApplyableOrgBadge = { id: string; label: string };

export function ProfilesScoredTable({
  rows,
  superAdmin,
  showStatus = false,
  initialNextCursor,
  totalCount,
  exportName,
  liveJobId,
  orgBadges = [],
}: {
  rows: ProfileTableRow[];
  superAdmin: boolean;
  showStatus?: boolean; // single-run view shows the per-item Status column
  initialNextCursor?: string | null; // present → infinite scroll enabled
  totalCount?: number; // total DB count, for the "Loaded X of Y" caption
  exportName?: string | null; // run/list title → used in the CSV download filename
  // Job id whose pending items we should poll for. When set, the table polls
  // /api/admin/jobs/[id] every 4s, dedupes pending items against `rows`, and
  // renders the remainder as ghost rows at the top of the body. Used by the
  // single-run view to merge "In-flight subjects" into this one table.
  liveJobId?: string;
  // Custom org badges the viewer may apply to the rows currently in the table.
  orgBadges?: ApplyableOrgBadge[];
}) {
  // Default: newest scored first; badges + source hidden until toggled on.
  // Source is hidden by default because each row lists every bulk run the
  // profile belongs to, which can balloon to a tall column on rescored profiles.
  const [sortKey, setSortKey] = useState<SortKey>("when");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [showBadges, setShowBadges] = useState(false);
  const [showSource, setShowSource] = useState(false);

  // Infinite scroll: `rows` is the server-rendered first page; additional pages
  // are fetched client-side and appended. `foundOverlay` patches the Email cell
  // for profiles enriched via Find Email this session (rows is a prop, so we
  // overlay rather than mutate).
  const [extraRows, setExtraRows] = useState<ProfileTableRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor ?? null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [foundOverlay, setFoundOverlay] = useState<Map<string, string>>(new Map());

  // Pending (in-flight) items polled from /api/admin/jobs/[liveJobId]. We
  // only set this when liveJobId is present; otherwise the table behaves
  // exactly as before. The polled items include both pending and done;
  // we filter to non-done and dedupe against scored rows below.
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);

  // Live per-item state keyed by evaluationId, from the same job poll. Powers
  // (a) the inline status pill and (b) the live score overlay on already-scored
  // rows during a RE-SCORE run (those rows aren't ghost rows — they already
  // exist in `rows`, so the ghost-row path above skips them). The scores track
  // the eval as the worker overwrites it, so a row updates the moment it
  // finishes instead of waiting for the end-of-job SSR refresh. Empty unless
  // liveJobId is set.
  type LiveEval = {
    status: string;
    founder: number | null;
    investor: number | null;
    combined: number | null;
  };
  const [liveByEval, setLiveByEval] = useState<Map<string, LiveEval>>(new Map());

  // Filter: a row is visible iff ANY of its labels is enabled (see lib/profile-filter).
  // Seeded from the first page; streamed pages auto-enable only labels not seen
  // before (so we never re-enable ones the user turned off). seenLabels tracks that.
  const [enabled, setEnabled] = useState<Set<string>>(
    () => new Set(collectFilterLabels(rows).map((l) => l.key)),
  );
  const seenLabels = useRef<Set<string>>(new Set(collectFilterLabels(rows).map((l) => l.key)));

  const allRows = useMemo(() => {
    const merged = [...rows, ...extraRows];
    if (foundOverlay.size === 0) return merged;
    return merged.map((r) =>
      foundOverlay.has(r.id)
        ? { ...r, emails: foundOverlay.get(r.id)!, emailStatus: "unverified" as const }
        : r,
    );
  }, [rows, extraRows, foundOverlay]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !nextCursor) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/admin/profiles/list?cursor=${encodeURIComponent(nextCursor)}`);
      if (!res.ok) {
        setNextCursor(null);
        return;
      }
      const data = (await res.json()) as { rows: ProfileTableRow[]; nextCursor: string | null };
      setExtraRows((prev) => [...prev, ...data.rows]);
      setNextCursor(data.nextCursor);
      // Auto-enable filter labels first seen in this page (event handler, not an effect).
      const fresh: string[] = [];
      for (const l of collectFilterLabels(data.rows)) {
        if (!seenLabels.current.has(l.key)) {
          seenLabels.current.add(l.key);
          fresh.push(l.key);
        }
      }
      if (fresh.length > 0) setEnabled((prev) => new Set([...prev, ...fresh]));
    } catch {
      setNextCursor(null); // stop trying on a network error
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, nextCursor]);

  const filterLabels = useMemo(() => collectFilterLabels(allRows), [allRows]);
  const [showFilter, setShowFilter] = useState(false);

  const sorted = useMemo(() => {
    const copy = allRows.filter((r) => rowMatchesFilter(r, enabled));
    copy.sort((a, b) => compare(sortValue(a, sortKey), sortValue(b, sortKey), dir));
    return copy;
  }, [allRows, sortKey, dir, enabled]);

  function onSort(key: SortKey) {
    if (key === sortKey) setDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortKey(key);
      setDir("desc"); // every new column starts descending
    }
  }

  function toggleLabel(key: string) {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Row selection (operates on the current sorted/filtered order). anchorRef is
  // the last plainly-clicked row, so a subsequent shift-click selects the range.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const anchorRef = useRef<number | null>(null);

  function onRowCheck(index: number, shiftKey: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (shiftKey && anchorRef.current !== null) {
        const lo = Math.min(anchorRef.current, index);
        const hi = Math.max(anchorRef.current, index);
        for (let i = lo; i <= hi; i++) {
          const r = sorted[i];
          if (r) next.add(r.id);
        }
      } else {
        const id = sorted[index].id;
        if (next.has(id)) next.delete(id);
        else next.add(id);
        anchorRef.current = index;
      }
      return next;
    });
  }

  // Bulk org-badge apply: clicking a badge applies it to every row currently in
  // the table (the active filter/sort), clicking again removes it from all of
  // them. State is optimistic — the server upsert/delete is idempotent.
  const [appliedBadges, setAppliedBadges] = useState<Set<string>>(new Set());
  const [badgeBusy, setBadgeBusy] = useState<string | null>(null);
  const [badgeMsg, setBadgeMsg] = useState<string | null>(null);

  async function toggleOrgBadge(badge: ApplyableOrgBadge) {
    if (badgeBusy) return;
    const evaluationIds = sorted.map((r) => r.id);
    if (evaluationIds.length === 0) {
      setBadgeMsg("No profiles in the current view.");
      return;
    }
    const isApplied = appliedBadges.has(badge.id);
    const action = isApplied ? "remove" : "apply";
    setBadgeBusy(badge.id);
    setBadgeMsg(null);
    try {
      const res = await fetch("/api/admin/badges/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ badgeId: badge.id, evaluationIds, action }),
      });
      if (res.ok) {
        setAppliedBadges((prev) => {
          const next = new Set(prev);
          if (isApplied) next.delete(badge.id);
          else next.add(badge.id);
          return next;
        });
        setBadgeMsg(
          `${action === "apply" ? "Applied" : "Removed"} "${badge.label}" ${action === "apply" ? "to" : "from"} ${evaluationIds.length.toLocaleString("en-US")} profile${evaluationIds.length === 1 ? "" : "s"}.`,
        );
      } else {
        setBadgeMsg(`Error: ${(await res.json().catch(() => ({}))).error ?? res.status}`);
      }
    } catch {
      setBadgeMsg("Network error — please try again.");
    } finally {
      setBadgeBusy(null);
    }
  }

  const allLoadedSelected = sorted.length > 0 && sorted.every((r) => selected.has(r.id));
  const someSelected = selected.size > 0 && !allLoadedSelected;
  const headerCbRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (headerCbRef.current) headerCbRef.current.indeterminate = someSelected;
  }, [someSelected]);

  function toggleAllLoaded() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (sorted.length > 0 && sorted.every((r) => prev.has(r.id))) {
        for (const r of sorted) next.delete(r.id); // clear only the loaded rows
      } else {
        for (const r of sorted) next.add(r.id);
      }
      return next;
    });
  }

  // Tools → Find Email.
  // Find Email is async: queue the selection, then poll while the find-email-tick
  // cron drains it, filling emails into the table as they resolve.
  const [finding, setFinding] = useState(false);
  const [findSummary, setFindSummary] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current); }, []);

  function pollStatus(ids: string[], total: number) {
    const tick = async () => {
      try {
        const res = await fetch("/api/admin/profiles/find-email/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ evaluationIds: ids }),
        });
        const data = (await res.json()) as { remaining?: number; found?: { id: string; email: string }[] };
        const found = data.found ?? [];
        if (found.length > 0) {
          setFoundOverlay((prev) => {
            const next = new Map(prev);
            for (const f of found) next.set(f.id, f.email);
            return next;
          });
        }
        const remaining = data.remaining ?? 0;
        if (remaining <= 0) {
          setFindSummary(`Found ${found.length} email${found.length === 1 ? "" : "s"} of ${total} queued.`);
          setFinding(false);
          return; // done — stop polling
        }
        setFindSummary(`Finding emails… ${found.length} found, ${remaining} pending`);
        pollRef.current = setTimeout(tick, 4000);
      } catch {
        pollRef.current = setTimeout(tick, 6000); // transient; keep polling
      }
    };
    tick();
  }

  async function runFindEmail() {
    if (finding || selected.size === 0) return;
    setFinding(true);
    setFindSummary(null);
    const ids = [...selected];
    try {
      const res = await fetch("/api/admin/profiles/find-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evaluationIds: ids }),
      });
      const data = (await res.json()) as { queued?: number; queuedIds?: string[]; error?: string };
      if (!res.ok || data.error) {
        setFindSummary(`Error: ${data.error ?? res.status}`);
        setFinding(false);
        return;
      }
      const queuedIds = data.queuedIds ?? [];
      if (queuedIds.length === 0) {
        setFindSummary("No eligible rows (already claimed, found, or queued).");
        setFinding(false);
        return;
      }
      setSelected(new Set());
      setFindSummary(`Queued ${queuedIds.length} — finding emails…`);
      pollStatus(queuedIds, queuedIds.length);
    } catch {
      setFindSummary("Error: request failed");
      setFinding(false);
    }
  }

  // Poll the live job for pending items. Only runs when liveJobId is set.
  // The same API powers the progress header sibling — two pollers calling
  // the same endpoint on a 4s cadence is fine (negligible traffic).
  useEffect(() => {
    if (!liveJobId) return;
    let cancelled = false;
    const TERMINAL = new Set(["completed", "failed", "cancelled"]);
    async function poll() {
      try {
        const res = await fetch(`/api/admin/jobs/${liveJobId}`);
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        type RawItem = PendingItem & {
          evaluationId: string | null;
          evalFounderScore: number | null;
          evalInvestorScore: number | null;
          evalScore: number | null;
          itemFounderScore: number | null;
          itemInvestorScore: number | null;
          itemCombinedScore: number | null;
        };
        const rawItems: RawItem[] = json.items ?? [];
        const items: PendingItem[] = rawItems
          .filter((it) => it.status !== "done")
          .map((it) => ({
            id: it.id,
            inputRaw: it.inputRaw,
            linkedinUrl: it.linkedinUrl,
            evalFullName: it.evalFullName,
            status: it.status,
            error: it.error,
          }));
        setPendingItems(items);
        // Build evalId → {status, live scores} for the inline pill + score
        // overlay on existing scored rows. Prefer the live eval numbers (the
        // worker overwrites them in place on a re-score); fall back to this
        // run's snapshot for legacy rows.
        const byEval = new Map<string, LiveEval>();
        for (const it of rawItems) {
          if (!it.evaluationId) continue;
          byEval.set(it.evaluationId, {
            status: it.status,
            founder: it.evalFounderScore ?? it.itemFounderScore,
            investor: it.evalInvestorScore ?? it.itemInvestorScore,
            combined: it.evalScore ?? it.itemCombinedScore,
          });
        }
        setLiveByEval(byEval);
        // Stop polling once the job is terminal AND nothing's pending — the
        // SSR refresh in JobLiveProgress will have updated `rows`.
        if (TERMINAL.has(json.job?.status) && items.length === 0) {
          cancelled = true;
        }
      } catch {
        /* transient; next interval retries */
      }
    }
    poll();
    const id = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [liveJobId]);

  // Ghost rows for in-flight items, dedup'd against the scored rows so we
  // don't double-render an item whose eval just landed in `rows` ahead of
  // the next pending-poll tick. We have no evaluationId on the item once
  // it's done, so dedup by linkedinUrl when both sides have one.
  const scoredLinkedinUrls = useMemo(
    () => new Set(allRows.map((r) => r.linkedinUrl)),
    [allRows],
  );
  const ghostRows = useMemo(
    () =>
      pendingItems.filter(
        (it) => !it.linkedinUrl || !scoredLinkedinUrls.has(it.linkedinUrl),
      ),
    [pendingItems, scoredLinkedinUrls],
  );

  // Infinite-scroll sentinel: load the next page when it nears the viewport.
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !nextCursor) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "400px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [nextCursor, loadMore]);

  const thProps = { sortKey, dir, onSort };
  // Columns spanned by the full-width badges sub-row. +1 for the leftmost
  // selection checkbox column (always shown); +2 for Email + Email Status;
  // Status adds one; Source is hideable so subtract one when hidden.
  const colCount =
    (superAdmin ? 16 : 15) + (showStatus ? 1 : 0) - (showSource ? 0 : 1);

  function exportCsv() {
    const blob = new Blob([toCsv(sorted)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // "060226-[run-name]-export.csv" when we have a run title; else the legacy
    // "profiles-scored-YYYY-MM-DD.csv" (the full-list view has no single run).
    const d = new Date();
    const mmddyy =
      `${String(d.getMonth() + 1).padStart(2, "0")}` +
      `${String(d.getDate()).padStart(2, "0")}` +
      `${String(d.getFullYear() % 100).padStart(2, "0")}`;
    const slug = (exportName ?? "")
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
    a.download = slug
      ? `${mmddyy}-${slug}-export.csv`
      : `profiles-scored-${d.toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Bulk org-badge apply. Sits above the filter/export controls. Clicking a
          badge toggles it on every profile currently in the table. */}
      {orgBadges.length > 0 && (
        <div className="flex flex-col gap-2 rounded border border-zinc-700 bg-[#1b1b1b] px-3 py-3">
          <span className="text-sm text-zinc-300">
            Apply these badges to all {sorted.length.toLocaleString("en-US")} profile
            {sorted.length === 1 ? "" : "s"} below:
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {orgBadges.map((b) => {
              const applied = appliedBadges.has(b.id);
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => toggleOrgBadge(b)}
                  disabled={badgeBusy === b.id}
                  aria-pressed={applied}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors disabled:opacity-50 ${
                    applied
                      ? "border-amber-400 bg-amber-400 text-black font-semibold"
                      : "border-amber-500/40 bg-amber-500/10 text-amber-200 hover:border-amber-400"
                  }`}
                >
                  {applied && <span aria-hidden>✓</span>}
                  {b.label}
                </button>
              );
            })}
          </div>
          {badgeMsg && <span className="text-xs text-zinc-400">{badgeMsg}</span>}
        </div>
      )}
      {totalCount != null && (
        <div className="text-xs text-zinc-500 tabular-nums">
          Loaded {sorted.length.toLocaleString("en-US")} of {totalCount.toLocaleString("en-US")}
        </div>
      )}
      {/* Controls, top-right: filter + badges toggle + CSV export of the view.
          Wraps on narrow screens so the buttons stack instead of overflowing. */}
      <div className="flex flex-wrap justify-start sm:justify-end items-center gap-3 sm:gap-4 relative">
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowFilter((v) => !v)}
            className="rounded border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white px-3 py-1 text-xs"
          >
            Filter{enabled.size < filterLabels.length ? ` (${enabled.size}/${filterLabels.length})` : ""}
          </button>
          {showFilter && (
            <div className="absolute right-0 top-full mt-1 z-10 w-56 rounded border border-zinc-700 bg-[#1b1b1b] p-3 shadow-xl">
              <div className="flex justify-between mb-2 text-xs">
                <button
                  type="button"
                  onClick={() => setEnabled(new Set(filterLabels.map((l) => l.key)))}
                  className="text-zinc-400 hover:text-white"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => setEnabled(new Set())}
                  className="text-zinc-400 hover:text-white"
                >
                  Select none
                </button>
              </div>
              <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
                {filterLabels.map((l) => (
                  <label key={l.key} className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enabled.has(l.key)}
                      onChange={() => toggleLabel(l.key)}
                      className="accent-[#dfa43a]"
                    />
                    <span className={l.kind === "source" ? "uppercase tracking-wide text-zinc-400" : ""}>
                      {l.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={exportCsv}
          className="rounded border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white px-3 py-1 text-xs"
        >
          Export CSV
        </button>
        <div className="inline-flex items-center gap-2 text-xs text-zinc-400">
          <span className="uppercase tracking-[0.15em]">Source:</span>
          <div className="inline-flex rounded border border-zinc-700 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowSource(true)}
              className={`px-2.5 py-1 ${showSource ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              Show
            </button>
            <button
              type="button"
              onClick={() => setShowSource(false)}
              className={`px-2.5 py-1 ${!showSource ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              Hide
            </button>
          </div>
        </div>
        <div className="inline-flex items-center gap-2 text-xs text-zinc-400">
          <span className="uppercase tracking-[0.15em]">Badges:</span>
          <div className="inline-flex rounded border border-zinc-700 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowBadges(true)}
              className={`px-2.5 py-1 ${showBadges ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              Show
            </button>
            <button
              type="button"
              onClick={() => setShowBadges(false)}
              className={`px-2.5 py-1 ${!showBadges ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              Hide
            </button>
          </div>
        </div>
      </div>

      {/* Tools: bulk actions on the selected rows. Sits above the table. */}
      {(selected.size > 0 || findSummary) && (
        <div className="flex flex-wrap items-center gap-3 rounded border border-zinc-700 bg-[#1b1b1b] px-3 py-2 text-sm">
          <span className="uppercase tracking-[0.15em] text-zinc-500 text-xs">Tools</span>
          {selected.size > 0 && (
            <>
              <span className="text-zinc-300">{selected.size} selected</span>
              <button
                type="button"
                onClick={runFindEmail}
                disabled={finding}
                className="rounded bg-white text-black px-3 py-1 text-xs font-medium hover:bg-zinc-200 disabled:opacity-50"
              >
                {finding ? "Finding…" : "Find Email"}
              </button>
              <span className="text-xs text-zinc-500">
                {superAdmin ? "free (super-admin)" : "$0.05 per email found"}
              </span>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-xs text-zinc-400 hover:text-white"
              >
                Clear
              </button>
            </>
          )}
          {findSummary && <span className="text-xs text-emerald-400">{findSummary}</span>}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-xs uppercase tracking-[0.15em] text-zinc-500 border-b border-zinc-800">
              <th className="py-2 pr-3 w-8">
                <input
                  ref={headerCbRef}
                  type="checkbox"
                  checked={allLoadedSelected}
                  onChange={toggleAllLoaded}
                  className="accent-[#dfa43a] align-middle"
                  aria-label="Select all loaded rows"
                />
              </th>
              <SortableTh k="name" label="Profile" {...thProps} />
              {showSource && <SortableTh k="source" label="Source" {...thProps} />}
              <SortableTh k="founder" label="Founder" align="right" {...thProps} />
              <SortableTh k="investor" label="Investor" align="right" {...thProps} />
              <SortableTh k="combined" label="Combined" align="right" {...thProps} />
              <SortableTh k="rank" label="Rank" align="right" {...thProps} />
              <SortableTh k="cost" label="Cost" align="right" {...thProps} />
              <SortableTh k="charge" label="Charge" align="right" {...thProps} />
              <SortableTh k="user" label="User" {...thProps} />
              <SortableTh k="email" label="Email" {...thProps} />
              <SortableTh k="emailStatus" label="Email Status" {...thProps} />
              {showStatus && <th className="py-2 pr-4 font-normal text-left">Status</th>}
              <SortableTh k="when" label="Date Scored" {...thProps} />
              <SortableTh k="ip" label="IP" {...thProps} />
              <SortableTh k="location" label="Location" {...thProps} />
              {superAdmin && <th className="py-2 pr-4 font-normal text-right">Detail</th>}
            </tr>
          </thead>
          <tbody>
            {/* Ghost rows for items still in-flight (live job poll). Always
                pinned to the top regardless of sort/filter so the operator
                can watch them resolve. Cells default to "—" — the row fills
                in when the scored record lands and rows replaces the ghost. */}
            {ghostRows.map((it) => (
              <tr
                key={`pending:${it.id}`}
                className="align-top border-b border-zinc-900 bg-amber-400/[0.04] text-zinc-400"
              >
                <td className="py-2 pr-3" />
                <td className="py-2 pr-4 whitespace-nowrap">
                  <span className="italic">{it.evalFullName ?? it.inputRaw}</span>
                  {it.linkedinUrl && (
                    <a
                      href={it.linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="LinkedIn profile"
                      className="ml-2 inline-flex align-middle text-[#0a66c2] hover:text-[#0a66c2]/80"
                    >
                      <FaLinkedin size={15} />
                    </a>
                  )}
                  <span
                    className={`ml-2 inline-flex align-middle text-xs ${STATUS_STYLE[it.status] ?? "text-zinc-400"}`}
                    aria-live="polite"
                  >
                    {it.status}
                  </span>
                  {it.error && (
                    <span className="ml-2 inline-flex align-middle text-xs text-red-400">
                      {it.error}
                    </span>
                  )}
                </td>
                {showSource && <td className="py-2 pr-4 text-zinc-600">—</td>}
                <td className="py-2 pr-4 text-right text-zinc-600">—</td>
                <td className="py-2 pr-4 text-right text-zinc-600">—</td>
                <td className="py-2 pr-4 text-right text-zinc-600">—</td>
                <td className="py-2 pr-4 text-right text-zinc-600">—</td>
                <td className="py-2 pr-4 text-right text-zinc-600">—</td>
                <td className="py-2 pr-4 text-right text-zinc-600">—</td>
                <td className="py-2 pr-4 text-zinc-600">—</td>
                <td className="py-2 pr-4 text-zinc-600">—</td>
                <td className="py-2 pr-4 text-zinc-600">—</td>
                {showStatus && <td className="py-2 pr-4 text-zinc-600">—</td>}
                <td className="py-2 pr-4 text-zinc-600">—</td>
                <td className="py-2 pr-4 text-zinc-600">—</td>
                <td className="py-2 pr-4 text-zinc-600">—</td>
                {superAdmin && <td className="py-2 pr-4 text-zinc-600">—</td>}
              </tr>
            ))}
            {sorted.map((p, i) => {
              const stripe = i % 2 === 1 ? "bg-white/[0.025]" : "";
              const hasSub = showBadges && p.badges.length > 0;
              // Live overlay (re-score in flight): status pill + fresh scores.
              const live = liveByEval.get(p.id);
              const liveLabel = live ? LIVE_STATUS_LABEL[live.status] : undefined;
              const founderScore = live?.founder ?? p.founderScore;
              const investorScore = live?.investor ?? p.investorScore;
              const combinedScore = live?.combined ?? p.combinedScore;
              return (
                <Fragment key={p.id}>
                  <tr className={`align-top ${stripe} hover:bg-white/[0.05] ${hasSub ? "" : "border-b border-zinc-900"}`}>
                    <td className="py-2 pr-3">
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => {}}
                        onClick={(e) => onRowCheck(i, e.shiftKey)}
                        className="accent-[#dfa43a] mt-1"
                        aria-label={`Select ${p.fullName ?? "profile"}`}
                      />
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap">
                      <a href={p.profileHref} className="link font-semibold" target="_blank" rel="noopener noreferrer">
                        {p.fullName?.trim() || "(unnamed)"}
                      </a>
                      {p.companyName && (
                        <span className="ml-2 text-xs text-zinc-500">
                          {p.companyUrl ? (
                            <a href={p.companyUrl} className="hover:text-zinc-300" target="_blank" rel="noopener noreferrer">
                              {p.companyName}
                            </a>
                          ) : (
                            p.companyName
                          )}
                        </span>
                      )}
                      <a
                        href={p.linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="LinkedIn profile"
                        className="ml-2 inline-flex align-middle text-[#0a66c2] hover:text-[#0a66c2]/80"
                      >
                        <FaLinkedin size={15} />
                      </a>
                      {/* Live (re-)scoring status from the job poll. Shown only
                          while an item is in-flight; vanishes once it's done. */}
                      {liveLabel && live && (
                        <span
                          className={`ml-2 inline-flex align-middle text-xs ${STATUS_STYLE[live.status] ?? "text-zinc-400"}`}
                          aria-live="polite"
                        >
                          {liveLabel}
                        </span>
                      )}
                    </td>
                    {showSource && (
                      <td className="py-2 pr-4">
                        <div className="flex flex-wrap items-center gap-1">
                          <span className={`px-2 py-0.5 rounded border text-xs ${SOURCE_STYLE[p.source]}`}>
                            {p.source === "web" ? "Web" : p.source === "bulk" ? "Bulk" : "API"}
                          </span>
                          {p.runs.map((run) => (
                            <a
                              key={run.jobId}
                              href={`/admin/profiles/${run.jobId}`}
                              className="px-2 py-0.5 rounded border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white text-xs whitespace-nowrap"
                            >
                              {run.title?.trim() || "Untitled run"}
                            </a>
                          ))}
                        </div>
                      </td>
                    )}
                    <td className="py-2 pr-4 text-right tabular-nums text-zinc-300">{founderScore.toLocaleString("en-US")}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-zinc-300">{investorScore.toLocaleString("en-US")}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-zinc-100 font-bold">{combinedScore.toLocaleString("en-US")}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-zinc-400">
                      {p.leaderboardRank == null ? (
                        "—"
                      ) : (
                        <a href={`/leaderboard?e=${p.id}`} className="link" target="_blank" rel="noopener noreferrer">
                          #{p.leaderboardRank}
                        </a>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums text-zinc-300 whitespace-nowrap">{fmtCents(p.costCents)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-zinc-300 whitespace-nowrap">{fmtCents(p.chargeCents)}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {p.claimed ? (
                        <span className="text-zinc-300">Claimed</span>
                      ) : (
                        <span className="text-zinc-500">Unclaimed</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-xs">
                      {p.emails ? (
                        <span className="text-zinc-300">{p.emails}</span>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap text-xs">
                      {p.emailStatus === "verified" ? (
                        <span className="text-emerald-400">Verified</span>
                      ) : p.emailStatus === "unverified" ? (
                        <span className="text-amber-400">Unverified</span>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    {showStatus && (
                      <td className="py-2 pr-4 whitespace-nowrap text-xs">
                        <span className={STATUS_STYLE[p.status ?? ""] ?? "text-zinc-400"}>
                          {p.status ?? "—"}
                        </span>
                      </td>
                    )}
                    <td className="py-2 pr-4 text-zinc-400 whitespace-nowrap tabular-nums">
                      <LocalTime iso={p.updatedAtIso} />
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap text-xs">
                      {p.requestIp ? (
                        <span className="tabular-nums text-zinc-400 font-mono">{p.requestIp}</span>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap text-xs text-zinc-400">
                      {p.requestLocation ?? <span className="text-zinc-600">—</span>}
                    </td>
                    {superAdmin && (
                      <td className="py-2 pr-4 text-right whitespace-nowrap">
                        <a
                          href={`/profile?e=${p.id}&debug=1`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="link text-xs"
                        >
                          Score Detail
                        </a>
                      </td>
                    )}
                  </tr>
                  {hasSub && (
                    <tr className={`${stripe} border-b border-zinc-900`}>
                      <td colSpan={colCount} className="pb-2 pl-1 pr-4">
                        <div className="flex flex-wrap items-center gap-1">
                          {p.badges.map((b) => (
                            <span
                              key={b}
                              className="px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-400 text-[10px] whitespace-nowrap"
                            >
                              {b}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {initialNextCursor !== undefined && nextCursor && (
        <div ref={sentinelRef} className="py-4 text-center text-xs text-zinc-500">
          {loadingMore ? "Loading…" : "Scroll to load more"}
        </div>
      )}
    </div>
  );
}
