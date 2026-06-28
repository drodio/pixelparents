// Pure, stable, dependency-free row sorting shared by the admin dashboard
// tables (and the `useSortable` client hook). Keeping it pure makes the sort
// behavior unit-testable without React.

export type SortDir = "asc" | "desc";
export type SortValue = string | number | Date | null | undefined;

function keyOf(v: SortValue): string | number | null {
  if (v == null) return null;
  if (v instanceof Date) return v.getTime();
  return v;
}

// Returns a NEW array sorted by `accessor`. Stable (equal keys keep input order),
// and nulls/undefined always sort last regardless of direction (so an empty cell
// never jumps to the top when you flip the sort).
export function sortRows<T>(
  rows: T[],
  accessor: (row: T) => SortValue,
  dir: SortDir,
): T[] {
  const decorated = rows.map((row, i) => ({ row, i, key: keyOf(accessor(row)) }));
  decorated.sort((a, b) => {
    if (a.key == null && b.key == null) return a.i - b.i;
    if (a.key == null) return 1;
    if (b.key == null) return -1;
    let c: number;
    if (typeof a.key === "string" && typeof b.key === "string") {
      c = a.key.localeCompare(b.key);
    } else {
      c = a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    }
    if (c === 0) return a.i - b.i; // stable tiebreak
    return dir === "asc" ? c : -c;
  });
  return decorated.map((d) => d.row);
}
