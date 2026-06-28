import { describe, it, expect } from "vitest";
import { findEmailOutcome, FIND_EMAIL_CHARGE_CENTS } from "@/lib/find-email-logic";

describe("findEmailOutcome", () => {
  it("stores + charges a regular admin on a valid hit", () => {
    const o = findEmailOutcome({ email: "a@b.com", status: "valid" }, { superAdmin: false });
    expect(o).toEqual({ store: true, email: "a@b.com", chargeCents: FIND_EMAIL_CHARGE_CENTS });
  });

  it("stores but does NOT charge a super-admin on a valid hit", () => {
    const o = findEmailOutcome({ email: "a@b.com", status: "valid" }, { superAdmin: true });
    expect(o).toEqual({ store: true, email: "a@b.com", chargeCents: 0 });
  });

  it("does nothing on not_found (no store, no charge)", () => {
    const o = findEmailOutcome({ email: null, status: "not_found" }, { superAdmin: false });
    expect(o).toEqual({ store: false, email: null, chargeCents: 0 });
  });

  it("does not store a risky result even if an email is present", () => {
    const o = findEmailOutcome({ email: "maybe@b.com", status: "risky" }, { superAdmin: false });
    expect(o).toEqual({ store: false, email: null, chargeCents: 0 });
  });
});
