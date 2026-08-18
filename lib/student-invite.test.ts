import { describe, expect, it } from "vitest";
import { decideStudentInvite, looksLikeOhsEmail } from "./student-invite";

describe("looksLikeOhsEmail", () => {
  it("accepts OHS and other stanford.edu subdomains", () => {
    expect(looksLikeOhsEmail("someone@ohs.stanford.edu")).toBe(true);
    expect(looksLikeOhsEmail("someone@stanford.edu")).toBe(true);
    expect(looksLikeOhsEmail("  SomeOne@OHS.Stanford.EDU  ")).toBe(true);
  });

  it("rejects non-stanford addresses and malformed input", () => {
    expect(looksLikeOhsEmail("someone@example.com")).toBe(false);
    // Must not be fooled by a lookalike domain that merely ENDS in the string.
    expect(looksLikeOhsEmail("someone@notstanford.edu")).toBe(false);
    expect(looksLikeOhsEmail("someone@stanford.edu.evil.com")).toBe(false);
    expect(looksLikeOhsEmail("not-an-email")).toBe(false);
    expect(looksLikeOhsEmail("")).toBe(false);
  });
});

describe("decideStudentInvite", () => {
  it("creates a row when nobody owns that email yet", () => {
    expect(decideStudentInvite({ parentFamilyId: "fam-1", existing: null })).toEqual({
      kind: "create",
    });
  });

  it("resends instead of duplicating when the student is already in this family", () => {
    expect(
      decideStudentInvite({
        parentFamilyId: "fam-1",
        existing: { id: "signup-1", familyId: "fam-1" },
      }),
    ).toEqual({ kind: "resend", signupId: "signup-1" });
  });

  it("BLOCKS when the email already has an account in another family", () => {
    // The regression this guards: signups.email has no unique index and
    // getSignupByEmail is most-recent-wins, so minting a second row here would
    // shadow the student's real account and silently move them families.
    const d = decideStudentInvite({
      parentFamilyId: "fam-1",
      existing: { id: "signup-2", familyId: "fam-2" },
    });
    expect(d.kind).toBe("blocked");
    if (d.kind === "blocked") {
      expect(d.reason).toMatch(/already has a GoPixel account/i);
      // Points at the consent-based path rather than doing it silently.
      expect(d.reason).toMatch(/link to your family/i);
    }
  });

  it("never returns create when an account exists, whichever family it is in", () => {
    for (const familyId of ["fam-1", "fam-2"]) {
      expect(
        decideStudentInvite({
          parentFamilyId: "fam-1",
          existing: { id: "s", familyId },
        }).kind,
      ).not.toBe("create");
    }
  });
});
