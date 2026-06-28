// Idempotent seed for the June 2026 event hosts: District (Jun 1 & 3 DECODE
// dinners) and Agate Hound (Jun 2 Summer Solstice). Matches events by their
// stable Luma api_id so it works on both dev and prod.
//
//   pnpm tsx --require dotenv/config scripts/seed-event-hosts.ts
//
// (Run after events have been synced from Luma.)

import { db } from "@/db";
import { events, hosts, eventHosts } from "@/db/schema";
import { eq, and } from "drizzle-orm";

const HOSTS: Record<string, { lumaEventIds: string[]; blurb: string }> = {
  District: {
    lumaEventIds: ["evt-6jPdDVqdWGqPjaf", "evt-TeYXZeBsRp6cfjz"],
    blurb: "Host of the DECODE founder dinners.",
  },
  "Agate Hound": {
    lumaEventIds: ["evt-QD6R9g8xiH5PFDx"],
    blurb: "Host of the Summer Solstice Founder + Investor Day.",
  },
};

async function findOrCreateHost(name: string, blurb: string): Promise<string> {
  const [existing] = await db.select({ id: hosts.id }).from(hosts).where(eq(hosts.name, name)).limit(1);
  if (existing) return existing.id;
  const [row] = await db.insert(hosts).values({ name, blurb }).returning({ id: hosts.id });
  return row.id;
}

async function main() {
  for (const [name, cfg] of Object.entries(HOSTS)) {
    const hostId = await findOrCreateHost(name, cfg.blurb);
    for (const lumaId of cfg.lumaEventIds) {
      const [ev] = await db.select({ id: events.id }).from(events).where(eq(events.lumaEventId, lumaId)).limit(1);
      if (!ev) {
        console.log(`  skip: no event for ${lumaId} (sync from Luma first)`);
        continue;
      }
      const [link] = await db
        .select({ id: eventHosts.id })
        .from(eventHosts)
        .where(and(eq(eventHosts.eventId, ev.id), eq(eventHosts.hostId, hostId)))
        .limit(1);
      if (!link) {
        await db.insert(eventHosts).values({ eventId: ev.id, hostId });
        console.log(`  linked ${name} → ${lumaId}`);
      } else {
        console.log(`  already linked ${name} → ${lumaId}`);
      }
    }
  }
  console.log("done.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
