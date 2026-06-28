import { describe, it, expect } from "vitest";
import {
  attributeRow,
  attributeInvestorRow,
  bucketByVector,
  bucketInvestorByVector,
  rawVectorPoints,
  percentileOf,
  signalHaverPercentile,
  type BreakdownRow,
} from "@/lib/credibility-vectors";

// Rows drawn from a real profile (Dmytro Zaporozhets / GitLab) so attribution is
// exercised against actual reason/source shapes, not contrived strings.
const row = (points: number, reason: string, sources: string[] = []): BreakdownRow => ({
  points,
  reason,
  sources,
});

describe("attributeRow", () => {
  it("routes capital/raise rows to traction even when 'founder' appears", () => {
    expect(attributeRow(row(200, "GitLab raised $435M in total venture funding."))).toBe("traction");
    expect(attributeRow(row(10, "GitLab went public via IPO in 2021, a successful exit."))).toBe("traction");
  });

  it("routes founder/role/YC rows to operator", () => {
    expect(attributeRow(row(5, "Past founder of GitLab, which he co-founded in 2011."))).toBe("operator");
    expect(attributeRow(row(10, "GitLab was part of Y Combinator's Winter 2015 batch."))).toBe("operator");
  });

  it("routes platform signals to technical via the source URL", () => {
    expect(attributeRow(row(5, "Active builder with 115 repos.", ["https://github.com/dzaporozhets"]))).toBe("technical");
    expect(attributeRow(row(2, "Identified on Stack Overflow.", ["https://stackoverflow.com"]))).toBe("technical");
  });

  it("routes domain prominence to GTM and research to domain", () => {
    expect(attributeRow(row(64, "GitLab is ranked 156 in the Majestic Million."))).toBe("gtm");
    expect(attributeRow(row(10, "h-index of 32 across 40 published papers."))).toBe("domain");
  });

  it("routes HN CONTENT signals by substance, not the platform (the GTM mis-bucket fix)", () => {
    // Content-derived technical depth from HN comments → technical, NOT gtm.
    expect(
      attributeRow(row(8, "Demonstrates personal technical depth: detailed HN comments on database internals and query planning.")),
    ).toBe("technical");
    // Content-derived domain expertise → domain.
    expect(
      attributeRow(row(6, "Deep domain expertise in payments infrastructure, per detailed HN comments.")),
    ).toBe("domain");
    // Generic HN reach (karma/posts) STILL → gtm.
    expect(attributeRow(row(8, "Active on Hacker News with 4,506 karma over a 19-year-old account."))).toBe("gtm");
    expect(attributeRow(row(5, "Active poster on Hacker News with 287 story submissions."))).toBe("gtm");
  });

  it("routes spelled-out valuations to traction (the lost-signal fix)", () => {
    // Long-form "$X billion" / "valued at" rows matched NOTHING before — a founder
    // could lose their entire traction axis to null (alexandr-wang lost 29k pts).
    expect(
      attributeRow(row(29000, "Scale AI was valued at over $29 billion in June 2025 when Meta invested for a 49% stake.")),
    ).toBe("traction");
    expect(attributeRow(row(7000, "Zapier is valued at approximately $7 billion as a still-private company."))).toBe(
      "traction",
    );
    // Abbreviated form must still work (no regression).
    expect(attributeRow(row(91750, "Stripe last valued at ~$91.5B as a still-private company."))).toBe("traction");
  });

  it("routes competency-bearing prestige to the axis it evidences, bare recognition off-radar", () => {
    // A prestige/press signal that NAMES a competency lands on that axis…
    expect(attributeRow(row(8, "Wall Street Journal feature on their go-to-market playbook."))).toBe("gtm");
    expect(attributeRow(row(6, "Profiled for scaling the engineering org to 500 people."))).toBe("operator");
    expect(attributeRow(row(8, "Recognized for deep technical work on database internals."))).toBe("technical");
    expect(attributeRow(row(6, "Award for domain expertise in genomics."))).toBe("domain");
    // …but a bare recognition with no competency stays OFF the radar (it still
    // scores its points; it just has no axis). That is intended, not a miss.
    expect(attributeRow(row(8, "Named to the Forbes 30 Under 30 list."))).toBeNull();
    expect(attributeRow(row(15, "Awarded a Thiel Fellowship in 2019."))).toBeNull();
  });

  it("returns null when nothing matches", () => {
    expect(attributeRow(row(5, "Some unrelated sentence about weather."))).toBeNull();
  });
});

describe("bucketByVector", () => {
  const rows = [
    row(5, "Past founder of GitLab, co-founded in 2011."),
    row(200, "GitLab raised $435M in venture funding."),
    row(10, "GitLab went public via IPO."),
    row(64, "Ranked 156 in the Majestic Million."),
    row(5, "Active GitHub builder.", ["https://github.com/x"]),
    row(2, "Identified on Stack Overflow.", ["https://stackoverflow.com"]),
  ];

  it("sums points per vector", () => {
    const b = bucketByVector(rows);
    expect(b.traction.points).toBe(210); // 200 raise + 10 IPO
    expect(b.operator.points).toBe(5); // past founder
    expect(b.gtm.points).toBe(64); // majestic million
    expect(b.technical.points).toBe(7); // 5 github + 2 SO
    expect(b.domain.points).toBe(0);
  });

  it("keeps the evidence rows for drill-down", () => {
    const b = bucketByVector(rows);
    expect(b.traction.rows).toHaveLength(2);
    expect(b.technical.rows.map((r) => r.points)).toEqual([5, 2]);
  });

  it("floors a vector total at 0 (never negative)", () => {
    const b = bucketByVector([row(-50, "GitHub account flagged.", ["https://github.com/x"])]);
    expect(b.technical.points).toBe(0);
  });
});

describe("rawVectorPoints", () => {
  it("returns a number for every vector key", () => {
    const raw = rawVectorPoints([row(10, "raised $5M")]);
    expect(Object.keys(raw).sort()).toEqual(["domain", "gtm", "operator", "technical", "traction"]);
  });
});

describe("percentileOf (mid-rank)", () => {
  it("returns 50 for an empty population", () => {
    expect(percentileOf(10, [])).toBe(50);
  });

  it("puts an all-zero field's zero founder at the median, not the floor", () => {
    expect(percentileOf(0, [0, 0, 0, 0])).toBe(50);
  });

  it("ranks above the field correctly", () => {
    expect(percentileOf(100, [0, 10, 20, 30])).toBe(100);
    expect(percentileOf(20, [0, 10, 20, 30])).toBe(63); // (2 below + 0.5*1 equal)/4 = 0.625 → 63
  });
});

describe("signalHaverPercentile (rank only against profiles that have signal)", () => {
  // The zero-inflated case: a thin score (13) in a population where most are 0.
  const zeroHeavy = [0, 0, 0, 0, 0, 0, 0, 0, 13, 50, 100, 150];

  it("no longer inflates a thin nonzero score (the artifact fix)", () => {
    // Old behavior ranked 13 against everyone incl. the 8 zeros → ~71st pct.
    expect(percentileOf(13, zeroHeavy)).toBe(71);
    // New: ranked only against the 4 signal-havers [13,50,100,150] → bottom.
    expect(signalHaverPercentile(13, zeroHeavy)).toBe(13);
  });

  it("keeps real depth near the top", () => {
    expect(signalHaverPercentile(150, zeroHeavy)).toBe(88); // top of the signal-havers
    expect(signalHaverPercentile(100, zeroHeavy)).toBe(63);
  });

  it("returns 0 for no signal (paired with coverage:false in the UI)", () => {
    expect(signalHaverPercentile(0, zeroHeavy)).toBe(0);
    expect(signalHaverPercentile(-5, zeroHeavy)).toBe(0);
  });
});

// Investor rows drawn from real profiles (Arrington, Staenberg, Blecharczyk).
describe("attributeInvestorRow", () => {
  it("routes portfolio outcomes (IPO/unicorn/acquisition) to outcomes", () => {
    expect(attributeInvestorRow(row(30, "Early investor in Uber, which reached unicorn status before its IPO."))).toBe("outcomes");
    expect(attributeInvestorRow(row(30, "Portfolio company Twitter went public via IPO."))).toBe("outcomes");
  });

  it("routes deal-count rows to portfolio", () => {
    expect(attributeInvestorRow(row(50, "Arrington Capital has invested in over 200 early-stage crypto companies."))).toBe("portfolio");
    expect(attributeInvestorRow(row(40, "Angel investor in 40+ early-stage startups."))).toBe("portfolio");
    expect(attributeInvestorRow(row(60, "Active portfolio spanning Neon, Regrello, Fathom, Pano AI."))).toBe("portfolio");
  });

  it("routes role/firm/angel-status rows to firm", () => {
    expect(attributeInvestorRow(row(15, "Active GP and founder of Arrington Capital, a thesis-driven web3 venture firm."))).toBe("firm");
    expect(attributeInvestorRow(row(15, "Publicly identified as an angel investor across multiple sources."))).toBe("firm");
    expect(attributeInvestorRow(row(30, "Partner at Sequoia Capital."))).toBe("firm");
  });

  it("routes tenure rows to experience", () => {
    expect(attributeInvestorRow(row(16, "Investing experience since the mid-1990s, well over 15 years."))).toBe("experience");
    expect(attributeInvestorRow(row(15, "Over three decades of investing experience."))).toBe("experience");
  });

  it("routes bare-identity investor rows to firm instead of dropping them (lost-signal fix)", () => {
    // Generic "seed/scout/active investor" identifications matched nothing before
    // — ~550 investor points were lost to null across thin investor profiles.
    expect(attributeInvestorRow(row(15, "Publicly identified as an active scout investor."))).toBe("firm");
    expect(
      attributeInvestorRow(row(15, "Publicly identified as a seed investor and technology investor across multiple sources.")),
    ).toBe("firm");
    // A bare-identity row that ALSO lists a portfolio still routes to portfolio
    // (outcomes/portfolio run before the firm catch-all).
    expect(
      attributeInvestorRow(row(50, "Active seed investor with a broad portfolio including Deel, Honeybook, Placer.ai.")),
    ).toBe("portfolio");
  });
});

describe("bucketInvestorByVector", () => {
  it("sums investor points into the right vectors", () => {
    const b = bucketInvestorByVector([
      row(50, "Invested in over 200 companies."),
      row(30, "Early investor in Uber, which reached unicorn status."),
      row(15, "Active GP and founder of Arrington Capital."),
      row(16, "Investing experience since the 1990s, over 15 years."),
    ]);
    expect(b.portfolio.points).toBe(50);
    expect(b.outcomes.points).toBe(30);
    expect(b.firm.points).toBe(15);
    expect(b.experience.points).toBe(16);
    expect(b.capital.points).toBe(0);
  });
});
