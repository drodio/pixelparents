"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { TagList } from "@/components/tag-list";
import {
  IconPlus,
  IconFlame,
  IconStar,
  IconClock,
  IconPin,
  IconArrowRight,
  IconBook,
} from "@/components/icons";
import { sortBoards, type BoardSort, filterByTag } from "@/lib/resources-label";
import { UpvoteButton } from "./upvote-button";
import { toggleBoardUpvoteAction } from "./actions";

export type BoardCard = {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  pinned: boolean;
  contributionCount: number;
  upvotes: number;
  viewerUpvoted: boolean;
  createdAt: string; // ISO
  lastActivityAt: string; // ISO
  authorName: string;
  isStudent: boolean;
  isMine: boolean;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function relativeDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const SORTS: Array<{ key: BoardSort; label: string; Icon: typeof IconFlame }> = [
  { key: "hot", label: "Hot", Icon: IconFlame },
  { key: "top", label: "Top", Icon: IconStar },
  { key: "new", label: "New", Icon: IconClock },
];

// The boards INDEX: a sort switcher (Hot / Top / New), a "Create board" CTA, a
// topic-tag filter strip (reuses <TagList>), an optional "trending this week"
// strip, and the board cards. Sorting + filtering happen client-side over the
// already-loaded list via the SHARED pure ranker (lib/resources-label), so the
// UI and the tests agree on ordering.
export function BoardsClient({
  boards,
  tagCounts,
}: {
  boards: BoardCard[];
  tagCounts: Array<{ tag: string; count: number }>;
}) {
  const [sort, setSort] = useState<BoardSort>("hot");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const reduce = useReducedMotion();

  // "now" is captured ONCE via a lazy initializer (runs a single time, outside
  // the render path) and used as the stable clock for hot-ranking + the trending
  // window. Re-reading Date.now() every render would be impure and could reorder
  // cards mid-interaction.
  const [now] = useState<number>(() => Date.now());

  const filtered = useMemo(() => filterByTag(boards, activeTag), [boards, activeTag]);

  const ranked = useMemo(() => {
    const rankable = filtered.map((b) => ({
      ...b,
      createdAtMs: new Date(b.createdAt).getTime(),
      lastActivityMs: new Date(b.lastActivityAt).getTime(),
    }));
    return sortBoards(rankable, sort, now);
  }, [filtered, sort, now]);

  // "Trending this week": boards active in the last 7 days, by upvotes.
  const trending = useMemo(() => {
    return [...boards]
      .filter((b) => now - new Date(b.lastActivityAt).getTime() < WEEK_MS && b.upvotes > 0)
      .sort((a, b) => b.upvotes - a.upvotes)
      .slice(0, 4);
  }, [boards, now]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-white/50">
          {boards.length} {boards.length === 1 ? "board" : "boards"} · curated by the OHS community
        </p>
        <Link
          href="/resources/new"
          className="inline-flex items-center gap-2 rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-black transition hover:bg-amber-300"
        >
          <IconPlus className="h-4 w-4" />
          Create board
        </Link>
      </div>

      {/* Trending this week strip — only when there's something warm to show. */}
      {trending.length > 0 && (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-200/80">
            <IconFlame className="h-4 w-4" />
            Trending this week
          </div>
          <div className="flex flex-wrap gap-2">
            {trending.map((b) => (
              <Link
                key={b.id}
                href={`/resources/${b.id}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/80 transition-colors hover:border-amber-400/40 hover:text-white"
              >
                <span className="font-medium">{b.title}</span>
                <span className="text-amber-200/80">▲ {b.upvotes}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Sort switcher. */}
      <div className="flex items-center gap-2">
        {SORTS.map(({ key, label, Icon }) => {
          const active = sort === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSort(key)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "border-amber-400/60 bg-amber-400/15 text-amber-200"
                  : "border-white/15 bg-white/[0.04] text-white/60 hover:bg-white/10 hover:text-white/80"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          );
        })}
      </div>

      {/* Topic filter chip strip — reuses the shared <TagList> "+N more" collapse. */}
      {tagCounts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-white/40">Filter by topic:</span>
          <button
            type="button"
            onClick={() => setActiveTag(null)}
            aria-pressed={activeTag === null}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
              activeTag === null
                ? "border-amber-400/60 bg-amber-400/15 text-amber-200"
                : "border-white/15 bg-white/[0.04] text-white/60 hover:bg-white/10 hover:text-white/80"
            }`}
          >
            All
          </button>
          <TagList
            tags={tagCounts.map((t) => t.tag)}
            max={8}
            renderTag={(tag) => {
              const count = tagCounts.find((t) => t.tag === tag)?.count ?? 0;
              const active = activeTag === tag;
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setActiveTag(active ? null : tag)}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "border-amber-400/60 bg-amber-400/15 text-amber-200"
                      : "border-white/15 bg-white/[0.04] text-white/70 hover:bg-white/10 hover:text-white/90"
                  }`}
                >
                  {tag}
                  <span className="text-white/35">{count}</span>
                </button>
              );
            }}
          />
        </div>
      )}

      {/* Board cards. */}
      {ranked.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
          {boards.length === 0 ? (
            <>
              <p className="text-white/60">No boards yet — be the first to start one.</p>
              <Link
                href="/resources/new"
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-amber-300 hover:text-amber-200"
              >
                Create the first board <IconArrowRight className="h-4 w-4" />
              </Link>
            </>
          ) : (
            <p className="text-white/60">
              No boards tagged <span className="text-amber-200">{activeTag}</span> yet.
            </p>
          )}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {ranked.map((b, i) => (
            <BoardCardItem key={b.id} board={b} index={i} reduce={Boolean(reduce)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function BoardCardItem({
  board,
  index,
  reduce,
}: {
  board: BoardCard;
  index: number;
  reduce: boolean;
}) {
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: reduce ? 0 : Math.min(index * 0.03, 0.2) }}
      className="group relative flex flex-col rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition-colors hover:border-amber-400/30"
    >
      <Link href={`/resources/${board.id}`} className="absolute inset-0 z-0" aria-label={board.title}>
        <span className="sr-only">{board.title}</span>
      </Link>

      <div className="relative z-10 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {board.pinned && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200"
                title="Pinned board"
              >
                <IconPin className="h-3 w-3" />
                Pinned
              </span>
            )}
          </div>
          <h3 className="mt-1 truncate text-base font-semibold text-white group-hover:text-amber-200">
            {board.title}
          </h3>
        </div>
        {/* Upvote sits above the overlay link so clicking it doesn't navigate. */}
        <div className="relative z-10 shrink-0">
          <UpvoteButton
            initialCount={board.upvotes}
            initialUpvoted={board.viewerUpvoted}
            onToggle={() => toggleBoardUpvoteAction({ boardId: board.id })}
            size="sm"
            label="board upvote"
          />
        </div>
      </div>

      {board.description && (
        <p className="relative z-10 mt-1.5 line-clamp-2 text-sm text-white/60">{board.description}</p>
      )}

      {board.tags.length > 0 && (
        <div className="relative z-10 mt-3">
          <TagList tags={board.tags} max={4} />
        </div>
      )}

      <div className="relative z-10 mt-3 flex items-center gap-3 text-xs text-white/40">
        <span className="inline-flex items-center gap-1">
          <IconBook className="h-3.5 w-3.5" />
          {board.contributionCount} {board.contributionCount === 1 ? "item" : "items"}
        </span>
        <span aria-hidden>·</span>
        <span className="truncate">
          {board.authorName}
          {board.isStudent && " (student)"}
        </span>
        <span aria-hidden>·</span>
        <span className="shrink-0">{relativeDate(board.createdAt)}</span>
      </div>

      {/* The card invites navigation; this arrow nudges it without competing. */}
      <span className="pointer-events-none absolute bottom-4 right-4 z-10 text-white/0 transition-colors group-hover:text-amber-300">
        <IconArrowRight className="h-4 w-4" />
      </span>
    </motion.li>
  );
}
