import { describe, it, expect } from "vitest";
import { clientLiveness, isClientLive, developerFacingStatus } from "./gating";

// The approval gate is the top V1 ask: a Sign-in app is live only once approved.
describe("clientLiveness — the approval gate", () => {
  it("a pending app is NOT live until the owner's API access is approved", () => {
    expect(clientLiveness({ status: "pending" }, false)).toEqual({ live: false, reason: "pending" });
    expect(clientLiveness({ status: "pending" }, true)).toEqual({ live: true, via: "owner_api_approved" });
  });

  it("an admin-approved client is live regardless of the owner's API access", () => {
    expect(clientLiveness({ status: "approved" }, false)).toEqual({ live: true, via: "client_approved" });
    expect(clientLiveness({ status: "approved" }, true)).toEqual({ live: true, via: "client_approved" });
  });

  it("a rejected app is never live, even if the owner's API access is approved", () => {
    expect(clientLiveness({ status: "rejected" }, true)).toEqual({ live: false, reason: "rejected" });
    expect(isClientLive({ status: "rejected" }, true)).toBe(false);
  });

  it("legacy MVP 'active' rows are grandfathered as live (back-compat)", () => {
    expect(clientLiveness({ status: "active" }, false)).toEqual({ live: true, via: "legacy_active" });
  });

  it("developerFacingStatus collapses both approval paths into 'live'", () => {
    expect(developerFacingStatus({ status: "pending" }, true)).toBe("live");
    expect(developerFacingStatus({ status: "approved" }, false)).toBe("live");
    expect(developerFacingStatus({ status: "active" }, false)).toBe("live");
    expect(developerFacingStatus({ status: "pending" }, false)).toBe("pending");
    expect(developerFacingStatus({ status: "rejected" }, false)).toBe("rejected");
  });
});
