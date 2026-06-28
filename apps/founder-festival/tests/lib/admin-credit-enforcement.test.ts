import { describe, it, expect, beforeEach } from "vitest";
import {
  adminCreditEnforcementEnabled,
  reconcileHold,
} from "@/lib/admin-credit-enforcement";

describe("adminCreditEnforcementEnabled", () => {
  beforeEach(() => {
    delete process.env.ADMIN_CREDIT_ENFORCEMENT;
  });

  it("is OFF by default (unset)", () => {
    expect(adminCreditEnforcementEnabled()).toBe(false);
  });

  it("is OFF for anything other than an explicit on value", () => {
    for (const v of ["off", "false", "0", "no", ""]) {
      process.env.ADMIN_CREDIT_ENFORCEMENT = v;
      expect(adminCreditEnforcementEnabled()).toBe(false);
    }
  });

  it("is ON for on/1/true (case-insensitive)", () => {
    for (const v of ["on", "ON", "1", "true", "TRUE"]) {
      process.env.ADMIN_CREDIT_ENFORCEMENT = v;
      expect(adminCreditEnforcementEnabled()).toBe(true);
    }
  });
});

describe("reconcileHold", () => {
  it("refunds nothing when there was no hold", () => {
    expect(reconcileHold({ holdCents: 0, estimatedCents: 100, actualCents: 50 })).toEqual({
      refundCents: 0,
    });
  });

  it("prorates the hold by actual/estimate (hold = mult × estimate ⇒ fair = mult × actual)", () => {
    // Held $10 against a $1 estimate (×10). Actual cost 60¢ ⇒ fair charge $6 ⇒ refund $4.
    expect(reconcileHold({ holdCents: 1000, estimatedCents: 100, actualCents: 60 })).toEqual({
      refundCents: 400,
    });
  });

  it("refunds the full hold when actual cost is zero", () => {
    expect(reconcileHold({ holdCents: 1000, estimatedCents: 100, actualCents: 0 })).toEqual({
      refundCents: 1000,
    });
  });

  it("never charges more than the hold — caps at the reserved amount (no surprise overage)", () => {
    // Actual blew past the estimate; we only ever charge what was reserved.
    expect(reconcileHold({ holdCents: 1000, estimatedCents: 100, actualCents: 250 })).toEqual({
      refundCents: 0,
    });
  });

  it("refunds the whole hold if the estimate was zero (can't prorate)", () => {
    expect(reconcileHold({ holdCents: 1000, estimatedCents: 0, actualCents: 50 })).toEqual({
      refundCents: 1000,
    });
  });
});
