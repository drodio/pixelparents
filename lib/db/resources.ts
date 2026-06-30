import { getSql, hasDatabase } from "../db";

// ---------------------------------------------------------------------------
// Resources — the OHS community "living library" data layer.
//
// Any VERIFIED member can share a learning resource (a link + a short note) that
// students/parents should learn from; each resource is auto-labeled with topic
// tags (see lib/resources-label.ts) so the library is browsable + filterable by
// topic. This module is pure DB access — authorization lives in the server
// action (app/(authed)/resources/actions.ts), mirroring lib/db/asks.ts.
//
// DDL is intentionally SELF-CONTAINED here (its own memoized ensureResourcesTable)
// rather than added to the shared lib/db/ensure.ts — this app shares one Neon DB
// across in-flight features and a sibling `drizzle-kit push` could DROP a table
// it doesn't know about (the country-column P0 lesson). Every read/write calls
// ensureResourcesTable() first so a cold instance — or a table dropped out from
// under us — self-heals before it queries. Mirrors lib/db/reports.ts and
// lib/admin.ts's ensureAdminsTable. CREATE handles a dropped table; the ALTERs
// upgrade an older table in place. All statements are idempotent.
// ---------------------------------------------------------------------------

let ensured: Promise<void> | null = null;
export function ensureResourcesTable(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      const sql = getSql();
      await sql.transaction([
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
        // Idempotent upgrades for an older table shape.
        sql`ALTER TABLE resources ADD COLUMN IF NOT EXISTS author_clerk_id text`,
        sql`ALTER TABLE resources ADD COLUMN IF NOT EXISTS note text`,
        sql`ALTER TABLE resources ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'`,
        // Newest-first listing is the hot path.
        sql`CREATE INDEX IF NOT EXISTS resources_created_idx ON resources (created_at DESC)`,
        // GIN index makes tag filtering (tags @> ARRAY[...]) cheap.
        sql`CREATE INDEX IF NOT EXISTS resources_tags_gin_idx ON resources USING gin (tags)`,
      ]);
    })().catch((e) => {
      ensured = null;
      throw e;
    });
  }
  return ensured;
}

export type ResourceRow = {
  id: string;
  authorSignupId: string;
  authorClerkId: string | null;
  title: string;
  url: string;
  note: string | null;
  tags: string[];
  createdAt: Date | null;
};

// Map a raw snake_case DB row (Neon HTTP driver) to our camelCase shape. The
// neon driver returns a text[] column as a JS string array already.
type RawResourceRow = {
  id: string;
  author_signup_id: string;
  author_clerk_id: string | null;
  title: string;
  url: string;
  note: string | null;
  tags: string[] | null;
  created_at: string | null;
};

function mapRow(r: RawResourceRow): ResourceRow {
  return {
    id: r.id,
    authorSignupId: r.author_signup_id,
    authorClerkId: r.author_clerk_id,
    title: r.title,
    url: r.url,
    note: r.note,
    tags: r.tags ?? [],
    createdAt: r.created_at ? new Date(r.created_at) : null,
  };
}

export type CreateResourceInput = {
  authorSignupId: string;
  authorClerkId?: string | null;
  title: string;
  url: string;
  note?: string | null;
  tags: string[];
};

// Persist a new resource. Returns the inserted row. The text[] tags are passed
// as a JS array with an explicit ::text[] cast (the neon HTTP driver serializes
// it to a Postgres array literal — verified round-trip).
export async function createResource(input: CreateResourceInput): Promise<ResourceRow> {
  await ensureResourcesTable();
  const rows = (await getSql()`
    INSERT INTO resources (author_signup_id, author_clerk_id, title, url, note, tags)
    VALUES (
      ${input.authorSignupId},
      ${input.authorClerkId ?? null},
      ${input.title},
      ${input.url},
      ${input.note ?? null},
      ${input.tags}::text[]
    )
    RETURNING *
  `) as unknown as RawResourceRow[];
  return mapRow(rows[0]!);
}

// List resources newest-first. Optionally filter to resources carrying ALL of
// the given tags (tags @> ARRAY[...]). An empty/absent tag filter returns
// everything. Tag comparison is exact against the stored (lowercased) tags.
export async function listResources(
  opts: { tags?: string[]; limit?: number } = {},
): Promise<ResourceRow[]> {
  await ensureResourcesTable();
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const filterTags = (opts.tags ?? []).filter((t) => typeof t === "string" && t.length > 0);
  const rows = (
    filterTags.length > 0
      ? await getSql()`
          SELECT * FROM resources
          WHERE tags @> ${filterTags}::text[]
          ORDER BY created_at DESC
          LIMIT ${limit}
        `
      : await getSql()`
          SELECT * FROM resources
          ORDER BY created_at DESC
          LIMIT ${limit}
        `
  ) as unknown as RawResourceRow[];
  return rows.map(mapRow);
}

// The set of all distinct tags currently in use, with how many resources carry
// each — powers the filter chip strip (most-used first, then alphabetical).
export async function listResourceTags(): Promise<Array<{ tag: string; count: number }>> {
  if (!hasDatabase()) return [];
  await ensureResourcesTable();
  const rows = (await getSql()`
    SELECT tag, count(*)::int AS count
    FROM resources, unnest(tags) AS tag
    GROUP BY tag
    ORDER BY count DESC, tag ASC
  `) as unknown as Array<{ tag: string; count: number }>;
  return rows.map((r) => ({ tag: r.tag, count: r.count }));
}

// Count this author's resources created since `sinceMs` — for the per-author
// submission rate limit in the server action.
export async function countResourcesByAuthorSince(
  authorSignupId: string,
  sinceMs: number,
): Promise<number> {
  await ensureResourcesTable();
  const since = new Date(sinceMs).toISOString();
  const rows = (await getSql()`
    SELECT count(*)::int AS c
    FROM resources
    WHERE author_signup_id = ${authorSignupId} AND created_at >= ${since}
  `) as unknown as { c: number }[];
  return rows[0]?.c ?? 0;
}

// Delete a resource. SCOPED to the owner — a resource owned by someone else
// matches 0 rows and is a no-op (returns false). The scoped WHERE is the
// authorization, mirroring the asks pattern. Returns true iff a row was removed.
export async function deleteResource(input: {
  id: string;
  authorSignupId: string;
}): Promise<boolean> {
  await ensureResourcesTable();
  const rows = (await getSql()`
    DELETE FROM resources
    WHERE id = ${input.id} AND author_signup_id = ${input.authorSignupId}
    RETURNING id
  `) as unknown as { id: string }[];
  return rows.length > 0;
}
