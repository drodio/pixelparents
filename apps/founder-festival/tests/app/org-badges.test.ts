import { describe, it, expect } from "vitest";
import { db } from "@/db";
import { evaluations, hosts, badgeOverrides } from "@/db/schema";
import { eq } from "drizzle-orm";
import { computeBadges, type BadgeOverride } from "@/lib/badges";
import { createHost } from "@/lib/hosts";
import {
  orgBadgeOverrideId,
  parseOrgBadgeOverrideId,
  createOrgBadge,
  listOrgBadges,
  deleteOrgBadge,
  applyOrgBadgeToProfiles,
  removeOrgBadgeFromProfiles,
  countAppliedOrgBadge,
  getAdminAssignments,
  setAdminAssignments,
} from "@/lib/org-badges";
import { IS_PROD_DB } from "../setup";

const rnd = () => Math.random().toString(36).slice(2, 8);

const EMPTY_INPUTS = {
  isClaimed: false,
  extractedMetrics: null,
  mmHits: null,
  primaryCompanyDomain: null,
} as const;

describe("org-badge id round-trip (pure)", () => {
  it("namespaces and parses an org badge id", () => {
    const id = "11111111-1111-1111-1111-111111111111";
    const overrideId = orgBadgeOverrideId(id);
    expect(overrideId).toBe(`org:${id}`);
    expect(parseOrgBadgeOverrideId(overrideId)).toBe(id);
  });

  it("returns null for non-org badge ids", () => {
    expect(parseOrgBadgeOverrideId("claimed")).toBeNull();
    expect(parseOrgBadgeOverrideId("yc")).toBeNull();
  });
});

describe("computeBadges surfaces org overrides (pure)", () => {
  it("renders a confirmed org: override as a gold identity pill using its label", () => {
    const overrides: BadgeOverride[] = [
      { badgeId: "org:abc", status: "confirmed", editedLabel: "District Member" },
    ];
    const badges = computeBadges(EMPTY_INPUTS, overrides);
    const org = badges.find((b) => b.id === "org:abc");
    expect(org).toBeDefined();
    expect(org!.label).toBe("District Member");
    expect(org!.category).toBe("identity");
    expect(org!.status).toBe("confirmed");
  });

  it("drops a rejected org: override", () => {
    const overrides: BadgeOverride[] = [
      { badgeId: "org:abc", status: "rejected", editedLabel: "District Member" },
    ];
    const badges = computeBadges(EMPTY_INPUTS, overrides);
    expect(badges.find((b) => b.id === "org:abc")).toBeUndefined();
  });
});

describe.skipIf(IS_PROD_DB)("org-badges lib (db)", () => {
  it("creates, lists, applies, counts, removes, and deletes an org badge", async () => {
    const host = await createHost({ name: "OrgBadgeHost-" + rnd(), blurb: "b" });
    const badge = await createOrgBadge("host", host.id, "District Member");
    expect(badge.label).toBe("District Member");
    expect(badge.ownerType).toBe("host");

    const listed = await listOrgBadges("host", host.id);
    expect(listed.map((b) => b.id)).toContain(badge.id);

    // Two scored evaluations to apply the badge to.
    const [evA] = await db
      .insert(evaluations)
      .values({ linkedinUrl: "https://linkedin.com/in/ob-" + rnd(), fullName: "A", score: 10, founderScore: 10, investorScore: 0, signalQuality: "high", source: "url" })
      .returning();
    const [evB] = await db
      .insert(evaluations)
      .values({ linkedinUrl: "https://linkedin.com/in/ob-" + rnd(), fullName: "B", score: 20, founderScore: 20, investorScore: 0, signalQuality: "high", source: "url" })
      .returning();

    await applyOrgBadgeToProfiles(badge.id, [evA.id, evB.id]);
    expect(await countAppliedOrgBadge(badge.id, [evA.id, evB.id])).toBe(2);

    // The applied override renders on the profile as the badge label.
    const [ov] = await db
      .select()
      .from(badgeOverrides)
      .where(eq(badgeOverrides.evaluationId, evA.id))
      .limit(1);
    expect(ov.badgeId).toBe(orgBadgeOverrideId(badge.id));
    expect(ov.editedLabel).toBe("District Member");

    // Idempotent re-apply doesn't duplicate.
    await applyOrgBadgeToProfiles(badge.id, [evA.id]);
    expect(await countAppliedOrgBadge(badge.id, [evA.id, evB.id])).toBe(2);

    await removeOrgBadgeFromProfiles(badge.id, [evA.id]);
    expect(await countAppliedOrgBadge(badge.id, [evA.id, evB.id])).toBe(1);

    // Deleting the badge clears any remaining applied overrides.
    await deleteOrgBadge(badge.id);
    expect(await countAppliedOrgBadge(badge.id, [evA.id, evB.id])).toBe(0);
    expect((await listOrgBadges("host", host.id)).map((b) => b.id)).not.toContain(badge.id);

    // cleanup
    await db.delete(evaluations).where(eq(evaluations.id, evA.id));
    await db.delete(evaluations).where(eq(evaluations.id, evB.id));
    await db.delete(hosts).where(eq(hosts.id, host.id));
  });

  it("replaces an admin's host/sponsor assignments", async () => {
    const clerkUserId = "user_orgtest_" + rnd();
    const host = await createHost({ name: "AssignHost-" + rnd(), blurb: "b" });

    await setAdminAssignments(clerkUserId, [{ ownerType: "host", ownerId: host.id }]);
    let assignments = await getAdminAssignments(clerkUserId);
    expect(assignments).toEqual([{ ownerType: "host", ownerId: host.id }]);

    // Replacing with an empty set clears them.
    await setAdminAssignments(clerkUserId, []);
    assignments = await getAdminAssignments(clerkUserId);
    expect(assignments).toHaveLength(0);

    await db.delete(hosts).where(eq(hosts.id, host.id));
  });
});
