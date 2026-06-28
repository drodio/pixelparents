import { describe, it, expect } from "vitest";
import {
  laDate,
  seriesToMap,
  pick,
  meanAt,
  pctDelta,
  formatValue,
  deltaBadge,
  lcpRating,
  gatherDailyMetrics,
  excludeEmails,
  exclusionClause,
} from "@/lib/daily-metrics";
import { type HogQLRow } from "@/lib/posthog-query";
import { renderDailyMetricsEmail } from "@/lib/daily-metrics-email";

describe("laDate", () => {
  it("formats an instant as the Pacific YYYY-MM-DD", () => {
    // 2026-06-11T02:00:00Z is still 2026-06-10 in Pacific (UTC-7 in June).
    expect(laDate(new Date("2026-06-11T02:00:00Z"))).toBe("2026-06-10");
    // 2026-06-11T15:00:00Z is 08:00 Pacific → same calendar day.
    expect(laDate(new Date("2026-06-11T15:00:00Z"))).toBe("2026-06-11");
  });
});

describe("seriesToMap / pick / meanAt", () => {
  const rows: HogQLRow[] = [
    ["2026-06-08", 10],
    ["2026-06-09", 20],
    ["2026-06-10", 30],
  ];
  it("maps day→value and reads back", () => {
    const m = seriesToMap(rows);
    expect(pick(m, "2026-06-09")).toBe(20);
    expect(pick(m, "2026-06-01")).toBe(0); // missing → 0
  });
  it("averages only the days that have data", () => {
    const m = seriesToMap(rows);
    expect(meanAt(m, ["2026-06-08", "2026-06-09", "2026-06-10"])).toBe(20);
    expect(meanAt(m, ["2026-06-09", "2026-06-30"])).toBe(20); // missing skipped
    expect(meanAt(m, ["2026-06-30"])).toBe(0); // none present
  });
});

describe("pctDelta", () => {
  it("computes percentage change", () => {
    expect(pctDelta(120, 100)).toBeCloseTo(20);
    expect(pctDelta(80, 100)).toBeCloseTo(-20);
  });
  it("returns null when prior is zero", () => {
    expect(pctDelta(5, 0)).toBeNull();
  });
});

describe("formatValue", () => {
  it("formats each unit", () => {
    expect(formatValue(1234, "int")).toBe("1,234");
    expect(formatValue(78.6, "pct")).toBe("78.6%");
    expect(formatValue(12.34, "pct")).toBe("12.3%");
    expect(formatValue(2.5, "ratio")).toBe("2.5");
    expect(formatValue(934, "duration")).toBe("15m 34s");
    expect(formatValue(45, "duration")).toBe("45s");
    expect(formatValue(1728, "ms")).toBe("1.73s");
    expect(formatValue(656, "ms")).toBe("656ms");
  });
});

describe("deltaBadge", () => {
  it("greens a rise when up is good, reds it when up is bad", () => {
    expect(deltaBadge(120, 100, "up-good")).toEqual({ text: "▲ 20%", positive: true });
    expect(deltaBadge(120, 100, "up-bad")).toEqual({ text: "▲ 20%", positive: false });
  });
  it("reds a drop in a good-up metric (e.g. visitors falling)", () => {
    expect(deltaBadge(80, 100, "up-good")).toEqual({ text: "▼ 20%", positive: false });
  });
  it("greens a drop in a bad-up metric (e.g. errors falling)", () => {
    expect(deltaBadge(80, 100, "up-bad")).toEqual({ text: "▼ 20%", positive: true });
  });
  it("is neutral on no prior data or flat", () => {
    expect(deltaBadge(5, 0, "up-good")).toEqual({ text: "new", positive: null });
    expect(deltaBadge(100, 100, "up-good")).toEqual({ text: "—", positive: null });
  });
});

describe("lcpRating", () => {
  it("buckets by Core Web Vitals thresholds", () => {
    expect(lcpRating(1324)).toBe("good");
    expect(lcpRating(3000)).toBe("needs work");
    expect(lcpRating(5000)).toBe("poor");
  });
});

// Fake query runner: dispatches canned rows by recognizable query fragments,
// so gatherDailyMetrics can be exercised with zero network.
function fakeRunner(): (q: string) => Promise<HogQLRow[]> {
  return async (q: string) => {
    if (q.includes("as pageviews"))
      return [
        ["2026-06-09", 100, 40, 50, 2, 1],
        ["2026-06-10", 120, 50, 60, 4, 0],
      ];
    if (q.includes("min(timestamp) as f"))
      return [
        ["2026-06-09", 12],
        ["2026-06-10", 18],
      ];
    if (q.includes("'$identify'"))
      return [
        ["2026-06-09", 3],
        ["2026-06-10", 5],
      ];
    if (q.includes("countIf(pv = 1)"))
      return [
        ["2026-06-09", 25, 50], // 50% bounce
        ["2026-06-10", 24, 60], // 40% bounce
      ];
    if (q.includes("avg(dur)"))
      return [
        ["2026-06-09", 600],
        ["2026-06-10", 720],
      ];
    if (q.includes("web_vitals_LCP_value"))
      return [
        ["2026-06-09", 1300],
        ["2026-06-10", 1700],
      ];
    if (q.includes("$pathname"))
      return [["/", 36], ["/leaderboard", 7]];
    if (q.includes("$referring_domain")) return [["$direct", 145], ["festival.so", 10]];
    if (q.includes("$geoip_country_name")) return [["United States", 27], ["Canada", 6]];
    if (q.includes("$device_type")) return [["Mobile", 28], ["Desktop", 18]];
    if (q.includes("$browser")) return [["Chrome", 21], ["Mobile Safari", 10]];
    return [];
  };
}

describe("excludeEmails / exclusionClause", () => {
  it("parses, lowercases, trims, and strips quotes", () => {
    expect(excludeEmails(" Drodio@Gmail.com , test@x.io ")).toEqual([
      "drodio@gmail.com",
      "test@x.io",
    ]);
    expect(excludeEmails("'a@b.com'")).toEqual(["a@b.com"]);
  });
  it("drops entries without an @ and yields [] when empty", () => {
    expect(excludeEmails("not-an-email, , a@b.com")).toEqual(["a@b.com"]);
    expect(excludeEmails("")).toEqual([]);
  });
  it("defaults to the owner email when unset", () => {
    expect(excludeEmails(undefined)).toEqual(["drodio@gmail.com"]);
  });
  it("builds a person_id exclusion fragment, or '' when no emails", () => {
    expect(exclusionClause([])).toBe("");
    const c = exclusionClause(["drodio@gmail.com"]);
    expect(c).toContain("person_id not in (select distinct person_id");
    expect(c).toContain("'drodio@gmail.com'");
    expect(c.startsWith(" and ")).toBe(true);
  });
});

describe("gatherDailyMetrics", () => {
  // 2026-06-11T15:30Z → report day = 2026-06-10, prior = 2026-06-09 (Pacific).
  const now = new Date("2026-06-11T15:30:00Z");

  it("selects the right report/prior days", async () => {
    const m = await gatherDailyMetrics(fakeRunner(), now);
    expect(m.reportDay).toBe("2026-06-10");
    expect(m.prevDay).toBe("2026-06-09");
    expect(m.reportLabel).toContain("Jun 10");
  });

  it("pulls report-day values with prior-day comparison", async () => {
    const m = await gatherDailyMetrics(fakeRunner(), now);
    const v = m.headline.find((h) => h.key === "visitors")!;
    expect(v.value).toBe(50);
    expect(v.prev).toBe(40);
    const b = m.headline.find((h) => h.key === "bounceRate")!;
    expect(b.value).toBeCloseTo(40); // 24/60
    expect(b.prev).toBeCloseTo(50); // 25/50
    const pps = m.headline.find((h) => h.key === "pagesPerSession")!;
    expect(pps.value).toBeCloseTo(2); // 120/60
  });

  it("includes breakdowns", async () => {
    const m = await gatherDailyMetrics(fakeRunner(), now);
    const pages = m.breakdowns.find((b) => b.key === "pages")!;
    expect(pages.rows[0]).toEqual({ name: "/", value: 36 });
  });
});

describe("renderDailyMetricsEmail", () => {
  it("renders a subject with the visitor count and an html body", async () => {
    const m = await gatherDailyMetrics(fakeRunner(), new Date("2026-06-11T15:30:00Z"));
    const { subject, html } = renderDailyMetricsEmail(m);
    expect(subject).toContain("50 visitors");
    expect(subject).toContain("▲ 25%"); // 50 vs 40
    expect(html).toContain("Unique visitors");
    expect(html).toContain("Bounce rate");
    expect(html).toContain("Top pages");
  });
});
