import { describe, it, expect } from "vitest";
import {
  isActive,
  activeRestriction,
  summarizeHistory,
  expiryFromHours,
  coerceKind,
} from "./enforcement";

const NOW = Date.parse("2026-08-04T12:00:00Z");
const inHours = (h: number) => new Date(NOW + h * 3_600_000);
const agoHours = (h: number) => new Date(NOW - h * 3_600_000);

const act = (
  over: Partial<Parameters<typeof isActive>[0]> & { reason?: string | null } = {},
) => ({
  kind: "mute",
  expiresAt: null,
  revokedAt: null,
  createdAt: agoHours(1),
  ...over,
});

describe("isActive", () => {
  it("counts a permanent, unrevoked restriction as active", () => {
    expect(isActive(act({ kind: "mute", expiresAt: null }), NOW)).toBe(true);
    expect(isActive(act({ kind: "ban", expiresAt: null }), NOW)).toBe(true);
  });

  it("counts a not-yet-expired timed restriction as active", () => {
    expect(isActive(act({ expiresAt: inHours(5) }), NOW)).toBe(true);
  });

  it("lets a lapsed restriction free itself with no job to run", () => {
    // The whole reason expiry is compared against now() rather than stored as a
    // flag: a failed cron must never leave someone muted forever.
    expect(isActive(act({ expiresAt: agoHours(1) }), NOW)).toBe(false);
  });

  it("respects an early revoke", () => {
    expect(isActive(act({ expiresAt: inHours(50), revokedAt: agoHours(1) }), NOW)).toBe(false);
  });

  it("never treats delete or note as a restriction", () => {
    expect(isActive(act({ kind: "delete" }), NOW)).toBe(false);
    expect(isActive(act({ kind: "note" }), NOW)).toBe(false);
  });
});

describe("activeRestriction", () => {
  it("reports nothing for a clean account", () => {
    expect(activeRestriction([], NOW)).toEqual({
      muted: false,
      banned: false,
      until: null,
      reason: null,
    });
  });

  it("treats a ban as implying a mute", () => {
    // Callers should only need `banned` for access and `muted` for posting.
    const r = activeRestriction([act({ kind: "ban", reason: "spam" })], NOW);
    expect(r.banned).toBe(true);
    expect(r.muted).toBe(true);
  });

  it("prefers the ban when both are live, and carries its reason", () => {
    const r = activeRestriction(
      [act({ kind: "mute", reason: "warning" }), act({ kind: "ban", reason: "advertising" })],
      NOW,
    );
    expect(r.reason).toBe("advertising");
  });

  it("surfaces the expiry of a timed restriction, and null when permanent", () => {
    expect(activeRestriction([act({ expiresAt: inHours(24) })], NOW).until).toEqual(inHours(24));
    expect(activeRestriction([act({ expiresAt: null })], NOW).until).toBeNull();
  });

  it("ignores expired history entirely", () => {
    const r = activeRestriction([act({ kind: "ban", expiresAt: agoHours(2) })], NOW);
    expect(r.banned).toBe(false);
    expect(r.muted).toBe(false);
  });
});

describe("summarizeHistory", () => {
  it("shows an em dash for a clean account", () => {
    expect(summarizeHistory([], NOW)).toBe("—");
  });

  it("leads with what is currently in force", () => {
    const s = summarizeHistory([act({ kind: "ban", expiresAt: null })], NOW);
    expect(s.startsWith("banned permanently")).toBe(true);
  });

  it("tallies lifetime actions so a repeat offender is obvious", () => {
    const s = summarizeHistory(
      [
        act({ kind: "mute", expiresAt: agoHours(50) }),
        act({ kind: "mute", expiresAt: agoHours(10) }),
        act({ kind: "delete" }),
        act({ kind: "delete" }),
        act({ kind: "delete" }),
      ],
      NOW,
    );
    expect(s).toContain("2x mute");
    expect(s).toContain("3x delete");
  });

  it("shows a timed mute with its end date", () => {
    const s = summarizeHistory([act({ kind: "mute", expiresAt: inHours(24) })], NOW);
    expect(s).toContain("muted until 2026-08-05");
  });
});

describe("expiryFromHours", () => {
  it("returns null for permanent and a concrete date otherwise", () => {
    expect(expiryFromHours(null, NOW)).toBeNull();
    expect(expiryFromHours(24, NOW)).toEqual(new Date(NOW + 86_400_000));
  });
});

describe("coerceKind", () => {
  it("accepts the four kinds and rejects anything else", () => {
    for (const k of ["mute", "ban", "delete", "note"]) expect(coerceKind(k)).toBe(k);
    expect(coerceKind("destroy")).toBeNull();
    expect(coerceKind(undefined)).toBeNull();
  });
});
