# Leaderboard Faceted Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three role tabs + client-only text search with a faceted sidebar (Stage / Outcome / Capital raised / Team size / Badges / Role) backed by a single shared filter layer, so both the UI and the future `/api/v1/leaderboard` (Plan 3) compile the same filter to SQL.

**Architecture:** Add a `LeaderboardFilter` type, a `parseLeaderboardFilter(searchParams)` parser, and a `buildLeaderboardWhere(filter)` Drizzle condition-builder to `src/lib/leaderboard.ts`. Refactor `getLeaderboard(tab)` → `getLeaderboard(filter)`. Facets compile to a SQL `WHERE` ANDed onto the existing `baseWhere`; metric facets use the `profile->'extractedMetrics'->>'key'` JSONB pattern; badges reproduce `computeBadges()` predicates in SQL (option (a), the spec default). UI becomes a server component reading facet params into the filter, a desktop sidebar, and a mobile filter drawer.

**Tech Stack:** Next.js App Router (server components + `"use client"` islands), Drizzle ORM over Neon, Vitest. Filtering is server-side and URL-driven (shareable links).

**Semantics:** OR within a facet, AND across facets (standard faceted search).

This is Part 1 of `docs/superpowers/specs/2026-05-28-leaderboard-filtering-and-scoring-design.md`. **Depends on:** nothing (ships independently). **Plan 3 depends on this.**

---

### Task 1: Define `LeaderboardFilter` + stage/role constants

**Files:**
- Modify: `src/lib/leaderboard.ts` (add types near `LeaderboardTab`, line 53)
- Test: `tests/lib/leaderboard-filter.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/lib/leaderboard-filter.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { STAGE_VALUES, OUTCOME_VALUES, type LeaderboardFilter } from "@/lib/leaderboard";

describe("filter constants", () => {
  it("exposes the canonical stage enum (no n/a)", () => {
    expect(STAGE_VALUES).toEqual([
      "idea","pre-seed","seed","series-a","series-b","series-c+","growth","public","acquired",
    ]);
  });
  it("exposes the outcome facet keys", () => {
    expect(OUTCOME_VALUES).toEqual(["ipo","acquired","unicorn"]);
  });
  it("LeaderboardFilter type is constructible with all facets", () => {
    const f: LeaderboardFilter = {
      role: "both", sort: "combined", stages: ["seed"], outcomes: ["ipo"],
      badges: ["yc"], raisedMin: 50_000, raisedMax: null, teamMin: null,
      limit: 50, cursor: null,
    };
    expect(f.role).toBe("both");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- leaderboard-filter`
Expected: FAIL — exports don't exist.

- [ ] **Step 3: Implement the types/constants**

In `src/lib/leaderboard.ts`, after `export type LeaderboardTab` (line 53), add:

```ts
// Canonical company-stage facet values (the scoring enum minus "n/a").
export const STAGE_VALUES = [
  "idea","pre-seed","seed","series-a","series-b","series-c+","growth","public","acquired",
] as const;
export type StageValue = (typeof STAGE_VALUES)[number];

// Outcome/traction facet keys → map to extractedMetrics booleans in SQL.
export const OUTCOME_VALUES = ["ipo","acquired","unicorn"] as const;
export type OutcomeValue = (typeof OUTCOME_VALUES)[number];

export type LeaderboardRole = "founder" | "investor" | "both";

// The single source of truth for what's being filtered/sorted. Both the
// leaderboard server component and /api/v1/leaderboard build one of these and
// pass it to getLeaderboard(). OR within each array facet, AND across facets.
export type LeaderboardFilter = {
  role: LeaderboardRole;          // "both" === the old combined view
  sort: LeaderboardTab;           // founder | investor | combined
  stages: StageValue[];           // company_stage IN (...)
  outcomes: OutcomeValue[];       // OR of hadIpo/hadAcquisition/isUnicornFounder
  badges: string[];               // OR of badge predicates (see badge-sql.ts)
  raisedMin: number | null;       // totalRaisedUsd >= (USD)
  raisedMax: number | null;       // totalRaisedUsd <= (USD)
  teamMin: number | null;         // employeesCount >= (peak headcount)
  limit: number;                  // page size (UI uses 500; API clamps 1..100)
  cursor: LeaderboardCursor | null; // keyset pagination (Plan 3); UI passes null
};

// Keyset cursor on (orderCol, id). Decoded from an opaque string by Plan 3.
export type LeaderboardCursor = { score: number; id: string };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- leaderboard-filter`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/leaderboard.ts tests/lib/leaderboard-filter.test.ts
git commit -m "feat(leaderboard): add LeaderboardFilter type + facet constants"
```

---

### Task 2: `parseLeaderboardFilter(searchParams)`

Shared parser used by both UI and API. Accepts a `URLSearchParams` (or plain record) and returns a fully-defaulted `LeaderboardFilter`. Invalid values are dropped, not errored (lenient, like the rest of the API surface).

**Files:**
- Modify: `src/lib/leaderboard.ts`
- Test: `tests/lib/leaderboard-filter.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/lib/leaderboard-filter.test.ts`:

```ts
import { parseLeaderboardFilter } from "@/lib/leaderboard";

describe("parseLeaderboardFilter", () => {
  const parse = (q: string) => parseLeaderboardFilter(new URLSearchParams(q));

  it("defaults to role=both, sort=combined, empty facets", () => {
    const f = parse("");
    expect(f.role).toBe("both");
    expect(f.sort).toBe("combined");
    expect(f.stages).toEqual([]);
    expect(f.raisedMin).toBeNull();
    expect(f.limit).toBe(50);
  });

  it("parses csv facets and drops invalid members", () => {
    const f = parse("stage=seed,series-a,bogus&outcome=ipo,nope&badge=yc,partner");
    expect(f.stages).toEqual(["seed","series-a"]);
    expect(f.outcomes).toEqual(["ipo"]);
    expect(f.badges).toEqual(["yc","partner"]);
  });

  it("derives default sort from role when sort is absent", () => {
    expect(parse("role=founder").sort).toBe("founder");
    expect(parse("role=investor").sort).toBe("investor");
    expect(parse("role=both").sort).toBe("combined");
  });

  it("clamps limit to 1..100 and parses raised/team ints", () => {
    expect(parse("limit=999").limit).toBe(100);
    expect(parse("limit=0").limit).toBe(1);
    const f = parse("raised_min=1000000&raised_max=50000000&team_min=10");
    expect(f.raisedMin).toBe(1_000_000);
    expect(f.raisedMax).toBe(50_000_000);
    expect(f.teamMin).toBe(10);
  });

  it("ignores junk numeric params", () => {
    const f = parse("raised_min=abc&limit=xyz");
    expect(f.raisedMin).toBeNull();
    expect(f.limit).toBe(50);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- leaderboard-filter`
Expected: FAIL — `parseLeaderboardFilter` undefined.

- [ ] **Step 3: Implement the parser**

In `src/lib/leaderboard.ts`, add. (Cursor decoding is added in Plan 3; here `cursor` parses to `null`.)

```ts
const ROLE_TO_SORT: Record<LeaderboardRole, LeaderboardTab> = {
  founder: "founder", investor: "investor", both: "combined",
};

function csv(sp: URLSearchParams, key: string): string[] {
  const raw = sp.get(key);
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function intParam(sp: URLSearchParams, key: string): number | null {
  const raw = sp.get(key);
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export function parseLeaderboardFilter(sp: URLSearchParams): LeaderboardFilter {
  const role: LeaderboardRole =
    sp.get("role") === "founder" ? "founder"
    : sp.get("role") === "investor" ? "investor"
    : "both";

  const sortRaw = sp.get("sort");
  const sort: LeaderboardTab =
    sortRaw === "founder" || sortRaw === "investor" || sortRaw === "combined"
      ? sortRaw
      : ROLE_TO_SORT[role];

  const stages = csv(sp, "stage").filter((s): s is StageValue =>
    (STAGE_VALUES as readonly string[]).includes(s));
  const outcomes = csv(sp, "outcome").filter((o): o is OutcomeValue =>
    (OUTCOME_VALUES as readonly string[]).includes(o));
  const badges = csv(sp, "badge").filter((b) => BADGE_SQL_PREDICATES[b] != null);

  const limitRaw = intParam(sp, "limit");
  const limit = limitRaw == null ? 50 : Math.min(100, Math.max(1, limitRaw));

  return {
    role, sort, stages, outcomes, badges,
    raisedMin: intParam(sp, "raised_min"),
    raisedMax: intParam(sp, "raised_max"),
    teamMin: intParam(sp, "team_min"),
    limit,
    cursor: null,
  };
}
```

> `BADGE_SQL_PREDICATES` is defined in Task 3. Implement Task 3 in the same commit if the typecheck complains about the forward reference, or stub `const BADGE_SQL_PREDICATES: Record<string, unknown> = {}` first and fill it in Task 3.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- leaderboard-filter`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/leaderboard.ts tests/lib/leaderboard-filter.test.ts
git commit -m "feat(leaderboard): add parseLeaderboardFilter shared parser"
```

---

### Task 3: Badge → SQL predicate map (option (a))

Reproduce the JSONB-derivable `computeBadges()` predicates as Drizzle `SQL` fragments. Badges needing a join (`claimed`) or the `mmHits` array (`mm`) are **deferred** — `parseLeaderboardFilter` already drops badge ids not in this map, so the UI simply won't offer them as filters in V1.

**Files:**
- Create: `src/lib/leaderboard-badge-sql.ts`
- Test: `tests/lib/leaderboard-badge-sql.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/lib/leaderboard-badge-sql.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { BADGE_SQL_PREDICATES, FILTERABLE_BADGE_IDS } from "@/lib/leaderboard-badge-sql";

describe("badge SQL predicates", () => {
  it("covers the metrics-derived badges", () => {
    for (const id of ["yc","serial-founder","unicorn","ipo","acquired","exits",
                       "raised","employees","partner","angel","deployed","oss","wiki"]) {
      expect(BADGE_SQL_PREDICATES[id]).toBeDefined();
    }
  });
  it("does NOT include join/array-only badges in V1", () => {
    expect(BADGE_SQL_PREDICATES["claimed"]).toBeUndefined();
    expect(BADGE_SQL_PREDICATES["mm"]).toBeUndefined();
  });
  it("FILTERABLE_BADGE_IDS matches the predicate keys", () => {
    expect(new Set(FILTERABLE_BADGE_IDS)).toEqual(new Set(Object.keys(BADGE_SQL_PREDICATES)));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- leaderboard-badge-sql`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

Create `src/lib/leaderboard-badge-sql.ts`. Each predicate mirrors the matching `computeBadges()` rule (`src/lib/badges.ts`). `em` aliases the JSONB path.

```ts
import { sql, type SQL } from "drizzle-orm";

// JSONB accessor for a key under profile.extractedMetrics. Values are stored as
// JSON scalars, so cast at the call site (::bigint / ::int / ::boolean).
const em = (key: string) => sql.raw(`(profile->'extractedMetrics'->>'${key}')`);

// One SQL predicate per filterable badge id, mirroring computeBadges() in
// src/lib/badges.ts. OR-combined within the badge facet by buildLeaderboardWhere.
// Deferred (need a users join or the mmHits array): "claimed", "mm".
export const BADGE_SQL_PREDICATES: Record<string, SQL> = {
  yc:              sql`${em("ycBatch")} IS NOT NULL`,
  "serial-founder":sql`${em("companiesFounded")}::int >= 2`,
  unicorn:         sql`${em("isUnicornFounder")}::boolean = true`,
  ipo:             sql`${em("hadIpo")}::boolean = true`,
  acquired:        sql`${em("hadAcquisition")}::boolean = true`,
  exits:           sql`${em("exitCount")}::int >= 2`,
  raised:          sql`${em("totalRaisedUsd")}::bigint > 0`,
  employees:       sql`${em("employeesCount")}::int >= 10`,
  partner:         sql`${em("partnerAtFirm")} IS NOT NULL`,
  angel:           sql`${em("isAngelInvestor")}::boolean = true`,
  deployed:        sql`${em("totalDeployedUsd")}::bigint >= 1000000`,
  oss:             sql`${em("topGithubRepo")} IS NOT NULL AND ${em("topGithubRepoStars")}::int >= 1000`,
  wiki:            sql`${em("onWikipedia")}::boolean = true`,
};

export const FILTERABLE_BADGE_IDS = Object.keys(BADGE_SQL_PREDICATES);
```

Then in `src/lib/leaderboard.ts` import it and replace any stub:

```ts
import { BADGE_SQL_PREDICATES } from "./leaderboard-badge-sql";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- leaderboard-badge-sql`
Expected: PASS.

- [ ] **Step 5: Guard against JSONB-null cast errors**

`(... ->> 'k')::int` throws if the text is non-numeric, but `->>'missing'` yields SQL NULL and `NULL::int` is safe NULL. Booleans: `'true'::boolean` ok, NULL ok. No extra guard needed — but add a test asserting a missing-key row doesn't error by including an integration note (covered by Task 5's query test).

- [ ] **Step 6: Commit**

```bash
git add src/lib/leaderboard-badge-sql.ts src/lib/leaderboard.ts tests/lib/leaderboard-badge-sql.test.ts
git commit -m "feat(leaderboard): badge->SQL predicate map for facet filtering"
```

---

### Task 4: `buildLeaderboardWhere(filter)` — compile facets to SQL

Pure function returning a Drizzle condition (or `undefined`) for the facet portion, to be ANDed with `baseWhere`. Pure → unit-testable by inspecting the generated SQL.

**Files:**
- Modify: `src/lib/leaderboard.ts`
- Test: `tests/lib/leaderboard-where.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/lib/leaderboard-where.test.ts`. Drizzle `SQL` objects expose `.queryChunks`; assert via the compiled string using the project's `db` dialect is overkill — instead assert structural presence by serializing with a tiny helper. Simplest robust approach: assert the function returns `undefined` for an empty filter and a defined `SQL` when any facet is set.

```ts
import { describe, it, expect } from "vitest";
import { buildLeaderboardWhere, parseLeaderboardFilter } from "@/lib/leaderboard";

const f = (q: string) => parseLeaderboardFilter(new URLSearchParams(q));

describe("buildLeaderboardWhere", () => {
  it("returns undefined when no facet is active", () => {
    expect(buildLeaderboardWhere(f("role=both"))).toBeUndefined();
  });
  it("returns a condition when stage is set", () => {
    expect(buildLeaderboardWhere(f("stage=seed,series-a"))).toBeDefined();
  });
  it("returns a condition for outcome/raised/team/badge", () => {
    expect(buildLeaderboardWhere(f("outcome=ipo"))).toBeDefined();
    expect(buildLeaderboardWhere(f("raised_min=1000000"))).toBeDefined();
    expect(buildLeaderboardWhere(f("team_min=10"))).toBeDefined();
    expect(buildLeaderboardWhere(f("badge=yc,partner"))).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- leaderboard-where`
Expected: FAIL — `buildLeaderboardWhere` undefined.

- [ ] **Step 3: Implement**

In `src/lib/leaderboard.ts` (import `or`, `inArray` already present; ensure `or` is imported from `drizzle-orm`):

```ts
import { and, desc, eq, gt, gte, lte, inArray, isNull, ne, notLike, or, sql } from "drizzle-orm";
// ... existing imports ...
import { BADGE_SQL_PREDICATES } from "./leaderboard-badge-sql";

const emNum = (key: string) => sql`(profile->'extractedMetrics'->>${key})::bigint`;

// Compiles the facet portion of a filter into a single AND-of-facets condition.
// Within a facet the members are OR'd; across facets they're AND'd. Role is
// handled separately in getLeaderboard (it gates on score columns + sort).
export function buildLeaderboardWhere(filter: LeaderboardFilter): SQL | undefined {
  const facets: SQL[] = [];

  if (filter.stages.length > 0) {
    facets.push(inArray(evaluations.companyStage, filter.stages));
  }

  if (filter.outcomes.length > 0) {
    const parts = filter.outcomes.map((o) =>
      o === "ipo" ? sql`(profile->'extractedMetrics'->>'hadIpo')::boolean = true`
      : o === "acquired" ? sql`(profile->'extractedMetrics'->>'hadAcquisition')::boolean = true`
      : sql`(profile->'extractedMetrics'->>'isUnicornFounder')::boolean = true`);
    facets.push(or(...parts)!);
  }

  if (filter.raisedMin != null) facets.push(sql`${emNum("totalRaisedUsd")} >= ${filter.raisedMin}`);
  if (filter.raisedMax != null) facets.push(sql`${emNum("totalRaisedUsd")} <= ${filter.raisedMax}`);
  if (filter.teamMin != null)  facets.push(sql`(profile->'extractedMetrics'->>'employeesCount')::int >= ${filter.teamMin}`);

  if (filter.badges.length > 0) {
    const parts = filter.badges.map((b) => BADGE_SQL_PREDICATES[b]).filter(Boolean) as SQL[];
    if (parts.length > 0) facets.push(or(...parts)!);
  }

  if (facets.length === 0) return undefined;
  return and(...facets);
}
```

Add `import { ..., type SQL } from "drizzle-orm";`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- leaderboard-where`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/leaderboard.ts tests/lib/leaderboard-where.test.ts
git commit -m "feat(leaderboard): buildLeaderboardWhere compiles facets to SQL"
```

---

### Task 5: Refactor `getLeaderboard(tab)` → `getLeaderboard(filter)`

Change the signature to take a `LeaderboardFilter`, apply role/sort and the facet WHERE, keep the existing claim/badge enrichment. Preserve back-compat with a thin overload so the page can migrate in Task 6.

**Files:**
- Modify: `src/lib/leaderboard.ts:78-218`
- Test: `tests/lib/leaderboard-query.test.ts` (new, DB-backed like other `tests/app` DB tests — check `tests/setup.ts` for the test DB harness; if there is no test DB, assert query construction instead by extracting the WHERE assembly into a covered pure function, which Tasks 1-4 already do).

- [ ] **Step 1: Read the test harness**

Read `tests/setup.ts` and one DB-touching test (e.g. `tests/lib/profiles-scored.test.ts`) to see whether tests hit a real Neon test branch or mock `db`. Match that pattern. If DB tests are mocked/absent, rely on the pure-function coverage from Tasks 1-4 and add only a light smoke test that `getLeaderboard` accepts a filter and returns an array.

- [ ] **Step 2: Implement the signature change**

Replace `getLeaderboard(tab: LeaderboardTab)` (line 78) with:

```ts
export async function getLeaderboard(filter: LeaderboardFilter): Promise<LeaderboardRow[]> {
  const orderCol =
    filter.sort === "founder" ? evaluations.founderScore
    : filter.sort === "investor" ? evaluations.investorScore
    : evaluations.score;

  // Role gate: founder/investor roles require a positive score on that
  // dimension (mirrors the old per-tab behavior). "both" shows everyone.
  const roleGate =
    filter.role === "founder" ? gt(evaluations.founderScore, 0)
    : filter.role === "investor" ? gt(evaluations.investorScore, 0)
    : undefined;

  const facetWhere = buildLeaderboardWhere(filter);
  const cursorWhere = filter.cursor
    ? sql`(${orderCol} < ${filter.cursor.score} OR (${orderCol} = ${filter.cursor.score} AND ${evaluations.id} < ${filter.cursor.id}))`
    : undefined;

  const where = and(baseWhere, roleGate, facetWhere, cursorWhere);

  const rawRows = await db
    .select({ /* ...unchanged select list... */ })
    .from(evaluations)
    .where(where)
    .orderBy(desc(orderCol), desc(evaluations.id))
    .limit(filter.limit);
  // ... rest of the function (claim enrichment, badge overrides, .map) unchanged ...
}
```

Notes:
- `and(...)` ignores `undefined` args, so passing `roleGate`/`facetWhere`/`cursorWhere` as possibly-undefined is fine.
- **Tiebreaker changes from `createdAt` to `id`** so the keyset cursor (Plan 3) is stable and unique. The UI is unaffected (still deterministic).
- `limit` now comes from the filter. The page (Task 6) passes `limit: 500` to preserve today's "show up to 500" behavior; the API (Plan 3) passes 1..100.

- [ ] **Step 3: Update the only other caller in this file/repo**

`grep -rn "getLeaderboard(" src/` — currently only `src/app/(authed)/leaderboard/page.tsx`. Task 6 updates it. Also check `computePercentile` callers are untouched (separate function).

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test` and `npx tsc --noEmit`
Expected: the page won't compile yet (Task 6 fixes it) — if so, do Task 6 in the same commit. Otherwise PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/leaderboard.ts tests/
git commit -m "refactor(leaderboard): getLeaderboard takes a LeaderboardFilter"
```

---

### Task 6: Server component reads facets into the filter

**Files:**
- Modify: `src/app/(authed)/leaderboard/page.tsx`
- Test: manual (server component); covered by the parser/where unit tests.

- [ ] **Step 1: Implement**

Update `page.tsx` to read all facet params (not just `tab`/`e`) and build the filter. The page renders up to 500 rows; the sidebar does no client re-fetch — every facet change is a URL navigation (server re-query), matching today's tab behavior.

```tsx
import { parseLeaderboardFilter, getLeaderboard } from "@/lib/leaderboard";

export default async function LeaderboardPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  // Normalize to URLSearchParams for the shared parser.
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") usp.set(k, v);
  }
  const filter = { ...parseLeaderboardFilter(usp), limit: 500, cursor: null };
  const e = typeof sp.e === "string" ? sp.e : undefined;

  const [rows, viewer] = await Promise.all([
    getLeaderboard(filter),
    getCurrentViewerContext(),
  ]);

  return <LeaderboardClient rows={rows} filter={filter} e={e} viewer={viewer} />;
}
```

- [ ] **Step 2: Run app, smoke-test**

Run: `npm run dev`, open `/leaderboard`, `/leaderboard?role=founder`, `/leaderboard?stage=seed&outcome=ipo`. Expect filtered results and no crashes.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(authed)/leaderboard/page.tsx"
git commit -m "feat(leaderboard): page reads facet params into shared filter"
```

---

### Task 7: Faceted sidebar UI (desktop) + role facet replaces tabs

**Files:**
- Create: `src/components/LeaderboardFilters.tsx` (`"use client"`)
- Modify: `src/components/LeaderboardClient.tsx`
- Test: manual + a small render assertion if a component-test harness exists (check `tests/app` for any RTL usage; the repo is mostly logic tests — if no RTL, skip the render test and rely on manual verification).

- [ ] **Step 1: Build the filter sidebar component**

`LeaderboardFilters.tsx` renders the facet controls and pushes URL changes via `useRouter`/`useSearchParams`. Each control updates one searchParam and navigates; the server re-queries. Controls:
- **Role**: 3 radio-style segmented buttons (Founder / Investor / Both) → sets `role` (and clears `sort` so it defaults).
- **Stage**: checkbox list over `STAGE_VALUES` → sets csv `stage`.
- **Outcome**: checkbox list over `OUTCOME_VALUES` (IPO / Acquired / Unicorn) → csv `outcome`.
- **Capital raised**: range slider $50K → $1B+ → sets `raised_min` (and optional `raised_max`). Use a log-scaled slider; display formatted ($50K, $1M, $1B+).
- **Team size**: threshold select (Any / 10+ / 50+ / 200+ / 1000+) → `team_min`.
- **Badges**: checkbox list over `FILTERABLE_BADGE_IDS` with human labels from the badge catalog → csv `badge`.
- A **Clear all** link → navigates to `/leaderboard`.

Helper to mutate one param and navigate:

```tsx
"use client";
import { useRouter, useSearchParams } from "next/navigation";

function useFacetNav() {
  const router = useRouter();
  const sp = useSearchParams();
  return (mutate: (p: URLSearchParams) => void) => {
    const next = new URLSearchParams(sp.toString());
    mutate(next);
    router.push(`/leaderboard?${next.toString()}`);
  };
}
```

(Read `node_modules/next/dist/docs/` for the App Router `useRouter`/`useSearchParams` conventions in this Next version before writing — per AGENTS.md.)

- [ ] **Step 2: Wire into `LeaderboardClient`**

- Remove the three `<a>` tab links (lines ~45-64) — Role facet replaces them.
- Render `<LeaderboardFilters filter={filter} />` as a left column on desktop (`md:` grid: sidebar + results).
- Keep the client text-search input as a refinement layered on the server-filtered `rows` (it still filters the in-memory page).
- Pass the active `filter` down so controls render checked state.

- [ ] **Step 3: Run app, verify**

Run: `npm run dev`. Verify each facet narrows results, URL updates, links are shareable, and the active state reflects the URL.

- [ ] **Step 4: Commit**

```bash
git add src/components/LeaderboardFilters.tsx src/components/LeaderboardClient.tsx
git commit -m "feat(leaderboard): faceted sidebar; role facet replaces tabs"
```

---

### Task 8: Mobile filter drawer

**Files:**
- Modify: `src/components/LeaderboardClient.tsx`, `src/components/LeaderboardFilters.tsx`

- [ ] **Step 1: Implement**

On mobile (`< md`), hide the sidebar and render a **Filters** button that opens the same `<LeaderboardFilters>` in a slide-over drawer (overlay + close button + "Apply"/"Clear"). Reuse the same component; just change its container. A count badge on the button shows active-facet count.

- [ ] **Step 2: Verify on a narrow viewport**

Run: `npm run dev`, resize to mobile width, confirm the drawer opens, filters apply, and the results update.

- [ ] **Step 3: Commit**

```bash
git add src/components/LeaderboardClient.tsx src/components/LeaderboardFilters.tsx
git commit -m "feat(leaderboard): mobile filter drawer"
```

---

### Task 9: Index `company_stage` (+ optional GIN on profile)

**Files:**
- Modify: `src/db/schema.ts` (add index to the `evaluations` table definition)
- Create: migration via `npm run db:generate`

- [ ] **Step 1: Add the index in `schema.ts`**

In the `evaluations` `pgTable` index block (lines ~96-108), add:

```ts
  companyStageIdx: index("evaluations_company_stage_idx").on(t.companyStage),
```

(Match the existing `index(...)` import/usage style in the file.)

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate`
Expected: a new `drizzle/00NN_*.sql` adding the index. Review it.

- [ ] **Step 3: Note the GIN index as conditional**

Do NOT add a `profile` GIN index preemptively. Add a comment in the migration or PRD: "If JSONB facet filters are slow under load, add `CREATE INDEX ... USING gin (profile jsonb_path_ops);`." Leave it out until measured.

- [ ] **Step 4: Commit (do not auto-apply to prod DB)**

```bash
git add src/db/schema.ts drizzle/
git commit -m "perf(leaderboard): index company_stage for stage facet"
```

Applying the migration (`npm run db:push`) is an operator action against the live DB — do not run it automatically.

---

## Self-Review

- **Spec coverage:** faceted sidebar ✓ (T7), mobile drawer ✓ (T8), role facet replaces tabs ✓ (T7), Stage/Outcome/Capital/Badges/Role facets ✓ (T2-4,7) + Team size ✓ (per user decision; T2-4,7), shared `LeaderboardFilter` + `parseLeaderboardFilter` ✓ (T1-2), SQL WHERE over evaluations with base gate intact ✓ (T5), JSONB metric access ✓ (T3-4), badge SQL predicates (option a default) ✓ (T3), OR-within/AND-across semantics ✓ (T4), index company_stage ✓ (T9), GIN deferred-until-slow ✓ (T9).
- **Deferred (logged, not silently dropped):** `claimed`/`mm` badge facets (need join / mmHits array) — `parseLeaderboardFilter` drops them and the UI won't offer them; note in PRD. Industry/geo/founded-year facets remain fast-follow.
- **Type consistency:** `LeaderboardFilter` shape identical across T1/T2/T5/T6; `buildLeaderboardWhere` and `BADGE_SQL_PREDICATES` referenced consistently; cursor field present from T1 but only populated in Plan 3.
- **Cross-plan:** Plan 3 reuses `parseLeaderboardFilter`, `buildLeaderboardWhere`, `getLeaderboard(filter)`, and the `LeaderboardCursor` type — all defined here.
