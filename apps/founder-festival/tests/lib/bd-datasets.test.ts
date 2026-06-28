import { describe, it, expect } from "vitest";
import { BD_DATASETS, type BdRowCtx } from "@/lib/bd-datasets";

const ds = (key: string) => BD_DATASETS.find((d) => d.key === key)!;

const baseCtx = (over: Partial<BdRowCtx> = {}): BdRowCtx => ({
  fullName: "Sam Rivera",
  profile: { primaryCompanyDomain: "stripe.com", identity: { companyName: "Stripe", websiteUrl: "https://stripe.com" } },
  linkedinRaw: { current_company: { name: "Stripe", company_id: "stripe" } },
  bdAsync: {},
  ...over,
});

describe("BD_DATASETS registry", () => {
  it("has the expected dataset keys + sources", () => {
    expect(BD_DATASETS.map((d) => d.key).sort()).toEqual(
      ["crunchbaseCompany", "crunchbasePerson", "linkedinCompany", "twitter"].sort(),
    );
  });

  it("crunchbaseCompany resolves the org URL from the company domain", () => {
    expect(ds("crunchbaseCompany").resolveInput(baseCtx())).toEqual({
      url: "https://www.crunchbase.com/organization/stripe-com",
    });
  });

  it("linkedinCompany resolves from the LinkedIn current_company.company_id (exact identity)", () => {
    expect(ds("linkedinCompany").resolveInput(baseCtx())).toEqual({
      url: "https://www.linkedin.com/company/stripe",
    });
    // no company_id → can't resolve
    expect(ds("linkedinCompany").resolveInput(baseCtx({ linkedinRaw: { current_company: {} } }))).toBeNull();
  });

  it("crunchbasePerson resolves only after the Crunchbase COMPANY founders are cached + name-matched", () => {
    const person = ds("crunchbasePerson");
    expect(person.resolveInput(baseCtx())).toBeNull(); // company not cached yet
    const withCompany = baseCtx({
      bdAsync: {
        crunchbaseCompany: {
          data: { facts: [], raw: { founders: [{ id: "sam-rivera", value: "Sam Rivera" }] } },
        },
      },
    });
    expect(person.resolveInput(withCompany)).toEqual({
      url: "https://www.crunchbase.com/person/sam-rivera",
    });
    // a company whose founders DON'T include the subject → no person lookup
    const otherFounder = baseCtx({
      bdAsync: { crunchbaseCompany: { data: { facts: [], raw: { founders: [{ id: "someone-else", value: "Someone Else" }] } } } },
    });
    expect(person.resolveInput(otherFounder)).toBeNull();
  });

  it("linkedinCompany renders scale + follower facts (no point values)", () => {
    const facts = ds("linkedinCompany").facts({
      name: "Stripe", employees_in_linkedin: 8000, followers: 1200000, founded: 2010, industries: "Fintech",
    });
    const joined = facts.join("\n");
    expect(joined).toMatch(/8,000 employees/);
    expect(joined).toMatch(/1,200,000 LinkedIn company followers/);
    expect(joined).not.toMatch(/\+\d+\s*(point|pts)/i);
  });

  it("crunchbasePerson renders board/advisor + press facts", () => {
    const facts = ds("crunchbasePerson").facts({
      full_name: "Sam Rivera",
      board_and_advisor_roles: [{}, {}],
      num_current_advisor_roles: 1,
      num_news_articles: 120,
      current_jobs: [{}], past_jobs: [{}, {}],
    });
    const joined = facts.join("\n");
    expect(joined).toMatch(/2 board \/ advisor role/);
    expect(joined).toMatch(/120 news articles/);
  });
});
