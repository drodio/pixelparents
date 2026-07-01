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
