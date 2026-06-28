# `GET /api/v1/leaderboard` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the same faceted leaderboard through a key-authed public endpoint with keyset pagination, returning a curated row shape (never the raw `profile` blob).

**Architecture:** A new route at `src/app/api/v1/leaderboard/route.ts` that reuses `verifyApiKey` → `checkAndIncrementRateLimit` → `parseLeaderboardFilter` (Plan 2) → `getLeaderboard(filter)` (Plan 2). Adds opaque cursor encode/decode (base64 JSON of `{score,id}`) and a curated per-row serializer. Mirrors the `/api/v1/score` GET pattern exactly.

**Tech Stack:** Next.js App Router route handler (Web `Request` → `NextResponse`), Vitest. snake_case params/response. Free cached read, rate-limited per key.

This is Part 1 (API surface) of `docs/superpowers/specs/2026-05-28-leaderboard-filtering-and-scoring-design.md`. **Depends on Plan 2** (filter layer). Best paired with **Plan 1** so `outcome` carries exit values, but works without it (exit values just read null).

---

### Task 1: Opaque keyset cursor encode/decode

**Files:**
- Create: `src/lib/leaderboard-cursor.ts`
- Modify: `src/lib/leaderboard.ts` (`parseLeaderboardFilter` reads `cursor`)
- Test: `tests/lib/leaderboard-cursor.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/lib/leaderboard-cursor.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { encodeCursor, decodeCursor } from "@/lib/leaderboard-cursor";

describe("leaderboard cursor", () => {
  it("round-trips score + id", () => {
    const enc = encodeCursor({ score: 1234, id: "abc-123" });
    expect(typeof enc).toBe("string");
    expect(decodeCursor(enc)).toEqual({ score: 1234, id: "abc-123" });
  });
  it("returns null for malformed cursors", () => {
    expect(decodeCursor("not-base64-json")).toBeNull();
    expect(decodeCursor("")).toBeNull();
    expect(decodeCursor(Buffer.from('{"score":"x"}').toString("base64url"))).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- leaderboard-cursor`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/lib/leaderboard-cursor.ts`:

```ts
import type { LeaderboardCursor } from "./leaderboard";

// Opaque base64url-encoded JSON of the keyset position {score, id}. Opaque so
// clients treat it as a token, not a stable contract — we can change the
// internal shape later without breaking callers.
export function encodeCursor(c: LeaderboardCursor): string {
  return Buffer.from(JSON.stringify({ s: c.score, i: c.id })).toString("base64url");
}

export function decodeCursor(raw: string | null | undefined): LeaderboardCursor | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (typeof obj?.s !== "number" || typeof obj?.i !== "string") return null;
    return { score: obj.s, id: obj.i };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Wire decode into `parseLeaderboardFilter`**

In `src/lib/leaderboard.ts`, import `decodeCursor` and set `cursor: decodeCursor(sp.get("cursor"))` in the returned object (replacing the hard `null`). (Import lives in `leaderboard-cursor.ts`, which imports the `LeaderboardCursor` type from `leaderboard.ts` — type-only import avoids a runtime cycle.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- leaderboard-cursor` and `npm test -- leaderboard-filter`
Expected: PASS (the existing filter test still expects `cursor: null` for no-cursor input — `decodeCursor(null)` returns null, so it holds).

- [ ] **Step 6: Commit**

```bash
git add src/lib/leaderboard-cursor.ts src/lib/leaderboard.ts tests/lib/leaderboard-cursor.test.ts
git commit -m "feat(leaderboard): opaque keyset cursor encode/decode"
```

---

### Task 2: Curated API row serializer + `nextCursor`

**Files:**
- Create: `src/lib/api/leaderboard-payload.ts`
- Test: `tests/lib/leaderboard-payload.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/lib/leaderboard-payload.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildLeaderboardPayload } from "@/lib/api/leaderboard-payload";
import type { LeaderboardRow } from "@/lib/leaderboard";

const row = (over: Partial<LeaderboardRow>): LeaderboardRow => ({
  id: "e1", linkedinUrl: "https://www.linkedin.com/in/x", fullName: "Ada L",
  founderScore: 120, investorScore: 0, combinedScore: 120, createdAt: new Date(0),
  claimedImageUrl: null, companyName: "Acme", companyUrl: "https://acme.com",
  profileHref: "/profile/ada", badges: [], ...over,
});

describe("buildLeaderboardPayload", () => {
  it("emits snake_case curated rows and never the raw profile", () => {
    const out = buildLeaderboardPayload([row({})], { sort: "combined", limit: 50 });
    expect(out.results[0]).toMatchObject({
      linkedin_url: "https://www.linkedin.com/in/x",
      full_name: "Ada L", company_name: "Acme",
      scores: { founder: 120, investor: 0, combined: 120 },
    });
    expect((out.results[0] as Record<string, unknown>).profile).toBeUndefined();
  });
  it("sets next_cursor only when a full page is returned", () => {
    const page = Array.from({ length: 50 }, (_, i) => row({ id: `e${i}`, combinedScore: 100 - i }));
    expect(buildLeaderboardPayload(page, { sort: "combined", limit: 50 }).next_cursor).not.toBeNull();
    expect(buildLeaderboardPayload([row({})], { sort: "combined", limit: 50 }).next_cursor).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- leaderboard-payload`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/lib/api/leaderboard-payload.ts`:

```ts
import type { LeaderboardRow, LeaderboardTab } from "@/lib/leaderboard";
import { encodeCursor } from "@/lib/leaderboard-cursor";

export type LeaderboardApiRow = {
  linkedin_url: string;
  full_name: string | null;
  company_name: string | null;
  company_url: string | null;
  profile_href: string;
  scores: { founder: number; investor: number; combined: number };
  badges: string[]; // badge ids only — the API doesn't leak internal badge state
};

export function buildLeaderboardPayload(
  rows: LeaderboardRow[],
  opts: { sort: LeaderboardTab; limit: number },
): { results: LeaderboardApiRow[]; next_cursor: string | null } {
  const results = rows.map((r) => ({
    linkedin_url: r.linkedinUrl,
    full_name: r.fullName,
    company_name: r.companyName,
    company_url: r.companyUrl,
    profile_href: r.profileHref,
    scores: { founder: r.founderScore, investor: r.investorScore, combined: r.combinedScore },
    badges: r.badges.filter((b) => b.status !== "rejected").map((b) => b.id),
  }));

  // Full page → there may be more; emit a cursor from the last row's sort key.
  let next_cursor: string | null = null;
  if (rows.length === opts.limit && rows.length > 0) {
    const last = rows[rows.length - 1]!;
    const score = opts.sort === "founder" ? last.founderScore
      : opts.sort === "investor" ? last.investorScore : last.combinedScore;
    next_cursor = encodeCursor({ score, id: last.id });
  }
  return { results, next_cursor };
}
```

> Check the real `Badge` type (`src/lib/badges.ts`) for the `id`/`status` field names and adjust `.filter`/`.map` accordingly.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- leaderboard-payload`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/leaderboard-payload.ts tests/lib/leaderboard-payload.test.ts
git commit -m "feat(api): curated leaderboard row serializer + next_cursor"
```

---

### Task 3: The route handler

**Files:**
- Create: `src/app/api/v1/leaderboard/route.ts`
- Test: `tests/app/api-v1-leaderboard.test.ts` (new — mirror `tests/lib/api-keys.test.ts` / any existing route test for the auth/ratelimit mocking pattern)

- [ ] **Step 1: Read an existing route test for the mocking pattern**

Read `tests/lib/rate-limit.test.ts` and any `tests/app/*.test.ts` that exercises a route to see how `verifyApiKey`/`db` are mocked (vi.mock). Match it.

- [ ] **Step 2: Write the failing test**

Create `tests/app/api-v1-leaderboard.test.ts`. At minimum:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/api-keys", () => ({ verifyApiKey: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkAndIncrementRateLimit: vi.fn() }));
vi.mock("@/lib/leaderboard", async (orig) => ({
  ...(await orig<typeof import("@/lib/leaderboard")>()),
  getLeaderboard: vi.fn(),
}));

import { GET } from "@/app/api/v1/leaderboard/route";
import { verifyApiKey } from "@/lib/api-keys";
import { checkAndIncrementRateLimit } from "@/lib/rate-limit";
import { getLeaderboard } from "@/lib/leaderboard";

const req = (q = "") => new Request(`https://x/api/v1/leaderboard${q}`, {
  headers: { authorization: "Bearer sk_festival_live_test" },
});

beforeEach(() => vi.clearAllMocks());

describe("GET /api/v1/leaderboard", () => {
  it("401 without a valid key", async () => {
    (verifyApiKey as any).mockResolvedValue(null);
    expect((await GET(req())).status).toBe(401);
  });
  it("429 when rate-limited", async () => {
    (verifyApiKey as any).mockResolvedValue({ keyId: "k", clerkUserId: "u" });
    (checkAndIncrementRateLimit as any).mockResolvedValue(false);
    expect((await GET(req())).status).toBe(429);
  });
  it("200 with curated results and applies the filter", async () => {
    (verifyApiKey as any).mockResolvedValue({ keyId: "k", clerkUserId: "u" });
    (checkAndIncrementRateLimit as any).mockResolvedValue(true);
    (getLeaderboard as any).mockResolvedValue([]);
    const res = await GET(req("?role=founder&stage=seed&limit=10"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("results");
    expect(body).toHaveProperty("next_cursor");
    // filter was parsed and forwarded
    const passed = (getLeaderboard as any).mock.calls[0][0];
    expect(passed.role).toBe("founder");
    expect(passed.stages).toEqual(["seed"]);
    expect(passed.limit).toBe(10);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- api-v1-leaderboard`
Expected: FAIL — route module missing.

- [ ] **Step 4: Implement the route**

Create `src/app/api/v1/leaderboard/route.ts` (mirrors `score/route.ts` GET):

```ts
import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/api-keys";
import { checkAndIncrementRateLimit } from "@/lib/rate-limit";
import { parseLeaderboardFilter, getLeaderboard } from "@/lib/leaderboard";
import { buildLeaderboardPayload } from "@/lib/api/leaderboard-payload";

export const dynamic = "force-dynamic";

// Free cached read of the public leaderboard. Per-key daily cap stops the
// whole scored DB being scraped row-by-row through pagination.
const PER_DAY_LIMIT = Number(process.env.API_LEADERBOARD_PER_DAY_LIMIT) || 2000;

export async function GET(req: Request) {
  const key = await verifyApiKey(req.headers.get("authorization"));
  if (!key) {
    return NextResponse.json({ error: "invalid_api_key" }, { status: 401 });
  }

  if (!(await checkAndIncrementRateLimit(`leaderboard:${key.keyId}`, PER_DAY_LIMIT))) {
    return NextResponse.json(
      { error: "rate_limit", limit: PER_DAY_LIMIT, resetsAt: "midnight UTC" },
      { status: 429 },
    );
  }

  const filter = parseLeaderboardFilter(new URL(req.url).searchParams);
  const rows = await getLeaderboard(filter);
  return NextResponse.json(buildLeaderboardPayload(rows, { sort: filter.sort, limit: filter.limit }));
}
```

Note: `parseLeaderboardFilter` already clamps `limit` to 1..100 and decodes `cursor`, so the API gets keyset pagination for free. The base gate + facet WHERE + cursor WHERE all live in `getLeaderboard`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- api-v1-leaderboard`
Expected: PASS.

- [ ] **Step 6: Full suite + typecheck**

Run: `npm test` and `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/v1/leaderboard/route.ts tests/app/api-v1-leaderboard.test.ts
git commit -m "feat(api): GET /api/v1/leaderboard with keyset pagination"
```

---

### Task 4: Document the endpoint

**Files:**
- Modify: the developer API guide (find it: `grep -rln "api/v1/score" src/app docs/ --include=*.tsx --include=*.md`; likely a `/developers` page or `docs/`).

- [ ] **Step 1: Add the endpoint to the developer docs**

Document: path, auth header, every param (role, stage, outcome, raised_min, raised_max, team_min, badge, sort, limit, cursor), the OR-within/AND-across semantics, the response shape (`results[]` + `next_cursor`), and a pagination example (pass `next_cursor` back as `cursor`). Note exit values appear under each row only once Plan 1's backfill runs.

- [ ] **Step 2: Commit**

```bash
git add <docs file>
git commit -m "docs(api): document GET /api/v1/leaderboard"
```

---

## Self-Review

- **Spec coverage:** new `GET /api/v1/leaderboard` ✓ (T3), key-auth + per-key rate limit mirroring `/api/v1/score` ✓ (T3), snake_case params ✓ (reuses parser), all params role/stage/outcome/raised_min/raised_max/badge/sort/limit/cursor ✓ (parser from Plan 2 + cursor T1), **team_min** included (Plan 2 decision) ✓, keyset `(score,id)` pagination ✓ (T1+T3, getLeaderboard cursor WHERE from Plan 2), curated row shape excluding raw `profile` ✓ (T2), OR-within/AND-across ✓ (inherited), free cached read ✓ (T3).
- **Cross-plan deps:** requires Plan 2's `parseLeaderboardFilter`, `getLeaderboard(filter)`, `buildLeaderboardWhere`, `LeaderboardCursor`. The cursor WHERE clause is implemented in Plan 2 Task 5 (`getLeaderboard`), decoded here.
- **Placeholder scan:** the only "find the file" step is T4 (docs location) — acceptable; it's a grep, not a code placeholder.
- **Security:** never emits `profile`; per-key rate limit; no paid path (read-only of already-scored rows). Pagination can't exfiltrate more than the public leaderboard already shows.
