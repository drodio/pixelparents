import { describe, it, expect } from "vitest";
import { emailDomainBrand, pickResolvedCandidate } from "@/lib/find-linkedin-handle";
import type { FoundCandidate } from "@/lib/find-linkedin-handle";

function cand(name: string, headline: string, handle = name.toLowerCase().replace(/\s+/g, "")): FoundCandidate {
  return { handle, url: `https://linkedin.com/in/${handle}`, title: `${name} - ${headline}`, name, headline, snippet: headline };
}

describe("emailDomainBrand", () => {
  it("extracts the brand token from a company domain", () => {
    expect(emailDomainBrand("mayank@pulse.qa")).toBe("pulse");
    expect(emailDomainBrand("daniel@gentrace.ai")).toBe("gentrace");
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
  const founderMayank = cand("Mayank Mehta", "Co-founder & CEO at Pulse Q&A", "imayank");
  const academicMayank = cand("Mayank Mehta", "Professor of Neuroscience at UCLA", "mayank-mehta-8bb1a6143");

  it("prefers the candidate corroborated by the email domain", () => {
    const pick = pickResolvedCandidate("Mayank Mehta", [academicMayank, founderMayank], {
      email: "mayank@pulse.qa",
    });
    expect(pick?.handle).toBe("imayank");
  });

  it("prefers the candidate corroborated by the company", () => {
    const pick = pickResolvedCandidate("Mayank Mehta", [academicMayank, founderMayank], {
      company: "Pulse Q&A",
    });
    expect(pick?.handle).toBe("imayank");
  });

  it("falls back to the first name-match when nothing corroborates (still automatic)", () => {
    const pick = pickResolvedCandidate("Mayank Mehta", [academicMayank, founderMayank], {
      company: "Unrelated Corp",
    });
    expect(pick?.handle).toBe("mayank-mehta-8bb1a6143");
  });

  it("returns the first name-match when no context is given (unchanged behavior)", () => {
    const pick = pickResolvedCandidate("Mayank Mehta", [academicMayank, founderMayank], {});
    expect(pick?.handle).toBe("mayank-mehta-8bb1a6143");
  });

  it("ignores candidates whose name doesn't match before corroboration", () => {
    const wrongPerson = cand("Sergey Egorov", "Founder at Pulse Q&A", "sergeye");
    const pick = pickResolvedCandidate("Mayank Mehta", [wrongPerson, academicMayank], {
      company: "Pulse Q&A",
    });
    // wrongPerson corroborates the company but fails the name gate → skip it.
    expect(pick?.handle).toBe("mayank-mehta-8bb1a6143");
  });

  it("returns null when no candidate passes the name gate", () => {
    const pick = pickResolvedCandidate("Mayank Mehta", [cand("Joe Bloggs", "CEO")], {});
    expect(pick).toBeNull();
  });
});
