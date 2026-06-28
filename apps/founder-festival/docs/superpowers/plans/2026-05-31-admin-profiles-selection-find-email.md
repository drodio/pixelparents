# Admin Profiles: Selection + Infinite Scroll + Find Email — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add row selection (checkbox / select-all / shift-click), infinite scroll, and a Tools → Find Email action (AnyMailFinder lookup, $0.05/hit charged to the acting admin; super-admins free) to `/admin/profiles`.

**Architecture:** Additive nullable `found_email*` columns on `evaluations` store enrichment results. A new keyset-paginated API streams rows into the existing client table, which keeps in-memory sort/filter. The table gains selection state and a Tools toolbar. A new server route runs AnyMailFinder per eligible profile and charges credits only on a `valid` hit.

**Tech Stack:** Next.js (App Router, force-dynamic), Drizzle (drizzle-kit push/generate, Neon Postgres), Clerk, Vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-05-31-admin-profiles-selection-find-email-design.md`

**Deployment ordering:** The `found_email*` columns are nullable/additive → backward-compatible. Apply the migration to the DB (`db:push`) BEFORE deploying code that reads them. Old code ignores the columns; new code reads null safely.

---

## Task 1: DB columns + migration for found emails

**Files:**
- Modify: `src/db/schema.ts` (evaluations table, after `requestCountry` block ~line 84)
- Generate: `drizzle/*.sql` (via drizzle-kit)

- [ ] **Step 1: Add columns to the `evaluations` table**

In `src/db/schema.ts`, inside `evaluations` columns (after the `requestCountry` line):

```ts
    // Email discovered by an enrichment tool (AnyMailFinder) for UNCLAIMED
    // profiles. Distinct from a claimer's verified Clerk email. found_email_status
    // mirrors AnyMailFinder's accepted status ("valid"); surfaced in the admin
    // Email column as "Unverified". found_email_by = Clerk id of the admin who ran it.
    foundEmail: text("found_email"),
    foundEmailStatus: text("found_email_status"),
    foundEmailAt: timestamp("found_email_at", { withTimezone: true }),
    foundEmailBy: text("found_email_by"),
```

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate`
Expected: a new file in `drizzle/` containing `ALTER TABLE "evaluations" ADD COLUMN "found_email" ...`.

- [ ] **Step 3: Apply to the dev database**

Run: `npm run db:push`
Expected: "Changes applied" (4 columns added). No errors.

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts drizzle/
git commit -m "feat(db): add found_email columns to evaluations"
```

---

## Task 2: Surface found emails via `profileEmailInfo` (TDD)

**Files:**
- Modify: `src/lib/admin-profiles-view.ts`
- Test: `tests/lib/admin-profiles-view.test.ts`

- [ ] **Step 1: Write failing tests** — append to the existing `describe("profileEmailInfo", ...)`:

```ts
it("surfaces a found email as Unverified for an unclaimed profile", () => {
  const info = profileEmailInfo(
    { claimerClerkUserId: null, foundEmail: "x@acme.com", foundEmailStatus: "valid" },
    new Map(),
  );
  expect(info).toEqual({ claimed: false, emails: "x@acme.com", emailStatus: "unverified" });
});

it("prefers the claimer's verified email over any found email", () => {
  const map = new Map([["u_1", ["ada@example.com"]]]);
  const info = profileEmailInfo(
    { claimerClerkUserId: "u_1", foundEmail: "stale@acme.com", foundEmailStatus: "valid" },
    map,
  );
  expect(info).toEqual({ claimed: true, emails: "ada@example.com", emailStatus: "verified" });
});
```

- [ ] **Step 2: Run, verify fail** — `npx vitest run tests/lib/admin-profiles-view.test.ts` → FAIL (extra arg / wrong shape).

- [ ] **Step 3: Extend `profileEmailInfo`** in `src/lib/admin-profiles-view.ts` — widen the param type and add the unclaimed-found branch:

```ts
export function profileEmailInfo(
  p: { claimerClerkUserId: string | null; foundEmail?: string | null; foundEmailStatus?: string | null },
  emailsById: Map<string, string[]>,
): ProfileEmailInfo {
  if (p.claimerClerkUserId) {
    const list = emailsById.get(p.claimerClerkUserId) ?? [];
    return { claimed: true, emails: list.length > 0 ? list.join(", ") : null, emailStatus: "verified" };
  }
  if (p.foundEmail) {
    return { claimed: false, emails: p.foundEmail, emailStatus: "unverified" };
  }
  return { claimed: false, emails: null, emailStatus: null };
}
```

- [ ] **Step 4: Run, verify pass** — `npx vitest run tests/lib/admin-profiles-view.test.ts` → PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin-profiles-view.ts tests/lib/admin-profiles-view.test.ts
git commit -m "feat: profileEmailInfo surfaces found emails as Unverified"
```

---

## Task 3: Thread found-email fields through the profiles query

**Files:**
- Modify: `src/lib/profiles-scored.ts` (`EVAL_BASE_COLUMNS`, `EvalBaseRow`, `ScoredProfileRow`, `enrichEvals`)

- [ ] **Step 1: Add to `EVAL_BASE_COLUMNS`** (after `profile: evaluations.profile,`):

```ts
  foundEmail: evaluations.foundEmail,
  foundEmailStatus: evaluations.foundEmailStatus,
```

- [ ] **Step 2: Add to `EvalBaseRow` type and `ScoredProfileRow` type:**

```ts
  foundEmail: string | null;
  foundEmailStatus: string | null;
```

- [ ] **Step 3: Pass through in `enrichEvals`** — wherever each `ScoredProfileRow` object is built, add:

```ts
      foundEmail: e.foundEmail,
      foundEmailStatus: e.foundEmailStatus,
```

- [ ] **Step 4: Typecheck** — `npx tsc --noEmit` → only the pre-existing `LayoutProps` errors (none in profiles-scored.ts).

- [ ] **Step 5: Commit**

```bash
git add src/lib/profiles-scored.ts
git commit -m "feat: carry found_email fields on ScoredProfileRow"
```

---

## Task 4: Shared row builder + keyset pagination + count

**Files:**
- Create: `src/lib/admin-profiles-rows.ts` (server-only row builder)
- Modify: `src/lib/profiles-scored.ts` (add `listScoredProfilesPage`, `countScoredProfiles`)

- [ ] **Step 1: Extract the row builder.** Create `src/lib/admin-profiles-rows.ts`:

```ts
import "server-only";
import type { ScoredProfileRow } from "@/lib/profiles-scored";
import type { ProfileTableRow } from "@/components/admin/ProfilesScoredTable";
import { fmtLocation, resolveEmails, profileEmailInfo } from "@/lib/admin-profiles-view";
import { applyCostMultiplier } from "@/lib/cost-multiplier";

// Single source of truth for serializing ScoredProfileRow[] -> ProfileTableRow[]
// (resolves claimer emails in one batched Clerk call). Used by the page AND the
// pagination API so their output can't drift.
export async function buildProfileTableRows(
  profiles: ScoredProfileRow[],
  costMult: number,
): Promise<ProfileTableRow[]> {
  const claimerIds = [
    ...new Set(profiles.map((p) => p.claimerClerkUserId).filter((x): x is string => !!x)),
  ];
  const emailById = await resolveEmails(claimerIds);
  return profiles.map((p) => ({
    id: p.id,
    fullName: p.fullName,
    linkedinUrl: p.linkedinUrl,
    profileHref: p.profileHref,
    source: p.source,
    founderScore: p.founderScore,
    investorScore: p.investorScore,
    combinedScore: p.combinedScore,
    leaderboardRank: p.leaderboardRank,
    badges: p.badges,
    companyName: p.companyName,
    companyUrl: p.companyUrl,
    costCents: applyCostMultiplier(p.costCents, costMult),
    chargeCents: p.chargeCents,
    ...profileEmailInfo(p, emailById),
    updatedAtIso: p.updatedAt.toISOString(),
    requestIp: p.requestIp,
    requestLocation: fmtLocation(p),
    runs: p.runs,
  }));
}
```

- [ ] **Step 2: Add `countScoredProfiles` + `listScoredProfilesPage`** to `src/lib/profiles-scored.ts`. The page version takes a cursor `{ updatedAtIso, id } | null` and keysets on `(updatedAt DESC, id DESC)`:

```ts
import { count } from "drizzle-orm"; // ensure imported

export async function countScoredProfiles(ownerEmail: string | null = null): Promise<number> {
  // Mirror listScoredProfiles' ownerEmail scoping.
  if (ownerEmail !== null) {
    const owned = await ownedEvaluationIds(ownerEmail); // extract the ownerIds block into a helper
    if (owned.length === 0) return 0;
    const [r] = await db.select({ n: count() }).from(evaluations)
      .where(and(eq(evaluations.source, "url"), inArray(evaluations.id, owned)));
    return r?.n ?? 0;
  }
  const [r] = await db.select({ n: count() }).from(evaluations).where(eq(evaluations.source, "url"));
  return r?.n ?? 0;
}

export type ProfilesCursor = { updatedAtIso: string; id: string };

export async function listScoredProfilesPage(
  cursor: ProfilesCursor | null,
  limit: number,
  ownerEmail: string | null = null,
): Promise<ScoredProfileRow[]> {
  // Build the same base WHERE as listScoredProfiles, then AND the keyset clause:
  //   (updated_at, id) < (cursor.updatedAt, cursor.id)  in DESC order
  const keyset = cursor
    ? sql`(${evaluations.updatedAt}, ${evaluations.id}) < (${new Date(cursor.updatedAtIso)}, ${cursor.id})`
    : undefined;
  // ... select EVAL_BASE_COLUMNS, where(and(baseWhere, keyset)),
  //     orderBy(desc(updatedAt), desc(id)).limit(limit); then enrichEvals.
}
```

Refactor the `ownerEmail` → `ownedIds` block in `listScoredProfiles` into a shared `ownedEvaluationIds(ownerEmail)` helper and reuse it in all three. Update `listScoredProfiles`' `orderBy` to add `desc(evaluations.id)` as a tiebreak so its order matches the paginated version.

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit` → no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/admin-profiles-rows.ts src/lib/profiles-scored.ts
git commit -m "feat: shared row builder + keyset pagination for scored profiles"
```

---

## Task 5: Pagination API route

**Files:**
- Create: `src/app/api/admin/profiles/list/route.ts`

- [ ] **Step 1: Implement the route** (mirrors page.tsx auth/scope):

```ts
import { NextResponse } from "next/server";
import { adminGate } from "@/lib/admin";
import { can, getViewerScopes, getViewerEmail, getViewerCostMultiplier } from "@/lib/grants";
import { listScoredProfilesPage, type ProfilesCursor } from "@/lib/profiles-scored";
import { buildProfileTableRows } from "@/lib/admin-profiles-rows";

export const dynamic = "force-dynamic";
const PAGE = 100;

export async function GET(req: Request) {
  const gate = await adminGate();
  if (!gate.ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!(await can("view_profiles"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const scopes = await getViewerScopes();
  const ownerEmail = scopes.users === "theirs" ? (await getViewerEmail()) ?? "" : null;

  const url = new URL(req.url);
  const raw = url.searchParams.get("cursor");
  let cursor: ProfilesCursor | null = null;
  if (raw) {
    const [updatedAtIso, id] = raw.split("|");
    if (updatedAtIso && id) cursor = { updatedAtIso, id };
  }

  const profiles = await listScoredProfilesPage(cursor, PAGE, ownerEmail);
  const rows = await buildProfileTableRows(profiles, await getViewerCostMultiplier());
  const last = profiles[profiles.length - 1];
  const nextCursor =
    profiles.length === PAGE && last ? `${last.updatedAt.toISOString()}|${last.id}` : null;
  return NextResponse.json({ rows, nextCursor });
}
```

- [ ] **Step 2: Manual check** — `curl` while signed-out returns 403. (Authenticated check happens in Task 10 end-to-end.)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/profiles/list/route.ts
git commit -m "feat: GET /api/admin/profiles/list keyset pagination endpoint"
```

---

## Task 6: Infinite scroll in the table component

**Files:**
- Modify: `src/components/admin/ProfilesScoredTable.tsx`
- Modify: `src/app/(authed)/admin/profiles/page.tsx`

- [ ] **Step 1: Add optional pagination props** to `ProfilesScoredTable`:

```ts
  initialNextCursor?: string | null; // when provided, enables infinite scroll
  totalCount?: number;               // for the "Showing X of Y" header
```

- [ ] **Step 2: Add loading state + effect.** Inside the component:

```ts
  const [extraRows, setExtraRows] = useState<ProfileTableRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor ?? null);
  const [loading, setLoading] = useState(false);
  const allRows = useMemo(() => [...rows, ...extraRows], [rows, extraRows]);

  const loadMore = useCallback(async () => {
    if (loading || !nextCursor) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/profiles/list?cursor=${encodeURIComponent(nextCursor)}`);
      const data = await res.json() as { rows: ProfileTableRow[]; nextCursor: string | null };
      setExtraRows((prev) => [...prev, ...data.rows]);
      setNextCursor(data.nextCursor);
    } finally { setLoading(false); }
  }, [loading, nextCursor]);
```

Replace `rows` with `allRows` everywhere downstream (the `sorted`/filter `useMemo`, `collectFilterLabels`).

- [ ] **Step 3: Sync filter labels as rows stream in** (fixes the documented caveat). Add:

```ts
  useEffect(() => {
    setEnabled((prev) => {
      const next = new Set(prev);
      for (const l of collectFilterLabels(extraRows)) next.add(l.key);
      return next;
    });
  }, [extraRows]);
```

- [ ] **Step 4: Add the IntersectionObserver sentinel** below the `</table>`:

```tsx
  {nextCursor && (
    <div ref={sentinelRef} className="py-4 text-center text-xs text-zinc-500">
      {loading ? "Loading…" : "Scroll to load more"}
    </div>
  )}
```

with an effect that observes `sentinelRef` and calls `loadMore()` on intersect.

- [ ] **Step 5: Wire the page.** In `page.tsx`: fetch the first page via `listScoredProfilesPage(null, 100, ownerEmail)` + `countScoredProfiles(ownerEmail)`, build rows with `buildProfileTableRows`, compute `initialNextCursor`, and pass `initialNextCursor` + `totalCount` to the table. Change the header line to `Showing {allRows.length} of {totalCount}` (move the count into the table or pass a render prop; simplest: header shows total via a new prop on the table or keep server total in the page and the table reports loaded count up via callback — keep it simple: page shows `{totalCount} profiles` and the table shows a small "loaded N" caption).

- [ ] **Step 6: Manual verify** (covered in Task 10). **Commit:**

```bash
git add src/components/admin/ProfilesScoredTable.tsx "src/app/(authed)/admin/profiles/page.tsx"
git commit -m "feat: infinite scroll for /admin/profiles"
```

---

## Task 7: Row selection (checkbox / select-all / shift-click)

**Files:**
- Modify: `src/components/admin/ProfilesScoredTable.tsx`

- [ ] **Step 1: Selection state:**

```ts
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const anchorRef = useRef<number | null>(null);
```

- [ ] **Step 2: Click handler with shift-range** (operates on `sorted` order):

```ts
  function onRowCheck(index: number, shiftKey: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      const id = sorted[index].id;
      if (shiftKey && anchorRef.current !== null) {
        const [a, b] = [anchorRef.current, index].sort((x, y) => x - y);
        for (let i = a; i <= b; i++) next.add(sorted[i].id);
      } else {
        next.has(id) ? next.delete(id) : next.add(id);
        anchorRef.current = index;
      }
      return next;
    });
  }
```

- [ ] **Step 3: Header checkbox** (select/clear all loaded), with `indeterminate` set via a ref when `0 < selected.size < sorted.length`.

- [ ] **Step 4: Leftmost `<th>`/`<td>`** with the checkbox; bump `colCount` by 1; the checkbox `onChange={(e) => onRowCheck(i, (e.nativeEvent as MouseEvent).shiftKey)}`.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/ProfilesScoredTable.tsx
git commit -m "feat: row selection with select-all + shift-click range"
```

---

## Task 8: AnyMailFinder client (TDD)

**Files:**
- Create: `src/lib/anymailfinder.ts`
- Test: `tests/lib/anymailfinder.test.ts`

- [ ] **Step 1: Failing test** (mock `fetch`):

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { findPersonEmail } from "@/lib/anymailfinder";

afterEach(() => vi.restoreAllMocks());

it("returns the valid email on a hit", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(
    JSON.stringify({ email: "a@b.com", email_status: "valid", valid_email: "a@b.com" }),
    { status: 200 },
  )));
  const r = await findPersonEmail({ linkedinUrl: "https://linkedin.com/in/x", apiKey: "k" });
  expect(r).toEqual({ email: "a@b.com", status: "valid" });
});

it("returns no email on not_found (no charge case)", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(
    JSON.stringify({ email: null, email_status: "not_found", valid_email: null }),
    { status: 200 },
  )));
  const r = await findPersonEmail({ linkedinUrl: "https://linkedin.com/in/x", apiKey: "k" });
  expect(r).toEqual({ email: null, status: "not_found" });
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** `src/lib/anymailfinder.ts`:

```ts
export type AmfStatus = "valid" | "risky" | "not_found" | "blacklisted";
export type AmfResult = { email: string | null; status: AmfStatus };

export async function findPersonEmail(input: {
  apiKey: string;
  linkedinUrl?: string | null;
  fullName?: string | null;
  domain?: string | null;
}): Promise<AmfResult> {
  const body: Record<string, string> = {};
  if (input.linkedinUrl) body.linkedin_url = input.linkedinUrl;
  if (input.fullName) body.full_name = input.fullName;
  if (input.domain) body.domain = input.domain;
  const res = await fetch("https://api.anymailfinder.com/v5.1/find-email/person", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${input.apiKey}` },
    body: JSON.stringify(body),
  });
  if (res.status === 401) throw new Error("anymailfinder: unauthorized (bad API key)");
  if (!res.ok && res.status !== 200) {
    // 400 = bad input for this profile; treat as a miss, not a crash.
    return { email: null, status: "not_found" };
  }
  const data = (await res.json()) as { valid_email?: string | null; email_status?: AmfStatus };
  const status = data.email_status ?? "not_found";
  return { email: status === "valid" ? data.valid_email ?? null : null, status };
}
```

- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** `git commit -m "feat: AnyMailFinder person-email client"`

---

## Task 9: Find Email route + charging (TDD)

**Files:**
- Create: `src/app/api/admin/profiles/find-email/route.ts`
- Modify: `src/lib/credits.ts` (generalize debit reason)
- Test: `tests/app/admin-find-email.test.ts`

- [ ] **Step 1: Add a debit helper** to `credits.ts` (reuses the atomic pattern; reason `find_email_debit`):

```ts
export async function reserveCreditsFor(
  clerkUserId: string, cents: number, reason: string,
): Promise<{ ledgerId: string; balanceAfter: number } | null> {
  const updated = await db.update(creditBalances)
    .set({ balanceCents: sql`${creditBalances.balanceCents} - ${cents}`, updatedAt: sql`NOW()` })
    .where(and(eq(creditBalances.clerkUserId, clerkUserId), sql`${creditBalances.balanceCents} >= ${cents}`))
    .returning({ balanceAfter: creditBalances.balanceCents });
  if (updated.length === 0) return null;
  const balanceAfter = updated[0]!.balanceAfter;
  const [led] = await db.insert(creditLedger)
    .values({ clerkUserId, deltaCents: -cents, reason, balanceAfterCents: balanceAfter })
    .returning({ id: creditLedger.id });
  return { ledgerId: led!.id, balanceAfter };
}
```

- [ ] **Step 2: Failing route test** (`tests/app/admin-find-email.test.ts`) — mock `@/lib/anymailfinder`, `@/lib/admin` (isSuperAdmin), Clerk `auth`; seed two unclaimed evals + one claimed; assert: only unclaimed-no-email processed; `valid` → `found_email` stored; super-admin → no `credit_ledger` row; non-super-admin → one `find_email_debit` row per valid hit; `not_found` → no store, no charge. Mirror the DB-test setup in `tests/app/admin-profile-hide-delete.test.ts`.

- [ ] **Step 3: Implement the route:**

```ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, eq, inArray, isNull, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { evaluations } from "@/db/schema";
import { adminGate, isSuperAdmin } from "@/lib/admin";
import { can } from "@/lib/grants";
import { findPersonEmail } from "@/lib/anymailfinder";
import { reserveCreditsFor } from "@/lib/credits";
import { reportServerError } from "@/lib/report-server-error";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const CHARGE_CENTS = 5;
const MAX_PER_CALL = 100;

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const gate = await adminGate();
  if (!gate.ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!(await can("run_scoring_jobs"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const apiKey = process.env.ANYMAILFINDER_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "not_configured" }, { status: 500 });

  let body: { evaluationIds?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const ids = Array.isArray(body.evaluationIds) ? body.evaluationIds.filter((x): x is string => typeof x === "string") : [];
  if (ids.length === 0) return NextResponse.json({ error: "no_ids" }, { status: 400 });

  // Server-side eligibility: unclaimed (no claimer) AND no found_email yet.
  // NOTE: claimer linkage lives in the claims source used by profiles-scored;
  // here we filter on found_email IS NULL and rely on the caller selecting
  // unclaimed rows — re-derive "claimed" via the same path profiles-scored uses.
  const eligible = await db.select({ id: evaluations.id, linkedinUrl: evaluations.linkedinUrl, fullName: evaluations.fullName })
    .from(evaluations)
    .where(and(inArray(evaluations.id, ids), isNull(evaluations.foundEmail)))
    .limit(MAX_PER_CALL);

  const superAdmin = await isSuperAdmin();
  const results: Array<{ id: string; email: string | null; status: string; charged: boolean }> = [];
  let chargedCents = 0, stopped = false;

  for (const e of eligible) {
    let r;
    try { r = await findPersonEmail({ apiKey, linkedinUrl: e.linkedinUrl, fullName: e.fullName }); }
    catch (err) { await reportServerError(err); results.push({ id: e.id, email: null, status: "error", charged: false }); continue; }

    if (r.status === "valid" && r.email) {
      if (!superAdmin) {
        const reserved = await reserveCreditsFor(userId, CHARGE_CENTS, "find_email_debit");
        if (!reserved) { stopped = true; break; } // out of credits
        chargedCents += CHARGE_CENTS;
      }
      await db.update(evaluations).set({
        foundEmail: r.email, foundEmailStatus: "valid", foundEmailAt: new Date(), foundEmailBy: userId,
      }).where(eq(evaluations.id, e.id));
      results.push({ id: e.id, email: r.email, status: "valid", charged: !superAdmin });
    } else {
      results.push({ id: e.id, email: null, status: r.status, charged: false });
    }
  }

  return NextResponse.json({ results, chargedCents, stopped, processed: results.length });
}
```

> Implementation note: confirm the exact "claimed" exclusion against how `profiles-scored.ts` derives `claimerClerkUserId` (claims map). If claimed rows can lack `found_email` but still have a verified email, also exclude them here using the same claims lookup so we never pay to find an email for a claimed profile.

- [ ] **Step 4: Run tests, verify pass.**
- [ ] **Step 5: Commit** `git commit -m "feat: POST /api/admin/profiles/find-email with per-hit charge"`

---

## Task 10: Tools toolbar + end-to-end wiring + ship

**Files:**
- Modify: `src/components/admin/ProfilesScoredTable.tsx`

- [ ] **Step 1: Tools toolbar** — above the `<table>` (below the existing controls row), shown when `selected.size > 0`:

```tsx
{selected.size > 0 && (
  <div className="flex items-center gap-3 rounded border border-zinc-700 bg-[#1b1b1b] px-3 py-2 text-sm">
    <span className="text-zinc-300">{selected.size} selected</span>
    <span className="uppercase tracking-[0.15em] text-zinc-500 text-xs">Tools</span>
    <button type="button" onClick={runFindEmail} disabled={finding}
      className="rounded bg-white text-black px-3 py-1 text-xs font-medium hover:bg-zinc-200 disabled:opacity-50">
      {finding ? "Finding…" : "Find Email"}
    </button>
    <span className="text-xs text-zinc-500">{superAdmin ? "free (super-admin)" : "$0.05 per email found"}</span>
    <button type="button" onClick={() => setSelected(new Set())} className="text-xs text-zinc-400 hover:text-white">Clear</button>
  </div>
)}
```

- [ ] **Step 2: `runFindEmail`** — POST selected ids, then patch matching rows in place with the returned `valid` emails (set `emails` + `emailStatus: "unverified"`), show a summary (`Found N · charged $X`), clear selection.

- [ ] **Step 3: Apply DB migration to PROD before deploy** — `npm run db:push` against the production Neon DB (additive nullable columns; safe). Confirm columns exist.

- [ ] **Step 4: Manual verify on preview** — push branch → preview build → on `/admin/profiles`: scroll loads more; total count correct; select rows; shift-click range; Tools shows; Find Email populates Email/Unverified; super-admin not charged.

- [ ] **Step 5: PR → merge → production** (same flow as PR #141). Update `PRD/email-related-work.md`. Commit.

---

## Self-review notes
- Spec coverage: infinite scroll (T4–6), real count (T4/T6), selection+shift (T7), Tools+Find Email (T9–10), charge-on-valid + super-admin bypass (T9), found-email storage (T1–3), Email-column surfacing (T2). All covered.
- Open confirmations carried from spec: AMF auth header (`Bearer` assumed in T8 — verify with a live call during T8/T10); "claimed" exclusion in the route (note in T9 Step 3).
