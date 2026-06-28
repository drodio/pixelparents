import { describe, it, expect } from "vitest";
import { db } from "@/db";
import { events } from "@/db/schema";
import { eq } from "drizzle-orm";
import { setEventPriorities, getEventPriorities } from "@/lib/event-priorities";
import { IS_PROD_DB } from "../setup";

const rnd = () => Math.random().toString(36).slice(2, 8);

describe.skipIf(IS_PROD_DB)("event priorities", () => {
  it("replaces priorities, preserves order, coerces unknown categories, drops blanks", async () => {
    const [event] = await db
      .insert(events)
      .values({ slug: "pri-" + rnd(), title: "Priorities Test", startsAt: new Date("2026-06-01"), status: "open", criteria: {}, source: "manual" })
      .returning();

    await setEventPriorities(event.id, [
      { text: "Meet seed AI founders", category: "intros" },
      { text: "  ", category: "hiring" }, // blank → dropped
      { text: "Close the round", category: "bogus" }, // unknown → tactical
    ]);

    let rows = await getEventPriorities(event.id);
    expect(rows).toHaveLength(2);
    expect(rows[0].text).toBe("Meet seed AI founders");
    expect(rows[0].category).toBe("intros");
    expect(rows[0].sortOrder).toBe(0);
    expect(rows[1].category).toBe("tactical");
    expect(rows[1].sortOrder).toBe(1);

    // replace wholesale
    await setEventPriorities(event.id, [{ text: "Only one now", category: "fundraising" }]);
    rows = await getEventPriorities(event.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toBe("Only one now");

    await db.delete(events).where(eq(events.id, event.id));
  });
});
