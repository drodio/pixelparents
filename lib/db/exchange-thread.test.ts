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
  castVote,
  getPollResults,
  closePoll,
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
    poll: null,
    ...over,
  };
}

// A raw poll message row.
function rawPoll(over: Partial<Record<string, unknown>> = {}) {
  return rawMsg({
    kind: "poll",
    visibility: "public",
    body: null,
    poll: { question: "Which time?", options: ["Mon", "Tue", "Wed"], closed: false },
    ...over,
  });
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

describe("castVote — toggle / change / retract + guards", () => {
  it("INSERTs a new vote (no prior) → 'added'", async () => {
    queue = [
      [rawPoll()], // load poll message
      [], // no existing vote
      [], // INSERT ... ON CONFLICT result
    ];
    const res = await castVote({ messageId: "m1", voterSignupId: "v1", optionIndex: 1 });
    expect(res).toEqual({ ok: true, state: "added" });
    const ins = lastCallMatching(/INSERT INTO poll_votes/);
    expect(ins!.sql).toMatch(/ON CONFLICT \(message_id, voter_signup_id\)/);
    expect(ins!.values).toContain("m1");
    expect(ins!.values).toContain("v1");
    expect(ins!.values).toContain(1);
  });

  it("moves the vote to a different option → 'changed' (upsert, no delete)", async () => {
    queue = [
      [rawPoll()],
      [{ option_index: 0 }], // existing vote on option 0
      [], // upsert
    ];
    const res = await castVote({ messageId: "m1", voterSignupId: "v1", optionIndex: 2 });
    expect(res).toEqual({ ok: true, state: "changed" });
    expect(lastCallMatching(/INSERT INTO poll_votes/)).toBeTruthy();
    expect(lastCallMatching(/DELETE FROM poll_votes/)).toBeUndefined();
  });

  it("re-voting the SAME option retracts (DELETE) → 'retracted'", async () => {
    queue = [
      [rawPoll()],
      [{ option_index: 2 }], // existing vote on option 2
      [], // delete
    ];
    const res = await castVote({ messageId: "m1", voterSignupId: "v1", optionIndex: 2 });
    expect(res).toEqual({ ok: true, state: "retracted" });
    const del = lastCallMatching(/DELETE FROM poll_votes/);
    expect(del!.sql).toMatch(/WHERE message_id = \? AND voter_signup_id = \?/);
    expect(del!.values).toContain("m1");
    expect(del!.values).toContain("v1");
  });

  it("rejects an out-of-range optionIndex (poll has 3 options)", async () => {
    queue = [[rawPoll()]]; // only the load — no vote query should follow
    const res = await castVote({ messageId: "m1", voterSignupId: "v1", optionIndex: 3 });
    expect(res).toEqual({ ok: false, error: "bad_option" });
    const negRes = await castVote({ messageId: "m1", voterSignupId: "v1", optionIndex: -1 });
    // (queue empty now → loads [] → not_found; the point is it never inserts)
    expect(lastCallMatching(/INSERT INTO poll_votes/)).toBeUndefined();
    expect(negRes.ok).toBe(false);
  });

  it("rejects voting on a CLOSED poll", async () => {
    queue = [[rawPoll({ poll: { question: "q", options: ["a", "b"], closed: true } })]];
    const res = await castVote({ messageId: "m1", voterSignupId: "v1", optionIndex: 0 });
    expect(res).toEqual({ ok: false, error: "closed" });
  });

  it("rejects a forged messageId (0 rows / not a poll)", async () => {
    queue = [[]];
    const res = await castVote({ messageId: "nope", voterSignupId: "v1", optionIndex: 0 });
    expect(res).toEqual({ ok: false, error: "not_found" });
  });
});

describe("getPollResults — counts + viewer's choice", () => {
  it("aggregates per-option counts, total, and the viewer's own option", async () => {
    queue = [
      [
        { message_id: "m1", option_index: 0, voter_signup_id: "a" },
        { message_id: "m1", option_index: 0, voter_signup_id: "b" },
        { message_id: "m1", option_index: 2, voter_signup_id: "viewer" },
      ],
    ];
    const out = await getPollResults([{ messageId: "m1", optionCount: 3 }], "viewer");
    const r = out.get("m1")!;
    expect(r.counts).toEqual([2, 0, 1]);
    expect(r.total).toBe(3);
    expect(r.viewerOptionIndex).toBe(2);
  });

  it("returns zero-filled counts for a poll with no votes; viewer choice null", async () => {
    queue = [[]];
    const out = await getPollResults([{ messageId: "m1", optionCount: 2 }], "viewer");
    const r = out.get("m1")!;
    expect(r.counts).toEqual([0, 0]);
    expect(r.total).toBe(0);
    expect(r.viewerOptionIndex).toBeNull();
  });

  it("short-circuits (no query) for an empty poll list", async () => {
    const out = await getPollResults([], "viewer");
    expect(out.size).toBe(0);
    expect(lastCallMatching(/FROM poll_votes/)).toBeUndefined();
  });
});

describe("closePoll — party-scoped", () => {
  it("scopes the UPDATE through ask_responses/asks to a party of the response", async () => {
    queue = [[rawPoll({ poll: { question: "q", options: ["a", "b"], closed: true } })]];
    const row = await closePoll({ messageId: "m1", callerSignupId: "author-1" });
    expect(row).toBeTruthy();
    expect(row!.poll!.closed).toBe(true);
    const upd = lastCallMatching(/UPDATE response_messages m/);
    expect(upd!.sql).toMatch(/kind = 'poll'/);
    expect(upd!.sql).toMatch(/a\.author_signup_id = \? OR r\.responder_signup_id = \?/);
    expect(upd!.values).toContain("m1");
    expect(upd!.values).toContain("author-1");
  });

  it("returns null when the caller is not a party (0 rows)", async () => {
    queue = [[]];
    expect(await closePoll({ messageId: "m1", callerSignupId: "stranger" })).toBeNull();
  });
});
