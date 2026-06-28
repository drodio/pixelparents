import { describe, it, expect } from "vitest";
import { buildIdentity, companyNameFromDomain, type LlmIdentity } from "@/lib/identity";
import type { EnrichmentResult } from "@/lib/enrichers/types";

const llm: LlmIdentity = {
  companyName: "Acme Robotics",
  jobTitle: "Co-Founder & CEO",
  headline: "Building robots at Acme",
  location: { city: "San Francisco", region: "CA", country: "USA" },
  websiteUrl: "https://acme.example",
  education: [{ institution: "MIT", degree: "BS" }],
};

const nfxEnrichment: EnrichmentResult = {
  source: "nfx",
  facts: [],
  citations: ["https://signal.nfx.com/investors/jane"],
  raw: {
    firm: "Foobar Ventures",
    leads_rounds: true,
    check: { min: 250000, max: 2000000, target: 1000000 },
    stages: ["seed", "series-a"],
    verticals: ["fintech"],
    fund_size: 50000000,
    location: "New York, NY, USA",
    portfolio_count: 22,
  },
};

const githubEnrichment: EnrichmentResult = {
  source: "github",
  facts: [],
  citations: ["https://github.com/janedev"],
  raw: {
    user: { login: "janedev", followers: 1500 },
    top_repos: [{ name: "janedev/cool-lib", stars: 4200 }],
    pushed_in_last_90d: 3,
  },
};

describe("companyNameFromDomain", () => {
  it("capitalizes the root segment", () => {
    expect(companyNameFromDomain("airbnb.com")).toBe("Airbnb");
    expect(companyNameFromDomain("www.acme.co.uk")).toBe("Acme");
    expect(companyNameFromDomain("https://stripe.com/about")).toBe("Stripe");
  });
  it("returns null for empty input", () => {
    expect(companyNameFromDomain(null)).toBeNull();
    expect(companyNameFromDomain(undefined)).toBeNull();
    expect(companyNameFromDomain("")).toBeNull();
  });
});

describe("buildIdentity priority merge", () => {
  it("prefers the LLM identity for company/jobTitle/headline/location/website", () => {
    const id = buildIdentity({ llm, enrichments: [nfxEnrichment], primaryCompanyDomain: "acme.com" });
    expect(id.companyName).toBe("Acme Robotics"); // LLM beats NFX firm + domain
    expect(id.jobTitle).toBe("Co-Founder & CEO");
    expect(id.headline).toBe("Building robots at Acme");
    expect(id.location).toEqual({
      city: "San Francisco",
      region: "CA",
      country: "USA",
      display: "San Francisco, CA, USA",
    });
    expect(id.websiteUrl).toBe("https://acme.example");
    expect(id.education).toEqual([{ institution: "MIT", degree: "BS" }]);
  });

  it("falls back to NFX firm name, then domain, when the LLM omits company", () => {
    const noCo: LlmIdentity = { ...llm, companyName: null, websiteUrl: null, location: null };
    const withNfx = buildIdentity({ llm: noCo, enrichments: [nfxEnrichment], primaryCompanyDomain: "acme.com" });
    expect(withNfx.companyName).toBe("Foobar Ventures");
    // NFX location string used when LLM has none.
    expect(withNfx.location).toEqual({ city: "New York", region: "NY", country: "USA", display: "New York, NY, USA" });

    const domainOnly = buildIdentity({ llm: noCo, enrichments: [], primaryCompanyDomain: "acme.com" });
    expect(domainOnly.companyName).toBe("Acme");
    // websiteUrl derived from the domain when LLM omits it.
    expect(domainOnly.websiteUrl).toBe("https://acme.com");
  });

  it("promotes GitHub stats from the enricher raw payload", () => {
    const id = buildIdentity({ llm, enrichments: [githubEnrichment] });
    expect(id.github).toEqual({
      username: "janedev",
      followers: 1500,
      topRepo: "janedev/cool-lib",
      topRepoStars: 4200,
      activeLast90d: true,
    });
  });

  it("builds the investor block only when NFX matched", () => {
    const withNfx = buildIdentity({ llm, enrichments: [nfxEnrichment] });
    expect(withNfx.investor).toEqual({
      firmName: "Foobar Ventures",
      leadsRounds: true,
      checkSize: { min: 250000, max: 2000000, target: 1000000 },
      stages: ["seed", "series-a"],
      verticals: ["fintech"],
      fundSize: 50000000,
      portfolioCount: 22,
    });
    expect(buildIdentity({ llm, enrichments: [] }).investor).toBeNull();
  });

  it("surfaces ycBatch from extractedMetrics", () => {
    const id = buildIdentity({ llm, extractedMetrics: { ycBatch: "W22", partnerAtFirm: null, topGithubRepo: null, topGithubRepoStars: null } });
    expect(id.ycBatch).toBe("W22");
  });

  it("returns an all-null/empty identity for empty input without throwing", () => {
    const id = buildIdentity({});
    expect(id.companyName).toBeNull();
    expect(id.location).toBeNull();
    expect(id.github).toBeNull();
    expect(id.investor).toBeNull();
    expect(id.education).toEqual([]);
    expect(id.secFilingsCount).toBeNull();
  });

  it("ignores malformed enricher raw payloads", () => {
    const junk: EnrichmentResult = { source: "github", facts: [], citations: [], raw: "not-an-object" };
    const id = buildIdentity({ llm, enrichments: [junk] });
    expect(id.github).toBeNull();
  });

  it("counts SEC filings without keeping the list", () => {
    const secE: EnrichmentResult = {
      source: "sec-edgar",
      facts: [],
      citations: [],
      raw: { issuers: [{ entity: "A" }, { entity: "B" }] },
    };
    expect(buildIdentity({ enrichments: [secE] }).secFilingsCount).toBe(2);
  });
});
