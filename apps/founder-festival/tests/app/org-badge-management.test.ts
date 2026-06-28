import { describe, it, expect } from "vitest";
import { db } from "@/db";
import { evaluations, hosts, badgeOverrides } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createHost } from "@/lib/hosts";
import {
  createOrgBadge,
  applyOrgBadgeToProfiles,
  renameOrgBadge,
  listOrgBadgeHolders,
  orgBadgeOverrideId,
} from "@/lib/org-badges";
import { IS_PROD_DB } from "../setup";

const rnd = () => Math.random().toString(36).slice(2, 8);

describe.skipIf(IS_PROD_DB)("org-badge-management (db)", () => {
  it("listOrgBadgeHolders returns badge holders and renameOrgBadge propagates to overrides", async () => {
    const host = await createHost({ name: "BadgeMgmtHost-" + rnd(), blurb: "b" });
    const badge = await createOrgBadge("host", host.id, "Old Label");

    // Seed one evaluation.
    const [ev] = await db
      .insert(evaluations)
      .values({
        linkedinUrl: "https://linkedin.com/in/bm-" + rnd(),
        fullName: "Badge Holder",
        score: 42,
        founderScore: 30,
        investorScore: 12,
        signalQuality: "high",
        source: "url",
      })
      .returning();

    // Apply the badge.
    await applyOrgBadgeToProfiles(badge.id, [ev!.id]);

    // listOrgBadgeHolders should return 1 row with the eval's id.
    const before = await listOrgBadgeHolders(badge.id);
    expect(before).toHaveLength(1);
    expect(before[0]!.id).toBe(ev!.id);

    // Rename the badge.
    const renamed = await renameOrgBadge(badge.id, "New Label");
    expect(renamed).not.toBeNull();
    expect(renamed!.label).toBe("New Label");

    // The badge_overrides row's editedLabel must be updated too.
    const [ov] = await db
      .select()
      .from(badgeOverrides)
      .where(eq(badgeOverrides.badgeId, orgBadgeOverrideId(badge.id)))
      .limit(1);
    expect(ov).toBeDefined();
    expect(ov!.editedLabel).toBe("New Label");

    // Cleanup.
    await db.delete(badgeOverrides).where(eq(badgeOverrides.badgeId, orgBadgeOverrideId(badge.id)));
    await db.delete(evaluations).where(eq(evaluations.id, ev!.id));
    await db.delete(hosts).where(eq(hosts.id, host.id));
  });

  it("renameOrgBadge returns null for empty label", async () => {
    const host = await createHost({ name: "BadgeMgmtHost2-" + rnd(), blurb: "b" });
    const badge = await createOrgBadge("host", host.id, "Original");
    const result = await renameOrgBadge(badge.id, "   ");
    expect(result).toBeNull();

    // Cleanup.
    await db.delete(hosts).where(eq(hosts.id, host.id));
  });
});
