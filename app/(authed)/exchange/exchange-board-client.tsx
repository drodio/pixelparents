"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { iconForInterest } from "@/lib/interest-icons";
import { IconX, IconClock, IconCircleCheck } from "@/components/icons";
import {
  distinctTags,
  filterAndSortPosts,
  isExpired,
  isExpiringSoon,
  type ExchangePost,
  type KindFilter,
  type SortDir,
  type SortKey,
  type StatusFilter,
} from "@/lib/exchange";

// The Exchange board: a list of posts that are either Asks ("I need help") or
// Offers ("I can help"). The server hands us a flat list (created_at ASC); ALL
// filtering + sorting is pure and lives in lib/exchange.ts so it's unit-tested.
// Default view: open posts, oldest first (the longest-waiting post on top).

const KIND_TABS: { value: KindFilter; label: string }[] = [
  { value: "ask", label: "Asks" },
  { value: "offer", label: "Offers" },
  { value: "all", label: "All" },
];

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
  { value: "all", label: "All" },
];

const segCls = (active: boolean) =>
  `px-3 py-1.5 text-xs font-medium transition-colors ${
    active ? "bg-amber-400 text-black" : "text-white/65 hover:bg-white/10"
  }`;

function MemberTypeBadge({ isStudent }: { isStudent: boolean }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[11px] ${
        isStudent
          ? "border-sky-400/30 bg-sky-400/10 text-sky-200"
          : "border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-200"
      }`}
    >
      {isStudent ? "Student" : "Parent"}
    </span>
  );
}

function KindBadge({ kind }: { kind: ExchangePost["kind"] }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${
        kind === "offer"
          ? "border-violet-400/30 bg-violet-400/10 text-violet-200"
          : "border-amber-400/30 bg-amber-400/10 text-amber-200"
      }`}
    >
      {kind === "offer" ? "Offer" : "Ask"}
    </span>
  );
}

function UrgencyBadge({ urgency }: { urgency: ExchangePost["urgency"] }) {
  if (urgency === "normal") return null;
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[11px] ${
        urgency === "high"
          ? "border-red-400/30 bg-red-400/10 text-red-200"
          : "border-white/15 bg-white/[0.05] text-white/55"
      }`}
    >
      {urgency === "high" ? "High urgency" : "Low urgency"}
    </span>
  );
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "";
}

export function ExchangeBoardClient({
  posts,
  myPostIds,
  viewerSignupId,
}: {
  posts: ExchangePost[];
  myPostIds: string[];
  viewerSignupId: string | null;
}) {
  const [kind, setKind] = useState<KindFilter>("ask");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("recency");
  const [sortDir, setSortDir] = useState<SortDir>("asc"); // oldest first default
  const [showExpired, setShowExpired] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);

  const myIds = useMemo(() => new Set(myPostIds), [myPostIds]);
  const allTags = useMemo(() => distinctTags(posts), [posts]);

  const toggleTag = (label: string) => {
    const key = label.toLowerCase();
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const visible = useMemo(
    () =>
      filterAndSortPosts(posts, {
        kind,
        status: statusFilter,
        tags: selectedTags,
        sortKey,
        sortDir,
        showExpired,
        mineSignupId: mineOnly ? viewerSignupId : null,
        myPostIds: mineOnly ? myIds : null,
      }),
    [posts, kind, statusFilter, selectedTags, sortKey, sortDir, showExpired, mineOnly, myIds, viewerSignupId],
  );

  const sortLabel =
    sortKey === "recency"
      ? sortDir === "asc"
        ? "Oldest first"
        : "Newest first"
      : sortDir === "desc"
        ? "Most urgent first"
        : "Least urgent first";

  return (
    <div className="flex flex-col gap-5">
      {/* Kind split (segmented) */}
      <div className="inline-flex w-fit overflow-hidden rounded-full border border-white/15">
        {KIND_TABS.map((t) => (
          <button key={t.value} type="button" onClick={() => setKind(t.value)} className={segCls(kind === t.value)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Controls row: status, sort, expiry, my posts */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex overflow-hidden rounded-full border border-white/15">
          {STATUS_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setStatusFilter(t.value)}
              className={segCls(statusFilter === t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="inline-flex items-center overflow-hidden rounded-full border border-white/15">
          <button
            type="button"
            onClick={() => {
              setSortKey("recency");
              setSortDir((d) => (sortKey === "recency" ? (d === "asc" ? "desc" : "asc") : "asc"));
            }}
            className={segCls(sortKey === "recency")}
          >
            Recency
          </button>
          <button
            type="button"
            onClick={() => {
              setSortKey("urgency");
              setSortDir((d) => (sortKey === "urgency" ? (d === "asc" ? "desc" : "asc") : "desc"));
            }}
            className={segCls(sortKey === "urgency")}
          >
            Urgency
          </button>
        </div>
        <span className="text-xs text-white/45">{sortLabel}</span>

        <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-white/55">
          <input type="checkbox" checked={showExpired} onChange={(e) => setShowExpired(e.target.checked)} />
          Show expired
        </label>

        {viewerSignupId && (
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-white/55">
            <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
            My posts
          </label>
        )}
      </div>

      {/* Expertise-tag facet (reuses the directory chip-filter pattern) */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {allTags.map((label) => {
            const active = selectedTags.has(label.toLowerCase());
            const Icon = iconForInterest(label);
            return (
              <button
                key={label}
                type="button"
                onClick={() => toggleTag(label)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  active
                    ? "border-amber-400 bg-amber-400 text-black"
                    : "border-white/15 bg-white/[0.04] text-white/70 hover:bg-white/10"
                }`}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                {label}
              </button>
            );
          })}
          {selectedTags.size > 0 && (
            <button
              type="button"
              onClick={() => setSelectedTags(new Set())}
              className="inline-flex items-center gap-1 px-2 text-xs text-white/45 hover:text-white/80"
            >
              Clear <IconX className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      <p className="text-sm text-white/45">
        {visible.length} {visible.length === 1 ? "post" : "posts"}
      </p>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center text-white/50">
          No posts match your filters.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((p) => {
            const expired = isExpired(p);
            const soon = !expired && isExpiringSoon(p);
            const resolved = p.status === "resolved";
            return (
              <Link
                key={p.id}
                href={`/exchange/${p.id}`}
                className={`group rounded-2xl border border-white/10 bg-white/[0.02] p-5 transition-colors hover:border-amber-400/40 hover:bg-white/[0.04] ${
                  expired || resolved ? "opacity-60" : ""
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <KindBadge kind={p.kind} />
                  <UrgencyBadge urgency={p.urgency} />
                  {resolved && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[11px] text-emerald-200">
                      <IconCircleCheck className="h-3 w-3" /> Resolved
                    </span>
                  )}
                  {expired ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.05] px-2 py-0.5 text-[11px] text-white/45">
                      <IconClock className="h-3 w-3" /> Expired
                    </span>
                  ) : soon ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[11px] text-amber-200">
                      <IconClock className="h-3 w-3" /> Expires soon
                    </span>
                  ) : null}
                </div>

                <h3 className="mt-2 font-semibold text-white">{p.title}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-white/60">{p.body}</p>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/45">
                  <span className="text-white/70">{p.authorName || "A community member"}</span>
                  <MemberTypeBadge isStudent={p.isStudent} />
                  {p.validUntil && !expired && <span>· valid until {fmtDate(p.validUntil)}</span>}
                </div>

                {p.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {p.tags.map((t) => {
                      const Icon = iconForInterest(t);
                      return (
                        <span
                          key={t}
                          className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.05] px-2.5 py-1 text-xs text-white/80"
                        >
                          <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                          {t}
                        </span>
                      );
                    })}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
