"use client";

export type Dir = "asc" | "desc";

// Compare two sort values. Null/empty always sorts last, regardless of dir.
export function compare(a: unknown, b: unknown, dir: Dir): number {
  const an = a === null || a === undefined || a === "";
  const bn = b === null || b === undefined || b === "";
  if (an && bn) return 0;
  if (an) return 1;
  if (bn) return -1;
  let r: number;
  if (typeof a === "number" && typeof b === "number") {
    r = a - b;
  } else {
    r = String(a).localeCompare(String(b), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  }
  return dir === "asc" ? r : -r;
}

// Clickable column header. Shows ↕ when inactive, ▲ (asc) / ▼ (desc) when active.
export function SortHeader({
  label,
  k,
  sortKey,
  dir,
  onSort,
  className,
  extra,
}: {
  label: string;
  k: string;
  sortKey: string;
  dir: Dir;
  onSort: (k: string) => void;
  className: string;
  // Optional non-sorting control rendered next to the label (e.g. a copy button).
  extra?: React.ReactNode;
}) {
  const active = k === sortKey;
  return (
    <th className={className} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <span className="inline-flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onSort(k)}
          className="inline-flex items-center gap-1 hover:text-white"
        >
          {label}
          <span className={`text-[9px] ${active ? "text-white/70" : "text-white/30"}`}>
            {active ? (dir === "asc" ? "▲" : "▼") : "↕"}
          </span>
        </button>
        {extra}
      </span>
    </th>
  );
}
