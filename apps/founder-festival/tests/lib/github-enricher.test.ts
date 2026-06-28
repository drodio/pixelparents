import { describe, it, expect } from "vitest";
import { githubMatchConfidence, GITHUB_MATCH_THRESHOLD, usernameEncodesName } from "@/lib/enrichers/github";

const accept = (n: number) => n >= GITHUB_MATCH_THRESHOLD;
const co = (...tokens: string[]) => new Set(tokens);

describe("githubMatchConfidence — company correlation (strongest)", () => {
  it("near-certain when the GitHub company appears in the subject's data", () => {
    const c = githubMatchConfidence("Jordan Avery", { name: "Jordan Avery", company: "@openai" }, false, co("openai", "research"));
    expect(c).toBeGreaterThanOrEqual(0.9);
    expect(accept(c)).toBe(true);
  });

  it("rejects a same-LAST-name coder whose company does NOT match (the same-surname case)", () => {
    // Marcus Hale (Brightwave Group) vs github.com/rhale = "Rick Hale" @openai.
    const c = githubMatchConfidence(
      "Marcus Hale",
      { name: "Rick Hale", company: "@openai" },
      true, // surfaced in web results
      co("brightwave", "group"),
    );
    expect(accept(c)).toBe(false);
  });

  it("rejects even a FULL name match when the company clearly belongs elsewhere", () => {
    const c = githubMatchConfidence("Jane Doe", { name: "Jane Doe", company: "@megacorp" }, false, co("tinystartup"));
    expect(accept(c)).toBe(false);
  });
});

describe("githubMatchConfidence — name + surfaced-URL fallback (no company)", () => {
  it("accepts a strong full-name match", () => {
    expect(accept(githubMatchConfidence("Jane Doe", { name: "Jane Doe" }, false, co()))).toBe(true);
    expect(accept(githubMatchConfidence("Jane Q Doe", { name: "Jane Doe" }, false, co()))).toBe(true);
  });

  it("rejects a shared-last-name-only account (famous-account-hijack vector)", () => {
    expect(accept(githubMatchConfidence("Jane Kellerman", { name: "Victor Kellerman" }, false, co()))).toBe(false);
    expect(accept(githubMatchConfidence("Jane Doe", { name: "Jane Smith" }, false, co()))).toBe(false);
  });

  it("a surfaced URL ALONE (no name match) is no longer enough", () => {
    expect(accept(githubMatchConfidence("Jane Doe", { name: "Completely Different" }, true, co()))).toBe(false);
    expect(accept(githubMatchConfidence("Jane Doe", { name: null }, true, co()))).toBe(false);
  });

  it("full name match + surfaced URL is accepted", () => {
    expect(accept(githubMatchConfidence("Jane Doe", { name: "Jane Doe" }, true, co()))).toBe(true);
  });

  it("matches a single-token name on that one token", () => {
    expect(accept(githubMatchConfidence("Vega", { name: "Vega" }, false, co()))).toBe(true);
    expect(accept(githubMatchConfidence("Vega", { name: "Nova" }, false, co()))).toBe(false);
  });

  it("rejects an unverifiable account (no name, no URL, no company)", () => {
    expect(accept(githubMatchConfidence("Jane Doe", { name: null }, false, co()))).toBe(false);
    expect(accept(githubMatchConfidence(undefined, { name: "Jane Doe" }, false, co()))).toBe(false);
  });
});

describe("usernameEncodesName", () => {
  it("strong (1) when the handle is first+last", () => {
    expect(usernameEncodesName("Dale Mercer", "dalemercer")).toBe(1);
    expect(usernameEncodesName("Pranav Iyer", "pranaviyer")).toBe(1);
    expect(usernameEncodesName("Esteban (Eddie) Ramirez", "estebanramirez")).toBe(1);
  });
  it("strong (1) for first + last-initial (marlon + t = marlont)", () => {
    expect(usernameEncodesName("Marlon Tavish", "marlont")).toBe(1);
  });
  it("0 when the handle does NOT encode THIS name", () => {
    // marlont encodes Marlon Tavish, NOT Marlin Tavarez
    expect(usernameEncodesName("Marlin Tavarez", "marlont")).toBe(0);
    // an org/unrelated handle on a mis-attach victim
    expect(usernameEncodesName("Quinn Avery", "shared-org-bot")).toBe(0);
    // the OTHER Dale (different surname) is not the strong owner of dalemercer
    expect(usernameEncodesName("Dale Whitman", "dalemercer")).toBeLessThan(1);
  });
  it("0 with no handle or no name", () => {
    expect(usernameEncodesName("Dale Mercer", "")).toBe(0);
    expect(usernameEncodesName(null, "dalemercer")).toBe(0);
  });
});

describe("githubMatchConfidence — username rescues distinctive legit owners", () => {
  it("KEEPS an owner whose handle encodes their name despite a non-correlating company field", () => {
    // Dale Mercer — github 'dalemercer'; the company field isn't in his scraped data.
    expect(accept(githubMatchConfidence("Dale Mercer", { name: "Dale Mercer", company: "Atlas", login: "dalemercer" }, false, co("pioneer", "fund")))).toBe(true);
    expect(accept(githubMatchConfidence("Pranav Iyer", { name: "Pranav Iyer", company: "Infosys", login: "pranaviyer" }, false, co("acme")))).toBe(true);
    expect(accept(githubMatchConfidence("Esteban (Eddie) Ramirez", { name: "Esteban Ramirez", company: "ActOne", login: "estebanramirez" }, false, co("acme")))).toBe(true);
  });
  it("still REJECTS the mis-attach victim whose name the handle does NOT encode", () => {
    // 'marlont' (Marlon Tavish @ Beacon) attached to Marlin Tavarez (Greenfield).
    expect(accept(githubMatchConfidence("Marlin Tavarez", { name: "Marlon Tavish", company: "Beacon Technologies", login: "marlont" }, false, co("greenfield")))).toBe(false);
    expect(accept(githubMatchConfidence("Quinn Avery", { name: null, company: null, login: "shared-org-bot" }, false, co()))).toBe(false);
  });
  it("the LEGIT Marlon still wins via company correlation (strongest tier)", () => {
    expect(githubMatchConfidence("Marlon Tavish", { name: "Marlon Tavish", company: "Beacon Technologies", login: "marlont" }, false, co("beacon"))).toBe(0.95);
  });
});
