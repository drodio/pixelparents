import { describe, it, expect } from "vitest";
import {
  isSamePerson,
  isSamePersonByWebsite,
  dedupWebsiteDomain,
  personIdentityFromProfile,
  normalizeWebsite,
} from "@/lib/identity-dedup";

const P = (gh: string | null, name: string | null, website: string | null, company: string | null) =>
  ({ githubUsername: gh, fullName: name, website, company });

describe("normalizeWebsite", () => {
  it("strips protocol, www, trailing slash, and lowercases", () => {
    expect(normalizeWebsite("https://www.Caseym.com/")).toBe("caseym.com");
    expect(normalizeWebsite("http://example.com")).toBe("example.com");
    expect(normalizeWebsite(null)).toBe(null);
    expect(normalizeWebsite("")).toBe(null);
  });
});

describe("personIdentityFromProfile", () => {
  it("pulls + normalizes github/name/website/company", () => {
    const id = personIdentityFromProfile("Casey Morgan", {
      github: { username: "CASEYM" },
      websiteUrl: "https://caseym.com",
      companyName: "OpenAI",
    });
    expect(id).toEqual({ githubUsername: "caseym", fullName: "Casey Morgan", website: "caseym.com", company: "openai" });
  });
  it("tolerates missing identity", () => {
    expect(personIdentityFromProfile(null, null)).toEqual({ githubUsername: null, fullName: null, website: null, company: null });
  });
});

describe("dedupWebsiteDomain", () => {
  it("returns the host for a dedicated domain, null for generic/social hosts", () => {
    expect(dedupWebsiteDomain("https://avstone.pro")).toBe("avstone.pro");
    expect(dedupWebsiteDomain("https://www.stripe.com/about")).toBe("stripe.com");
    expect(dedupWebsiteDomain("https://linkedin.com/in/x")).toBe(null);
    expect(dedupWebsiteDomain("https://medium.com/@x")).toBe(null);
    expect(dedupWebsiteDomain(null)).toBe(null);
  });
});

describe("isSamePersonByWebsite — the dedicated-website test (no GitHub)", () => {
  it("merges same name + same dedicated website across two LinkedIn URLs", () => {
    const a = P(null, "Avery Stone", "https://avstone.pro", "Avstone Pro");
    const b = P(null, "Avery Stone", "https://avstone.pro", "Avstone Pro");
    expect(isSamePersonByWebsite(a, b)).toBe(true);
  });
  it("does NOT merge when names differ", () => {
    expect(isSamePersonByWebsite(P(null, "Avery Stone", "https://avstone.pro", null), P(null, "Jane Doe", "https://avstone.pro", null))).toBe(false);
  });
  it("does NOT merge on a generic/social website (two different people)", () => {
    expect(isSamePersonByWebsite(P(null, "John Smith", "https://medium.com/@a", null), P(null, "John Smith", "https://medium.com/@b", null))).toBe(false);
  });
  it("does NOT merge when only one has a website", () => {
    expect(isSamePersonByWebsite(P(null, "Avery Stone", "https://avstone.pro", null), P(null, "Avery Stone", null, null))).toBe(false);
  });
});

describe("isSamePerson — the same-person merge test", () => {
  it("MERGES the real duplicate: same github + name + website + company", () => {
    const a = P("caseym", "Casey Morgan", "caseym.com", "openai");
    const b = P("caseym", "Casey Morgan", "caseym.com", "openai");
    expect(isSamePerson(a, b)).toBe(true);
  });

  it("corroborates on company alone (website missing)", () => {
    expect(isSamePerson(P("x", "Jane Doe", null, "acme"), P("x", "Jane Doe", null, "acme"))).toBe(true);
  });

  it("corroborates on website alone (company missing)", () => {
    expect(isSamePerson(P("x", "Jane Doe", "jane.dev", null), P("x", "Jane Doe", "jane.dev", null))).toBe(true);
  });

  it("matches a reversed name when company corroborates (Wei Zhang / Zhang Wei)", () => {
    expect(isSamePerson(P("p", "Wei Zhang", null, "acme"), P("p", "Zhang Wei", null, "acme"))).toBe(true);
  });

  // --- the guards that stop wrong merges (the mis-attach cases) ---

  it("does NOT merge two same-named people whose company differs (the two Morgan Reeds)", () => {
    const a = P("morgan-reed", "Morgan Reed", "northwind.com", "northwind");
    const b = P("morgan-reed", "Morgan Reed", "globex.com", "globex");
    expect(isSamePerson(a, b)).toBe(false);
  });

  it("does NOT merge a github mis-attach to a different person (shared-org-bot)", () => {
    const a = P("shared-org-bot", "Quinn Avery", null, null);
    const b = P("shared-org-bot", "Priya Anand", "initech.com", "initech");
    expect(isSamePerson(a, b)).toBe(false);
  });

  it("does NOT merge when there is no corroborating website/company (can't confirm)", () => {
    expect(isSamePerson(P("x", "Jane Doe", null, null), P("x", "Jane Doe", null, null))).toBe(false);
  });

  it("does NOT merge when github differs or is missing", () => {
    expect(isSamePerson(P("a", "Jane Doe", "jane.dev", "acme"), P("b", "Jane Doe", "jane.dev", "acme"))).toBe(false);
    expect(isSamePerson(P(null, "Jane Doe", "jane.dev", "acme"), P(null, "Jane Doe", "jane.dev", "acme"))).toBe(false);
  });
});
