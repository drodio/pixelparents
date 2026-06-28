import { describe, it, expect } from "vitest";
import { db } from "@/db";
import { events, evaluations, sponsors } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  createSponsor,
  setEventSponsors,
  getSponsorsForEvent,
  attachSponsorProfileByLinkedin,
  getSponsorProfiles,
  detachSponsorProfile,
  profileHref,
} from "@/lib/sponsors";
import { IS_PROD_DB } from "../setup";

const rnd = () => Math.random().toString(36).slice(2, 8);

describe.skipIf(IS_PROD_DB)("sponsors lib", () => {
  it("assigns sponsors to events and attaches/detaches profiles by linkedin", async () => {
    const sponsor = await createSponsor({ name: "TestSponsor-" + rnd(), websiteUrl: "https://x.com" });
    const [event] = await db
      .insert(events)
      .values({ slug: "spon-" + rnd(), title: "Sponsor Test", startsAt: new Date("2026-06-01"), status: "open", criteria: {}, source: "luma", lumaEventId: "evt-s-" + rnd() })
      .returning();

    await setEventSponsors(event.id, [sponsor.id]);
    expect((await getSponsorsForEvent(event.id)).map((s) => s.id)).toContain(sponsor.id);

    // matchable by case/trailing-slash-insensitive linkedin
    const lk = "https://linkedin.com/in/sponsor-person-" + rnd();
    const [ev] = await db
      .insert(evaluations)
      .values({ linkedinUrl: lk, fullName: "Sponsor Person", score: 50, founderScore: 50, investorScore: 0, signalQuality: "high", source: "url", slug: "sp-" + rnd(), slugKind: "founder" })
      .returning();

    const attached = await attachSponsorProfileByLinkedin(sponsor.id, lk.toUpperCase() + "/");
    expect(attached).not.toBeNull();
    expect(attached!.evaluationId).toBe(ev.id);
    expect(profileHref(attached!)).toMatch(/^\/profile\/founder\//);

    const people = await getSponsorProfiles(sponsor.id);
    expect(people.map((p) => p.evaluationId)).toContain(ev.id);

    // unknown linkedin → null
    expect(await attachSponsorProfileByLinkedin(sponsor.id, "https://linkedin.com/in/nobody-" + rnd())).toBeNull();

    await detachSponsorProfile(sponsor.id, ev.id);
    expect(await getSponsorProfiles(sponsor.id)).toHaveLength(0);

    // cleanup
    await db.delete(events).where(eq(events.id, event.id));
    await db.delete(evaluations).where(eq(evaluations.id, ev.id));
    await db.delete(sponsors).where(eq(sponsors.id, sponsor.id));
  });
});
