import { describe, it, expect } from "vitest";
import {
  matchConfidence,
  localPartMatchesName,
  domainMatches,
  signalConfidence,
  isOwningConfidence,
} from "@/lib/identity-match";

describe("matchConfidence — LinkedIn", () => {
  const profile = {
    fullName: "Patrick Collison",
    primaryCompanyDomain: "stripe.com",
    publicEmail: "patrick@stripe.com",
  };

  it("linkedin email exact match → linkedin-email-exact", () => {
    const r = matchConfidence(
      { provider: "linkedin", email: "patrick@stripe.com", firstName: "Patrick", lastName: "Collison" },
      "https://linkedin.com/in/pc",
      profile,
    );
    expect(r).toEqual({ kind: "match", signal: "linkedin-email-exact" });
  });

  it("linkedin email name+company match → linkedin-email-name-company", () => {
    const r = matchConfidence(
      { provider: "linkedin", email: "patrick.collison@stripe.com", firstName: "Patrick", lastName: "Collison" },
      "https://linkedin.com/in/pc",
      { fullName: "Patrick Collison", primaryCompanyDomain: "stripe.com" },
    );
    expect(r).toEqual({ kind: "match", signal: "linkedin-email-name-company" });
  });

  it("linkedin firstName+lastName matches fullName → linkedin-name-match", () => {
    const r = matchConfidence(
      { provider: "linkedin", email: "anything@example.com", firstName: "Patrick", lastName: "Collison" },
      "https://linkedin.com/in/pc",
      { fullName: "Patrick Collison" },
    );
    expect(r).toEqual({ kind: "match", signal: "linkedin-name-match" });
  });

  it("linkedin name match is diacritic-insensitive", () => {
    const r = matchConfidence(
      { provider: "linkedin", email: "x@y.com", firstName: "José", lastName: "García" },
      "https://linkedin.com/in/jg",
      { fullName: "Jose Garcia" },
    );
    expect(r).toEqual({ kind: "match", signal: "linkedin-name-match" });
  });

  it("linkedin name match tolerates profile middle names absent from LinkedIn", () => {
    // LinkedIn returns firstName="Daniel" lastName="Odio" — middle name "Rubén"
    // never appears in the Clerk claim. Profile has the full legal name.
    const r = matchConfidence(
      { provider: "linkedin", email: "x@y.com", firstName: "Daniel", lastName: "Odio" },
      "https://linkedin.com/in/danielodio",
      { fullName: "Daniel Rubén Odio" },
    );
    expect(r).toEqual({ kind: "match", signal: "linkedin-name-match" });
  });

  it("linkedin name match tolerates handle in firstName + decoration in lastName", () => {
    // LinkedIn lets users put a display brand in firstName; the formal first
    // name can end up packed into lastName ("- Daniel R. Odio"). Surname + at
    // least one other token must still match.
    const r = matchConfidence(
      { provider: "linkedin", email: "x@y.com", firstName: "DROdio", lastName: "- Daniel R. Odio" },
      "https://linkedin.com/in/drodio",
      { fullName: "Daniel Odio" },
    );
    expect(r).toEqual({ kind: "match", signal: "linkedin-name-match" });
  });

  it("linkedin name match rejects when only surname matches", () => {
    // John Smith vs Jane Smith shouldn't match — same surname but no other
    // overlap.
    const r = matchConfidence(
      { provider: "linkedin", email: "x@y.com", firstName: "John", lastName: "Smith" },
      "https://linkedin.com/in/x",
      { fullName: "Jane Smith" },
    );
    expect(r).toEqual({ kind: "no-match", reason: "linkedin-no-signal" });
  });

  it("linkedin with no profile signal → no-match linkedin-no-signal", () => {
    const r = matchConfidence(
      { provider: "linkedin", email: "x@y.com", firstName: "Foo", lastName: "Bar" },
      "https://linkedin.com/in/x",
      { fullName: "Patrick Collison", primaryCompanyDomain: "stripe.com" },
    );
    expect(r).toEqual({ kind: "no-match", reason: "linkedin-no-signal" });
  });

  it("linkedin with no profile at all → no-match linkedin-no-signal", () => {
    const r = matchConfidence(
      { provider: "linkedin", email: "x@y.com", firstName: "X", lastName: "Y" },
      "https://linkedin.com/in/x",
      null,
    );
    expect(r).toEqual({ kind: "no-match", reason: "linkedin-no-signal" });
  });
});

describe("matchConfidence — GitHub", () => {
  it("stored username matches claim username → github-username", () => {
    const r = matchConfidence(
      { provider: "github", githubUsername: "patrickc" },
      "https://linkedin.com/in/pc",
      { fullName: "Patrick Collison", githubUsername: "patrickc" },
    );
    expect(r).toEqual({ kind: "match", signal: "github-username" });
  });

  it("case-insensitive github match", () => {
    const r = matchConfidence(
      { provider: "github", githubUsername: "PatrickC" },
      "https://linkedin.com/in/pc",
      { fullName: "Patrick Collison", githubUsername: "patrickc" },
    );
    expect(r).toEqual({ kind: "match", signal: "github-username" });
  });

  it("no stored username → no-match github-no-stored-username", () => {
    const r = matchConfidence(
      { provider: "github", githubUsername: "anyone" },
      "https://linkedin.com/in/pc",
      { fullName: "Patrick Collison" },
    );
    expect(r).toEqual({ kind: "no-match", reason: "github-no-stored-username" });
  });

  it("stored username present but claim differs → github-username-mismatch", () => {
    const r = matchConfidence(
      { provider: "github", githubUsername: "imposter" },
      "https://linkedin.com/in/pc",
      { fullName: "Patrick Collison", githubUsername: "patrickc" },
    );
    expect(r).toEqual({ kind: "no-match", reason: "github-username-mismatch" });
  });

  it("claim has no username → github-username-mismatch", () => {
    const r = matchConfidence(
      { provider: "github" },
      "https://linkedin.com/in/pc",
      { fullName: "Patrick Collison", githubUsername: "patrickc" },
    );
    expect(r).toEqual({ kind: "no-match", reason: "github-username-mismatch" });
  });
});

describe("matchConfidence — Email (standalone provider)", () => {
  it("exact publicEmail match → email-exact", () => {
    const r = matchConfidence(
      { provider: "email", email: "Patrick@Stripe.com" },
      "https://linkedin.com/in/pc",
      { fullName: "Patrick Collison", primaryCompanyDomain: "stripe.com", publicEmail: "patrick@stripe.com" },
    );
    expect(r).toEqual({ kind: "match", signal: "email-exact" });
  });

  it("non-matching publicEmail falls through to name+company tier", () => {
    const r = matchConfidence(
      { provider: "email", email: "patrick.collison@stripe.com" },
      "https://linkedin.com/in/pc",
      { fullName: "Patrick Collison", primaryCompanyDomain: "stripe.com", publicEmail: "patrick@stripe.com" },
    );
    expect(r).toEqual({ kind: "match", signal: "email-name-company" });
  });

  it("first.last@company → email-name-company", () => {
    const r = matchConfidence(
      { provider: "email", email: "patrick.collison@stripe.com" },
      "https://linkedin.com/in/pc",
      { fullName: "Patrick Collison", primaryCompanyDomain: "stripe.com" },
    );
    expect(r).toEqual({ kind: "match", signal: "email-name-company" });
  });

  it("subdomain of stored domain matches", () => {
    const r = matchConfidence(
      { provider: "email", email: "patrick.collison@eu.stripe.com" },
      "https://linkedin.com/in/pc",
      { fullName: "Patrick Collison", primaryCompanyDomain: "stripe.com" },
    );
    expect(r).toEqual({ kind: "match", signal: "email-name-company" });
  });

  it("wrong domain → email-no-signal", () => {
    const r = matchConfidence(
      { provider: "email", email: "patrick.collison@google.com" },
      "https://linkedin.com/in/pc",
      { fullName: "Patrick Collison", primaryCompanyDomain: "stripe.com" },
    );
    expect(r).toEqual({ kind: "no-match", reason: "email-no-signal" });
  });

  it("right domain, wrong local-part → email-no-signal", () => {
    const r = matchConfidence(
      { provider: "email", email: "support@stripe.com" },
      "https://linkedin.com/in/pc",
      { fullName: "Patrick Collison", primaryCompanyDomain: "stripe.com" },
    );
    expect(r).toEqual({ kind: "no-match", reason: "email-no-signal" });
  });

  it("no profile at all → email-no-signal", () => {
    const r = matchConfidence(
      { provider: "email", email: "anyone@stripe.com" },
      "https://linkedin.com/in/pc",
      null,
    );
    expect(r).toEqual({ kind: "no-match", reason: "email-no-signal" });
  });

  it("missing email on claim → email-no-domain", () => {
    const r = matchConfidence(
      { provider: "email" },
      "https://linkedin.com/in/pc",
      { fullName: "Patrick Collison", primaryCompanyDomain: "stripe.com" },
    );
    expect(r).toEqual({ kind: "no-match", reason: "email-no-domain" });
  });
});

describe("signalConfidence — name-only must never reach owner-grade confidence", () => {
  // SECURITY (P0-1): a LinkedIn name match relies only on the user-editable
  // Clerk firstName/lastName against a PUBLIC display name. It must never grant
  // mutation rights, so it maps to at most "medium" — which isOwningConfidence
  // rejects. Strong signals (verified email / domain+name / github username)
  // remain "high".
  it("linkedin-name-match → medium (not owner-grade)", () => {
    expect(signalConfidence("linkedin-name-match")).toBe("medium");
  });

  it.each([
    "linkedin-email-exact",
    "linkedin-email-name-company",
    "github-username",
    "email-exact",
    "email-name-company",
  ] as const)("%s → high", (signal) => {
    expect(signalConfidence(signal)).toBe("high");
  });
});

describe("isOwningConfidence — only 'high' grants mutation ownership", () => {
  it("high → true", () => {
    expect(isOwningConfidence("high")).toBe(true);
  });

  it.each(["medium", "low", null, undefined, "", "HIGH"])(
    "%s → false",
    (value) => {
      expect(isOwningConfidence(value)).toBe(false);
    },
  );
});

describe("localPartMatchesName", () => {
  it.each([
    ["patrick", "Patrick Collison"],
    ["collison", "Patrick Collison"],
    ["patrickcollison", "Patrick Collison"],
    ["patrick.collison", "Patrick Collison"],
    ["patrick_collison", "Patrick Collison"],
    ["patrick-collison", "Patrick Collison"],
    ["pcollison", "Patrick Collison"],
    ["p.collison", "Patrick Collison"],
    ["p_collison", "Patrick Collison"],
    ["collisonpatrick", "Patrick Collison"],
    ["collison.patrick", "Patrick Collison"],
  ])("'%s' matches '%s'", (local, name) => {
    expect(localPartMatchesName(local, name)).toBe(true);
  });

  it.each([
    ["patrick", "Patrick"], // single-token name — must still match "patrick"
    ["smith", "Mary Jane Smith"], // multi-token: only first+last considered
    ["mary.smith", "Mary Jane Smith"],
  ])("'%s' matches '%s'", (local, name) => {
    expect(localPartMatchesName(local, name)).toBe(true);
  });

  it("ignores middle tokens (mary.jane.smith does NOT match)", () => {
    expect(localPartMatchesName("mary.jane.smith", "Mary Jane Smith")).toBe(false);
  });

  it("strips +suffix", () => {
    expect(localPartMatchesName("patrick.collison+spam", "Patrick Collison")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(localPartMatchesName("PATRICK", "patrick collison")).toBe(true);
  });

  it("normalizes diacritics (José → jose)", () => {
    expect(localPartMatchesName("jose", "José García")).toBe(true);
    expect(localPartMatchesName("jose.garcia", "José García")).toBe(true);
  });

  it("rejects unrelated local-parts", () => {
    expect(localPartMatchesName("admin", "Patrick Collison")).toBe(false);
    expect(localPartMatchesName("info", "Patrick Collison")).toBe(false);
    expect(localPartMatchesName("xyz", "Patrick Collison")).toBe(false);
  });

  it("returns false on empty inputs", () => {
    expect(localPartMatchesName("", "Patrick Collison")).toBe(false);
    expect(localPartMatchesName("patrick", "")).toBe(false);
    expect(localPartMatchesName("patrick", "   ")).toBe(false);
  });
});

describe("domainMatches", () => {
  it("exact match", () => {
    expect(domainMatches("stripe.com", "stripe.com")).toBe(true);
  });
  it("subdomain of target matches", () => {
    expect(domainMatches("eu.stripe.com", "stripe.com")).toBe(true);
    expect(domainMatches("payments.eu.stripe.com", "stripe.com")).toBe(true);
  });
  it("parent of target does NOT match", () => {
    expect(domainMatches("stripe.com", "eu.stripe.com")).toBe(false);
  });
  it("similar-name domains do not match (no substring trick)", () => {
    expect(domainMatches("notstripe.com", "stripe.com")).toBe(false);
    expect(domainMatches("stripe.com.attacker.com", "stripe.com")).toBe(false);
  });
  it("case-insensitive", () => {
    expect(domainMatches("Stripe.COM", "stripe.com")).toBe(true);
  });
  it("returns false on empty inputs", () => {
    expect(domainMatches("", "stripe.com")).toBe(false);
    expect(domainMatches("stripe.com", "")).toBe(false);
  });
});
