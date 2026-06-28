"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangelogEntryView, ChangelogStats } from "@/lib/changelog";
import {
  CHANGELOG_CATEGORIES,
  CHANGE_TYPES,
  CHANGE_TYPE_STYLE,
  CHANGE_TYPE_LABEL,
  categoryLabel,
} from "@/lib/changelog-constants";

function fmtDate(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    time: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" }),
  };
}

export function ChangelogTimeline({
  entries,
  stats,
}: {
  entries: ChangelogEntryView[];
  stats: ChangelogStats;
}) {
  // Active filters. A category OR a change-type. Clicking any badge toggles it.
  const [cats, setCats] = useState<Set<string>>(new Set());
  const [types, setTypes] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [highlight, setHighlight] = useState<string | null>(null);
  const refs = useRef<Record<string, HTMLLIElement | null>>({});

  const toggleCat = (c: string) =>
    setCats((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  const toggleType = (t: string) =>
    setTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  const clearAll = () => {
    setCats(new Set());
    setTypes(new Set());
  };
  // Stat boxes filter the timeline to a single change type. Clicking the active
  // one (or "Total PRs") clears the type filter back to "all".
  const selectOnlyType = (t: string) =>
    setTypes((prev) => (prev.size === 1 && prev.has(t) ? new Set() : new Set([t])));

  // Deep-link: /changelog?item=<slug> (or #<slug>) → scroll to + expand + flash.
  useEffect(() => {
    const url = new URL(window.location.href);
    const slug = url.searchParams.get("item") || window.location.hash.replace(/^#/, "");
    if (!slug) return;
    const el = refs.current[slug];
    if (el) {
      setExpanded((p) => new Set(p).add(slug));
      setHighlight(slug);
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      const t = setTimeout(() => setHighlight(null), 2600);
      return () => clearTimeout(t);
    }
  }, []);

  const visible = useMemo(
    () =>
      entries.filter(
        (e) =>
          (cats.size === 0 || e.categories.some((c) => cats.has(c))) &&
          (types.size === 0 || types.has(e.changeType)),
      ),
    [entries, cats, types],
  );

  // Only show category chips that actually appear in the data, most-common first.
  const presentCats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) for (const c of e.categories) counts.set(c, (counts.get(c) ?? 0) + 1);
    return CHANGELOG_CATEGORIES.filter((c) => counts.has(c.slug)).sort(
      (a, b) => (counts.get(b.slug) ?? 0) - (counts.get(a.slug) ?? 0),
    );
  }, [entries]);

  const hasFilters = cats.size > 0 || types.size > 0;

  const onlyType = types.size === 1 ? [...types][0] : null;

  return (
    <div>
      {/* Headline stats. Each box is a filter: the type boxes scope the timeline
          to that change type; "Total PRs" clears back to all. */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBox
          label="Total PRs"
          value={stats.totalPrs}
          active={onlyType === null}
          onClick={() => setTypes(new Set())}
        />
        <StatBox
          label="Features shipped in the past month"
          value={stats.features}
          active={onlyType === "feature"}
          onClick={() => selectOnlyType("feature")}
        />
        <StatBox
          label="Enhancements shipped in the past month"
          value={stats.enhancements}
          active={onlyType === "enhancement"}
          onClick={() => selectOnlyType("enhancement")}
        />
        <StatBox
          label="Bugs fixed in the past month"
          value={stats.bugs}
          active={onlyType === "bug_fix"}
          onClick={() => selectOnlyType("bug_fix")}
        />
      </div>

      {/* Filter controls */}
      <div className="mb-6 rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs uppercase tracking-wide text-zinc-500">Type</span>
          {CHANGE_TYPES.map((t) => {
            const on = types.has(t.slug);
            return (
              <button
                key={t.slug}
                type="button"
                onClick={() => toggleType(t.slug)}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition ${
                  on ? CHANGE_TYPE_STYLE[t.slug] : "text-zinc-400 ring-1 ring-inset ring-zinc-700 hover:text-zinc-200"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs uppercase tracking-wide text-zinc-500">Area</span>
          {presentCats.map((c) => {
            const on = cats.has(c.slug);
            return (
              <button
                key={c.slug}
                type="button"
                onClick={() => toggleCat(c.slug)}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition ${
                  on
                    ? "bg-[#dfa43a]/15 text-[#dfa43a] ring-1 ring-inset ring-[#dfa43a]/40"
                    : "text-zinc-400 ring-1 ring-inset ring-zinc-700 hover:text-zinc-200"
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active filter pills (x to remove) */}
      {hasFilters && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-500">Filtering:</span>
          {[...types].map((t) => (
            <FilterPill key={`t-${t}`} label={CHANGE_TYPE_LABEL[t] ?? t} onClear={() => toggleType(t)} />
          ))}
          {[...cats].map((c) => (
            <FilterPill key={`c-${c}`} label={categoryLabel(c)} onClear={() => toggleCat(c)} />
          ))}
          <button
            type="button"
            onClick={clearAll}
            className="ml-1 text-xs text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
          >
            clear all
          </button>
          <span className="ml-auto text-xs text-zinc-600">
            {visible.length} of {entries.length}
          </span>
        </div>
      )}

      {/* Timeline. The <ol>'s left border IS the gray line; each dot is centered
          ON it (li has no left margin; -left-[8px] = half the 14px dot minus the
          2px line, so the gold core sits over the line, not to its right). */}
      <ol className="relative ml-2 border-l-2 border-zinc-800">
        {visible.map((e) => {
          const { date, time } = fmtDate(e.shippedAt);
          const isOpen = expanded.has(e.slug);
          return (
            <li
              key={e.id}
              id={e.slug}
              ref={(el) => {
                refs.current[e.slug] = el;
              }}
              className={`relative pb-9 pl-7 transition-colors ${
                highlight === e.slug ? "rounded-lg bg-[#dfa43a]/5" : ""
              }`}
            >
              {/* dot — centered on the line */}
              <span
                className={`absolute -left-[8px] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-[#151515] ${
                  highlight === e.slug ? "bg-[#dfa43a] ring-2 ring-[#dfa43a]/40" : "bg-[#dfa43a]"
                }`}
              />
              <div className="mb-1.5 flex items-baseline gap-2">
                <time className="text-sm font-medium text-zinc-300">{date}</time>
                <span className="text-xs text-zinc-600">{time}</span>
              </div>

              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => toggleType(e.changeType)}
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${CHANGE_TYPE_STYLE[e.changeType]}`}
                  title="Filter by this type"
                >
                  {CHANGE_TYPE_LABEL[e.changeType] ?? e.changeType}
                </button>
                {e.categories.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggleCat(c)}
                    className="rounded-full px-2 py-0.5 text-[11px] font-medium text-zinc-300 ring-1 ring-inset ring-zinc-700 transition hover:bg-[#dfa43a]/10 hover:text-[#dfa43a] hover:ring-[#dfa43a]/40"
                    title="Filter by this area"
                  >
                    {categoryLabel(c)}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() =>
                  setExpanded((p) => {
                    const n = new Set(p);
                    if (n.has(e.slug)) n.delete(e.slug);
                    else n.add(e.slug);
                    return n;
                  })
                }
                className="group flex w-full items-start gap-2 text-left"
                aria-expanded={isOpen}
              >
                <span
                  className={`mt-1 select-none text-zinc-600 transition-transform ${isOpen ? "rotate-90" : ""}`}
                  aria-hidden
                >
                  ▸
                </span>
                <span className="text-[15px] font-semibold text-zinc-100 group-hover:text-white">
                  {e.title}
                </span>
              </button>

              {isOpen && (
                <div className="mt-2 pl-5 text-sm leading-relaxed text-zinc-400">
                  <p>{e.summary}</p>
                  {e.bullets.length > 0 && (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-zinc-500 marker:text-[#dfa43a]/60">
                      {e.bullets.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {visible.length === 0 && (
        <p className="py-10 text-center text-sm text-zinc-500">No entries match these filters.</p>
      )}
    </div>
  );
}

function StatBox({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex flex-col items-center justify-between gap-2 rounded-xl border p-4 text-center transition ${
        active
          ? "border-[#dfa43a]/60 bg-[#dfa43a]/10"
          : "border-zinc-800/80 bg-zinc-900/30 hover:border-zinc-700"
      }`}
    >
      <span className="text-[11px] font-medium uppercase leading-tight tracking-wide text-zinc-400">
        {label}
      </span>
      <span className="font-display text-3xl font-bold tabular-nums text-[#dfa43a] sm:text-4xl">
        {value.toLocaleString("en-US")}
      </span>
    </button>
  );
}

function FilterPill({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#dfa43a]/15 px-2.5 py-0.5 text-xs font-medium text-[#dfa43a] ring-1 ring-inset ring-[#dfa43a]/40">
      {label}
      <button
        type="button"
        onClick={onClear}
        className="ml-0.5 text-[#dfa43a]/70 hover:text-[#dfa43a]"
        aria-label={`Remove ${label} filter`}
      >
        ×
      </button>
    </span>
  );
}
