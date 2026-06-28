import { describe, it, expect } from "vitest";
import { db } from "@/db";
import { evaluations, hosts, sponsors } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createHost, attachHostProfileById, getHostProfiles, detachHostProfile } from "@/lib/hosts";
import { createSponsor, attachSponsorProfileById, getSponsorProfiles, detachSponsorProfile } from "@/lib/sponsors";
import { IS_PROD_DB } from "../setup";

const rnd = () => Math.random().toString(36).slice(2, 8);

async function seedProfile() {
  const [ev] = await db
    .insert(evaluations)
    .values({
      linkedinUrl: "https://linkedin.com/in/attach-" + rnd(),
      fullName: "Attach Person",
      score: 60,
      founderScore: 60,
      investorScore: 0,
      signalQuality: "high",
      source: "url",
      slug: "ap-" + rnd(),
      slugKind: "founder",
    })
    .returning();
  return ev;
}

describe.skipIf(IS_PROD_DB)("attach profiles by evaluation id", () => {
  it("attaches/detaches a profile to a host", async () => {
    const host = await createHost({ name: "AttachHost-" + rnd() });
    const ev = await seedProfile();

    const attached = await attachHostProfileById(host.id, ev.id);
    expect(attached?.evaluationId).toBe(ev.id);
    expect(attached?.fullName).toBe("Attach Person");

    // idempotent
    await attachHostProfileById(host.id, ev.id);
    let people = await getHostProfiles(host.id);
    expect(people.filter((p) => p.evaluationId === ev.id)).toHaveLength(1);
    expect(people[0].slugKind).toBe("founder");

    // unknown id → null
    expect(await attachHostProfileById(host.id, "00000000-0000-0000-0000-000000000000")).toBeNull();

    await detachHostProfile(host.id, ev.id);
    people = await getHostProfiles(host.id);
    expect(people).toHaveLength(0);

    await db.delete(hosts).where(eq(hosts.id, host.id));
    await db.delete(evaluations).where(eq(evaluations.id, ev.id));
  }, 20000);

  it("attaches/detaches a profile to a sponsor", async () => {
    const sponsor = await createSponsor({ name: "AttachSponsor-" + rnd() });
    const ev = await seedProfile();

    const attached = await attachSponsorProfileById(sponsor.id, ev.id);
    expect(attached?.evaluationId).toBe(ev.id);

    const people = await getSponsorProfiles(sponsor.id);
    expect(people.map((p) => p.evaluationId)).toContain(ev.id);

    await detachSponsorProfile(sponsor.id, ev.id);
    expect(await getSponsorProfiles(sponsor.id)).toHaveLength(0);

    await db.delete(sponsors).where(eq(sponsors.id, sponsor.id));
    await db.delete(evaluations).where(eq(evaluations.id, ev.id));
  }, 20000);
});
