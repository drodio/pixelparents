import { describe, it, expect } from "vitest";
import {
  collectFilterLabels,
  rowLabelKeys,
  rowMatchesFilter,
  type FilterableRow,
} from "@/lib/profile-filter";

const webRow: FilterableRow = { source: "web", runs: [] };
const bulkRow: FilterableRow = {
  source: "bulk",
  runs: [{ jobId: "job-1", title: "Batch A" }],
};
const multiRunRow: FilterableRow = {
  source: "bulk",
  runs: [
    { jobId: "job-1", title: "Batch A" },
    { jobId: "job-2", title: "Batch B" },
  ],
};

describe("rowLabelKeys", () => {
  it("includes the source key plus one run key per run", () => {
    expect(rowLabelKeys(webRow)).toEqual(["source:web"]);
    expect(rowLabelKeys(bulkRow)).toEqual(["source:bulk", "run:job-1"]);
    expect(rowLabelKeys(multiRunRow)).toEqual(["source:bulk", "run:job-1", "run:job-2"]);
  });
});

describe("collectFilterLabels", () => {
  it("returns source labels (web/bulk/api order) then de-duped run labels", () => {
    const labels = collectFilterLabels([webRow, bulkRow, multiRunRow]);
    expect(labels).toEqual([
      { key: "source:web", label: "Web", kind: "source" },
      { key: "source:bulk", label: "Bulk", kind: "source" },
      { key: "run:job-1", label: "Batch A", kind: "run" },
      { key: "run:job-2", label: "Batch B", kind: "run" },
    ]);
  });

  it("labels an untitled run 'Untitled run'", () => {
    const labels = collectFilterLabels([{ source: "bulk", runs: [{ jobId: "j", title: null }] }]);
    expect(labels).toContainEqual({ key: "run:j", label: "Untitled run", kind: "run" });
  });
});

describe("rowMatchesFilter", () => {
  it("shows a row when ANY of its labels is enabled", () => {
    expect(rowMatchesFilter(bulkRow, new Set(["run:job-1"]))).toBe(true); // run enabled
    expect(rowMatchesFilter(bulkRow, new Set(["source:bulk"]))).toBe(true); // source enabled
    expect(rowMatchesFilter(bulkRow, new Set(["source:web"]))).toBe(false); // neither matches
    expect(rowMatchesFilter(bulkRow, new Set<string>())).toBe(false); // select-none hides all
  });
});
