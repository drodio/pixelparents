import { describe, it, expect } from "vitest";
import { corroboratePatent, patentFacts, inventorIsSubject, resolvePatentName } from "@/lib/enrichers/patents";
import type { EnricherContext } from "@/lib/enrichers/types";
import { twitterHandleFromLinkedin } from "@/lib/bd-datasets";
import type { UsptoPatent } from "@/lib/uspto";

const P = (over: Partial<UsptoPatent>): UsptoPatent => ({
  title: "A METHOD",
  inventors: ["Jensen Huang"],
  applicant: "NVIDIA Corporation",
  granted: true,
  filingDate: "2013-01-01",
  ...over,
});

describe("inventorIsSubject (strict first+last, tolerant of middle initials/nicknames)", () => {
  it("matches a middle-initial form (the DROdio/Armory case)", () => {
    expect(inventorIsSubject("Daniel Odio", "Daniel R. Odio")).toBe(true);
  });
  it("matches a nickname↔full form (Sam↔Samuel)", () => {
    expect(inventorIsSubject("Sam Odio", "Samuel Odio")).toBe(true);
  });
  it("handles BrightData's 'Nick - Real Name' form", () => {
    expect(inventorIsSubject("DROdio - Daniel R. Odio", "Daniel R. Odio")).toBe(true);
  });
  it("rejects a different first name with the same surname", () => {
    expect(inventorIsSubject("Daniel Odio", "Samuel Odio")).toBe(false);
  });
});

describe("corroboratePatent (career-wide assignee match)", () => {
  // DROdio's research mentions Armory; Sam's mentions Facebook — PAST employers.
  it("keeps a PAST-employer patent when the assignee appears in research text", () => {
    const danArmory = P({ inventors: ["Daniel R. Odio"], applicant: "Armory, Inc." });
    expect(corroboratePatent(danArmory, "Daniel Odio", "co-founder of armory continuous delivery")).toBe(true);
  });
  it("drops a same-surname inventor whose assignee isn't in the subject's research", () => {
    const samFacebook = P({ inventors: ["Samuel Odio", "David Garcia"], applicant: "Facebook, Inc." });
    expect(corroboratePatent(samFacebook, "Daniel Odio", "co-founder of armory")).toBe(false);
  });
  it("drops a patent with no assignee (can't corroborate)", () => {
    expect(corroboratePatent(P({ applicant: null }), "Jensen Huang", "ceo of nvidia")).toBe(false);
  });
});

describe("resolvePatentName (vanity-handle fallback)", () => {
  const ctx = (fullName: string | null, knownFullName?: string | null) =>
    ({ fullName, knownFullName }) as EnricherContext;
  it("prefers the legal knownFullName when the live name is a vanity handle (the DROdio case)", () => {
    // "DROdio" has no separable first/last → fall back to the eval's legal name.
    expect(resolvePatentName(ctx("DROdio", "Daniel Rubén Odio"))).toBe("Daniel Rubén Odio");
  });
  it("keeps the live name when it already parses into a first+last", () => {
    expect(resolvePatentName(ctx("Samuel Odio", "Sam Odio"))).toBe("Samuel Odio");
  });
  it("falls back to the raw live name when neither parses (first score still tries)", () => {
    expect(resolvePatentName(ctx("DROdio", null))).toBe("DROdio");
  });
  it("returns null when there is no name at all", () => {
    expect(resolvePatentName(ctx(null, null))).toBeNull();
  });
});

describe("patentFacts", () => {
  it("renders a count + assignee fact (no point values)", () => {
    const facts = patentFacts([P({}), P({ granted: false })]);
    const joined = facts.join("\n");
    expect(joined).toMatch(/2 US patent/);
    expect(joined).toMatch(/1 granted/);
    expect(joined).toMatch(/NVIDIA Corporation/);
    expect(joined).not.toMatch(/\+\d+\s*(point|pts)/i);
  });
  it("returns nothing for zero patents", () => {
    expect(patentFacts([])).toEqual([]);
  });
});

describe("twitterHandleFromLinkedin", () => {
  it("extracts a handle from the subject's listed bio links", () => {
    expect(twitterHandleFromLinkedin({ bio_links: [{ link: "https://twitter.com/drodio" }] })).toBe("drodio");
    expect(twitterHandleFromLinkedin({ bio_links: ["https://x.com/patrickc"] })).toBe("patrickc");
  });
  it("ignores non-profile twitter paths + missing links", () => {
    expect(twitterHandleFromLinkedin({ bio_links: ["https://twitter.com/intent/tweet"] })).toBeNull();
    expect(twitterHandleFromLinkedin({ bio_links: [] })).toBeNull();
    expect(twitterHandleFromLinkedin(null)).toBeNull();
  });
});
