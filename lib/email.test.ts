import { describe, expect, it } from "vitest";
import { hasRecipient, appendSignature } from "@/lib/email";

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
