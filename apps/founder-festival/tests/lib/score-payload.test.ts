import { describe, it, expect } from "vitest";
import { buildScorePayload, type ScorePayloadInput } from "@/lib/api/score-payload";

const base: ScorePayloadInput = {
  linkedinUrl: "https://linkedin.com/in/jane-q-public",
  fullName: "Jane Q Public",
  nickname: null,
  companyName: "Acme",
  companyUrl: "https://acme.com",
  profileHref: "/profile/jane",
  avatarUrl: null,
  claimed: true,
  signalQuality: "high",
  credibilityTitle: "4x-exited YC founder now building Acme",
  founderStatus: "current",
  investorStatus: null,
  canonicalIndustries: ["ai-ml", "fintech"],
  badges: ["yc", "ipo"],
  familyBadges: [
    { label: "Daughter", filterKey: "children" },
    { label: "Dog", filterKey: "dog" },
  ],
  location: { city: "San Francisco", region: "CA", country: "USA" },
  investor: {
    stageFocus: ["seed", "series-a"],
    industryFocus: ["fintech"],
    leadsRounds: true,
    checkSize: { minUsd: 250_000, maxUsd: 1_000_000 },
  },
  neo: { onNeo: true, slug: "jane-q" },
  overall: { score: 530, percentile: 78 },
  founder: { score: 410, percentile: 81 },
  investorScores: { score: 120, percentile: 60 },
  founderRows: [{ reason: "Current founder", confidence: 100, status: "confirmed" }],
  investorRows: [],
  summary: { text: "Raise a seed round.", status: "confirmed", confidence: 90 },
  priorities: [
    { id: "p1", text: "Hire a CTO", category: "hiring", rating: 4, private: false },
    { id: "p2", text: null, category: null, rating: 2, private: true },
  ],
  credibility: {
    founder: [
      { key: "technical", label: "Technical Depth", axisLabel: "Technical", score: 80, coverage: true, evidence: [{ points: 5, reason: "Built X" }] }, // points here is INTERNAL input; the serializer must drop it
    ],
    investor: null,
  },
  matrix: {
    founder: {
      similar: [{ evalId: "e9", fullName: "Sam O", profileHref: "/profile/sam", imageUrl: "https://img/sam", displayScore: 400 }],
      complement: [],
      opposite: [],
    },
    investor: null,
  },
  scoredAt: new Date("2026-05-20T12:00:00Z"),
  cached: true,
  chargedCents: 0,
  outcome: { hadIpo: null, hadAcquisition: null, isUnicorn: null, ipoMarketCapUsd: null, acquisitionPriceUsd: null },
};

describe("buildScorePayload", () => {
  it("maps fields and splits first/last name (multi-word last name kept whole)", () => {
    const p = buildScorePayload(base);
    expect(p.first_name).toBe("Jane");
    expect(p.last_name).toBe("Q Public");
    expect(p.company_name).toBe("Acme");
    expect(p.scores.overall).toEqual({ score: 530, percentile: 78 });
    expect(p.scores.investor).toEqual({ score: 120, percentile: 60 });
    expect(p.founder_rows[0]).toEqual({ reason: "Current founder", confidence: 100, status: "confirmed" });
    expect(p.what_you_likely_need).toEqual({ text: "Raise a seed round.", status: "confirmed", confidence: 90 });
    expect(p.current_priorities[0].rating).toBe(4);
    expect(p.scored_at).toBe("2026-05-20T12:00:00.000Z");
  });

  // SECURITY: the public payload must NEVER expose per-row scoring point values
  // (internal IP). It returns overall/founder/investor scores + percentiles and
  // each row's reason/confidence/status, but no `points` anywhere.
  it("never leaks per-row point values (scoring IP)", () => {
    const p = buildScorePayload({
      ...base,
      credibility: {
        founder: [
          { key: "technical", label: "Technical Depth", axisLabel: "Technical", score: 80, coverage: true, evidence: [{ points: 5, reason: "Built X" }] },
        ],
        investor: null,
      },
    });
    // scores survive...
    expect(p.scores.founder.score).toBe(410);
    expect(p.scores.overall.percentile).toBe(78);
    // ...but no `points` key appears ANYWHERE in the serialized JSON.
    expect(JSON.stringify(p)).not.toContain('"points"');
    expect(p.founder_rows[0]).not.toHaveProperty("points");
    expect(p.credibility.founder?.[0].evidence[0]).not.toHaveProperty("points");
    expect(p.credibility.founder?.[0].evidence[0]).toEqual({ reason: "Built X" });
  });

  it("handles a null fullName", () => {
    const p = buildScorePayload({ ...base, fullName: null });
    expect(p.first_name).toBeNull();
    expect(p.last_name).toBeNull();
    expect(p.full_name).toBeNull();
  });

  it("sets cost basis from chargedCents", () => {
    expect(buildScorePayload(base).cost).toEqual({ charged_cents: 0, basis: "cached" });
    expect(buildScorePayload({ ...base, cached: false, chargedCents: 280 }).cost)
      .toEqual({ charged_cents: 280, basis: "measured" });
  });

  it("includes the outcome block with exit values (snake_case)", () => {
    const p = buildScorePayload({
      ...base,
      outcome: {
        hadIpo: true, hadAcquisition: false, isUnicorn: true,
        ipoMarketCapUsd: 11_000_000_000, acquisitionPriceUsd: null,
      },
    });
    expect(p.outcome).toEqual({
      had_ipo: true,
      had_acquisition: false,
      is_unicorn: true,
      ipo_market_cap_usd: 11_000_000_000,
      acquisition_price_usd: null,
    });
  });

  it("exposes the new public profile fields (status, industries, badges, location, neo)", () => {
    const p = buildScorePayload(base);
    expect(p.profile_href).toBe("/profile/jane");
    expect(p.company_url).toBe("https://acme.com");
    expect(p.founder_status).toBe("current");
    expect(p.investor_status).toBeNull();
    expect(p.canonical_industries).toEqual(["ai-ml", "fintech"]);
    expect(p.badges).toEqual(["yc", "ipo"]);
    expect(p.location).toEqual({ city: "San Francisco", region: "CA", country: "USA" });
    expect(p.neo).toEqual({ on_neo: true, slug: "jane-q" });
  });

  it("exposes the credibility_title headline and public family badges", () => {
    const p = buildScorePayload(base);
    expect(p.credibility_title).toBe("4x-exited YC founder now building Acme");
    expect(p.family_badges).toEqual([
      { label: "Daughter", filter_key: "children" },
      { label: "Dog", filter_key: "dog" },
    ]);
  });

  it("emits the investor focus block with snake_case check size", () => {
    const p = buildScorePayload(base);
    expect(p.investor).toEqual({
      stage_focus: ["seed", "series-a"],
      industry_focus: ["fintech"],
      leads_rounds: true,
      check_size: { min_usd: 250_000, max_usd: 1_000_000 },
    });
  });

  it("nulls the check_size block when no check size is known", () => {
    const p = buildScorePayload({ ...base, investor: { ...base.investor, checkSize: null } });
    expect(p.investor.check_size).toBeNull();
  });

  it("keeps private priority items but scrubs text/category and flags them", () => {
    const p = buildScorePayload(base);
    expect(p.current_priorities[0]).toEqual({ id: "p1", text: "Hire a CTO", category: "hiring", rating: 4, private: false });
    // The private item is retained with its rating but its text/category are null.
    expect(p.current_priorities[1]).toEqual({ id: "p2", text: null, category: null, rating: 2, private: true });
  });

  it("maps the credibility radar to snake_case axes with evidence reasons (no points)", () => {
    const p = buildScorePayload(base);
    expect(p.credibility.founder).toEqual([
      { key: "technical", label: "Technical Depth", axis_label: "Technical", score: 80, coverage: true, evidence: [{ reason: "Built X" }] },
    ]);
    // No investor signal → null, exactly as the profile page hides it.
    expect(p.credibility.investor).toBeNull();
  });

  it("maps the peer matrix dropping internal evalId, keyed off profile_href", () => {
    const p = buildScorePayload(base);
    expect(p.matrix.founder?.similar[0]).toEqual({
      full_name: "Sam O",
      profile_href: "/profile/sam",
      avatar_url: "https://img/sam",
      display_score: 400,
    });
    expect((p.matrix.founder?.similar[0] as Record<string, unknown>).evalId).toBeUndefined();
    expect(p.matrix.investor).toBeNull();
  });
});
