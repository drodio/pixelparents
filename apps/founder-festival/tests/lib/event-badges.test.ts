import { describe, it, expect } from "vitest";
import {
  pickBadgeDimension,
  badgeCompanyName,
  buildBadgeData,
  radarVertex,
  radarShape,
} from "@/lib/event-badges";
import type { CredibilityRadars, RadarVector } from "@/lib/credibility";

function vec(key: string, score: number): RadarVector {
  return { key, label: key, axisLabel: key, score, coverage: true, evidence: [] };
}
const radars: CredibilityRadars = {
  founder: [vec("a", 80), vec("b", 40), vec("c", 60)],
  investor: [vec("x", 20), vec("y", 90), vec("z", 50)],
};

describe("pickBadgeDimension", () => {
  it("uses slugKind when it is founder/investor", () => {
    expect(pickBadgeDimension({ slugKind: "investor", founderScore: 999, investorScore: 1 })).toBe("investor");
    expect(pickBadgeDimension({ slugKind: "founder", founderScore: 1, investorScore: 999 })).toBe("founder");
  });
  it("falls back to the higher score, defaulting to founder on a tie", () => {
    expect(pickBadgeDimension({ slugKind: null, founderScore: 10, investorScore: 50 })).toBe("investor");
    expect(pickBadgeDimension({ slugKind: null, founderScore: 50, investorScore: 50 })).toBe("founder");
    expect(pickBadgeDimension({ slugKind: null, founderScore: null, investorScore: null })).toBe("founder");
  });
});

describe("badgeCompanyName", () => {
  it("prefers the clean identity company name", () => {
    expect(
      badgeCompanyName({ identity: { companyName: "Acme Robotics" }, extractedMetrics: { partnerAtFirm: "X" }, primaryCompanyDomain: "y.com" }),
    ).toBe("Acme Robotics");
  });
  it("falls back to firm then domain", () => {
    expect(badgeCompanyName({ extractedMetrics: { partnerAtFirm: "Foobar Ventures" }, primaryCompanyDomain: "y.com" })).toBe("Foobar Ventures");
    expect(badgeCompanyName({ primaryCompanyDomain: "stripe.com" })).toBe("Stripe");
    expect(badgeCompanyName(null)).toBeNull();
  });
});

describe("buildBadgeData", () => {
  const ev = {
    id: "eval-1",
    fullName: "Jane Eval",
    founderScore: 100,
    investorScore: 10,
    slug: "jane-q",
    slugKind: "founder" as const,
    profile: { identity: { companyName: "Acme" } },
  };

  it("assembles name, company, canonical vectors, and an absolute profile URL", () => {
    const b = buildBadgeData({ applicantFullName: null, ev, radars, siteUrl: "https://festival.so/" });
    expect(b.name).toBe("Jane Eval");
    expect(b.company).toBe("Acme");
    expect(b.dimension).toBe("founder");
    expect(b.vectors).toBe(radars.founder);
    expect(b.profileUrl).toBe("https://festival.so/profile/founder/jane-q");
  });

  it("prefers the applicant's name over the evaluation's, and never blanks the name", () => {
    expect(buildBadgeData({ applicantFullName: "Applicant Name", ev, radars, siteUrl: "https://x.co" }).name).toBe("Applicant Name");
    const noName = buildBadgeData({ applicantFullName: null, ev: { ...ev, fullName: null }, radars, siteUrl: "https://x.co" });
    expect(noName.name).toBe("Guest");
  });

  it("falls back to the ?e= profile URL when slug is missing", () => {
    const b = buildBadgeData({ applicantFullName: null, ev: { ...ev, slug: null, slugKind: null }, radars, siteUrl: "https://festival.so" });
    expect(b.profileUrl).toBe("https://festival.so/profile?e=eval-1");
  });
});

describe("radar geometry", () => {
  it("places the first axis straight up and scales by frac", () => {
    const [x, y] = radarVertex(1, 0, 4, 50, 60, 60);
    expect(x).toBeCloseTo(60, 5); // straight up → no horizontal offset
    expect(y).toBeCloseTo(10, 5); // cy - R
  });
  it("emits one 'x,y' pair per axis in the shape string", () => {
    const s = radarShape([0.5, 0.5, 0.5], 50, 60, 60);
    expect(s.split(" ")).toHaveLength(3);
  });
});
