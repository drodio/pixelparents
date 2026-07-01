import { getSql, hasDatabase } from "../db";

// ---------------------------------------------------------------------------
// Resources — the OHS community "resource BOARDS" data layer.
//
// A board is a Reddit-like, OHS-only, community-curated, PERMANENT collection on
// a theme (e.g. "AP Calc BC study links", "College essay swaps"). Any VERIFIED
// member can create a board and add CONTRIBUTIONS to any board (a link, an
// uploaded file, or a markdown text post). Boards and contributions can both be
// UPVOTED (one per member). Boards are auto-labeled with topic tags (see
// lib/resources-label.ts) so the library is browsable + filterable by topic.
//
// This module is pure DB access — authorization lives in the server action
// (app/(authed)/resources/actions.ts), mirroring lib/db/asks.ts.
//
// DDL is intentionally SELF-CONTAINED here (its own memoized ensureBoardsTables)
// rather than added to the shared lib/db/ensure.ts — this app shares one Neon DB
// across in-flight features and a sibling `drizzle-kit push` could DROP a table
// it doesn't know about (the country-column P0 lesson). Every read/write calls
// ensureBoardsTables() first so a cold instance — or a table dropped out from
// under us — self-heals before it queries. Mirrors lib/db/reports.ts and
// lib/db/notifications.ts. CREATEs handle a dropped table; ALTERs upgrade an
// older table in place. All statements are idempotent.
//
// MIGRATION (idempotent, lossless): the prior "living library" stored flat rows
// in `resources`. ensureBoardsTables() keeps that table AND folds any existing
// rows into a default "General" board as `link` contributions exactly once (a
// per-row `migrated_to_contribution_id` marker makes it safe to re-run). No data
// is ever lost — the old rows stay in `resources` too.
// ---------------------------------------------------------------------------

import {
  validateBoardTitle,
  type ContributionKind,
} from "../resources-label";

// The fixed slug/title of the auto-created home for migrated legacy resources.
const DEFAULT_BOARD_TITLE = "General";

let ensured: Promise<void> | null = null;
export function ensureBoardsTables(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      const sql = getSql();
      await sql.transaction([
        // --- Legacy flat resources table (kept for migration + back-compat) ---
        sql`
          CREATE TABLE IF NOT EXISTS resources (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            author_signup_id uuid NOT NULL,
            author_clerk_id text,
            title text NOT NULL,
            url text NOT NULL,
            note text,
            tags text[] NOT NULL DEFAULT '{}',
            created_at timestamptz NOT NULL DEFAULT now()
          )
        `,
        sql`ALTER TABLE resources ADD COLUMN IF NOT EXISTS author_clerk_id text`,
        sql`ALTER TABLE resources ADD COLUMN IF NOT EXISTS note text`,
        sql`ALTER TABLE resources ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'`,
        // Marker so the legacy→board migration runs at most once per row.
        sql`ALTER TABLE resources ADD COLUMN IF NOT EXISTS migrated_to_contribution_id uuid`,

        // --- Boards ---
        sql`
          CREATE TABLE IF NOT EXISTS resource_boards (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            title text NOT NULL,
            description text,
            author_signup_id uuid NOT NULL,
            author_clerk_id text,
            tags text[] NOT NULL DEFAULT '{}',
            pinned boolean NOT NULL DEFAULT false,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
          )
        `,
        sql`ALTER TABLE resource_boards ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'`,
        sql`ALTER TABLE resource_boards ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false`,
        sql`ALTER TABLE resource_boards ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()`,
        sql`CREATE INDEX IF NOT EXISTS resource_boards_created_idx ON resource_boards (created_at DESC)`,
        sql`CREATE INDEX IF NOT EXISTS resource_boards_tags_gin_idx ON resource_boards USING gin (tags)`,

        // --- Contributions (a board's "thread") ---
        sql`
          CREATE TABLE IF NOT EXISTS board_contributions (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            board_id uuid NOT NULL REFERENCES resource_boards(id) ON DELETE CASCADE,
            author_signup_id uuid NOT NULL,
            author_clerk_id text,
            kind text NOT NULL DEFAULT 'link',
            title text NOT NULL,
            url text,
            file_path text,
            file_name text,
            body text,
            created_at timestamptz NOT NULL DEFAULT now()
          )
        `,
        // Pinning: a board owner can pin contributions to the top. Nullable —
        // NULL = not pinned; the timestamp records WHEN it was pinned so pinned
        // items render in the order they were pinned (top to bottom).
        sql`ALTER TABLE board_contributions ADD COLUMN IF NOT EXISTS pinned_at timestamptz`,
        sql`CREATE INDEX IF NOT EXISTS board_contributions_board_idx ON board_contributions (board_id, created_at DESC)`,
        sql`CREATE INDEX IF NOT EXISTS board_contributions_pinned_idx ON board_contributions (board_id, pinned_at)`,

        // --- Upvotes (one row per member per target → UNIQUE enforces "one vote") ---
        sql`
          CREATE TABLE IF NOT EXISTS board_upvotes (
            board_id uuid NOT NULL REFERENCES resource_boards(id) ON DELETE CASCADE,
            signup_id uuid NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (board_id, signup_id)
          )
        `,
        sql`
          CREATE TABLE IF NOT EXISTS contribution_upvotes (
            contribution_id uuid NOT NULL REFERENCES board_contributions(id) ON DELETE CASCADE,
            signup_id uuid NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (contribution_id, signup_id)
          )
        `,

        // --- Board followers (notify on new contributions; reuses notifications) ---
        sql`
          CREATE TABLE IF NOT EXISTS board_followers (
            board_id uuid NOT NULL REFERENCES resource_boards(id) ON DELETE CASCADE,
            signup_id uuid NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (board_id, signup_id)
          )
        `,
      ]);

      // One-time, idempotent migration of any legacy flat resources into a
      // default "General" board as link contributions. Done OUTSIDE the DDL
      // transaction so a partial migration can't wedge schema creation.
      await migrateLegacyResources();
    })().catch((e) => {
      ensured = null;
      throw e;
    });
  }
  return ensured;
}

// Fold un-migrated rows from the legacy `resources` table into a default board
// as `link` contributions. Idempotent: each legacy row carries a
// migrated_to_contribution_id once moved, so re-runs are no-ops. Only runs when
// there is at least one un-migrated legacy row (cheap guard for the common path).
async function migrateLegacyResources(): Promise<void> {
  const sql = getSql();
  const pending = (await sql`
    SELECT count(*)::int AS c FROM resources WHERE migrated_to_contribution_id IS NULL
  `) as unknown as { c: number }[];
  if ((pending[0]?.c ?? 0) === 0) return;

  // Ensure a single "General" board exists to receive migrated resources. Pick
  // the earliest legacy author as the board author so attribution stays sane;
  // fall back to the first un-migrated row.
  const seed = (await sql`
    SELECT author_signup_id, author_clerk_id
    FROM resources
    WHERE migrated_to_contribution_id IS NULL
    ORDER BY created_at ASC
    LIMIT 1
  `) as unknown as { author_signup_id: string; author_clerk_id: string | null }[];
  const seedAuthor = seed[0];
  if (!seedAuthor) return;

  const existing = (await sql`
    SELECT id FROM resource_boards WHERE title = ${DEFAULT_BOARD_TITLE} ORDER BY created_at ASC LIMIT 1
  `) as unknown as { id: string }[];
  let boardId = existing[0]?.id;
  if (!boardId) {
    const title = validateBoardTitle(DEFAULT_BOARD_TITLE);
    const created = (await sql`
      INSERT INTO resource_boards (title, description, author_signup_id, author_clerk_id, tags, pinned)
      VALUES (
        ${title.ok ? title.value : DEFAULT_BOARD_TITLE},
        ${"Community resources shared before boards existed — and a home for anything that doesn't fit elsewhere."},
        ${seedAuthor.author_signup_id},
        ${seedAuthor.author_clerk_id},
        ${["ohs", "resource"]}::text[],
        ${true}
      )
      RETURNING id
    `) as unknown as { id: string }[];
    boardId = created[0]!.id;
  }

  // Move each un-migrated legacy row into the board as a link contribution and
  // stamp the marker in the same statement (CTE) so it's atomic per row.
  await sql`
    WITH legacy AS (
      SELECT id, author_signup_id, author_clerk_id, title, url, note, created_at
      FROM resources
      WHERE migrated_to_contribution_id IS NULL
      ORDER BY created_at ASC
    ),
    inserted AS (
      INSERT INTO board_contributions
        (board_id, author_signup_id, author_clerk_id, kind, title, url, body, created_at)
      SELECT ${boardId}, l.author_signup_id, l.author_clerk_id, 'link', l.title, l.url, l.note, l.created_at
      FROM legacy l
      RETURNING id, url, title
    )
    UPDATE resources r
    SET migrated_to_contribution_id = i.id
    FROM inserted i
    WHERE r.url = i.url AND r.title = i.title AND r.migrated_to_contribution_id IS NULL
  `;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BoardRow = {
  id: string;
  title: string;
  description: string | null;
  authorSignupId: string;
  authorClerkId: string | null;
  tags: string[];
  pinned: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
};

// A board enriched with aggregate counts + the viewer's own upvote state — the
// shape the index/detail pages render.
export type BoardWithCounts = BoardRow & {
  contributionCount: number;
  upvotes: number;
  lastActivityAt: Date | null;
  viewerUpvoted: boolean;
};

export type ContributionRow = {
  id: string;
  boardId: string;
  authorSignupId: string;
  authorClerkId: string | null;
  kind: ContributionKind;
  title: string;
  url: string | null;
  filePath: string | null;
  fileName: string | null;
  body: string | null;
  pinned: boolean;
  createdAt: Date | null;
};

export type ContributionWithCounts = ContributionRow & {
  upvotes: number;
  viewerUpvoted: boolean;
};

type RawBoard = {
  id: string;
  title: string;
  description: string | null;
  author_signup_id: string;
  author_clerk_id: string | null;
  tags: string[] | null;
  pinned: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  contribution_count?: number | string | null;
  upvotes?: number | string | null;
  last_activity_at?: string | null;
  viewer_upvoted?: boolean | null;
};

type RawContribution = {
  id: string;
  board_id: string;
  author_signup_id: string;
  author_clerk_id: string | null;
  kind: string;
  title: string;
  url: string | null;
  file_path: string | null;
  file_name: string | null;
  body: string | null;
  pinned_at?: string | null;
  created_at: string | null;
  upvotes?: number | string | null;
  viewer_upvoted?: boolean | null;
};

function toDate(s: string | null | undefined): Date | null {
  return s ? new Date(s) : null;
}
function toInt(v: number | string | null | undefined): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseInt(v, 10) || 0;
  return 0;
}

function mapBoard(r: RawBoard): BoardWithCounts {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    authorSignupId: r.author_signup_id,
    authorClerkId: r.author_clerk_id,
    tags: r.tags ?? [],
    pinned: Boolean(r.pinned),
    createdAt: toDate(r.created_at),
    updatedAt: toDate(r.updated_at),
    contributionCount: toInt(r.contribution_count),
    upvotes: toInt(r.upvotes),
    lastActivityAt: toDate(r.last_activity_at) ?? toDate(r.created_at),
    viewerUpvoted: Boolean(r.viewer_upvoted),
  };
}

function mapContribution(r: RawContribution): ContributionWithCounts {
  const kind: ContributionKind =
    r.kind === "file" || r.kind === "text" ? r.kind : "link";
  return {
    id: r.id,
    boardId: r.board_id,
    authorSignupId: r.author_signup_id,
    authorClerkId: r.author_clerk_id,
    kind,
    title: r.title,
    url: r.url,
    filePath: r.file_path,
    fileName: r.file_name,
    body: r.body,
    pinned: r.pinned_at != null,
    createdAt: toDate(r.created_at),
    upvotes: toInt(r.upvotes),
    viewerUpvoted: Boolean(r.viewer_upvoted),
  };
}

// ---------------------------------------------------------------------------
// Boards — create / list / get
// ---------------------------------------------------------------------------

export type CreateBoardInput = {
  authorSignupId: string;
  authorClerkId?: string | null;
  title: string;
  description?: string | null;
  tags: string[];
};

export async function createBoard(input: CreateBoardInput): Promise<BoardRow> {
  await ensureBoardsTables();
  const rows = (await getSql()`
    INSERT INTO resource_boards (title, description, author_signup_id, author_clerk_id, tags)
    VALUES (
      ${input.title},
      ${input.description ?? null},
      ${input.authorSignupId},
      ${input.authorClerkId ?? null},
      ${input.tags}::text[]
    )
    RETURNING *
  `) as unknown as RawBoard[];
  const r = rows[0]!;
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    authorSignupId: r.author_signup_id,
    authorClerkId: r.author_clerk_id,
    tags: r.tags ?? [],
    pinned: Boolean(r.pinned),
    createdAt: toDate(r.created_at),
    updatedAt: toDate(r.updated_at),
  };
}

// List boards with aggregate counts + the viewer's upvote state. Ordering is
// applied in the data layer for "new"/"top"; "hot" is computed by the pure
// ranker (lib/resources-label.sortBoards) over this enriched list, so we always
// return the full set here (the library is small) and let the action sort it.
// `viewerSignupId` powers the per-row viewerUpvoted flag.
export async function listBoards(opts: {
  viewerSignupId: string;
  tags?: string[];
  limit?: number;
}): Promise<BoardWithCounts[]> {
  await ensureBoardsTables();
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const filterTags = (opts.tags ?? []).filter((t) => typeof t === "string" && t.length > 0);
  const rows = (
    filterTags.length > 0
      ? await getSql()`
          SELECT b.*,
            (SELECT count(*)::int FROM board_contributions c WHERE c.board_id = b.id) AS contribution_count,
            (SELECT count(*)::int FROM board_upvotes u WHERE u.board_id = b.id) AS upvotes,
            (SELECT max(c.created_at) FROM board_contributions c WHERE c.board_id = b.id) AS last_activity_at,
            EXISTS (SELECT 1 FROM board_upvotes u WHERE u.board_id = b.id AND u.signup_id = ${opts.viewerSignupId}) AS viewer_upvoted
          FROM resource_boards b
          WHERE b.tags @> ${filterTags}::text[]
          ORDER BY b.pinned DESC, b.created_at DESC
          LIMIT ${limit}
        `
      : await getSql()`
          SELECT b.*,
            (SELECT count(*)::int FROM board_contributions c WHERE c.board_id = b.id) AS contribution_count,
            (SELECT count(*)::int FROM board_upvotes u WHERE u.board_id = b.id) AS upvotes,
            (SELECT max(c.created_at) FROM board_contributions c WHERE c.board_id = b.id) AS last_activity_at,
            EXISTS (SELECT 1 FROM board_upvotes u WHERE u.board_id = b.id AND u.signup_id = ${opts.viewerSignupId}) AS viewer_upvoted
          FROM resource_boards b
          ORDER BY b.pinned DESC, b.created_at DESC
          LIMIT ${limit}
        `
  ) as unknown as RawBoard[];
  return rows.map(mapBoard);
}

export async function getBoard(opts: {
  id: string;
  viewerSignupId: string;
}): Promise<BoardWithCounts | null> {
  await ensureBoardsTables();
  const rows = (await getSql()`
    SELECT b.*,
      (SELECT count(*)::int FROM board_contributions c WHERE c.board_id = b.id) AS contribution_count,
      (SELECT count(*)::int FROM board_upvotes u WHERE u.board_id = b.id) AS upvotes,
      (SELECT max(c.created_at) FROM board_contributions c WHERE c.board_id = b.id) AS last_activity_at,
      EXISTS (SELECT 1 FROM board_upvotes u WHERE u.board_id = b.id AND u.signup_id = ${opts.viewerSignupId}) AS viewer_upvoted
    FROM resource_boards b
    WHERE b.id = ${opts.id}
    LIMIT 1
  `) as unknown as RawBoard[];
  return rows[0] ? mapBoard(rows[0]) : null;
}

// The set of all distinct board tags currently in use, with how many boards
// carry each — powers the filter chip strip (most-used first, then alphabetical).
export async function listBoardTags(): Promise<Array<{ tag: string; count: number }>> {
  if (!hasDatabase()) return [];
  await ensureBoardsTables();
  const rows = (await getSql()`
    SELECT tag, count(*)::int AS count
    FROM resource_boards, unnest(tags) AS tag
    GROUP BY tag
    ORDER BY count DESC, tag ASC
  `) as unknown as Array<{ tag: string; count: number }>;
  return rows.map((r) => ({ tag: r.tag, count: r.count }));
}

// Delete a board — SCOPED to the owner (someone else's board matches 0 rows →
// no-op). Cascades remove its contributions + upvotes + followers.
export async function deleteBoard(input: {
  id: string;
  authorSignupId: string;
}): Promise<boolean> {
  await ensureBoardsTables();
  const rows = (await getSql()`
    DELETE FROM resource_boards
    WHERE id = ${input.id} AND author_signup_id = ${input.authorSignupId}
    RETURNING id
  `) as unknown as { id: string }[];
  return rows.length > 0;
}

// Update a board — SCOPED to the owner (WHERE id AND author_signup_id, so
// someone else's board matches 0 rows → returns null, no write). Bumps
// updated_at so "hot" reflects the edit. Tags are replaced wholesale with the
// caller-sanitized list.
export async function updateBoard(input: {
  id: string;
  authorSignupId: string;
  title: string;
  description: string | null;
  tags: string[];
}): Promise<BoardRow | null> {
  await ensureBoardsTables();
  const rows = (await getSql()`
    UPDATE resource_boards
    SET title = ${input.title},
        description = ${input.description},
        tags = ${input.tags}::text[],
        updated_at = now()
    WHERE id = ${input.id} AND author_signup_id = ${input.authorSignupId}
    RETURNING *
  `) as unknown as RawBoard[];
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    authorSignupId: r.author_signup_id,
    authorClerkId: r.author_clerk_id,
    tags: r.tags ?? [],
    pinned: Boolean(r.pinned),
    createdAt: toDate(r.created_at),
    updatedAt: toDate(r.updated_at),
  };
}

export async function countBoardsByAuthorSince(
  authorSignupId: string,
  sinceMs: number,
): Promise<number> {
  await ensureBoardsTables();
  const since = new Date(sinceMs).toISOString();
  const rows = (await getSql()`
    SELECT count(*)::int AS c FROM resource_boards
    WHERE author_signup_id = ${authorSignupId} AND created_at >= ${since}
  `) as unknown as { c: number }[];
  return rows[0]?.c ?? 0;
}

// ---------------------------------------------------------------------------
// Contributions — list / create / delete
// ---------------------------------------------------------------------------

export type CreateContributionInput = {
  boardId: string;
  authorSignupId: string;
  authorClerkId?: string | null;
  kind: ContributionKind;
  title: string;
  url?: string | null;
  filePath?: string | null;
  fileName?: string | null;
  body?: string | null;
};

export async function createContribution(
  input: CreateContributionInput,
): Promise<ContributionRow> {
  await ensureBoardsTables();
  const rows = (await getSql()`
    INSERT INTO board_contributions
      (board_id, author_signup_id, author_clerk_id, kind, title, url, file_path, file_name, body)
    VALUES (
      ${input.boardId},
      ${input.authorSignupId},
      ${input.authorClerkId ?? null},
      ${input.kind},
      ${input.title},
      ${input.url ?? null},
      ${input.filePath ?? null},
      ${input.fileName ?? null},
      ${input.body ?? null}
    )
    RETURNING *
  `) as unknown as RawContribution[];
  // Bump the board's updated_at so "hot" reflects fresh activity.
  await getSql()`UPDATE resource_boards SET updated_at = now() WHERE id = ${input.boardId}`;
  const r = rows[0]!;
  return mapContribution(r);
}

// List a board's contributions with upvote counts + the viewer's vote state.
// Ordering: PINNED contributions first, in the order they were pinned
// (pinned_at ASC — earliest-pinned at the very top); then UNPINNED by the
// Reddit-thread rule (upvotes desc, then recency). The `pinned_at IS NULL`
// primary sort key keeps every pinned row ahead of every unpinned one.
export async function listContributions(opts: {
  boardId: string;
  viewerSignupId: string;
}): Promise<ContributionWithCounts[]> {
  await ensureBoardsTables();
  const rows = (await getSql()`
    SELECT c.*,
      (SELECT count(*)::int FROM contribution_upvotes u WHERE u.contribution_id = c.id) AS upvotes,
      EXISTS (
        SELECT 1 FROM contribution_upvotes u
        WHERE u.contribution_id = c.id AND u.signup_id = ${opts.viewerSignupId}
      ) AS viewer_upvoted
    FROM board_contributions c
    WHERE c.board_id = ${opts.boardId}
    ORDER BY
      (c.pinned_at IS NULL),
      c.pinned_at ASC,
      upvotes DESC,
      c.created_at DESC
  `) as unknown as RawContribution[];
  return rows.map(mapContribution);
}

// The board id a contribution belongs to (for revalidation / authz context).
export async function getContributionBoardId(id: string): Promise<string | null> {
  await ensureBoardsTables();
  const rows = (await getSql()`
    SELECT board_id FROM board_contributions WHERE id = ${id} LIMIT 1
  `) as unknown as { board_id: string }[];
  return rows[0]?.board_id ?? null;
}

export async function deleteContribution(input: {
  id: string;
  authorSignupId: string;
}): Promise<boolean> {
  await ensureBoardsTables();
  const rows = (await getSql()`
    DELETE FROM board_contributions
    WHERE id = ${input.id} AND author_signup_id = ${input.authorSignupId}
    RETURNING id
  `) as unknown as { id: string }[];
  return rows.length > 0;
}

// Pin or unpin a contribution. Authorization (board owner) lives in the server
// action — this is pure DB. `boardId` is included in the WHERE as a safety belt
// so a stale/forged contributionId can't pin a row on a different board. Pin
// sets pinned_at = now() (recording the pin order); unpin clears it to NULL.
export async function setContributionPinned(input: {
  contributionId: string;
  boardId: string;
  pinned: boolean;
}): Promise<boolean> {
  await ensureBoardsTables();
  // `now()` must be real SQL, not a bound param — passing the string "now()" and
  // casting it (`'now()'::timestamptz`) throws "invalid input syntax". Branch the
  // statement so pin uses the SQL now() function and unpin sets NULL directly.
  const rows = (await (input.pinned
    ? getSql()`
        UPDATE board_contributions
        SET pinned_at = now()
        WHERE id = ${input.contributionId} AND board_id = ${input.boardId}
        RETURNING id
      `
    : getSql()`
        UPDATE board_contributions
        SET pinned_at = NULL
        WHERE id = ${input.contributionId} AND board_id = ${input.boardId}
        RETURNING id
      `)) as unknown as { id: string }[];
  return rows.length > 0;
}

// Update a contribution — SCOPED to the author (WHERE id AND author_signup_id →
// someone else's row matches 0 rows → returns null). The kind is FIXED at create
// time; only the kind-relevant editable field changes here:
//   • title  — always editable
//   • link   — url
//   • text   — body
//   • file   — title only (uploads are NOT re-handled on edit; file_path stays)
// Callers pass already-validated values. Bumps the board's updated_at.
export async function updateContribution(input: {
  id: string;
  authorSignupId: string;
  title: string;
  url?: string | null;
  body?: string | null;
}): Promise<ContributionRow | null> {
  await ensureBoardsTables();
  const rows = (await getSql()`
    UPDATE board_contributions
    SET title = ${input.title},
        url = CASE WHEN kind = 'link' THEN ${input.url ?? null} ELSE url END,
        body = CASE WHEN kind = 'text' THEN ${input.body ?? null} ELSE body END
    WHERE id = ${input.id} AND author_signup_id = ${input.authorSignupId}
    RETURNING *
  `) as unknown as RawContribution[];
  const r = rows[0];
  if (!r) return null;
  // Bump the owning board's updated_at so "hot" reflects the edit.
  await getSql()`UPDATE resource_boards SET updated_at = now() WHERE id = ${r.board_id}`;
  return mapContribution(r);
}

export async function countContributionsByAuthorSince(
  authorSignupId: string,
  sinceMs: number,
): Promise<number> {
  await ensureBoardsTables();
  const since = new Date(sinceMs).toISOString();
  const rows = (await getSql()`
    SELECT count(*)::int AS c FROM board_contributions
    WHERE author_signup_id = ${authorSignupId} AND created_at >= ${since}
  `) as unknown as { c: number }[];
  return rows[0]?.c ?? 0;
}

// ---------------------------------------------------------------------------
// Upvotes — toggle (idempotent insert/delete), one per member per target
// ---------------------------------------------------------------------------

// Toggle a board upvote for a member. Returns the resulting state + fresh count.
// The UNIQUE PK (board_id, signup_id) makes a double-upvote a no-op insert.
export async function toggleBoardUpvote(input: {
  boardId: string;
  signupId: string;
}): Promise<{ upvoted: boolean; count: number }> {
  await ensureBoardsTables();
  const existing = (await getSql()`
    SELECT 1 FROM board_upvotes WHERE board_id = ${input.boardId} AND signup_id = ${input.signupId} LIMIT 1
  `) as unknown as unknown[];
  let upvoted: boolean;
  if (existing.length > 0) {
    await getSql()`
      DELETE FROM board_upvotes WHERE board_id = ${input.boardId} AND signup_id = ${input.signupId}
    `;
    upvoted = false;
  } else {
    await getSql()`
      INSERT INTO board_upvotes (board_id, signup_id) VALUES (${input.boardId}, ${input.signupId})
      ON CONFLICT (board_id, signup_id) DO NOTHING
    `;
    upvoted = true;
  }
  const rows = (await getSql()`
    SELECT count(*)::int AS c FROM board_upvotes WHERE board_id = ${input.boardId}
  `) as unknown as { c: number }[];
  return { upvoted, count: rows[0]?.c ?? 0 };
}

export async function toggleContributionUpvote(input: {
  contributionId: string;
  signupId: string;
}): Promise<{ upvoted: boolean; count: number }> {
  await ensureBoardsTables();
  const existing = (await getSql()`
    SELECT 1 FROM contribution_upvotes
    WHERE contribution_id = ${input.contributionId} AND signup_id = ${input.signupId} LIMIT 1
  `) as unknown as unknown[];
  let upvoted: boolean;
  if (existing.length > 0) {
    await getSql()`
      DELETE FROM contribution_upvotes
      WHERE contribution_id = ${input.contributionId} AND signup_id = ${input.signupId}
    `;
    upvoted = false;
  } else {
    await getSql()`
      INSERT INTO contribution_upvotes (contribution_id, signup_id)
      VALUES (${input.contributionId}, ${input.signupId})
      ON CONFLICT (contribution_id, signup_id) DO NOTHING
    `;
    upvoted = true;
  }
  const rows = (await getSql()`
    SELECT count(*)::int AS c FROM contribution_upvotes WHERE contribution_id = ${input.contributionId}
  `) as unknown as { c: number }[];
  return { upvoted, count: rows[0]?.c ?? 0 };
}

// ---------------------------------------------------------------------------
// Board followers — for "notify me on new contributions"
// ---------------------------------------------------------------------------

export async function toggleBoardFollow(input: {
  boardId: string;
  signupId: string;
}): Promise<{ following: boolean }> {
  await ensureBoardsTables();
  const existing = (await getSql()`
    SELECT 1 FROM board_followers WHERE board_id = ${input.boardId} AND signup_id = ${input.signupId} LIMIT 1
  `) as unknown as unknown[];
  if (existing.length > 0) {
    await getSql()`
      DELETE FROM board_followers WHERE board_id = ${input.boardId} AND signup_id = ${input.signupId}
    `;
    return { following: false };
  }
  await getSql()`
    INSERT INTO board_followers (board_id, signup_id) VALUES (${input.boardId}, ${input.signupId})
    ON CONFLICT (board_id, signup_id) DO NOTHING
  `;
  return { following: true };
}

export async function isFollowingBoard(input: {
  boardId: string;
  signupId: string;
}): Promise<boolean> {
  await ensureBoardsTables();
  const rows = (await getSql()`
    SELECT 1 FROM board_followers WHERE board_id = ${input.boardId} AND signup_id = ${input.signupId} LIMIT 1
  `) as unknown as unknown[];
  return rows.length > 0;
}

// The signup ids following a board EXCEPT one (the actor) — recipients for a
// "new contribution" notification. Excludes the contributor themselves.
export async function listBoardFollowerIds(input: {
  boardId: string;
  excludeSignupId?: string;
}): Promise<string[]> {
  await ensureBoardsTables();
  const rows = (await getSql()`
    SELECT signup_id FROM board_followers
    WHERE board_id = ${input.boardId}
      AND (${input.excludeSignupId ?? null}::uuid IS NULL OR signup_id <> ${input.excludeSignupId ?? null}::uuid)
  `) as unknown as { signup_id: string }[];
  return rows.map((r) => r.signup_id);
}
