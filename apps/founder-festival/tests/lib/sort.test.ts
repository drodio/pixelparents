import { describe, it, expect } from "vitest";
import { sortRows } from "@/lib/sort";

type Row = { id: number; name: string | null; amount: number | null; when: Date };

const rows: Row[] = [
  { id: 1, name: "Bob", amount: 30, when: new Date("2026-01-03") },
  { id: 2, name: "alice", amount: 10, when: new Date("2026-01-05") },
  { id: 3, name: null, amount: 20, when: new Date("2026-01-01") },
  { id: 4, name: "Bob", amount: null, when: new Date("2026-01-04") },
];

describe("sortRows", () => {
  it("sorts numbers ascending and descending", () => {
    expect(sortRows(rows, (r) => r.amount, "asc").map((r) => r.id)).toEqual([2, 3, 1, 4]);
    expect(sortRows(rows, (r) => r.amount, "desc").map((r) => r.id)).toEqual([1, 3, 2, 4]);
  });

  it("keeps nulls last in BOTH directions", () => {
    expect(sortRows(rows, (r) => r.amount, "asc").at(-1)!.id).toBe(4);
    expect(sortRows(rows, (r) => r.amount, "desc").at(-1)!.id).toBe(4);
    expect(sortRows(rows, (r) => r.name, "asc").at(-1)!.id).toBe(3);
    expect(sortRows(rows, (r) => r.name, "desc").at(-1)!.id).toBe(3);
  });

  it("sorts strings case-insensitively-ish via localeCompare and is stable on ties", () => {
    // alice < Bob; the two "Bob" rows keep input order (id 1 before id 4).
    expect(sortRows(rows, (r) => r.name, "asc").map((r) => r.id)).toEqual([2, 1, 4, 3]);
  });

  it("sorts Dates (newest first when desc)", () => {
    expect(sortRows(rows, (r) => r.when, "desc").map((r) => r.id)).toEqual([2, 4, 1, 3]);
  });

  it("does not mutate the input array", () => {
    const copy = [...rows];
    sortRows(rows, (r) => r.amount, "asc");
    expect(rows).toEqual(copy);
  });
});
