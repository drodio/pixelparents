import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_TYPES,
  isNotificationType,
  formatUnreadBadge,
} from "@/lib/db/notifications";

// Pure-logic coverage for the notifications data layer. The DB-touching functions
// (createNotification/listNotifications/unreadCount/markRead/markAllRead) need a
// live Neon connection and are out of scope for the node-only unit suite. The two
// pure pieces the surfaces depend on are pinned here: isNotificationType (the
// guard that keeps a typo'd type from ever being persisted — emit callers pass a
// literal, but the guard is defense-in-depth in createNotification) and
// formatUnreadBadge (the single source of truth for the bell's unread badge).

describe("isNotificationType", () => {
  it("accepts every canonical type", () => {
    for (const t of NOTIFICATION_TYPES) {
      expect(isNotificationType(t)).toBe(true);
    }
  });

  it("pins the exact canonical set (so emit call-sites stay in lockstep)", () => {
    expect(NOTIFICATION_TYPES).toEqual([
      "community_response",
      "community_connected",
      "event_rsvp",
    ]);
  });

  it("rejects casing, junk, and non-strings", () => {
    expect(isNotificationType("Community_Response")).toBe(false);
    expect(isNotificationType("EVENT_RSVP")).toBe(false);
    expect(isNotificationType("dm")).toBe(false);
    expect(isNotificationType("")).toBe(false);
    expect(isNotificationType("'; drop table notifications;--")).toBe(false);
    expect(isNotificationType(null)).toBe(false);
    expect(isNotificationType(undefined)).toBe(false);
    expect(isNotificationType(3)).toBe(false);
    expect(isNotificationType({})).toBe(false);
  });
});

describe("formatUnreadBadge", () => {
  it("hides the badge when there's nothing unread", () => {
    expect(formatUnreadBadge(0)).toEqual({ show: false, label: "" });
  });

  it("shows the raw count up to the cap", () => {
    expect(formatUnreadBadge(1)).toEqual({ show: true, label: "1" });
    expect(formatUnreadBadge(9)).toEqual({ show: true, label: "9" });
  });

  it("caps at N+ above the threshold (default 9)", () => {
    expect(formatUnreadBadge(10)).toEqual({ show: true, label: "9+" });
    expect(formatUnreadBadge(250)).toEqual({ show: true, label: "9+" });
  });

  it("honors a custom cap", () => {
    expect(formatUnreadBadge(99, 99)).toEqual({ show: true, label: "99" });
    expect(formatUnreadBadge(100, 99)).toEqual({ show: true, label: "99+" });
  });

  it("floors fractional counts and treats negatives / NaN as no badge", () => {
    expect(formatUnreadBadge(3.9)).toEqual({ show: true, label: "3" });
    expect(formatUnreadBadge(-5)).toEqual({ show: false, label: "" });
    expect(formatUnreadBadge(Number.NaN)).toEqual({ show: false, label: "" });
    expect(formatUnreadBadge(Number.POSITIVE_INFINITY)).toEqual({ show: false, label: "" });
  });
});
