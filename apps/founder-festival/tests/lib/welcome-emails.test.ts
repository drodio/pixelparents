import { describe, it, expect } from "vitest";
import { escapeHtml, firstNameFor, renderClaimWelcomeEmail, renderDevApiWelcomeEmail } from "@/lib/welcome-emails";

describe("escapeHtml", () => {
  it("neutralizes angle brackets, ampersands, and quotes", () => {
    expect(escapeHtml(`<b>"a"&'b'`)).toBe("&lt;b&gt;&quot;a&quot;&amp;&#39;b&#39;");
  });
});

describe("firstNameFor", () => {
  it("prefers the nickname over everything else", () => {
    expect(firstNameFor("DROdio", "Dana", "Profile Person")).toBe("DROdio");
    expect(firstNameFor("Mary Beth", "Mary", "Mary Beth Smith")).toBe("Mary Beth");
  });
  it("uses the nickname whole (no first-token reduction)", () => {
    expect(firstNameFor("Two Words", null, null)).toBe("Two Words");
  });
  it("treats empty/whitespace nickname as absent", () => {
    expect(firstNameFor("", "Dana", null)).toBe("Dana");
    expect(firstNameFor("   ", "Dana", null)).toBe("Dana");
    expect(firstNameFor(null, "Dana", null)).toBe("Dana");
  });
  it("falls through to Clerk firstName when nickname is missing", () => {
    expect(firstNameFor(null, "Dana", "Profile Person")).toBe("Dana");
  });
  it("takes the first token of Clerk firstName when it contains a full name", () => {
    expect(firstNameFor(null, "Nova Hayes", "ignored")).toBe("Nova");
    expect(firstNameFor(null, "  Nova  Hayes  ", null)).toBe("Nova");
  });
  it("falls back to the first token of the fallback name", () => {
    expect(firstNameFor(null, null, "Nova Hayes")).toBe("Nova");
    expect(firstNameFor(null, "   ", "Nova Hayes")).toBe("Nova");
  });
  it("falls back to 'there' when nothing usable", () => {
    expect(firstNameFor(null, null)).toBe("there");
    expect(firstNameFor("", "", "")).toBe("there");
  });
});

describe("renderClaimWelcomeEmail", () => {
  const base = { firstName: "Ada", profileUrl: "https://festival.so/profile/p/ada" };

  it("full: name subject, profile + my-profile + Chief + Festival API links, escapes name", () => {
    const { subject, html } = renderClaimWelcomeEmail({ ...base, firstName: "A<b>", short: false });
    expect(subject).toBe("A<b> - Welcome to Founder Festival + what to build? (and FYI on API)");
    expect(html).toContain('href="https://festival.so/profile/p/ada"');
    expect(html).toContain('href="https://festival.so/profile/founder/daniel-r-odio"');
    expect(html).toContain('href="https://chief.bot"');
    expect(html).toContain('href="https://festival.so/developers"');
    expect(html).toContain("A&lt;b&gt;,");
  });

  it("short: '+ profile!' subject, has *also*, keeps intro, DROPS the Festival API paragraph", () => {
    const { subject, html } = renderClaimWelcomeEmail({ ...base, short: true });
    expect(subject).toBe("+ profile! what to build next?");
    expect(html).toContain("<em>also</em>");
    expect(html).toContain('href="https://festival.so/profile/founder/daniel-r-odio"');
    expect(html).not.toContain("https://festival.so/developers");
  });
});

describe("renderDevApiWelcomeEmail", () => {
  it("full: name subject, intro links + Festival API link", () => {
    const { subject, html } = renderDevApiWelcomeEmail({ firstName: "Ada", short: false });
    expect(subject).toBe("Ada - LMK what you do with the Festival Developer API! + ideas?");
    expect(html).toContain("BTW, how'd you hear about it?");
    expect(html).toContain('href="https://festival.so/profile/founder/daniel-r-odio"');
    expect(html).toContain('href="https://festival.so/developers"');
  });

  it("short: '+ LMK' subject, *also*, no intro/links", () => {
    const { subject, html } = renderDevApiWelcomeEmail({ firstName: "Ada", short: true });
    expect(subject).toBe("+ LMK what you do with the Festival Developer API! + ideas?");
    expect(html).toContain("<em>also</em>");
    expect(html).not.toContain("href=");
    expect(html).not.toContain("BTW, how'd you hear");
  });
});
