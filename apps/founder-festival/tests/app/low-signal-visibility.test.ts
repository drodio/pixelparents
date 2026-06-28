// Regression test: low-signal profiles must appear in all profile LISTS.
// See PR: remove-low-signal-gate
//
// Before the change:
//   - getLeaderboardRowsForEvalIds excluded signalQuality === "low" rows by default
//   - resolveEventAttendeeEvalIds name-fallback skipped low-signal rows
//
// After the change (this test pins the NEW behaviour):
//   - Both return low-signal rows like any other scored profile.

import { describe, it, expect } from "vitest";
import { db } from "@/db";
import { events, eventAttendees, evaluations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { IS_PROD_DB } from "../setup";
import { getLeaderboardRowsForEvalIds } from "@/lib/leaderboard";
import { resolveEventAttendeeEvalIds } from "@/lib/events";

const rnd = () => Math.random().toString(36).slice(2, 10);

async function seedLowSignalEval(name: string) {
  const [ev] = await db
    .insert(evaluations)
    .values({
      linkedinUrl: "https://linkedin.com/in/low-sig-vis-" + rnd(),
      fullName: name,
      score: 0,
      founderScore: 0,
      investorScore: 0,
      signalQuality: "low",
      source: "url",
    })
    .returning();
  return ev!;
}

async function seedEvent() {
  const [e] = await db
    .insert(events)
    .values({
      slug: "low-sig-vis-" + rnd(),
      title: "Low Signal Visibility Test",
      startsAt: new Date("2026-07-01"),
      status: "open",
      criteria: {},
      source: "luma",
    })
    .returning();
  return e!;
}

describe.skipIf(IS_PROD_DB)("low-signal visibility", () => {
  it("getLeaderboardRowsForEvalIds returns a low-signal profile", async () => {
    const ev = await seedLowSignalEval("Low Signal Person " + rnd());
    try {
      const rows = await getLeaderboardRowsForEvalIds([ev.id]);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.id).toBe(ev.id);
    } finally {
      await db.delete(evaluations).where(eq(evaluations.id, ev.id));
    }
  });

  it("resolveEventAttendeeEvalIds name-fallback resolves a low-signal profile", async () => {
    // Unique name so the name-fallback .limit(2) only finds exactly ONE match.
    const uniqueName = "Low Signal Fallback " + rnd();
    const ev = await seedLowSignalEval(uniqueName);
    const event = await seedEvent();
    try {
      // Attendee row with no evaluationId but a name that matches the low-signal eval.
      await db.insert(eventAttendees).values({
        eventId: event.id,
        name: uniqueName,
        approvalStatus: "approved",
        source: "luma",
        lumaGuestApiId: "gst-low-sig-" + rnd(),
      });

      const { evalIds, unmatchedNames } = await resolveEventAttendeeEvalIds(event.id);

      expect(evalIds).toContain(ev.id);
      expect(unmatchedNames).not.toContain(uniqueName);
    } finally {
      await db.delete(eventAttendees).where(eq(eventAttendees.eventId, event.id));
      await db.delete(events).where(eq(events.id, event.id));
      await db.delete(evaluations).where(eq(evaluations.id, ev.id));
    }
  });
});
