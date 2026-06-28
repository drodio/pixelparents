import { describe, it, expect } from "vitest";
import {
  mapApprovalStatus,
  lumaGuestToAttendeeValues,
} from "@/lib/event-attendees";
import type { LumaGuest } from "@/lib/luma";

describe("mapApprovalStatus", () => {
  it("passes through known statuses", () => {
    expect(mapApprovalStatus("approved")).toBe("approved");
    expect(mapApprovalStatus("pending")).toBe("pending");
    expect(mapApprovalStatus("declined")).toBe("declined");
  });
  it("normalizes case/whitespace", () => {
    expect(mapApprovalStatus("  Approved ")).toBe("approved");
  });
  it("defaults unknown/empty to pending", () => {
    expect(mapApprovalStatus(null)).toBe("pending");
    expect(mapApprovalStatus(undefined)).toBe("pending");
    expect(mapApprovalStatus("waitlist")).toBe("pending");
  });
});

describe("lumaGuestToAttendeeValues", () => {
  const guest: LumaGuest = {
    api_id: "gst-abc",
    approval_status: "approved",
    email: "  Jane@Acme.COM ",
    name: "Jane Doe",
    user_first_name: "Jane",
    user_last_name: "Doe",
    user_api_id: "usr-xyz",
    registered_at: "2026-05-13T20:24:39.303Z",
    checked_in_at: null,
  };

  it("maps a guest into event_attendees insert values", () => {
    const v = lumaGuestToAttendeeValues(guest, {
      eventId: "evt-row-1",
      lumaUrl: "https://luma.com/foo",
    });
    expect(v.eventId).toBe("evt-row-1");
    expect(v.lumaUrl).toBe("https://luma.com/foo");
    expect(v.lumaGuestApiId).toBe("gst-abc");
    expect(v.lumaUserApiId).toBe("usr-xyz");
    expect(v.email).toBe("jane@acme.com"); // lowercased + trimmed
    expect(v.name).toBe("Jane Doe");
    expect(v.approvalStatus).toBe("approved");
    expect(v.registeredAt).toEqual(new Date("2026-05-13T20:24:39.303Z"));
    expect(v.checkedInAt).toBeNull();
    // Email→profile matching is a later DB step; mapper leaves it unset.
    expect(v.evaluationId).toBeNull();
  });

  it("is null-safe on missing dates and name", () => {
    const v = lumaGuestToAttendeeValues(
      { api_id: "gst-2", email: "x@y.com" },
      { eventId: "e", lumaUrl: null },
    );
    expect(v.registeredAt).toBeNull();
    expect(v.checkedInAt).toBeNull();
    expect(v.name).toBeNull();
    expect(v.lumaUserApiId).toBeNull();
    expect(v.approvalStatus).toBe("pending");
    expect(v.email).toBe("x@y.com");
  });

  it("falls back to first+last name when name is absent", () => {
    const v = lumaGuestToAttendeeValues(
      { api_id: "g", user_first_name: "Sam", user_last_name: "Lee" },
      { eventId: "e", lumaUrl: null },
    );
    expect(v.name).toBe("Sam Lee");
  });

  it("leaves email null when guest has none", () => {
    const v = lumaGuestToAttendeeValues({ api_id: "g" }, { eventId: "e", lumaUrl: null });
    expect(v.email).toBeNull();
  });
});
