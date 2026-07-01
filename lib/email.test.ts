import { describe, expect, it } from "vitest";
import { hasRecipient, appendSignature, buildApiDecisionEmail } from "@/lib/email";

describe("hasRecipient", () => {
  it("is false for missing/blank to (cc alone never sends)", () => {
    expect(hasRecipient(undefined)).toBe(false);
    expect(hasRecipient("")).toBe(false);
    expect(hasRecipient("   ")).toBe(false);
    expect(hasRecipient([])).toBe(false);
    expect(hasRecipient(["", "  "])).toBe(false);
  });

  it("is true when a real to is present", () => {
    expect(hasRecipient("a@example.com")).toBe(true);
    expect(hasRecipient(["", "a@example.com"])).toBe(true);
  });
});

describe("appendSignature", () => {
  it("appends only when a signature is configured", () => {
    expect(appendSignature("body", "")).toBe("body");
    expect(appendSignature("body", "— sig")).toBe("body\n\n— sig");
  });
});

describe("buildApiDecisionEmail (rejection)", () => {
  it("omits the Note line and any stray blank line when no reason is given", () => {
    const body = buildApiDecisionEmail({ name: "Sam", approved: false });
    expect(body).not.toContain("Note:");
    // No double blank line anywhere in the body.
    expect(body).not.toMatch(/\n\n\n/);
    // The reason slot collapses cleanly to a single blank line.
    expect(body).toContain(
      "Unfortunately we can't approve this request right now.\n\nIf you think this was a mistake",
    );
  });

  it("treats a blank/whitespace reason as no reason", () => {
    const body = buildApiDecisionEmail({ name: "Sam", approved: false, reason: "   " });
    expect(body).not.toContain("Note:");
    expect(body).not.toMatch(/\n\n\n/);
  });

  it("includes a single Note line (no double blank line) when a reason is given", () => {
    const body = buildApiDecisionEmail({
      name: "Sam",
      approved: false,
      reason: "Incomplete use case.",
    });
    expect(body).toContain("\nNote: Incomplete use case.");
    expect(body).not.toMatch(/\n\n\n/);
    expect(body).toContain(
      "right now.\n\nNote: Incomplete use case.\n\nIf you think this was a mistake",
    );
  });
});

describe("buildApiDecisionEmail (approval)", () => {
  it("ignores any reason and renders the approval copy", () => {
    const body = buildApiDecisionEmail({ name: "Sam", approved: true, reason: "n/a" });
    expect(body).toContain("has been approved");
    expect(body).not.toContain("Note:");
    expect(body).not.toMatch(/\n\n\n/);
  });
});
