import { describe, it, expect } from "vitest";
import { buildAgentGuide } from "@/lib/developers/agent-guide";

describe("buildAgentGuide", () => {
  it("uses the base URL (trailing slash trimmed) + documents the endpoints", () => {
    const md = buildAgentGuide({ baseUrl: "https://festival.so/" });
    expect(md).toContain("https://festival.so/api/v1/score"); // trailing slash trimmed
    expect(md).not.toContain("festival.so//"); // base normalized
    expect(md).toContain("founder_rows");
  });

  it("documents the new endpoints and the verbose profile fields", () => {
    const md = buildAgentGuide({ baseUrl: "https://festival.so" });
    for (const path of [
      "/api/v1/search",
      "/api/v1/events",
      "/api/v1/industries",
      "/api/v1/leaderboard",
    ]) {
      expect(md).toContain(path);
    }
    // Verbose profile surface: radar, peer matrix, investor focus, privacy.
    expect(md).toContain("credibility");
    expect(md).toContain("matrix");
    expect(md).toContain("complement");
    expect(md).toContain("check_size");
    expect(md).toContain("canonical_industries");
    // Privacy promise must be stated explicitly.
    expect(md.toLowerCase()).toContain("never");
  });

  it("documents the new event + profile public data (badges, hosts/sponsors/recap, credibility, family)", () => {
    const md = buildAgentGuide({ baseUrl: "https://festival.so" });
    // Events: badge filter + taxonomy endpoint + nested detail content.
    expect(md).toContain("/api/v1/event-badges");
    expect(md).toContain("?badge=");
    for (const field of ["hosts", "sponsors", "recap_html"]) expect(md).toContain(field);
    // Profile: credibility headline + public family badges.
    expect(md).toContain("credibility_title");
    expect(md).toContain("family_badges");
    // Leaderboard family filter.
    expect(md).toMatch(/`family`/);
    // Points were removed from the public API — must not be re-documented on rows.
    expect(md).toContain("Per-row point values are not exposed");
  });

  it("ALWAYS shows a key placeholder — never embeds a real key", () => {
    const md = buildAgentGuide({ baseUrl: "https://festival.so" });
    expect(md).toContain(
      "Authorization: Bearer [USER WILL PROVIDE API KEY IN sk_festival_live_*** format]",
    );
    // No real key should ever appear in the generated markdown.
    expect(md).not.toMatch(/Bearer sk_festival_live_[A-Za-z0-9]/);
  });
});
