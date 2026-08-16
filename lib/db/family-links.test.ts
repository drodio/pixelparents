import { describe, it, expect, beforeEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// Decide-guard + live-state coverage for family link approval/decline.
//
// Two bugs pinned here (both reachable from approveFamilyLinkAction, whose only
// input is the request id — the decider comes from the session):
//
// 1. canDecideLink's third argument is the ADDRESSEE's family. The db layer
//    passed the DECIDER's own familyId, which made the "member of the target's
//    family" clause compare the decider to themselves — always true — so the
//    "This request wasn't sent to you" refusal could never fire, and approval
//    merged the requester's family into whoever called it.
// 2. Approval repointed the family snapshotted at request time
//    (req.fromFamilyId). If the requester had since moved families (a duplicate
//    request approved first, a re-signup), the merge moved the wrong rows — or
//    none — while still reporting "Linked", leaving one side reading "pending"
//    forever while the other read "linked" (the Aug 2026 walkthrough symptom).
//
// Same approach as signups.test.ts: no live DB, so getDb()/getSql() are mocked
// with recorders. Selects resolve from a FIFO in call order; updates and
// transaction statements are captured for assertion. All emails/ids below are
// fixtures, not real people.
// ---------------------------------------------------------------------------

const selectResults: unknown[][] = [];
const updates: Record<string, unknown>[] = [];
const transactions: { text: string; values: unknown[] }[][] = [];

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => {
      const c: Record<string, unknown> = {};
      const chain = () => c;
      c.from = chain;
      c.where = chain;
      c.limit = chain;
      (c as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
        resolve(selectResults.shift() ?? []);
      return c;
    },
    insert: () => ({ values: () => Promise.resolve() }),
    update: () => {
      const c: Record<string, unknown> = {};
      c.set = (vals: Record<string, unknown>) => {
        updates.push(vals);
        return c;
      };
      c.where = () => c;
      c.returning = () => Promise.resolve([{ id: "row" }]);
      (c as { then: unknown }).then = (resolve: (v: unknown) => unknown) => resolve([]);
      return c;
    },
  }),
  getSql: () => {
    const tag = (strings: TemplateStringsArray, ...values: unknown[]) => ({
      text: strings.join(" $ "),
      values,
    });
    (tag as unknown as Record<string, unknown>).transaction = (
      list: { text: string; values: unknown[] }[],
    ) => {
      transactions.push(list);
      return Promise.resolve();
    };
    return tag;
  },
}));

vi.mock("@/lib/db/app-logs", () => ({ logEvent: () => Promise.resolve() }));
vi.mock("@/lib/email", () => ({ notifyFamilyLinkRequest: () => Promise.resolve() }));
vi.mock("@/lib/url", () => ({ getBaseUrl: () => "https://example.test" }));
vi.mock("next/server", () => ({ after: () => {} }));

import { approveFamilyLinkRequest, declineFamilyLinkRequest } from "@/lib/db/family-links";

const REQ_ID = "req-1111";

// Request created when the requester sat in family F_SNAPSHOT.
const request = {
  id: REQ_ID,
  createdAt: new Date("2026-08-01T00:00:00Z"),
  fromSignupId: "s-requester",
  fromFamilyId: "F_SNAPSHOT",
  toEmail: "parent@example.test",
  toSignupId: "s-addressee",
  status: "pending",
  decidedAt: null,
  decidedBySignupId: null,
};

const addressee = {
  id: "s-addressee",
  familyId: "F_TARGET",
  email: "parent@example.test",
  firstName: "Pat",
  extra: {},
};

const stranger = {
  id: "s-stranger",
  familyId: "F_STRANGER",
  email: "stranger@example.test",
  firstName: "Sam",
  extra: {},
};

// The requester as they are NOW — moved to F_CURRENT since the request was made.
const requesterNow = {
  id: "s-requester",
  familyId: "F_CURRENT",
  email: "kid@example.test",
  firstName: "Kim",
  extra: {},
};

function mergeTransactions() {
  return transactions.filter((list) => list.some((s) => s.text.includes("UPDATE signups")));
}

beforeEach(() => {
  selectResults.length = 0;
  updates.length = 0;
  transactions.length = 0;
});

describe("approveFamilyLinkRequest", () => {
  it("refuses a signed-in stranger holding the request id", async () => {
    // FIFO: request row, decider (the stranger), addressee lookup.
    selectResults.push([request], [stranger], [addressee]);
    const r = await approveFamilyLinkRequest(REQ_ID, "s-stranger");
    expect(r).toEqual({ ok: false, message: "This request wasn't sent to you." });
    expect(mergeTransactions()).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it("merges the requester's CURRENT family, not the request-time snapshot", async () => {
    // FIFO: request, decider (= addressee), addressee, requester as of now.
    selectResults.push([request], [addressee], [addressee], [requesterNow]);
    const r = await approveFamilyLinkRequest(REQ_ID, "s-addressee");
    expect(r.ok).toBe(true);
    const [merge] = mergeTransactions();
    expect(merge).toBeDefined();
    const [repointSignups, repointChildren, , cancelMoot] = merge;
    expect(repointSignups.values).toEqual(["F_TARGET", "F_CURRENT"]);
    expect(repointChildren.values).toEqual(["F_TARGET", "F_CURRENT"]);
    expect(cancelMoot.values).toEqual(["F_CURRENT", REQ_ID]);
  });

  it("closes the request instead of erroring when the two are already one family", async () => {
    selectResults.push([request], [addressee], [addressee], [{ ...requesterNow, familyId: "F_TARGET" }]);
    const r = await approveFamilyLinkRequest(REQ_ID, "s-addressee");
    expect(r.ok).toBe(true);
    expect(r.message).toContain("already one family");
    expect(updates).toHaveLength(1);
    expect(updates[0].status).toBe("cancelled");
    expect(mergeTransactions()).toHaveLength(0);
  });

  it("closes the request when the requesting account no longer exists", async () => {
    selectResults.push([request], [addressee], [addressee], []);
    const r = await approveFamilyLinkRequest(REQ_ID, "s-addressee");
    expect(r.ok).toBe(false);
    expect(r.message).toContain("closed the request");
    expect(updates).toHaveLength(1);
    expect(updates[0].status).toBe("cancelled");
    expect(mergeTransactions()).toHaveLength(0);
  });

  it("still approves when the addressee row is gone but the email matches (stale toSignupId)", async () => {
    // Duplicate-account worlds can replace the row toSignupId pointed at; the
    // email clause must keep the legitimate addressee (now on a NEW row id,
    // same address) able to decide.
    const reParent = { ...addressee, id: "s-addressee-2", familyId: "F_TARGET_2" };
    selectResults.push([request], [reParent], [], [requesterNow]);
    const r = await approveFamilyLinkRequest(REQ_ID, "s-addressee-2");
    expect(r.ok).toBe(true);
    const [merge] = mergeTransactions();
    expect(merge[0].values).toEqual(["F_TARGET_2", "F_CURRENT"]);
  });
});

describe("declineFamilyLinkRequest", () => {
  it("refuses a signed-in stranger holding the request id", async () => {
    selectResults.push([request], [stranger], [addressee]);
    const r = await declineFamilyLinkRequest(REQ_ID, "s-stranger");
    expect(r).toEqual({ ok: false, message: "This request wasn't sent to you." });
    expect(updates).toHaveLength(0);
  });

  it("lets the addressee decline", async () => {
    selectResults.push([request], [addressee], [addressee]);
    const r = await declineFamilyLinkRequest(REQ_ID, "s-addressee");
    expect(r).toEqual({ ok: true, message: "Request declined." });
    expect(updates).toHaveLength(1);
    expect(updates[0].status).toBe("declined");
  });
});
