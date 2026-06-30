import { describe, expect, it } from "vitest";
import { REPORT_STATUSES, isReportStatus } from "@/lib/db/reports";

// Pure-logic coverage for the reports data layer. The DB-touching functions
// (createReport/listReports/setReportStatus/openReportCount) need a live Neon
// connection and are out of scope for the node-only unit suite; isReportStatus is
// the validation gate the admin status action relies on, so it's worth pinning.
describe("isReportStatus", () => {
  it("accepts the canonical statuses", () => {
    expect(isReportStatus("open")).toBe(true);
    expect(isReportStatus("resolved")).toBe(true);
  });

  it("rejects anything else, including casing and junk", () => {
    expect(isReportStatus("Open")).toBe(false);
    expect(isReportStatus("RESOLVED")).toBe(false);
    expect(isReportStatus("closed")).toBe(false);
    expect(isReportStatus("")).toBe(false);
    expect(isReportStatus("pending")).toBe(false);
    expect(isReportStatus("'; drop table reports;--")).toBe(false);
  });

  it("narrows exactly to the exported status set", () => {
    for (const s of REPORT_STATUSES) {
      expect(isReportStatus(s)).toBe(true);
    }
    expect(REPORT_STATUSES).toEqual(["open", "resolved"]);
  });
});
