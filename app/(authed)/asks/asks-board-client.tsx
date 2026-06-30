"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { iconForInterest } from "@/lib/interest-icons";
import { IconX } from "@/components/icons";

export type AskCard = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  createdAt: string; // ISO
};

// The asks board: a list of open asks (newest first) with an expertise-tag facet
// filter (reuses the directory chip-filter pattern). Cards link to the detail
// page. Newest-first ordering comes from the server; we only filter here.
export function AsksBoardClient({ asks }: { asks: AskCard[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Distinct expertise tags across all open asks, deduped case-insensitively but
  // keeping the first-seen display label, sorted for a stable facet row.
  const allTags = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const a of asks) {
      for (const t of a.tags) {
        const k = t.toLowerCase();
        if (!byKey.has(k)) byKey.set(k, t);
      }
    }
    return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b));
  }, [asks]);

  const toggleTag = (label: string) => {
    const key = label.toLowerCase();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const visible = useMemo(() => {
    if (selected.size === 0) return asks;
    return asks.filter((a) => {
      const keys = new Set(a.tags.map((t) => t.toLowerCase()));
      for (const s of selected) if (keys.has(s)) return true; // OR match
      return false;
    });
  }, [asks, selected]);

  return (
    <div className="flex flex-col gap-6">
      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {allTags.map((label) => {
            const active = selected.has(label.toLowerCase());
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
          {selected.size > 0 && (
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="inline-flex items-center gap-1 px-2 text-xs text-white/45 hover:text-white/80"
            >
              Clear <IconX className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      <p className="text-sm text-white/45">
        {visible.length} {visible.length === 1 ? "open ask" : "open asks"}
        {selected.size > 0 ? " match your filter" : ""}
      </p>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center text-white/50">
          No open asks match your filter.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((a) => (
            <Link
              key={a.id}
              href={`/asks/${a.id}`}
              className="group rounded-2xl border border-white/10 bg-white/[0.02] p-5 transition-colors hover:border-amber-400/40 hover:bg-white/[0.04]"
            >
              <h3 className="font-semibold text-white">{a.title}</h3>
              <p className="mt-1 line-clamp-2 text-sm text-white/60">{a.body}</p>
              {a.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {a.tags.map((t) => {
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
          ))}
        </div>
      )}
    </div>
  );
}
