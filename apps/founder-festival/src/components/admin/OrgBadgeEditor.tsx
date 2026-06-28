"use client";

import { useEffect, useRef, useState } from "react";
import type { OrgBadge, OrgOwnerType } from "@/lib/org-badges";
import type { LeaderboardRow } from "@/lib/leaderboard";
import { ProfileMiniTable } from "@/components/events/ProfileMiniTable";

const MIN_CHARS = 2;
const MAX_RESULTS = 8;

// Add / remove / rename custom badges on a host or sponsor (e.g. "District
// Member"). Each badge is an expandable management card: rename inline, search
// to add holders, view holders in a leaderboard-style table.
export function OrgBadgeEditor({
  ownerType,
  ownerId,
  initial,
}: {
  ownerType: OrgOwnerType;
  ownerId: string;
  initial: OrgBadge[];
}) {
  const [badges, setBadges] = useState<OrgBadge[]>(initial);
  // New badge label input at the bottom.
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Per-badge expand/collapse. Only one badge panel open at a time.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Per-badge inline-rename state. Only one badge editable at a time.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  // Per-badge holder rows, fetched on first expand.
  const [holders, setHolders] = useState<Record<string, LeaderboardRow[] | null>>({});
  const [holdersLoading, setHoldersLoading] = useState<Record<string, boolean>>({});
  // Per-badge action messages.
  const [badgeMsg, setBadgeMsg] = useState<Record<string, string | null>>({});

  async function add() {
    const trimmed = label.trim();
    if (!trimmed) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/org-badges", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ownerType, ownerId, label: trimmed }),
      });
      const data = await res.json();
      if (res.ok) {
        setBadges((b) => [...b, data.badge as OrgBadge]);
        setLabel("");
      } else {
        setMsg(`Error: ${data.error ?? res.status}`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setMsg(null);
    const res = await fetch("/api/admin/org-badges", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setBadges((b) => b.filter((x) => x.id !== id));
      if (expandedId === id) setExpandedId(null);
      if (editingId === id) setEditingId(null);
    } else {
      setMsg(`Error: ${(await res.json()).error ?? res.status}`);
    }
  }

  function setBadgeMsgFor(badgeId: string, m: string | null) {
    setBadgeMsg((prev) => ({ ...prev, [badgeId]: m }));
  }

  // Rename a badge inline: PATCH the catalog label + propagate to all overrides.
  async function saveRename(id: string) {
    const trimmed = editLabel.trim();
    if (!trimmed) return;
    setBadgeMsgFor(id, null);
    const res = await fetch("/api/admin/org-badges", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, label: trimmed }),
    });
    const data = await res.json();
    if (res.ok) {
      setBadges((b) => b.map((badge) => (badge.id === id ? { ...badge, label: trimmed } : badge)));
      setEditingId(null);
      setEditLabel("");
    } else {
      setBadgeMsgFor(id, `Error: ${data.error ?? res.status}`);
    }
  }

  function startEditing(badge: OrgBadge) {
    setEditingId(badge.id);
    setEditLabel(badge.label);
    // Collapse the manage panel while renaming to reduce visual clutter.
    if (expandedId === badge.id) setExpandedId(null);
  }

  // Toggle the manage panel for a badge. Fetch holders on first open.
  async function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    setEditingId(null); // stop any in-progress rename
    // Fetch holders if not already loaded.
    if (holders[id] === undefined) {
      setHoldersLoading((prev) => ({ ...prev, [id]: true }));
      try {
        const res = await fetch(`/api/admin/org-badges/holders?id=${encodeURIComponent(id)}`);
        const data = await res.json();
        setHolders((prev) => ({ ...prev, [id]: res.ok ? (data.rows as LeaderboardRow[]) : [] }));
      } catch {
        setHolders((prev) => ({ ...prev, [id]: [] }));
      } finally {
        setHoldersLoading((prev) => ({ ...prev, [id]: false }));
      }
    }
  }

  async function refreshHolders(id: string) {
    setHoldersLoading((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await fetch(`/api/admin/org-badges/holders?id=${encodeURIComponent(id)}`);
      const data = await res.json();
      setHolders((prev) => ({ ...prev, [id]: res.ok ? (data.rows as LeaderboardRow[]) : [] }));
    } catch {
      // keep existing
    } finally {
      setHoldersLoading((prev) => ({ ...prev, [id]: false }));
    }
  }

  async function applyBadge(badgeId: string, evaluationId: string) {
    setBadgeMsgFor(badgeId, null);
    const res = await fetch("/api/admin/badges/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ badgeId, evaluationIds: [evaluationId], action: "apply" }),
    });
    if (res.ok) {
      await refreshHolders(badgeId);
    } else {
      const data = await res.json().catch(() => ({}));
      setBadgeMsgFor(badgeId, `Error applying: ${data.error ?? res.status}`);
    }
  }

  async function removeBadgeFromHolder(badgeId: string, evaluationId: string) {
    setBadgeMsgFor(badgeId, null);
    const res = await fetch("/api/admin/badges/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ badgeId, evaluationIds: [evaluationId], action: "remove" }),
    });
    if (res.ok) {
      await refreshHolders(badgeId);
    } else {
      const data = await res.json().catch(() => ({}));
      setBadgeMsgFor(badgeId, `Error removing: ${data.error ?? res.status}`);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-zinc-400">
        Custom badges admins can apply to scored profiles. Deleting a badge also removes it from every profile it was applied to.
      </p>

      {badges.length > 0 && (
        <div className="flex flex-col gap-2">
          {badges.map((b) => (
            <BadgeCard
              key={b.id}
              badge={b}
              expanded={expandedId === b.id}
              editing={editingId === b.id}
              editLabel={editLabel}
              badgeMsg={badgeMsg[b.id] ?? null}
              holderRows={holders[b.id] ?? null}
              holdersLoading={holdersLoading[b.id] ?? false}
              onToggleExpand={() => toggleExpand(b.id)}
              onStartEditing={() => startEditing(b)}
              onEditLabelChange={setEditLabel}
              onSaveRename={() => saveRename(b.id)}
              onCancelRename={() => { setEditingId(null); setEditLabel(""); }}
              onDelete={() => remove(b.id)}
              onApply={(evalId) => applyBadge(b.id, evalId)}
              onRemoveHolder={(evalId) => removeBadgeFromHolder(b.id, evalId)}
            />
          ))}
        </div>
      )}

      {/* Add a new badge */}
      <div className="flex items-center gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="New badge label (e.g. District Member)"
          className="flex-1 rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
        />
        <button
          type="button"
          onClick={add}
          disabled={busy || !label.trim()}
          className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-700 disabled:opacity-40"
        >
          Add badge
        </button>
      </div>

      {msg && <p className="text-sm text-red-400">{msg}</p>}
    </div>
  );
}

// Individual expandable management card for one org badge.
function BadgeCard({
  badge,
  expanded,
  editing,
  editLabel,
  badgeMsg,
  holderRows,
  holdersLoading,
  onToggleExpand,
  onStartEditing,
  onEditLabelChange,
  onSaveRename,
  onCancelRename,
  onDelete,
  onApply,
  onRemoveHolder,
}: {
  badge: OrgBadge;
  expanded: boolean;
  editing: boolean;
  editLabel: string;
  badgeMsg: string | null;
  holderRows: LeaderboardRow[] | null;
  holdersLoading: boolean;
  onToggleExpand: () => void;
  onStartEditing: () => void;
  onEditLabelChange: (v: string) => void;
  onSaveRename: () => void;
  onCancelRename: () => void;
  onDelete: () => void;
  onApply: (evaluationId: string) => void;
  onRemoveHolder: (evaluationId: string) => void;
}) {
  const holderIds = new Set((holderRows ?? []).map((r) => r.id));

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/40">
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-2">
        {/* Badge pill or inline rename input */}
        {editing ? (
          <div className="flex flex-1 items-center gap-2">
            <input
              autoFocus
              value={editLabel}
              onChange={(e) => onEditLabelChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); onSaveRename(); }
                if (e.key === "Escape") { e.preventDefault(); onCancelRename(); }
              }}
              className="flex-1 rounded-md border border-amber-500/40 bg-zinc-900 px-2.5 py-1 text-sm text-amber-200 focus:border-amber-500/70 focus:outline-none"
            />
            <button
              type="button"
              onClick={onSaveRename}
              disabled={!editLabel.trim()}
              className="rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-40"
            >
              Save
            </button>
            <button
              type="button"
              onClick={onCancelRename}
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              Cancel
            </button>
          </div>
        ) : (
          <span className="inline-flex items-center rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-sm text-amber-200">
            {badge.label}
          </span>
        )}

        {!editing && (
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onStartEditing}
              className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={onToggleExpand}
              className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                expanded
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                  : "border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              }`}
            >
              {expanded ? "Close" : "Manage"}
            </button>
            <button
              type="button"
              onClick={onDelete}
              aria-label={`Delete ${badge.label}`}
              className="rounded-md border border-red-500/30 px-2.5 py-1 text-xs text-red-400/70 hover:border-red-500/60 hover:text-red-300"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {badgeMsg && (
        <p className="px-3 pb-2 text-sm text-red-400">{badgeMsg}</p>
      )}

      {/* Expanded management panel */}
      {expanded && (
        <div className="flex flex-col gap-4 border-t border-zinc-800 px-3 py-3">
          {/* Search & add profiles */}
          <BadgeProfileSearch
            holderIds={holderIds}
            onApply={onApply}
          />

          {/* Holders table */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Badge holders</p>
            {holdersLoading ? (
              <p className="text-sm text-zinc-500">Loading…</p>
            ) : holderRows === null || holderRows.length === 0 ? (
              <p className="text-sm text-zinc-500">No one has this badge yet.</p>
            ) : (
              <ProfileMiniTable
                rows={holderRows}
                isClaimed
                rowAction={(row) => (
                  <button
                    type="button"
                    onClick={() => onRemoveHolder(row.id)}
                    className="rounded-md border border-red-500/30 px-2 py-0.5 text-xs text-red-400/70 hover:border-red-500/60 hover:text-red-300"
                  >
                    Remove
                  </button>
                )}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Debounced search box for adding a profile to a badge.
function BadgeProfileSearch({
  holderIds,
  onApply,
}: {
  holderIds: Set<string>;
  onApply: (evaluationId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LeaderboardRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const genRef = useRef(0);

  const trimmed = query.trim();
  const active = trimmed.length >= MIN_CHARS;

  // Debounced search (generation-token pattern from AttendeeManager).
  useEffect(() => {
    if (!active) {
      genRef.current++;
      setResults(null);
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

  async function handleApply(row: LeaderboardRow) {
    if (holderIds.has(row.id)) return;
    setApplying(row.id);
    try {
      await onApply(row.id);
      setQuery("");
      setResults(null);
      setFocused(false);
    } finally {
      setApplying(null);
    }
  }

  const visible = results ? results.slice(0, MAX_RESULTS) : [];
  const settledEmpty = active && !loading && results !== null && results.length === 0;

  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Add a profile</p>
      <div ref={containerRef} className="relative">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          placeholder="Search by name…"
          aria-label="Search profiles to add badge to"
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none"
        />
        {focused && active && (
          <div className="absolute left-0 z-50 mt-1 w-full max-w-md overflow-hidden rounded-md border border-zinc-800 bg-[#151515] shadow-xl shadow-black/40">
            {loading && (results === null || results.length === 0) ? (
              <div className="px-3 py-3 text-sm text-zinc-500">Searching…</div>
            ) : settledEmpty ? (
              <div className="px-3 py-3 text-sm text-zinc-500">No profiles found.</div>
            ) : (
              <ul className="max-h-[40vh] overflow-y-auto py-1">
                {visible.map((row) => {
                  const already = holderIds.has(row.id);
                  const isApplying = applying === row.id;
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        disabled={already || isApplying}
                        onClick={() => handleApply(row)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-zinc-800/60 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm text-zinc-100">
                          {row.fullName ?? "(unnamed)"}
                          {row.companyName && <span className="text-zinc-500">, {row.companyName}</span>}
                        </span>
                        <span className="shrink-0 font-mono text-xs tabular-nums text-zinc-400">
                          {row.combinedScore.toLocaleString("en-US")}
                        </span>
                        <span className={`shrink-0 text-xs ${already ? "text-zinc-500" : "text-amber-400"}`}>
                          {isApplying ? "Adding…" : already ? "Added" : "+ Add"}
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
    </div>
  );
}
