import { describe, it, expect, vi, beforeEach } from "vitest";

// Shared, hoisted state the mocks read at call-time (vi.mock is hoisted above
// normal module-level declarations, so the state must be hoisted too).
const h = vi.hoisted(() => ({
  userRows: [] as Array<{ clerkUserId: string; evaluationId: string | null; fullName: string | null; nickname: string | null }>,
  keyedRows: [] as Array<{ id: string }>,
  marked: [] as string[],
  clerkUsers: [] as Array<{ id: string; emailAddresses: Array<{ id: string; emailAddress: string }>; primaryEmailAddressId: string; firstName: string | null }>,
  sendImpl: (() => Promise.resolve({ id: "ok" })) as (opts: { to: string }) => Promise<{ id: string }>,
}));

type Builder = {
  select: () => Builder;
  from: (t: unknown) => Builder;
  leftJoin: () => Builder;
  where: () => Builder;
  orderBy: () => Builder;
  groupBy: () => Builder;
  limit: () => Builder;
  then: (resolve: (v: unknown) => unknown) => unknown;
  _t?: unknown;
};

// Minimal chainable drizzle stand-in. Terminal `await` resolves by the table
// passed to `.from()`; the un-awaited `sent` subquery just returns the builder.
vi.mock("@/db", async () => {
  const schema = await import("@/db/schema");
  const builder: Builder = {
    select: () => builder,
    from(t: unknown) { builder._t = t; return builder; },
    leftJoin: () => builder,
    where: () => builder,
    orderBy: () => builder,
    groupBy: () => builder,
    limit: () => builder,
    then(resolve: (v: unknown) => unknown) {
      if (builder._t === schema.users) return resolve(h.userRows);
      if (builder._t === schema.apiKeys) return resolve(h.keyedRows);
      return resolve([]);
    },
  };
  return {
    db: {
      select: () => builder,
      insert: () => ({
        values: (v: { clerkUserId: string }) => ({
          onConflictDoNothing: async () => { h.marked.push(v.clerkUserId); },
        }),
      }),
    },
  };
});

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({ users: { getUserList: async () => ({ data: h.clerkUsers }) } }),
}));

vi.mock("@/lib/admin", () => ({ SUPER_ADMIN_EMAILS: [] as string[] }));
vi.mock("@/lib/canonical-profile-url", () => ({ canonicalProfileUrl: async () => "/profile/founder/x" }));

// Partial mock: keep the real firstNameFor (pure), stub the senders.
vi.mock("@/lib/welcome-emails", async (orig) => {
  const actual = await orig<typeof import("@/lib/welcome-emails")>();
  return {
    ...actual,
    sendClaimWelcomeEmail: vi.fn((opts: { to: string }) => h.sendImpl(opts)),
    sendDevApiWelcomeEmail: vi.fn((opts: { to: string }) => h.sendImpl(opts)),
  };
});

import { runClaimWelcomePass } from "@/lib/welcome-email-sweep";

function clerkUser(id: string, email: string, firstName: string | null = null) {
  return { id, emailAddresses: [{ id: `${id}-pe`, emailAddress: email }], primaryEmailAddressId: `${id}-pe`, firstName };
}

beforeEach(() => {
  process.env.CLAIM_WELCOME_EMAIL_ENABLED = "on";
  h.userRows = [];
  h.keyedRows = [];
  h.marked = [];
  h.clerkUsers = [];
  h.sendImpl = () => Promise.resolve({ id: "ok" });
  vi.clearAllMocks();
});

describe("runClaimWelcomePass — per-recipient failure isolation", () => {
  it("a failing send for one user does NOT block the next, and the failed row is left unmarked", async () => {
    h.userRows = [
      { clerkUserId: "u1", evaluationId: "e1", fullName: "User One", nickname: null },
      { clerkUserId: "u2", evaluationId: "e2", fullName: "User Two", nickname: null },
    ];
    h.clerkUsers = [clerkUser("u1", "u1@example.com"), clerkUser("u2", "u2@example.com")];
    // u1's send throws (e.g. Resend rejects the address); u2 must still go out.
    h.sendImpl = (opts) =>
      opts.to === "u1@example.com" ? Promise.reject(new Error("resend boom")) : Promise.resolve({ id: "ok" });

    const res = await runClaimWelcomePass();

    expect(res).toEqual({ sent: 1, skipped: 0, failed: 1 });
    // Only the successful user is marked sent; the failed one retries next run.
    expect(h.marked).toEqual(["u2"]);
  });

  it("happy path marks every recipient and reports no failures", async () => {
    h.userRows = [
      { clerkUserId: "u1", evaluationId: "e1", fullName: "User One", nickname: null },
      { clerkUserId: "u2", evaluationId: "e2", fullName: "User Two", nickname: null },
    ];
    h.clerkUsers = [clerkUser("u1", "u1@example.com"), clerkUser("u2", "u2@example.com")];

    const res = await runClaimWelcomePass();

    expect(res).toEqual({ sent: 2, skipped: 0, failed: 0 });
    expect(h.marked.sort()).toEqual(["u1", "u2"]);
  });
});
