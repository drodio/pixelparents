import { describe, it, expect } from "vitest";
import { buildConnectionsPrompt } from "@/lib/recommended-connections";

describe("buildConnectionsPrompt", () => {
  const base = {
    fullName: "Daniel R. Odio",
    eventUrl: "https://festival.so/events/co-founder-unconference-dinner",
    profileUrl: "https://festival.so/profile/drodio",
    learningsText: "PUBLIC LEARNINGS:\nShip fast.",
    attendees: [
      { fullName: "Jane Doe", profileUrl: "https://festival.so/profile/jane" },
      { fullName: "John Roe", profileUrl: null },
    ],
  };

  it("includes the subject, event URL, profile URL, and learnings", () => {
    const p = buildConnectionsPrompt(base);
    expect(p).toContain("help Daniel R. Odio get more value from https://festival.so/events/co-founder-unconference-dinner");
    expect(p).toContain("Founder Festival profile for Daniel R. Odio: https://festival.so/profile/drodio");
    expect(p).toContain("Ship fast.");
  });

  it("formats the roster as bullets, omitting the colon+URL when a profile URL is missing", () => {
    const p = buildConnectionsPrompt(base);
    expect(p).toContain("- Jane Doe: https://festival.so/profile/jane");
    expect(p).toContain("- John Roe");
    expect(p).not.toContain("- John Roe:"); // no dangling colon when URL is null
    // The subject is never a bullet in their own roster (caller excludes them).
    expect(p).not.toContain("- Daniel R. Odio");
  });

  it("asks for the two deliverables (top-3 connections + give/get) and clean HTML", () => {
    const p = buildConnectionsPrompt(base);
    expect(p).toContain("top 3 people");
    expect(p).toMatch(/"give"/);
    expect(p).toMatch(/"get"/);
    expect(p).toContain("Output CLEAN HTML ONLY");
  });

  it("degrades gracefully with no learnings and no other attendees", () => {
    const p = buildConnectionsPrompt({ ...base, learningsText: "", attendees: [] });
    expect(p).toContain("Here are all the learnings from the event: (none provided).");
    expect(p).toContain("(no other attendee profiles available)");
  });
});
