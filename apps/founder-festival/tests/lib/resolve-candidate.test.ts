import { describe, it, expect } from "vitest";
import { emailDomainBrand, pickResolvedCandidate } from "@/lib/find-linkedin-handle";
import type { FoundCandidate } from "@/lib/find-linkedin-handle";

function cand(name: string, headline: string, handle = name.toLowerCase().replace(/\s+/g, "")): FoundCandidate {
  return { handle, url: `https://linkedin.com/in/${handle}`, title: `${name} - ${headline}`, name, headline, snippet: headline };
}

describe("emailDomainBrand", () => {
  it("extracts the brand token from a company domain", () => {
    expect(emailDomainBrand("jordan@northwind.io")).toBe("northwind");
    expect(emailDomainBrand("alex@globex.ai")).toBe("globex");
  });
  it("returns null for free providers", () => {
    expect(emailDomainBrand("someone@gmail.com")).toBeNull();
    expect(emailDomainBrand("x@yahoo.co.uk")).toBeNull();
  });
  it("returns null for missing/garbage", () => {
    expect(emailDomainBrand(undefined)).toBeNull();
    expect(emailDomainBrand("not-an-email")).toBeNull();
  });
});

describe("pickResolvedCandidate", () => {
  const founderJordan = cand("Jordan Lee", "Co-founder & CEO at Northwind", "ijordan");
  const academicJordan = cand("Jordan Lee", "Professor of Neuroscience at a university", "jordan-lee-8bb1a6143");

  it("prefers the candidate corroborated by the email domain", () => {
    const pick = pickResolvedCandidate("Jordan Lee", [academicJordan, founderJordan], {
      email: "jordan@northwind.io",
    });
    expect(pick?.handle).toBe("ijordan");
  });

  it("prefers the candidate corroborated by the company", () => {
    const pick = pickResolvedCandidate("Jordan Lee", [academicJordan, founderJordan], {
      company: "Northwind",
    });
    expect(pick?.handle).toBe("ijordan");
  });

  it("falls back to the first name-match when nothing corroborates (still automatic)", () => {
    const pick = pickResolvedCandidate("Jordan Lee", [academicJordan, founderJordan], {
      company: "Unrelated Corp",
    });
    expect(pick?.handle).toBe("jordan-lee-8bb1a6143");
  });

  it("returns the first name-match when no context is given (unchanged behavior)", () => {
    const pick = pickResolvedCandidate("Jordan Lee", [academicJordan, founderJordan], {});
    expect(pick?.handle).toBe("jordan-lee-8bb1a6143");
  });

  it("ignores candidates whose name doesn't match before corroboration", () => {
    const wrongPerson = cand("Riley Chen", "Founder at Northwind", "rileychen");
    const pick = pickResolvedCandidate("Jordan Lee", [wrongPerson, academicJordan], {
      company: "Northwind",
    });
    // wrongPerson corroborates the company but fails the name gate → skip it.
    expect(pick?.handle).toBe("jordan-lee-8bb1a6143");
  });

  it("returns null when no candidate passes the name gate", () => {
    const pick = pickResolvedCandidate("Jordan Lee", [cand("Joe Bloggs", "CEO")], {});
    expect(pick).toBeNull();
  });
});
