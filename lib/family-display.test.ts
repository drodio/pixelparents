import { describe, expect, it } from "vitest";
import {
  buildFamilyDisplay,
  isStudentAccount,
  type DisplayChild,
  type DisplayMember,
} from "@/lib/family-display";

const parent = (id: string, extra: Record<string, unknown> = {}): DisplayMember => ({
  id,
  extra,
});
const student = (
  id: string,
  verified: string[],
  extra: Record<string, unknown> = {},
): DisplayMember => ({
  id,
  extra: { accountType: "student", verifiedStudentEmails: verified, ...extra },
});
const kid = (
  id: string,
  studentEmail: string | null,
  grade: string | null = null,
  interests: string[] | null = null,
): DisplayChild => ({ id, studentEmail, grade, interests });

describe("isStudentAccount", () => {
  it("is true only when extra.accountType === 'student'", () => {
    expect(isStudentAccount(student("s", []))).toBe(true);
    expect(isStudentAccount(parent("p"))).toBe(false);
    expect(isStudentAccount(parent("p", { accountType: "parent" }))).toBe(false);
    expect(isStudentAccount({ id: "x", extra: null })).toBe(false);
  });
});

describe("buildFamilyDisplay — sectioning", () => {
  it("splits members into parents and students, caller first in each group", () => {
    const members = [parent("p1"), student("s1", []), parent("p2"), student("s2", [])];
    const r = buildFamilyDisplay(members, [], "p2");
    expect(r.parentMembers.map((m) => m.id)).toEqual(["p2", "p1"]);
    expect(r.studentMembers.map((m) => m.id)).toEqual(["s1", "s2"]);
  });

  it("orders a student caller first within the students group", () => {
    const members = [student("s1", []), student("s2", [])];
    const r = buildFamilyDisplay(members, [], "s2");
    expect(r.studentMembers.map((m) => m.id)).toEqual(["s2", "s1"]);
  });
});

describe("buildFamilyDisplay — dedup", () => {
  it("folds a child row into the student account whose verified email matches", () => {
    const members = [parent("p1"), student("s1", ["kid@example.test"])];
    const kids = [kid("k1", "kid@example.test", "10", ["chess"])];
    const r = buildFamilyDisplay(members, kids, "p1");

    // The matched child is folded (hidden from the kids list) and enriches the card.
    expect(r.foldedChildIds.has("k1")).toBe(true);
    expect(r.unmatchedKids).toHaveLength(0);
    expect(r.studentProfileByAccountId.get("s1")).toEqual({
      grade: "10",
      interests: ["chess"],
    });
  });

  it("matches case-insensitively and trims whitespace", () => {
    const members = [parent("p1"), student("s1", ["Kid@Example.Test"])];
    const kids = [kid("k1", "  kid@example.test  ", "9", null)];
    const r = buildFamilyDisplay(members, kids, "p1");
    expect(r.foldedChildIds.has("k1")).toBe(true);
    expect(r.studentProfileByAccountId.get("s1")).toEqual({ grade: "9", interests: [] });
  });

  it("keeps child rows with no matching student account as kids", () => {
    const members = [parent("p1"), student("s1", ["other@example.test"])];
    const kids = [
      kid("k1", "nomatch@example.test", "8", ["art"]),
      kid("k2", null, "5", []),
    ];
    const r = buildFamilyDisplay(members, kids, "p1");
    expect(r.foldedChildIds.size).toBe(0);
    expect(r.unmatchedKids.map((k) => k.id)).toEqual(["k1", "k2"]);
    expect(r.studentProfileByAccountId.size).toBe(0);
  });

  it("falls back to the legacy singular verifiedStudentEmail field", () => {
    const members = [
      parent("p1"),
      { id: "s1", extra: { accountType: "student", verifiedStudentEmail: "legacy@example.test" } },
    ];
    const kids = [kid("k1", "legacy@example.test", "11", ["robotics"])];
    const r = buildFamilyDisplay(members, kids, "p1");
    expect(r.foldedChildIds.has("k1")).toBe(true);
    expect(r.studentProfileByAccountId.get("s1")?.grade).toBe("11");
  });

  it("does not dedup against an UNVERIFIED student account (no verified emails)", () => {
    const members = [parent("p1"), student("s1", [])];
    const kids = [kid("k1", "kid@example.test", "10", ["chess"])];
    const r = buildFamilyDisplay(members, kids, "p1");
    expect(r.foldedChildIds.size).toBe(0);
    expect(r.unmatchedKids.map((k) => k.id)).toEqual(["k1"]);
  });

  it("first matching child wins when two kids share a verified email", () => {
    const members = [parent("p1"), student("s1", ["kid@example.test"])];
    const kids = [
      kid("k1", "kid@example.test", "10", ["chess"]),
      kid("k2", "kid@example.test", "12", ["math"]),
    ];
    const r = buildFamilyDisplay(members, kids, "p1");
    // Both fold (same person), but the profile reflects the first match.
    expect(r.foldedChildIds.has("k1")).toBe(true);
    expect(r.foldedChildIds.has("k2")).toBe(true);
    expect(r.studentProfileByAccountId.get("s1")).toEqual({ grade: "10", interests: ["chess"] });
  });

  it("accepts an injected verifiedEmailsOf reader", () => {
    const members = [parent("p1"), { id: "s1", extra: { accountType: "student", custom: "x@y.z" } }];
    const kids = [kid("k1", "x@y.z", "10", [])];
    const reader = (extra: Record<string, unknown>) =>
      typeof extra.custom === "string" ? [extra.custom] : [];
    const r = buildFamilyDisplay(members, kids, "p1", reader);
    expect(r.foldedChildIds.has("k1")).toBe(true);
  });
});
