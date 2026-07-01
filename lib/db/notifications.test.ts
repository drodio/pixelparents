import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_TYPES,
  isNotificationType,
  formatUnreadBadge,
  notificationsSubtitle,
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
      "community_mention",
      "community_reply",
      "community_event",
      "event_rsvp",
      "board_contribution",
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

  it("keeps the bell's corner badge (cap 9) and label pill (cap 99) consistent for the same value", () => {
    // Regression for the two-count bug: for a count between 10 and 99 the corner
    // badge showed "9+" while the pill showed the raw number. Both now flow
    // through formatUnreadBadge, differing only by an intentional cap.
    const count = 15;
    expect(formatUnreadBadge(count).label).toBe("9+");
    expect(formatUnreadBadge(count, 99).label).toBe("15");
    // At/under the tight cap they agree exactly.
    expect(formatUnreadBadge(7).label).toBe(formatUnreadBadge(7, 99).label);
  });
});

describe("notificationsSubtitle", () => {
  it("shows the unread count when there are unread notifications", () => {
    expect(notificationsSubtitle(1, 5)).toBe("1 unread");
    expect(notificationsSubtitle(3, 3)).toBe("3 unread");
  });

  it("never says 'all caught up' while unread notifications exist (live-test regression)", () => {
    // The reported bug: "You're all caught up." showed while an unread item was
    // displayed. The unread branch must win over the caught-up branch.
    expect(notificationsSubtitle(1, 1)).not.toMatch(/caught up/i);
    expect(notificationsSubtitle(2, 4)).toBe("2 unread");
  });

  it("says 'all caught up' only when there are notifications but none unread", () => {
    expect(notificationsSubtitle(0, 5)).toBe("You're all caught up.");
  });

  it("describes every notification source when the list is empty (finding 6)", () => {
    const copy = notificationsSubtitle(0, 0);
    expect(copy).toMatch(/posts/i);
    expect(copy).toMatch(/replies/i);
    expect(copy).toMatch(/connections/i);
    expect(copy).toMatch(/events/i);
    expect(copy).toMatch(/boards/i);
    // The stale copy that omitted connections and boards must be gone.
    expect(copy).not.toBe("Updates about your community posts and events show up here.");
  });

  it("coerces negative / NaN counts defensively", () => {
    expect(notificationsSubtitle(-1, -1)).toMatch(/show up here/i);
    expect(notificationsSubtitle(Number.NaN, 5)).toBe("You're all caught up.");
  });
});
