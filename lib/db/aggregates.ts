import { getSql, hasDatabase } from "./index";

// The signup tables (`signups` / `children`) are built by a separate, in-flight
// feature. Until they land, every aggregate degrades gracefully to zeros +
// `database: "pending"` (HTTP 200, never 500) so the API ships independently.
//
// All outputs are aggregate COUNTS only — never individual rows or PII.
//
// FILTERING (E1): callers may pass a `Filters` object to scope the population.
// To stop filtering from being a de-anonymization tool on a small community, any
// *filtered* result obeys k-anonymity: totals/buckets below K_ANON are suppressed
// (null / omitted). Unfiltered calls are unchanged (backwards compatible).

type CountMap = Record<string, number>;
export type DbState = "ready" | "pending";

// Filtered results never reveal a subpopulation smaller than this.
export const K_ANON = 5;

async function tableExists(name: string): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql`SELECT to_regclass(${"public." + name}) IS NOT NULL AS present`) as Array<{
    present: boolean;
  }>;
  return Boolean(rows[0]?.present);
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export type Filters = {
  state?: string;
  affiliation?: string;
  tech_depth?: string;
  time_commitment?: string;
  skillset?: string;
  grade?: string;
  builder_interest?: string;
};

export function hasFilters(f: Filters): boolean {
  return Object.values(f).some((v) => v != null && v !== "");
}

// Parameterized predicate fragments against the `signups` table (alias-free).
// Returns positional `$1..$n` conditions plus their params, reusable across
// every breakdown query (same filter → same param order).
function signupConds(f: Filters): { conds: string[]; params: unknown[] } {
  const conds: string[] = [];
  const params: unknown[] = [];
  const add = (frag: (i: number) => string, val: unknown) => {
    params.push(val);
    conds.push(frag(params.length));
  };
  if (f.state) add((i) => `state = $${i}`, f.state);
  if (f.affiliation) add((i) => `ohs_affiliation = $${i}`, f.affiliation);
  if (f.tech_depth) add((i) => `technical_depth = $${i}`, f.tech_depth);
  if (f.time_commitment) add((i) => `time_commitment = $${i}`, f.time_commitment);
  if (f.skillset) add((i) => `$${i} = ANY(skillsets)`, f.skillset);
  if (f.builder_interest) add((i) => `extra->>'builderInterest' = $${i}`, f.builder_interest);
  // Children are shared across a family, so "has a child in grade X" keys on family.
  if (f.grade)
    add(
      (i) => `EXISTS (SELECT 1 FROM children c WHERE c.family_id = signups.family_id AND c.grade = $${i})`,
      f.grade,
    );
  return { conds, params };
}

// Compose a WHERE clause from always-on base conditions + filter conditions.
function whereClause(base: string[], filterConds: string[]): string {
  const all = [...base, ...filterConds];
  return all.length ? `WHERE ${all.join(" AND ")}` : "";
}

// Scope a children query to the filtered family population (or "" when no
// filters). Children are shared across a family, so we key on family_id.
function childScope(filterConds: string[]): string {
  if (filterConds.length === 0) return "";
  return `family_id IN (SELECT family_id FROM signups WHERE ${filterConds.join(" AND ")})`;
}

// Build a CountMap from {k,c} rows, dropping sub-threshold buckets when suppressing.
function toCountMap(rows: Array<{ k: string | null; c: number }>, suppress: boolean): CountMap {
  const out: CountMap = {};
  for (const { k, c } of rows) {
    if (k === null || k === "") continue;
    if (suppress && c < K_ANON) continue;
    out[k] = c;
  }
  return out;
}

async function safeQuery<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export type Stats = {
  total_signups: number | null;
  total_families: number | null;
  total_children: number | null;
  updated_at: string;
  database: DbState;
  filters?: Filters;
  suppressed?: boolean;
};

export async function getStats(filters: Filters = {}): Promise<Stats> {
  const updated_at = new Date().toISOString();
  const filtered = hasFilters(filters);
  if (!hasDatabase() || !(await tableExists("signups"))) {
    return {
      total_signups: 0,
      total_families: 0,
      total_children: 0,
      updated_at,
      database: "pending",
      ...(filtered ? { filters, suppressed: false } : {}),
    };
  }
  const sql = getSql();
  const { conds, params } = signupConds(filters);
  const where = whereClause([], conds);

  // Each parent is a signup row; a family groups one or more parents.
  const sRows = (await sql.query(
    `SELECT count(*)::int AS c FROM signups ${where}`,
    params,
  )) as Array<{ c: number }>;
  const signups = sRows[0]?.c ?? 0;

  // Distinct families (falls back to the signup count on a pre-families schema).
  const families = await safeQuery(async () => {
    const rows = (await sql.query(
      `SELECT count(DISTINCT family_id)::int AS c FROM signups ${where}`,
      params,
    )) as Array<{ c: number }>;
    return rows[0]?.c ?? signups;
  }, signups);

  let children = 0;
  if (await tableExists("children")) {
    const scope = childScope(conds);
    children = await safeQuery(async () => {
      const rows = (await sql.query(
        `SELECT count(*)::int AS c FROM children ${scope ? `WHERE ${scope}` : ""}`,
        params,
      )) as Array<{ c: number }>;
      return rows[0]?.c ?? 0;
    }, 0);
  }

  // Suppress on the family count — the smallest identifiable unit.
  const suppress = filtered && families < K_ANON;
  return {
    total_signups: suppress ? null : signups,
    total_families: suppress ? null : families,
    total_children: suppress ? null : children,
    updated_at,
    database: "ready",
    ...(filtered ? { filters, suppressed: suppress } : {}),
  };
}

// ---------------------------------------------------------------------------
// Breakdowns
// ---------------------------------------------------------------------------

export type Breakdowns = {
  signups_by_state: CountMap;
  signups_by_affiliation: CountMap;
  signups_by_tech_depth: CountMap;
  signups_by_time_commitment: CountMap;
  signups_by_skillset: CountMap;
  signups_by_builder_interest: CountMap;
  signups_by_grade: CountMap;
  skillsets_by_tech_depth: Record<string, CountMap>;
  top_interests: Array<{ interest: string; count: number }>;
  updated_at: string;
  database: DbState;
  filters?: Filters;
  suppressed_below?: number;
};

export async function getBreakdowns(filters: Filters = {}): Promise<Breakdowns> {
  const updated_at = new Date().toISOString();
  const filtered = hasFilters(filters);
  const empty: Breakdowns = {
    signups_by_state: {},
    signups_by_affiliation: {},
    signups_by_tech_depth: {},
    signups_by_time_commitment: {},
    signups_by_skillset: {},
    signups_by_builder_interest: {},
    signups_by_grade: {},
    skillsets_by_tech_depth: {},
    top_interests: [],
    updated_at,
    database: "pending",
    ...(filtered ? { filters, suppressed_below: K_ANON } : {}),
  };
  if (!hasDatabase() || !(await tableExists("signups"))) return empty;

  const sql = getSql();
  const hasChildren = await tableExists("children");
  const { conds, params } = signupConds(filters);
  const suppress = filtered;

  const countMap = (base: string[], col: string, from = "signups") =>
    safeQuery(async () => {
      const rows = (await sql.query(
        `SELECT ${col} AS k, count(*)::int AS c FROM ${from} ${whereClause(base, conds)} GROUP BY ${col}`,
        params,
      )) as Array<{ k: string | null; c: number }>;
      return toCountMap(rows, suppress);
    }, {} as CountMap);

  const [
    signups_by_state,
    signups_by_affiliation,
    signups_by_tech_depth,
    signups_by_time_commitment,
    signups_by_skillset,
    signups_by_builder_interest,
  ] = await Promise.all([
    countMap(["state IS NOT NULL"], "state"),
    countMap(["ohs_affiliation IS NOT NULL"], "ohs_affiliation"),
    countMap(["technical_depth IS NOT NULL"], "technical_depth"),
    countMap(["time_commitment IS NOT NULL"], "time_commitment"),
    // unnest array into a derived column, then count
    safeQuery(async () => {
      const rows = (await sql.query(
        `SELECT skill AS k, count(*)::int AS c FROM signups, unnest(skillsets) AS skill ${whereClause([], conds)} GROUP BY skill`,
        params,
      )) as Array<{ k: string | null; c: number }>;
      return toCountMap(rows, suppress);
    }, {} as CountMap),
    // Builder interest lives in signups.extra (JSONB).
    countMap(["extra->>'builderInterest' IS NOT NULL"], "extra->>'builderInterest'"),
  ]);

  // Grade lives on children — scope to the filtered signups when filtering.
  const signups_by_grade = hasChildren
    ? await safeQuery(async () => {
        const scope = childScope(conds);
        const where = whereClause(["grade IS NOT NULL", ...(scope ? [scope] : [])], []);
        const rows = (await sql.query(
          `SELECT grade AS k, count(*)::int AS c FROM children ch ${where} GROUP BY grade`,
          params,
        )) as Array<{ k: string | null; c: number }>;
        return toCountMap(rows, suppress);
      }, {} as CountMap)
    : {};

  // Cross-tab: skillset distribution within each technical-depth tier.
  const skillsets_by_tech_depth = await safeQuery(async () => {
    const rows = (await sql.query(
      `SELECT technical_depth AS td, skill AS sk, count(*)::int AS c
       FROM signups, unnest(skillsets) AS skill
       ${whereClause(["technical_depth IS NOT NULL"], conds)}
       GROUP BY td, sk`,
      params,
    )) as Array<{ td: string | null; sk: string | null; c: number }>;
    const out: Record<string, CountMap> = {};
    for (const { td, sk, c } of rows) {
      if (!td || !sk) continue;
      if (suppress && c < K_ANON) continue;
      (out[td] ??= {})[sk] = c;
    }
    return out;
  }, {} as Record<string, CountMap>);

  const top_interests = await safeQuery(async () => {
    const scope = childScope(conds);
    const childUnion = hasChildren
      ? `UNION ALL SELECT unnest(interests) AS interest FROM children ${scope ? `WHERE ${scope}` : ""}`
      : "";
    const rows = (await sql.query(
      `SELECT interest AS k, count(*)::int AS c FROM (
         SELECT unnest(parent_interests) AS interest FROM signups ${whereClause([], conds)}
         ${childUnion}
       ) t
       WHERE interest IS NOT NULL AND interest <> ''
       GROUP BY interest
       ORDER BY c DESC, interest ASC
       LIMIT 25`,
      params,
    )) as Array<{ k: string | null; c: number }>;
    return rows
      .filter((r) => r.k !== null && !(suppress && r.c < K_ANON))
      .map((r) => ({ interest: r.k as string, count: r.c }));
  }, [] as Array<{ interest: string; count: number }>);

  return {
    signups_by_state,
    signups_by_affiliation,
    signups_by_tech_depth,
    signups_by_time_commitment,
    signups_by_skillset,
    signups_by_builder_interest,
    signups_by_grade,
    skillsets_by_tech_depth,
    top_interests,
    updated_at,
    database: "ready",
    ...(filtered ? { filters, suppressed_below: K_ANON } : {}),
  };
}

// ---------------------------------------------------------------------------
// Interests pool (used by /options)
// ---------------------------------------------------------------------------

export async function getInterestsPool(): Promise<string[]> {
  if (!hasDatabase() || !(await tableExists("signups"))) return [];
  const sql = getSql();
  const hasChildren = await tableExists("children");
  return safeQuery(async () => {
    const rows = (await sql.query(
      `SELECT DISTINCT i AS interest FROM (
         SELECT unnest(parent_interests) AS i FROM signups
         ${hasChildren ? "UNION ALL SELECT unnest(interests) FROM children" : ""}
       ) t
       WHERE i IS NOT NULL AND i <> ''
       ORDER BY interest`,
      [],
    )) as Array<{ interest: string }>;
    return rows.map((r) => r.interest);
  }, [] as string[]);
}

// ---------------------------------------------------------------------------
// Trends (E2) — signups over time
// ---------------------------------------------------------------------------

export type TrendInterval = "week" | "month";
export type TrendPoint = { period: string; signups: number; cumulative: number };
export type Trends = {
  interval: TrendInterval;
  points: TrendPoint[];
  updated_at: string;
  database: DbState;
};

export async function getTrends(interval: TrendInterval = "week"): Promise<Trends> {
  const updated_at = new Date().toISOString();
  if (!hasDatabase() || !(await tableExists("signups"))) {
    return { interval, points: [], updated_at, database: "pending" };
  }
  const sql = getSql();
  // `interval` is whitelisted to week|month before reaching SQL — safe to inline.
  const trunc = interval === "month" ? "month" : "week";
  const points = await safeQuery(async () => {
    const rows = (await sql.query(
      `SELECT to_char(date_trunc('${trunc}', created_at), 'YYYY-MM-DD') AS period, count(*)::int AS c
       FROM signups
       GROUP BY 1
       ORDER BY 1`,
      [],
    )) as Array<{ period: string; c: number }>;
    let cumulative = 0;
    return rows.map((r) => {
      cumulative += r.c;
      return { period: r.period, signups: r.c, cumulative };
    });
  }, [] as TrendPoint[]);
  return { interval, points, updated_at, database: "ready" };
}
