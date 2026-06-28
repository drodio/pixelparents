import { describe, it, expect } from "vitest";
import { resolveAutoAction } from "@/lib/attendee-connections";

describe("resolveAutoAction", () => {
  const E = "event-123";
  it("defaults to ask with no prefs", () => {
    expect(resolveAutoAction([], "founder", E)).toBe("ask");
  });
  it("uses the global pref for the group", () => {
    expect(resolveAutoAction([{ scope: "global", group: "investor", action: "auto_approve" }], "investor", E)).toBe("auto_approve");
  });
  it("event-specific overrides global", () => {
    const prefs = [
      { scope: "global", group: "founder", action: "auto_approve" },
      { scope: E, group: "founder", action: "auto_deny" },
    ];
    expect(resolveAutoAction(prefs, "founder", E)).toBe("auto_deny");
  });
  it("ignores prefs for other groups", () => {
    expect(resolveAutoAction([{ scope: "global", group: "sponsor", action: "auto_deny" }], "founder", E)).toBe("ask");
  });
  it("ignores event prefs for a different event", () => {
    expect(resolveAutoAction([{ scope: "other-event", group: "founder", action: "auto_deny" }], "founder", E)).toBe("ask");
  });
});
