import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

// DB-layer coverage for the exchange thread. We mock @/lib/db so getSql() returns
// a tagged-template fn we drive per-call via a results queue, and we record every
// issued statement so we can assert WHERE-clause scoping + the private-visibility
// filter without a live Neon connection. getSql() also needs a `.transaction`
// method (ensureThreadTables runs its DDL through it) — a no-op that resolves.
const calls: Array<{ sql: string; values: unknown[] }> = [];
let queue: unknown[][] = [];

function normalize(strings: TemplateStringsArray): string {
  return strings.join("?").replace(/\s+/g, " ").trim();
}

const sqlMock = Object.assign(
  (strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ sql: normalize(strings), values });
    return Promise.resolve(queue.shift() ?? []);
  },
  { transaction: () => Promise.resolve([]) },
);

vi.mock("@/lib/db", () => ({
  getSql: () => sqlMock,
  hasDatabase: () => true,
}));

import {
  listMessagesForResponses,
  getResponseParties,
  acceptEventProposal,
  declineEventProposal,
  deleteResponseMessage,
  countMessagesByAuthorSince,
} from "./exchange-thread";

// Prime the module-memoized ensureThreadTables() ONCE up front. Its DDL runs
// through getSql().transaction([...]), and each inner sql`` template evaluates
// against our mock (shifting the queue). We pad the queue generously so the DDL
// drains harmless empties; after this, `ensured` is memoized and every later data
// call skips the transaction, so per-test queues line up with the real query only.
beforeAll(async () => {
  queue = Array.from({ length: 40 }, () => [] as unknown[]);
  await getResponseParties("prime-0000-0000-0000-000000000000").catch(() => null);
});

beforeEach(() => {
  calls.length = 0;
  queue = [];
});

function lastCallMatching(re: RegExp): { sql: string; values: unknown[] } | undefined {
  for (let i = calls.length - 1; i >= 0; i--) {
    if (re.test(calls[i]!.sql)) return calls[i];
  }
  return undefined;
}

// A raw row shaped like the DB SELECT * returns.
function rawMsg(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "m1",
    created_at: "2026-06-30T00:00:00.000Z",
    response_id: "resp-1",
    ask_id: "ask-1",
    author_signup_id: "author-x",
    author_clerk_id: null,
    kind: "comment",
    visibility: "public",
    body: "hello",
    proposed_event: null,
    event_id: null,
    event_status: null,
    ...over,
  };
}

describe("listMessagesForResponses — private-visibility filtering by party", () => {
  it("returns public messages to everyone, but private ONLY to a party of that response", async () => {
    queue = [
      // ensureThreadTables transaction is a no-op mock; the SELECT is the first
      // recorded template call.
      [
        rawMsg({ id: "pub", visibility: "public", response_id: "resp-1" }),
        rawMsg({ id: "priv-party", visibility: "private", response_id: "resp-1", author_signup_id: "someone" }),
        rawMsg({ id: "priv-nonparty", visibility: "private", response_id: "resp-2", author_signup_id: "other" }),
      ],
    ];
    // Viewer is a party of resp-1 only.
    const partyMap = new Map<string, boolean>([
      ["resp-1", true],
      ["resp-2", false],
    ]);
    const out = await listMessagesForResponses(["resp-1", "resp-2"], "viewer-1", partyMap);
    const ids = out.map((m) => m.id);
    expect(ids).toContain("pub"); // public → everyone
    expect(ids).toContain("priv-party"); // private on resp-1 → viewer is a party
    expect(ids).not.toContain("priv-nonparty"); // private on resp-2 → not a party
  });

  it("shows a private message to its OWN author even if the party map says false", async () => {
    queue = [
      [rawMsg({ id: "mine", visibility: "private", response_id: "resp-9", author_signup_id: "viewer-1" })],
    ];
    const partyMap = new Map<string, boolean>([["resp-9", false]]);
    const out = await listMessagesForResponses(["resp-9"], "viewer-1", partyMap);
    expect(out.map((m) => m.id)).toContain("mine");
  });

  it("short-circuits (no query) for an empty response list", async () => {
    const out = await listMessagesForResponses([], "viewer-1", new Map());
    expect(out).toEqual([]);
    expect(lastCallMatching(/FROM response_messages/)).toBeUndefined();
  });
});

describe("getResponseParties — authz resolution", () => {
  it("joins ask_responses → asks and returns both parties + ask status", async () => {
    queue = [
      [
        {
          ask_id: "ask-1",
          ask_status: "open",
          post_author_signup_id: "author-1",
          responder_signup_id: "responder-1",
        },
      ],
    ];
    const parties = await getResponseParties("resp-1");
    expect(parties).toEqual({
      askId: "ask-1",
      askStatus: "open",
      postAuthorSignupId: "author-1",
      responderSignupId: "responder-1",
    });
    const q = lastCallMatching(/FROM ask_responses r/);
    expect(q!.sql).toMatch(/INNER JOIN asks a ON a\.id = r\.ask_id/);
    expect(q!.values).toContain("resp-1");
  });

  it("returns null for a forged / unknown response id (0 rows)", async () => {
    queue = [[]];
    expect(await getResponseParties("nope")).toBeNull();
  });
});

describe("acceptEventProposal — idempotency guard at the SQL level", () => {
  it("scopes the UPDATE to a still-'proposed' event_proposal and sets accepted + event_id", async () => {
    queue = [[rawMsg({ kind: "event_proposal", event_status: "accepted", event_id: "ev-1" })]];
    const row = await acceptEventProposal({ messageId: "m1", eventId: "ev-1" });
    expect(row).toBeTruthy();
    const upd = lastCallMatching(/UPDATE response_messages SET event_status = 'accepted'/);
    expect(upd!.sql).toMatch(/kind = 'event_proposal'/);
    expect(upd!.sql).toMatch(/event_status = 'proposed'/); // only from proposed
    expect(upd!.values).toContain("m1");
    expect(upd!.values).toContain("ev-1");
  });

  it("returns null when the proposal was already accepted/declined (0 rows) — idempotent", async () => {
    queue = [[]];
    expect(await acceptEventProposal({ messageId: "m1", eventId: "ev-2" })).toBeNull();
  });
});

describe("declineEventProposal", () => {
  it("only declines a still-'proposed' proposal", async () => {
    queue = [[rawMsg({ kind: "event_proposal", event_status: "declined" })]];
    await declineEventProposal("m1");
    const upd = lastCallMatching(/UPDATE response_messages SET event_status = 'declined'/);
    expect(upd!.sql).toMatch(/event_status = 'proposed'/);
    expect(upd!.values).toContain("m1");
  });
});

describe("deleteResponseMessage — author-scoped", () => {
  it("scopes the DELETE to id AND author_signup_id", async () => {
    queue = [[{ id: "m1" }]];
    const ok = await deleteResponseMessage({ messageId: "m1", authorSignupId: "author-1" });
    expect(ok).toBe(true);
    const del = lastCallMatching(/DELETE FROM response_messages/);
    expect(del!.sql).toMatch(/WHERE id = \? AND author_signup_id = \?/);
    expect(del!.values).toContain("m1");
    expect(del!.values).toContain("author-1");
  });

  it("returns false when a non-author attempts the delete (0 rows)", async () => {
    queue = [[]];
    expect(await deleteResponseMessage({ messageId: "m1", authorSignupId: "not-author" })).toBe(false);
  });
});

describe("countMessagesByAuthorSince — rate-limit helper", () => {
  it("counts a single author's messages since a timestamp", async () => {
    queue = [[{ c: 4 }]];
    const n = await countMessagesByAuthorSince("author-1", Date.parse("2026-06-30T00:00:00.000Z"));
    expect(n).toBe(4);
    const q = lastCallMatching(/count\(\*\)::int AS c FROM response_messages/);
    expect(q!.sql).toMatch(/author_signup_id = \? AND created_at >= \?/);
    expect(q!.values).toContain("author-1");
  });
});
