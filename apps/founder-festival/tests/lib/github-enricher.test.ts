import { describe, it, expect } from "vitest";
import { githubMatchConfidence, GITHUB_MATCH_THRESHOLD, usernameEncodesName } from "@/lib/enrichers/github";

const accept = (n: number) => n >= GITHUB_MATCH_THRESHOLD;
const co = (...tokens: string[]) => new Set(tokens);

describe("githubMatchConfidence — company correlation (strongest)", () => {
  it("near-certain when the GitHub company appears in the subject's data", () => {
    const c = githubMatchConfidence("Sam Altman", { name: "Sam Altman", company: "@openai" }, false, co("openai", "research"));
    expect(c).toBeGreaterThanOrEqual(0.9);
    expect(accept(c)).toBe(true);
  });

  it("rejects a same-LAST-name coder whose company does NOT match (the Branson case)", () => {
    // Sir Richard Branson (Virgin Group) vs github.com/rbranson = "Rick Branson" @openai.
    const c = githubMatchConfidence(
      "Richard Branson",
      { name: "Rick Branson", company: "@openai" },
      true, // surfaced in web results
      co("virgin", "group"),
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
    expect(accept(githubMatchConfidence("Jane Torvalds", { name: "Linus Torvalds" }, false, co()))).toBe(false);
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
    expect(accept(githubMatchConfidence("Cher", { name: "Cher" }, false, co()))).toBe(true);
    expect(accept(githubMatchConfidence("Cher", { name: "Madonna" }, false, co()))).toBe(false);
  });

  it("rejects an unverifiable account (no name, no URL, no company)", () => {
    expect(accept(githubMatchConfidence("Jane Doe", { name: null }, false, co()))).toBe(false);
    expect(accept(githubMatchConfidence(undefined, { name: "Jane Doe" }, false, co()))).toBe(false);
  });
});

describe("usernameEncodesName", () => {
  it("strong (1) when the handle is first+last", () => {
    expect(usernameEncodesName("Zane Salim", "zanesalim")).toBe(1);
    expect(usernameEncodesName("Gowtham Sundaresan", "gowthamsundaresan")).toBe(1);
    expect(usernameEncodesName("Alejandro (Al) Guerrero", "alejandroguerrero")).toBe(1);
  });
  it("strong (1) for first + last-initial (helson + t = helsont)", () => {
    expect(usernameEncodesName("Helson Taveras", "helsont")).toBe(1);
  });
  it("0 when the handle does NOT encode THIS name", () => {
    // helsont encodes Helson Taveras, NOT Helison Tavares
    expect(usernameEncodesName("Helison Tavares", "helsont")).toBe(0);
    // an org/unrelated handle on a mis-attach victim
    expect(usernameEncodesName("Omar Mohtar", "kaito-project")).toBe(0);
    // the OTHER Zane (different surname) is not the strong owner of zanesalim
    expect(usernameEncodesName("Zane Qureshi", "zanesalim")).toBeLessThan(1);
  });
  it("0 with no handle or no name", () => {
    expect(usernameEncodesName("Zane Salim", "")).toBe(0);
    expect(usernameEncodesName(null, "zanesalim")).toBe(0);
  });
});

describe("githubMatchConfidence — username rescues distinctive legit owners", () => {
  it("KEEPS an owner whose handle encodes their name despite a non-correlating company field", () => {
    // Zane Salim — github 'zanesalim'; the company field isn't in his scraped data.
    expect(accept(githubMatchConfidence("Zane Salim", { name: "Zane Salim", company: "Atlas", login: "zanesalim" }, false, co("pioneer", "fund")))).toBe(true);
    expect(accept(githubMatchConfidence("Gowtham Sundaresan", { name: "Gowtham Sundaresan", company: "Infosys", login: "gowthamsundaresan" }, false, co("acme")))).toBe(true);
    expect(accept(githubMatchConfidence("Alejandro (Al) Guerrero", { name: "Alejandro Guerrero", company: "ActOne", login: "alejandroguerrero" }, false, co("acme")))).toBe(true);
  });
  it("still REJECTS the mis-attach victim whose name the handle does NOT encode", () => {
    // 'helsont' (Helson Taveras @ Keep) attached to Helison Tavares (Granorte).
    expect(accept(githubMatchConfidence("Helison Tavares", { name: "Helson Taveras", company: "Keep Technologies", login: "helsont" }, false, co("granorte")))).toBe(false);
    expect(accept(githubMatchConfidence("Omar Mohtar", { name: null, company: null, login: "kaito-project" }, false, co()))).toBe(false);
  });
  it("the LEGIT Helson still wins via company correlation (strongest tier)", () => {
    expect(githubMatchConfidence("Helson Taveras", { name: "Helson Taveras", company: "Keep Technologies", login: "helsont" }, false, co("keep"))).toBe(0.95);
  });
});
