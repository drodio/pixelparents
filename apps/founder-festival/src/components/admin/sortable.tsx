"use client";

import { useMemo, useState } from "react";
import { sortRows, type SortDir, type SortValue } from "@/lib/sort";

// Client-side sorting for the admin dashboard tables. Data sets here are bounded
// (purchasers are few; spend detail is capped), so sorting in the browser keeps
// the tables instant and the server code simple.
//
// Pass an `accessors` map defined at MODULE scope (stable identity) so the memo
// doesn't churn every render.
export function useSortable<T>(
  rows: T[],
  accessors: Record<string, (row: T) => SortValue>,
  initialKey: string,
  initialDir: SortDir,
) {
  const [sort, setSort] = useState<{ key: string; dir: SortDir }>({
    key: initialKey,
    dir: initialDir,
  });
  const sorted = useMemo(() => {
    const acc = accessors[sort.key];
    return acc ? sortRows(rows, acc, sort.dir) : rows;
  }, [rows, sort, accessors]);
  const toggle = (key: string, defaultDir: SortDir = "asc") =>
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: defaultDir },
    );
  return { sorted, sort, toggle };
}

// A clickable, sortable column header. Shows a caret on the active column.
export function SortHeader({
  label,
  colKey,
  sort,
  onToggle,
  align = "left",
  defaultDir = "asc",
}: {
  label: string;
  colKey: string;
  sort: { key: string; dir: SortDir };
  onToggle: (key: string, defaultDir?: SortDir) => void;
  align?: "left" | "right";
  defaultDir?: SortDir;
}) {
  const active = sort.key === colKey;
  return (
    <th className={`px-4 py-3 ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={() => onToggle(colKey, defaultDir)}
        className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-white transition-colors ${
          active ? "text-white" : "text-zinc-400"
        } ${align === "right" ? "flex-row-reverse" : ""}`}
      >
        <span>{label}</span>
        <span className="text-[9px] w-2 inline-block">{active ? (sort.dir === "asc" ? "▲" : "▼") : ""}</span>
      </button>
    </th>
  );
}
