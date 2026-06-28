import { describe, it, expect } from "vitest";
import { db } from "@/db";
import { events, evaluations, eventAttendees } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  createConnectionRequest,
  decideConnectionRequest,
  decideConnectionRequestByToken,
  setConnectionPreference,
  setContactSharingMode,
  getEventDirectory,
} from "@/lib/attendee-connections";
import { IS_PROD_DB } from "../setup";

const rnd = () => Math.random().toString(36).slice(2, 8);

async function attendee(eventId: string, founderScore: number, investorScore: number, email: string) {
  const [ev] = await db
    .insert(evaluations)
    .values({ linkedinUrl: "https://linkedin.com/in/conn-" + rnd(), fullName: "Conn " + rnd(), score: founderScore + investorScore, founderScore, investorScore, signalQuality: "high", source: "url", slug: "c-" + rnd(), slugKind: founderScore >= investorScore ? "founder" : "investor" })
    .returning();
  await db.insert(eventAttendees).values({ eventId, evaluationId: ev.id, lumaGuestApiId: "gst-" + rnd(), email, approvalStatus: "approved" });
  return ev;
}

describe.skipIf(IS_PROD_DB)("attendee connections", () => {
  it("respects auto-approve prefs, hides contact on approval (intro email instead), and powers the directory", async () => {
    const [event] = await db
      .insert(events)
      .values({ slug: "conn-" + rnd(), title: "Conn", startsAt: new Date("2026-06-01"), status: "open", criteria: {}, source: "luma", lumaEventId: "evt-c-" + rnd() })
      .returning();
    const a = await attendee(event.id, 90, 0, "a@example.com"); // founder
    const b = await attendee(event.id, 0, 80, "b@example.com"); // investor

    // a's directory: b appears, no contact (b is by_request, no connection)
    let dir = await getEventDirectory(event.id, a.id);
    expect(dir).toHaveLength(1);
    expect(dir[0].evaluationId).toBe(b.id);
    expect(dir[0].role).toBe("investor");
    expect(dir[0].contact).toBeNull();
    expect(dir[0].connectionStatus).toBe("none");

    // b auto-approves founders globally → a's request to b is instantly approved
    await setConnectionPreference(b.id, "global", "founder", "auto_approve");
    const { request, autoResolved } = await createConnectionRequest(event.id, a.id, b.id);
    expect(autoResolved).toBe("auto_approve");
    expect(request.status).toBe("approved");

    // a no longer sees b's contact — approved connections are introduced over email instead
    dir = await getEventDirectory(event.id, a.id);
    expect(dir[0].connectionStatus).toBe("approved");
    expect(dir[0].contact).toBeNull();

    // open_to_all reveals contact without a connection: b's view of a
    await setContactSharingMode(event.id, a.id, "open_to_all");
    const dirB = await getEventDirectory(event.id, b.id);
    expect(dirB.find((d) => d.evaluationId === a.id)?.contact?.email).toBe("a@example.com");

    // manual decide path: c is an investor; b has no investor pref → ask → pending
    const c = await attendee(event.id, 0, 70, "c@example.com");
    const { request: r2 } = await createConnectionRequest(event.id, c.id, b.id);
    expect(r2.status).toBe("pending");
    const decided = await decideConnectionRequest(r2.id, b.id, "denied");
    expect(decided?.status).toBe("denied");
    // a non-target cannot decide
    expect(await decideConnectionRequest(r2.id, a.id, "approved")).toBeNull();

    // token decide path (email links): d → b, decided by token
    const d = await attendee(event.id, 60, 0, "d@example.com");
    const { request: r3 } = await createConnectionRequest(event.id, d.id, c.id); // c has no founder pref → pending
    expect(r3.status).toBe("pending");
    const byToken = await decideConnectionRequestByToken(r3.token, "approved");
    expect(byToken?.status).toBe("approved");
    // token is single-use (already non-pending) → null on retry
    expect(await decideConnectionRequestByToken(r3.token, "denied")).toBeNull();

    await db.delete(events).where(eq(events.id, event.id));
    for (const id of [a.id, b.id, c.id, d.id]) await db.delete(evaluations).where(eq(evaluations.id, id));
  }, 30000);
});
