import { describe, it, expect, vi, beforeEach } from "vitest";

// DB-layer coverage for the resource-boards pin/edit features. We mock @/lib/db
// so getSql() returns a tagged-template fn we drive per-call via a results queue,
// and we record every issued statement so we can assert WHERE-clause scoping and
// ORDER BY semantics without a live Neon connection. getSql() also needs a
// `.transaction` method (ensureBoardsTables runs its DDL through it) — we make it
// a no-op that resolves, since the unit suite never exercises real DDL.
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
  setContributionPinned,
  updateBoard,
  updateContribution,
  listContributions,
  listBoardChats,
  createBoardChat,
  updateBoardChat,
  deleteBoardChat,
  reorderBoardChats,
  type ContributionWithCounts,
} from "./resources";

beforeEach(() => {
  calls.length = 0;
  queue = [];
});

// The data-touching fns call ensureBoardsTables() first. With ensured memoized
// across the module, only the FIRST call in the suite runs the migration probe
// (migrateLegacyResources SELECTs count of un-migrated legacy rows). We seed a
// 0-count so that probe short-circuits, then the real query for the fn under
// test. Because `ensured` is memoized, subsequent tests only need the fn's own
// result rows — but to stay order-independent we filter recorded calls by SQL.
function lastCallMatching(re: RegExp): { sql: string; values: unknown[] } | undefined {
  for (let i = calls.length - 1; i >= 0; i--) {
    if (re.test(calls[i]!.sql)) return calls[i];
  }
  return undefined;
}

describe("listContributions ordering", () => {
  it("orders pinned-first by pinned_at ASC, then unpinned by upvotes DESC, created_at DESC", async () => {
    queue = [
      [{ c: 0 }], // ensureBoardsTables migration probe (first call only)
      [], // the SELECT result (content irrelevant — we assert the SQL)
    ];
    await listContributions({ boardId: "board-1", viewerSignupId: "viewer-1" });

    const select = lastCallMatching(/FROM board_contributions c/);
    expect(select).toBeTruthy();
    const sql = select!.sql.replace(/\s+/g, " ");
    // Pinned rows ahead of unpinned: the (pinned_at IS NULL) boolean sorts
    // false(=pinned) before true(=unpinned).
    expect(sql).toMatch(/ORDER BY \(c\.pinned_at IS NULL\), c\.pinned_at ASC, upvotes DESC, c\.created_at DESC/);
  });

  it("surfaces a `pinned` boolean derived from pinned_at on each row", async () => {
    // Re-mock the result for the SELECT to return two rows: one pinned, one not.
    queue = [
      [
        {
          id: "c-pinned",
          board_id: "b1",
          author_signup_id: "a1",
          author_clerk_id: null,
          kind: "link",
          title: "Pinned one",
          url: "https://example.com",
          file_path: null,
          file_name: null,
          body: null,
          pinned_at: "2026-06-30T00:00:00.000Z",
          created_at: "2026-06-29T00:00:00.000Z",
          upvotes: 3,
          viewer_upvoted: false,
        },
        {
          id: "c-unpinned",
          board_id: "b1",
          author_signup_id: "a2",
          author_clerk_id: null,
          kind: "text",
          title: "Unpinned one",
          url: null,
          file_path: null,
          file_name: null,
          body: "hi",
          pinned_at: null,
          created_at: "2026-06-28T00:00:00.000Z",
          upvotes: 9,
          viewer_upvoted: true,
        },
      ],
    ];
    const rows: ContributionWithCounts[] = await listContributions({
      boardId: "b1",
      viewerSignupId: "viewer-1",
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]!.pinned).toBe(true);
    expect(rows[1]!.pinned).toBe(false);
  });
});

describe("setContributionPinned", () => {
  it("pins with pinned_at = now() and scopes by BOTH contribution id and board id", async () => {
    queue = [[{ id: "c1" }]];
    const ok = await setContributionPinned({
      contributionId: "c1",
      boardId: "b1",
      pinned: true,
    });
    expect(ok).toBe(true);

    const upd = lastCallMatching(/UPDATE board_contributions SET pinned_at/);
    expect(upd).toBeTruthy();
    // now() must be real SQL, not a bound value (a bound "now()" cast to
    // timestamptz throws). The ids are still bound and both appear in the WHERE.
    expect(upd!.sql).toMatch(/SET pinned_at = now\(\)/);
    expect(upd!.values).not.toContain("now()");
    expect(upd!.values).toContain("c1");
    expect(upd!.values).toContain("b1");
    expect(upd!.sql).toMatch(/WHERE id = \? AND board_id = \?/);
  });

  it("unpins by setting pinned_at to NULL", async () => {
    queue = [[{ id: "c1" }]];
    await setContributionPinned({ contributionId: "c1", boardId: "b1", pinned: false });
    const upd = lastCallMatching(/UPDATE board_contributions SET pinned_at/);
    // NULL is inline SQL, not a bound value.
    expect(upd!.sql).toMatch(/SET pinned_at = NULL/);
    expect(upd!.values).not.toContain("now()");
  });

  it("returns false when no row matches (wrong board → no-op)", async () => {
    queue = [[]];
    const ok = await setContributionPinned({
      contributionId: "c1",
      boardId: "other-board",
      pinned: true,
    });
    expect(ok).toBe(false);
  });
});

describe("updateBoard (owner-scoped)", () => {
  it("scopes the UPDATE to id AND author_signup_id and bumps updated_at", async () => {
    queue = [
      [
        {
          id: "b1",
          title: "New title",
          description: "New desc",
          author_signup_id: "owner-1",
          author_clerk_id: null,
          tags: ["math"],
          pinned: false,
          created_at: "2026-06-01T00:00:00.000Z",
          updated_at: "2026-06-30T00:00:00.000Z",
        },
      ],
    ];
    const row = await updateBoard({
      id: "b1",
      authorSignupId: "owner-1",
      title: "New title",
      description: "New desc",
      tags: ["math"],
    });
    expect(row).toBeTruthy();
    expect(row!.title).toBe("New title");
    const upd = lastCallMatching(/UPDATE resource_boards SET/);
    expect(upd!.sql).toMatch(/WHERE id = \? AND author_signup_id = \?/);
    expect(upd!.sql).toMatch(/updated_at = now\(\)/);
    expect(upd!.values).toContain("b1");
    expect(upd!.values).toContain("owner-1");
  });

  it("returns null when a non-owner attempts the edit (0 rows)", async () => {
    queue = [[]];
    const row = await updateBoard({
      id: "b1",
      authorSignupId: "not-the-owner",
      title: "x",
      description: null,
      tags: [],
    });
    expect(row).toBeNull();
  });
});

describe("updateContribution (author-scoped)", () => {
  it("scopes the UPDATE to id AND author_signup_id, edits url only for link, and bumps the board", async () => {
    queue = [
      [
        {
          id: "c1",
          board_id: "b1",
          author_signup_id: "author-1",
          author_clerk_id: null,
          kind: "link",
          title: "Edited",
          url: "https://new.example.com",
          file_path: null,
          file_name: null,
          body: null,
          pinned_at: null,
          created_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      [{ id: "b1" }], // the follow-up board updated_at bump
    ];
    const row = await updateContribution({
      id: "c1",
      authorSignupId: "author-1",
      title: "Edited",
      url: "https://new.example.com",
      body: null,
    });
    expect(row).toBeTruthy();
    expect(row!.title).toBe("Edited");

    const upd = lastCallMatching(/UPDATE board_contributions SET title/);
    expect(upd!.sql).toMatch(/WHERE id = \? AND author_signup_id = \?/);
    // url only changes for kind = 'link'; body only for kind = 'text' (CASE guards).
    expect(upd!.sql).toMatch(/url = CASE WHEN kind = 'link'/);
    expect(upd!.sql).toMatch(/body = CASE WHEN kind = 'text'/);
    expect(upd!.values).toContain("author-1");

    // The owning board's updated_at is bumped.
    const bump = lastCallMatching(/UPDATE resource_boards SET updated_at = now\(\)/);
    expect(bump).toBeTruthy();
    expect(bump!.values).toContain("b1");
  });

  it("returns null (and does NOT bump the board) when a non-author attempts the edit", async () => {
    queue = [[]]; // UPDATE ... RETURNING matched 0 rows
    const row = await updateContribution({
      id: "c1",
      authorSignupId: "not-author",
      title: "x",
    });
    expect(row).toBeNull();
    // No second UPDATE for the board bump.
    expect(lastCallMatching(/UPDATE resource_boards SET updated_at = now\(\)/)).toBeUndefined();
  });
});

// The legacy→"General" migration must seed the board as SYSTEM-OWNED (nil-UUID
// author, no clerk id) rather than attributing it to the earliest legacy member.
// Ownership drives edit/delete, so a real seed author could otherwise rename or
// DELETE a community-wide board. We import the module FRESH (resetModules) so its
// memoized `ensured` is null and both the DDL + migrateLegacyResources run.
//
// NB: ensureBoardsTables builds its DDL by evaluating each `sql``` template
// (that's how the statements are recorded), so those calls also drain the mock
// queue. We don't care about their results, so we drive the migration by the
// SQL that was ISSUED (lastCallMatching) rather than by exact queue position,
// and make the count-probe non-empty by returning a nonzero count for EVERY
// unmatched call — the probe reads `pending[0]?.c`.
describe("migrateLegacyResources — General board ownership", () => {
  // A queue item shifted for any DDL/probe call: report "2 un-migrated rows" so
  // the probe (SELECT count ... AS c) sees pending > 0 and the migration runs.
  const NONZERO_COUNT = [{ c: 2 }];

  it("creates the General board with the nil-UUID system owner and null clerk id", async () => {
    vi.resetModules();
    calls.length = 0;
    // Every call returns the nonzero-count row; the only results that matter are
    // the "existing General board" lookup (empty → create) and the INSERT id.
    queue = Array.from({ length: 40 }, () => NONZERO_COUNT);
    // Every NONZERO_COUNT slot has a `c` (probe: pending > 0) but no `id`, so the
    // "existing General board" lookup resolves to no id wherever it lands → the
    // create path runs and we assert the system-owned INSERT below. (The exact
    // index of that SELECT shifts as DDL grows, since each tagged-template inside
    // sql.transaction shifts the queue; this test doesn't depend on it.)

    const fresh = await import("./resources");
    await fresh.ensureBoardsTables();

    const insert = lastCallMatching(
      /INSERT INTO resource_boards \(title, description, author_signup_id/,
    );
    expect(insert).toBeTruthy();
    // The author is the nil UUID (system-owned), and NO earliest-legacy-author
    // SELECT was issued to pick a real member.
    expect(insert!.values).toContain("00000000-0000-0000-0000-000000000000");
    expect(
      lastCallMatching(/SELECT author_signup_id, author_clerk_id FROM resources/),
    ).toBeUndefined();
  });

  it("does NOT re-create the board when a General board already exists", async () => {
    vi.resetModules();
    calls.length = 0;
    // A combined sentinel so this test is independent of how many DDL statements
    // ensureBoardsTables issues (each tagged-template inside sql.transaction
    // shifts the queue, so the exact index of the "existing General" SELECT moves
    // as the schema grows). `c` keeps the migration probe seeing pending > 0;
    // `id` makes every "existing General board" lookup resolve to a row → reuse.
    queue = Array.from({ length: 40 }, () => [{ c: 2, id: "existing-general" }]);

    const fresh = await import("./resources");
    await fresh.ensureBoardsTables();

    // No INSERT for a new board — it reuses the existing one.
    expect(
      lastCallMatching(/INSERT INTO resource_boards \(title, description, author_signup_id/),
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Board group chats — ordering, attribution, and the two authorized delete
// paths (owner deletes any / non-owner deletes own). Authorization itself lives
// in the server action; here we assert the DB scoping the action relies on.
// ---------------------------------------------------------------------------

describe("listBoardChats", () => {
  it("orders by position ASC then created_at ASC and scopes to the board", async () => {
    queue = [[{ c: 0 }], []];
    await listBoardChats("board-1");
    const select = lastCallMatching(/FROM board_chats/);
    expect(select).toBeTruthy();
    expect(select!.sql.replace(/\s+/g, " ")).toMatch(
      /WHERE board_id = \? ORDER BY position ASC, created_at ASC/,
    );
    expect(select!.values).toContain("board-1");
  });
});

describe("createBoardChat", () => {
  it("persists submitted_by and appends at max(position)+1", async () => {
    queue = [
      [
        {
          id: "chat-1",
          board_id: "b1",
          title: "AP Calc WhatsApp",
          url: "https://chat.whatsapp.com/x",
          submitted_by: "member-1",
          submitted_clerk_id: "clerk-1",
          last_edited_by: null,
          position: 3,
          created_at: "2026-07-08T00:00:00.000Z",
        },
      ],
    ];
    const row = await createBoardChat({
      boardId: "b1",
      title: "AP Calc WhatsApp",
      url: "https://chat.whatsapp.com/x",
      submittedBy: "member-1",
      submittedClerkId: "clerk-1",
    });
    expect(row.submittedBy).toBe("member-1");
    expect(row.position).toBe(3);

    const ins = lastCallMatching(/INSERT INTO board_chats/);
    expect(ins).toBeTruthy();
    // submitted_by is bound (attribution), and position is derived in SQL.
    expect(ins!.values).toContain("member-1");
    expect(ins!.sql).toMatch(/COALESCE\(\(SELECT max\(position\) \+ 1 FROM board_chats/);
  });
});

describe("updateBoardChat", () => {
  it("stamps last_edited_by and scopes by BOTH chat id and board id (no author scope — owner edits any)", async () => {
    queue = [
      [
        {
          id: "chat-1",
          board_id: "b1",
          title: "New name",
          url: "https://pronto.io/x",
          submitted_by: "someone-else",
          submitted_clerk_id: null,
          last_edited_by: "owner-1",
          position: 0,
          created_at: "2026-07-08T00:00:00.000Z",
        },
      ],
    ];
    const row = await updateBoardChat({
      id: "chat-1",
      boardId: "b1",
      title: "New name",
      url: "https://pronto.io/x",
      lastEditedBy: "owner-1",
    });
    expect(row?.lastEditedBy).toBe("owner-1");

    const upd = lastCallMatching(/UPDATE board_chats SET title/);
    expect(upd).toBeTruthy();
    expect(upd!.sql.replace(/\s+/g, " ")).toMatch(/WHERE id = \? AND board_id = \?/);
    // Deliberately NOT scoped to submitted_by — an owner can edit a chat someone
    // else submitted. The values carry last_edited_by for attribution.
    expect(upd!.sql).not.toMatch(/submitted_by/);
    expect(upd!.values).toContain("owner-1");
  });
});

describe("deleteBoardChat", () => {
  it("owner/admin path: no submitter scope (requireSubmitter null → deletes any)", async () => {
    queue = [[{ id: "chat-1" }]];
    const ok = await deleteBoardChat({ id: "chat-1", boardId: "b1", requireSubmitter: null });
    expect(ok).toBe(true);
    const del = lastCallMatching(/DELETE FROM board_chats/);
    expect(del!.sql.replace(/\s+/g, " ")).toMatch(
      /WHERE id = \? AND board_id = \? AND \(\?::uuid IS NULL OR submitted_by = \?::uuid\)/,
    );
    // The submitter guard param is null → the "IS NULL" branch matches any row.
    expect(del!.values).toContain(null);
  });

  it("non-owner path: scopes the delete to the submitter's own signup id", async () => {
    queue = [[]]; // wrong submitter → 0 rows
    const ok = await deleteBoardChat({
      id: "chat-1",
      boardId: "b1",
      requireSubmitter: "member-2",
    });
    expect(ok).toBe(false);
    const del = lastCallMatching(/DELETE FROM board_chats/);
    expect(del!.values).toContain("member-2");
  });
});

describe("reorderBoardChats", () => {
  it("writes position by index and last_edited_by, scoping each UPDATE to the board", async () => {
    // Two chats reordered → two UPDATEs, each returning a moved row.
    queue = [[{ id: "a" }], [{ id: "b" }]];
    const moved = await reorderBoardChats({
      boardId: "b1",
      orderedIds: ["a", "b"],
      lastEditedBy: "owner-1",
    });
    expect(moved).toBe(2);
    const upd = lastCallMatching(/UPDATE board_chats SET position/);
    expect(upd).toBeTruthy();
    expect(upd!.sql.replace(/\s+/g, " ")).toMatch(/WHERE id = \? AND board_id = \?/);
    expect(upd!.values).toContain("owner-1");
    expect(upd!.values).toContain("b1");
  });
});
