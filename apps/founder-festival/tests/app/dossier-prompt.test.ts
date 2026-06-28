import { describe, it, expect } from "vitest";
import { buildDossierPrompt } from "@/lib/dossier-prompt";
import { dossierShareUrl } from "@/lib/chief";

describe("dossierShareUrl", () => {
  const ANCHOR = "DeepIntelligenceDossieron"; // "Deep Intelligence Dossier on", spaces stripped

  it("adds start/end (scroll-to heading) + leaf when the base has no query", () => {
    expect(dossierShareUrl("https://chief.bot/shared/chat/abc", "message_x")).toBe(
      `https://chief.bot/shared/chat/abc?start=${ANCHOR}&end=${ANCHOR}&leaf=message_x`,
    );
  });

  it("uses & when the base already has a query", () => {
    expect(dossierShareUrl("https://chief.bot/shared/chat/abc?foo=1", "message_x")).toBe(
      `https://chief.bot/shared/chat/abc?foo=1&start=${ANCHOR}&end=${ANCHOR}&leaf=message_x`,
    );
  });

  it("url-encodes the message id", () => {
    expect(dossierShareUrl("https://x/y", "a b")).toBe(
      `https://x/y?start=${ANCHOR}&end=${ANCHOR}&leaf=a%20b`,
    );
  });
});

describe("buildDossierPrompt", () => {
  const ffUrl = "https://festival.so/profile/founder/daniel-odio";

  it("renders 'Nickname (Full Name)' when a nickname is present", () => {
    const p = buildDossierPrompt({
      nickname: "DROdio",
      fullName: "Daniel R. Odio",
      ffUrl,
      title: "Founder & CEO",
      location: "San Francisco, CA, USA",
    });
    expect(p).toContain("- Name: DROdio (Daniel R. Odio)");
    expect(p).toContain("# Deep Intelligence Dossier on DROdio (Daniel R. Odio)");
    // Section headers use the display name (nickname).
    expect(p).toContain("## DROdio's Likely Superpower:");
    expect(p).toContain("## DROdio  At A Glance:");
    expect(p).toContain("## DROdio's Inferred Interpersonal Characteristics:");
    expect(p).toContain("## Fun Facts About DROdio:");
    expect(p).toContain("- Founder Festival profile: " + ffUrl);
    expect(p).toContain("- Title/role (as known): Founder & CEO");
    expect(p).toContain("- Location (as known): San Francisco, CA, USA");
    // Verbatim instruction markers + disclaimer kept for Chief.
    expect(p).toContain("[red circle emoji]:");
    expect(p).toContain("[orange emoji]");
    expect(p).toContain("This dossier is AI-generated based on publicly available data");
    expect(p).toContain("Use the Founder Festival profile as the authoritative anchor");
    expect(p).not.toContain("LinkedIn");
  });

  it("drops the parens and uses full name when there is no nickname", () => {
    const p = buildDossierPrompt({ nickname: null, fullName: "Daniel R. Odio", ffUrl });
    expect(p).toContain("- Name: Daniel R. Odio");
    expect(p).toContain("# Deep Intelligence Dossier on Daniel R. Odio");
    expect(p).toContain("## Daniel R. Odio's Likely Superpower:");
    expect(p).not.toContain("(Daniel R. Odio)");
  });

  it("falls back to 'Unknown' for blank title/location", () => {
    const p = buildDossierPrompt({ nickname: "DROdio", fullName: "Daniel R. Odio", ffUrl, title: null, location: "" });
    expect(p).toContain("- Title/role (as known): Unknown");
    expect(p).toContain("- Location (as known): Unknown");
  });
});
