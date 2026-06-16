import { getSql, hasDatabase } from "./index";

// The signup tables (`signups` / `children`) are built by a separate, in-flight
// feature. Until they land, every aggregate degrades gracefully to zeros +
// `database: "pending"` (HTTP 200, never 500) so the API ships independently.
// Individual breakdowns are additionally wrapped so a column that doesn't exist
// yet (schema still settling) returns an empty map rather than erroring the call.

type CountMap = Record<string, number>;
export type DbState = "ready" | "pending";

async function tableExists(name: string): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql`SELECT to_regclass(${"public." + name}) IS NOT NULL AS present`) as Array<{
    present: boolean;
  }>;
  return Boolean(rows[0]?.present);
}

async function safeCountMap(run: () => Promise<Array<{ k: string | null; c: number }>>): Promise<CountMap> {
  try {
    const rows = await run();
    const out: CountMap = {};
    for (const { k, c } of rows) {
      if (k !== null && k !== "") out[k] = c;
    }
    return out;
  } catch {
    return {};
  }
}

export type Stats = {
  total_signups: number;
  total_children: number;
  updated_at: string;
  database: DbState;
};

export async function getStats(): Promise<Stats> {
  const updated_at = new Date().toISOString();
  if (!hasDatabase() || !(await tableExists("signups"))) {
    return { total_signups: 0, total_children: 0, updated_at, database: "pending" };
  }
  const sql = getSql();
  const signupRows = (await sql`SELECT count(*)::int AS c FROM signups`) as Array<{ c: number }>;
  let total_children = 0;
  if (await tableExists("children")) {
    const childRows = (await sql`SELECT count(*)::int AS c FROM children`) as Array<{ c: number }>;
    total_children = childRows[0]?.c ?? 0;
  }
  return {
    total_signups: signupRows[0]?.c ?? 0,
    total_children,
    updated_at,
    database: "ready",
  };
}

// Distinct, sorted set of free-form interests across parents + children. Used by
// GET /api/v1/options alongside the static taxonomies. Defensive: empty until
// the signup tables exist.
export async function getInterestsPool(): Promise<string[]> {
  if (!hasDatabase() || !(await tableExists("signups"))) return [];
  const sql = getSql();
  const hasChildren = await tableExists("children");
  try {
    const rows = (hasChildren
      ? await sql`
          SELECT DISTINCT i AS interest FROM (
            SELECT unnest(parent_interests) AS i FROM signups
            UNION ALL
            SELECT unnest(interests) FROM children
          ) t
          WHERE i IS NOT NULL AND i <> ''
          ORDER BY interest`
      : await sql`
          SELECT DISTINCT i AS interest FROM (
            SELECT unnest(parent_interests) AS i FROM signups
          ) t
          WHERE i IS NOT NULL AND i <> ''
          ORDER BY interest`) as Array<{ interest: string }>;
    return rows.map((r) => r.interest);
  } catch {
    return [];
  }
}

export type Breakdowns = {
  signups_by_state: CountMap;
  signups_by_affiliation: CountMap;
  signups_by_tech_depth: CountMap;
  signups_by_skillset: CountMap;
  children_by_grade: CountMap;
  top_interests: Array<{ interest: string; count: number }>;
  updated_at: string;
  database: DbState;
};

export async function getBreakdowns(): Promise<Breakdowns> {
  const updated_at = new Date().toISOString();
  const empty: Breakdowns = {
    signups_by_state: {},
    signups_by_affiliation: {},
    signups_by_tech_depth: {},
    signups_by_skillset: {},
    children_by_grade: {},
    top_interests: [],
    updated_at,
    database: "pending",
  };
  if (!hasDatabase() || !(await tableExists("signups"))) return empty;

  const sql = getSql();
  const hasChildren = await tableExists("children");

  const [
    signups_by_state,
    signups_by_affiliation,
    signups_by_tech_depth,
    signups_by_skillset,
    children_by_grade,
    top_interests,
  ] = await Promise.all([
    safeCountMap(
      async () =>
        (await sql`SELECT state AS k, count(*)::int AS c FROM signups WHERE state IS NOT NULL GROUP BY state`) as Array<{
          k: string | null;
          c: number;
        }>,
    ),
    safeCountMap(
      async () =>
        (await sql`SELECT ohs_affiliation AS k, count(*)::int AS c FROM signups WHERE ohs_affiliation IS NOT NULL GROUP BY ohs_affiliation`) as Array<{
          k: string | null;
          c: number;
        }>,
    ),
    safeCountMap(
      async () =>
        (await sql`SELECT technical_depth AS k, count(*)::int AS c FROM signups WHERE technical_depth IS NOT NULL GROUP BY technical_depth`) as Array<{
          k: string | null;
          c: number;
        }>,
    ),
    safeCountMap(
      async () =>
        (await sql`SELECT skill AS k, count(*)::int AS c FROM signups, unnest(skillsets) AS skill GROUP BY skill`) as Array<{
          k: string | null;
          c: number;
        }>,
    ),
    hasChildren
      ? safeCountMap(
          async () =>
            (await sql`SELECT grade AS k, count(*)::int AS c FROM children WHERE grade IS NOT NULL GROUP BY grade`) as Array<{
              k: string | null;
              c: number;
            }>,
        )
      : Promise.resolve({} as CountMap),
    (async () => {
      try {
        const rows = (await sql`
          SELECT interest AS k, count(*)::int AS c
          FROM (
            SELECT unnest(parent_interests) AS interest FROM signups
            UNION ALL
            SELECT unnest(interests) AS interest FROM children
          ) t
          WHERE interest IS NOT NULL AND interest <> ''
          GROUP BY interest
          ORDER BY c DESC, interest ASC
          LIMIT 25
        `) as Array<{ k: string | null; c: number }>;
        return rows
          .filter((r) => r.k !== null)
          .map((r) => ({ interest: r.k as string, count: r.c }));
      } catch {
        return [] as Array<{ interest: string; count: number }>;
      }
    })(),
  ]);

  return {
    signups_by_state,
    signups_by_affiliation,
    signups_by_tech_depth,
    signups_by_skillset,
    children_by_grade,
    top_interests,
    updated_at,
    database: "ready",
  };
}
