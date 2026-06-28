import { describe, it, expect } from "vitest";
import { computeBadges } from "@/lib/badges";

// Phase 1 of Neo investor integration emits four new investor badge classes
// directly from the normalized columns on the evaluations row:
//   • stage focus (per ApplyStages, deduped by canonical bucket)
//   • industry focus (capped at 4)
//   • leads rounds
//   • featured on Neo
// These tests pin the mapping so a regex change doesn't silently drop a badge.

const emptyMetricInputs = {
  isClaimed: false,
  extractedMetrics: null,
  mmHits: null,
  primaryCompanyDomain: null,
};

function ids(badges: Array<{ id: string }>): string[] {
  return badges.map((b) => b.id);
}

describe("computeBadges: investor stage focus", () => {
  it("emits one badge per recognized stage bucket", () => {
    const b = computeBadges({
      ...emptyMetricInputs,
      investorStageFocus: ["Pre-seed", "Seed", "Series B"],
    });
    expect(ids(b)).toEqual(["pre-seed-focus", "seed-focus", "series-b-focus"]);
  });

  it("dedupes by canonical bucket (Neo's '(1-10 ppl)' suffix already stripped at the enricher)", () => {
    const b = computeBadges({
      ...emptyMetricInputs,
      investorStageFocus: ["Seed", "seed-stage", "SEED"],
    });
    expect(ids(b)).toEqual(["seed-focus"]);
  });

  it("recognizes Series A/B/C separately and groups D+ as Growth", () => {
    const b = computeBadges({
      ...emptyMetricInputs,
      investorStageFocus: ["Series A", "Series B", "Series C", "Series D"],
    });
    expect(ids(b)).toEqual(["series-a-focus", "series-b-focus", "series-c-focus", "growth-stage-focus"]);
  });

  it("ignores unrecognized strings (no badge littering)", () => {
    const b = computeBadges({
      ...emptyMetricInputs,
      investorStageFocus: ["¯\\_(ツ)_/¯"],
    });
    expect(b).toEqual([]);
  });
});

describe("computeBadges: industry focus", () => {
  it("caps at 4 to avoid littering", () => {
    const b = computeBadges({
      ...emptyMetricInputs,
      investorIndustryFocus: ["AI", "Fintech", "SaaS", "Climate", "Bio", "Robotics"],
    });
    expect(ids(b)).toEqual([
      "industry-ai",
      "industry-fintech",
      "industry-saas",
      "industry-climate",
    ]);
    expect(b[0].label).toBe("AI Focus");
  });

  it("trims whitespace + drops empties", () => {
    const b = computeBadges({
      ...emptyMetricInputs,
      investorIndustryFocus: ["  AI  ", "", " "],
    });
    expect(ids(b)).toEqual(["industry-ai"]);
  });
});

describe("computeBadges: leads-rounds + on-neo", () => {
  it("emits leads-rounds when the column is true", () => {
    const b = computeBadges({ ...emptyMetricInputs, investorLeadsRounds: true });
    expect(ids(b)).toContain("leads-rounds");
  });
  it("does NOT emit leads-rounds when the column is false or null (only true → badge)", () => {
    expect(ids(computeBadges({ ...emptyMetricInputs, investorLeadsRounds: false }))).not.toContain("leads-rounds");
    expect(ids(computeBadges({ ...emptyMetricInputs, investorLeadsRounds: null }))).not.toContain("leads-rounds");
  });
  it("emits 'Featured on Neo' when onNeo is true", () => {
    const b = computeBadges({ ...emptyMetricInputs, onNeo: true });
    expect(ids(b)).toContain("on-neo");
    expect(b.find((x) => x.id === "on-neo")?.label).toBe("Featured on Neo");
  });
  it("does NOT emit on-neo when null (never-checked) or false (checked, no match)", () => {
    expect(ids(computeBadges({ ...emptyMetricInputs, onNeo: null }))).not.toContain("on-neo");
    expect(ids(computeBadges({ ...emptyMetricInputs, onNeo: false }))).not.toContain("on-neo");
  });
});

describe("computeBadges: overrides still apply to new badges", () => {
  it("a rejected override hides 'Featured on Neo'", () => {
    const b = computeBadges(
      { ...emptyMetricInputs, onNeo: true },
      [{ badgeId: "on-neo", status: "rejected", editedLabel: null }],
    );
    expect(ids(b)).not.toContain("on-neo");
  });
  it("a confirmed override upgrades 'Leads Rounds' from likely to confirmed", () => {
    const b = computeBadges(
      { ...emptyMetricInputs, investorLeadsRounds: true },
      [{ badgeId: "leads-rounds", status: "confirmed", editedLabel: null }],
    );
    expect(b.find((x) => x.id === "leads-rounds")?.status).toBe("confirmed");
  });
});
