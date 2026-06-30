"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { gridContainer, gridItem, staticContainer, staticItem } from "../directory/motion";
import { iconForInterest } from "@/lib/interest-icons";
import { IconX, IconClock, IconCircleCheck, IconFilter, IconArrowRight, IconUsers } from "@/components/icons";
import { TagList } from "@/components/tag-list";
import { MobileSheet } from "@/components/mobile-sheet";
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

// The Community board: a list of posts that are either Asks ("I need help") or
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

const MotionLink = motion.create(Link);

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
  const reduce = useReducedMotion();
  const [kind, setKind] = useState<KindFilter>("ask");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("recency");
  const [sortDir, setSortDir] = useState<SortDir>("asc"); // oldest first default
  const [showExpired, setShowExpired] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);

  // On phones the secondary controls (status, sort, expiry, my-posts, tag chips)
  // move into a bottom sheet behind a Filters button; the Asks/Offers kind tabs
  // stay inline. Track viewport so the controls render in exactly one place.
  const [isMobile, setIsMobile] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Count of active secondary filters for the mobile Filters badge.
  const activeFilterCount =
    selectedTags.size +
    (statusFilter !== "open" ? 1 : 0) +
    (sortKey !== "recency" || sortDir !== "asc" ? 1 : 0) +
    (showExpired ? 1 : 0) +
    (mineOnly ? 1 : 0);

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

  // Filter signature — when it changes the motion list remounts so the staggered
  // reveal replays as the board's contents update.
  const boardKey = useMemo(
    () =>
      [
        kind,
        statusFilter,
        Array.from(selectedTags).sort().join(","),
        sortKey,
        sortDir,
        showExpired ? "exp" : "",
        mineOnly ? "mine" : "",
      ].join("|"),
    [kind, statusFilter, selectedTags, sortKey, sortDir, showExpired, mineOnly],
  );

  const sortLabel =
    sortKey === "recency"
      ? sortDir === "asc"
        ? "Oldest first"
        : "Newest first"
      : sortDir === "desc"
        ? "Most urgent first"
        : "Least urgent first";

  // Secondary controls (status, sort, expiry, my-posts, tag chips). Rendered
  // inline on desktop and inside the mobile filter sheet — one place at a time.
  const secondaryControls = (
    <div className="flex flex-col gap-4">
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

      {/* Expertise-tag facet (reuses the directory chip-filter pattern).
          Collapsed to a handful with a "+N more" toggle; chips stay clickable filters. */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <TagList
            tags={allTags}
            max={12}
            className="flex flex-wrap items-center gap-2"
            renderTag={(label) => {
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
            }}
          />
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
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Primary row: kind split (always inline) + a mobile-only Filters button. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex w-fit overflow-hidden rounded-full border border-white/15">
          {KIND_TABS.map((t) => (
            <button key={t.value} type="button" onClick={() => setKind(t.value)} className={segCls(kind === t.value)}>
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-3.5 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/10 md:hidden"
          aria-haspopup="dialog"
        >
          <IconFilter className="h-4 w-4" />
          Filters
          {activeFilterCount > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-amber-400 px-1 text-[11px] font-bold text-black">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Desktop: secondary controls inline. Rendered only when NOT mobile so
          the shared `secondaryControls` element never mounts twice. */}
      {!isMobile && <div className="hidden md:block">{secondaryControls}</div>}

      {/* Mobile: secondary controls in a bottom sheet. */}
      {isMobile && (
        <MobileSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title="Filters & sort"
          footer={
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  setStatusFilter("open");
                  setSelectedTags(new Set());
                  setSortKey("recency");
                  setSortDir("asc");
                  setShowExpired(false);
                  setMineOnly(false);
                }}
                className="text-sm text-white/55 hover:text-white"
              >
                Clear all
              </button>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="rounded-full bg-amber-400 px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-300"
              >
                Show {visible.length} {visible.length === 1 ? "post" : "posts"}
              </button>
            </div>
          }
        >
          {secondaryControls}
        </MobileSheet>
      )}

      <p className="text-sm text-white/45">
        {visible.length} {visible.length === 1 ? "post" : "posts"}
      </p>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center text-white/50">
          No posts match your filters.
        </div>
      ) : (
        // Animated board: posts stagger in on mount and animate in/out when the
        // Asks/Offers/status/tag filters change (keyed on the filter signature)
        // instead of hard-cutting. Reduced-motion → present/absent variants only.
        <motion.div
          key={reduce ? undefined : boardKey}
          variants={reduce ? staticContainer : gridContainer}
          initial="hidden"
          animate="show"
          className="flex flex-col gap-3"
        >
          <AnimatePresence mode="popLayout" initial={false}>
            {visible.map((p) => {
              const expired = isExpired(p);
              const soon = !expired && isExpiringSoon(p);
              const resolved = p.status === "resolved";
              // 3px left accent border by kind so the board is scannable at a
              // glance: Ask = amber, Offer = violet.
              const accent = p.kind === "offer" ? "border-l-violet-400/70" : "border-l-amber-400/70";
              // Dim ONLY the title/body on resolved/expired posts so the status
              // pill (Resolved / Expired) stays at full opacity and legible.
              const dim = expired || resolved;
              return (
                <MotionLink
                  key={p.id}
                  layout={!reduce}
                  variants={reduce ? staticItem : gridItem}
                  whileHover={reduce ? undefined : { y: -3 }}
                  transition={
                    reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 32 }
                  }
                  href={`/community/${p.id}`}
                  className={`group rounded-2xl border border-l-[3px] border-white/10 ${accent} bg-white/[0.02] p-5 transition-[border-color,background-color,box-shadow] hover:border-amber-400/40 hover:bg-white/[0.04] hover:shadow-lg hover:shadow-amber-400/5`}
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

                  <div className={dim ? "opacity-60" : ""}>
                    <h3 className="mt-2 font-semibold text-white">{p.title}</h3>
                    <p className="mt-1 line-clamp-2 text-sm text-white/60">{p.body}</p>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/45">
                    <span className="text-white/70">{p.authorName || "A community member"}</span>
                    <MemberTypeBadge isStudent={p.isStudent} />
                    {p.validUntil && !expired && <span>· valid until {fmtDate(p.validUntil)}</span>}
                    {(p.upvotes ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1 text-amber-200/80">
                        <IconArrowRight className="h-3 w-3 -rotate-90" strokeWidth={2.5} />
                        {p.upvotes}
                      </span>
                    )}
                    {(p.attachments ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1 text-emerald-200/80">
                        <IconUsers className="h-3 w-3" strokeWidth={2} />
                        {p.attachments}
                      </span>
                    )}
                  </div>

                  {p.tags.length > 0 && (
                    <TagList
                      tags={p.tags}
                      max={6}
                      className="mt-3 flex flex-wrap items-center gap-1.5"
                      renderTag={(t) => {
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
                      }}
                    />
                  )}
                </MotionLink>
              );
            })}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
