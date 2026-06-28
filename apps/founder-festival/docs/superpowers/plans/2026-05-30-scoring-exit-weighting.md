# Scoring: Exit Dollar-Weighting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Score founder exits on the same `+1-per-$1M` uncapped dollar scale as `venture_raised`, so an IPO/acquisition outranks a comparable raise instead of being worth a flat +10.

**Architecture:** Add two value fields to `extractedMetrics` (`ipoMarketCapUsd`, `acquisitionPriceUsd`), introduce a new `founder_exit` rule id that bypasses the +200 upper clamp, rewrite the rubric prompt to compute exit points from those dollar values (replacing the flat `+10`-per-exit and the SEC S-1 `+10` bonus), and rely on the **existing** `/api/admin/rescore-all` tooling to backfill (we do **not** run it here).

**Tech Stack:** TypeScript, Zod, Vitest. Scoring lives in `src/lib/scoring.ts`. No DB migration — `extractedMetrics` is stored inside the JSONB `profile` column, so new optional fields need no schema change.

This is Part 2 of `docs/superpowers/specs/2026-05-28-leaderboard-filtering-and-scoring-design.md`.

---

### Task 1: Add exit-value fields to `EXTRACTED_METRICS_SCHEMA`

**Files:**
- Modify: `src/lib/scoring.ts:489-504` (the `EXTRACTED_METRICS_SCHEMA` object)
- Test: `tests/lib/scoring-schema.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/lib/scoring-schema.test.ts`:

```ts
import { EXTRACTED_METRICS_SCHEMA } from "@/lib/scoring";

describe("exit value metrics", () => {
  it("accepts ipoMarketCapUsd and acquisitionPriceUsd as nullable ints", () => {
    const parsed = EXTRACTED_METRICS_SCHEMA.parse({
      companiesFounded: 1, totalRaisedUsd: null, exitCount: 1,
      hadIpo: true, hadAcquisition: false, employeesCount: null,
      isUnicornFounder: true, ycBatch: null, partnerAtFirm: null,
      isAngelInvestor: null, totalDeployedUsd: null, topGithubRepo: null,
      topGithubRepoStars: null, onWikipedia: null,
      ipoMarketCapUsd: 11_000_000_000, acquisitionPriceUsd: null,
    });
    expect(parsed.ipoMarketCapUsd).toBe(11_000_000_000);
    expect(parsed.acquisitionPriceUsd).toBeNull();
  });

  it("defaults the new fields to null when omitted", () => {
    const parsed = EXTRACTED_METRICS_SCHEMA.parse({
      companiesFounded: null, totalRaisedUsd: null, exitCount: null,
      hadIpo: null, hadAcquisition: null, employeesCount: null,
      isUnicornFounder: null, ycBatch: null, partnerAtFirm: null,
      isAngelInvestor: null, totalDeployedUsd: null, topGithubRepo: null,
      topGithubRepoStars: null, onWikipedia: null,
    });
    expect(parsed.ipoMarketCapUsd).toBeNull();
    expect(parsed.acquisitionPriceUsd).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- scoring-schema`
Expected: FAIL — `ipoMarketCapUsd`/`acquisitionPriceUsd` don't exist; second test fails because omitting them currently throws (fields not in schema) or the first test's properties are stripped.

- [ ] **Step 3: Implement — add the two fields with `.default(null)`**

In `src/lib/scoring.ts`, edit `EXTRACTED_METRICS_SCHEMA` (lines 489-504). After `onWikipedia: z.boolean().nullable(),` add:

```ts
  // Exit dollar values — feed the founder_exit rule (+1 per $1M, uncapped).
  // Default to null so older persisted profiles (which lack these keys) still
  // parse. ipoMarketCapUsd = market cap at IPO (the headline valuation public
  // markets assigned). acquisitionPriceUsd = summed acquisition/purchase price
  // across all acquired companies they founded.
  ipoMarketCapUsd: z.number().int().min(0).nullable().default(null),
  acquisitionPriceUsd: z.number().int().min(0).nullable().default(null),
```

Note: the existing 14 fields are `.nullable()` (required key, nullable value). The two new fields use `.nullable().default(null)` so re-parsing legacy `profile` blobs that predate these keys doesn't throw.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- scoring-schema`
Expected: PASS.

- [ ] **Step 5: Fix the type-level fallout in other tests**

Adding required-ish fields to `ExtractedMetrics` breaks every test that builds a full `extractedMetrics` literal. Update each to add the two keys (set to `null`):
- `tests/lib/scoring.test.ts` (the `result()` helper's `extractedMetrics` block ~line 23)
- `tests/lib/scoring-verification.test.ts`
- `tests/lib/scoring-rubric-clamp.test.ts`
- `tests/lib/score-payload.test.ts`
- any other test the typecheck flags.

Find them: `grep -rl "onWikipedia" tests/`. In each full literal, add after `onWikipedia: ...,`:

```ts
      ipoMarketCapUsd: null,
      acquisitionPriceUsd: null,
```

(Because the new fields have `.default(null)`, runtime `.parse()` of partial objects is fine, but TS object literals typed as `ExtractedMetrics` must include them.)

- [ ] **Step 6: Run the full suite + typecheck**

Run: `npm test` and `npx tsc --noEmit`
Expected: PASS / no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/scoring.ts tests/
git commit -m "feat(scoring): add ipoMarketCapUsd/acquisitionPriceUsd to extractedMetrics"
```

---

### Task 2: Add the `founder_exit` rule id and exempt it from the upper clamp

**Files:**
- Modify: `src/lib/scoring.ts:519` (`RULE_IDS`), `src/lib/scoring.ts:727` (`UNCAPPED_UPPER_RULES`)
- Test: `tests/lib/scoring-rubric-clamp.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/lib/scoring-rubric-clamp.test.ts`:

```ts
import { clampBreakdown } from "@/lib/scoring";

it("leaves a founder_exit row uncapped above +200", () => {
  const [row] = clampBreakdown([
    { points: 11000, reason: "GitLab IPO at ~$11B market cap.", rule: "founder_exit" },
  ]);
  expect(row.points).toBe(11000);
});

it("still clamps the lower bound on founder_exit rows", () => {
  const [row] = clampBreakdown([
    { points: -999, reason: "bogus", rule: "founder_exit" },
  ]);
  expect(row.points).toBe(-50);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- scoring-rubric-clamp`
Expected: FAIL — `"founder_exit"` is not assignable to `RuleId`, and (if cast) the row clamps to 200.

- [ ] **Step 3: Implement — extend `RULE_IDS` and `UNCAPPED_UPPER_RULES`**

In `src/lib/scoring.ts` line 519:

```ts
export const RULE_IDS = ["venture_raised", "github_top_repo", "founder_exit"] as const;
```

In `src/lib/scoring.ts` line 727:

```ts
const UNCAPPED_UPPER_RULES = new Set<RuleId>(["venture_raised", "github_top_repo", "founder_exit"]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- scoring-rubric-clamp`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scoring.ts tests/lib/scoring-rubric-clamp.test.ts
git commit -m "feat(scoring): add founder_exit rule id, exempt from upper clamp"
```

---

### Task 3: Rewrite the rubric prompt — exits scored by dollar value

**Files:**
- Modify: `src/lib/scoring.ts:22` (the flat-exit rubric line), `:119-124` (SEC S-1 IPO/EXIT block), `:434-467` (EXTRACTED METRICS prompt section)
- Test: `tests/lib/scoring.test.ts` (assert prompt text via `buildScoringPrompt` or `SCORING_RUBRIC`)

This task changes prompt *text*, not runtime math (the model computes the points). Tests assert the rubric string contains the new instructions and no longer contains the flat-+10 instruction.

- [ ] **Step 1: Write the failing test**

Add to `tests/lib/scoring.test.ts`:

```ts
import { SCORING_RUBRIC } from "@/lib/scoring";

describe("founder_exit rubric copy", () => {
  it("instructs exits to be scored per $1M with rule founder_exit", () => {
    expect(SCORING_RUBRIC).toContain('rule: "founder_exit"');
    expect(SCORING_RUBRIC).toMatch(/max\(1, floor\(exitValueUsd \/ 1,000,000\)\)/);
  });
  it("no longer awards a flat +10 per distinct exit", () => {
    expect(SCORING_RUBRIC).not.toContain("Each distinct exit (sold or acquired company they founded): +10");
  });
  it("documents the new exit-value extracted metrics", () => {
    expect(SCORING_RUBRIC).toContain("extractedMetrics.ipoMarketCapUsd");
    expect(SCORING_RUBRIC).toContain("extractedMetrics.acquisitionPriceUsd");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- "tests/lib/scoring.test.ts"`
Expected: FAIL on all three.

- [ ] **Step 3a: Replace the founder-rubric exit line**

In `src/lib/scoring.ts`, replace line 22:

```
- Each distinct exit (sold or acquired company they founded): +10
```

with:

```
- FOUNDER EXIT (dollar-weighted) — for each company they founded that exited,
  award points on the SAME +1-per-$1M uncapped scale as "Venture raised":
  points = max(1, floor(exitValueUsd / 1,000,000)). This row MUST set
  rule: "founder_exit" so the clamp pipeline leaves it uncapped.
    • ACQUISITION: exitValueUsd = the acquisition / purchase price in USD. If
      they founded multiple acquired companies, SUM the prices into one
      acquisitionPriceUsd and award once on the sum.
    • IPO: exitValueUsd = MARKET CAP AT IPO (the valuation public markets
      assigned, e.g. GitLab ≈ $11B → +11000), NOT the proceeds raised.
    • A sub-$1M exit floors to +1, mirroring the raise floor.
    • reason MUST cite the exact dollar figure used (e.g. "GitLab IPO'd at a
      ~$11B market cap." or "Sold Acme to Google for $400M.").
    • Set extractedMetrics.ipoMarketCapUsd and/or acquisitionPriceUsd to the
      figures you used.
```

- [ ] **Step 3b: Update the SEC S-1 IPO/EXIT block**

In `src/lib/scoring.ts`, replace lines 119-124 (the `IPO / EXIT (FOUNDER):` bullet):

```
- IPO / EXIT (FOUNDER): when the enrichment reports that a company the subject is
  a named related person on "has gone public" (filed an S-1 and now files
  10-K/10-Q), that is AUTHORITATIVE evidence of an exit. Emit the founder
  "FOUNDER EXIT" row for that company using rule: "founder_exit", set
  extractedMetrics.hadIpo=true, and set extractedMetrics.ipoMarketCapUsd to the
  company's market capitalization at IPO (read it from the highlights; if only a
  valuation range is available, use the midpoint). Do NOT award a separate flat
  bonus — the dollar-weighted founder_exit row IS the exit award. This SEC IPO
  signal is authoritative; do not also award the same IPO from a press snippet
  (no double-count).
```

- [ ] **Step 3c: Document the new extracted-metric fields**

In `src/lib/scoring.ts`, in the EXTRACTED METRICS section, after the `hadAcquisition` bullet (line 444) insert:

```
- extractedMetrics.ipoMarketCapUsd: if any company they founded went public,
  its market capitalization AT IPO in raw USD (e.g. 11000000000 for ~$11B).
  This feeds the FOUNDER EXIT rule. Null if no IPO or no figure available.
- extractedMetrics.acquisitionPriceUsd: SUM of acquisition/purchase prices, in
  raw USD, across all companies they founded that were acquired. This feeds the
  FOUNDER EXIT rule. Null if no acquisition or no price available.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- "tests/lib/scoring.test.ts"`
Expected: PASS.

- [ ] **Step 5: Sanity-check the whole scoring suite**

Run: `npm test -- scoring`
Expected: PASS. (Watch for any other test asserting the old "+10 exit" copy — update it to the new copy if so.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/scoring.ts tests/lib/scoring.test.ts
git commit -m "feat(scoring): score founder exits by dollar value, retire flat +10"
```

---

### Task 4: Surface exit values in the curated API payload (no PII leak)

Exit values are now scoring inputs; the public `score-payload` should expose them as plain numbers (they're not PII and investors want them). This keeps Plan 3's leaderboard row shape consistent.

**Files:**
- Modify: `src/lib/api/score-payload.ts` (the build + fetch transform)
- Test: `tests/lib/score-payload.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/lib/score-payload.test.ts` (mirror the file's existing `buildScorePayload` test style):

```ts
it("includes exit values under outcome", () => {
  const payload = buildScorePayload({
    /* ...existing minimal input the test helper uses... */
    ipoMarketCapUsd: 11_000_000_000,
    acquisitionPriceUsd: null,
  } as any);
  expect(payload.outcome.ipo_market_cap_usd).toBe(11_000_000_000);
  expect(payload.outcome.acquisition_price_usd).toBeNull();
});
```

(Adapt to the real `buildScorePayload` input shape — read `src/lib/api/score-payload.ts:31-59` first and match its existing field plumbing.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- score-payload`
Expected: FAIL — no `outcome` block.

- [ ] **Step 3: Implement**

In `src/lib/api/score-payload.ts`, thread `ipoMarketCapUsd` / `acquisitionPriceUsd` (read from the `profile.extractedMetrics` already fetched internally) into the returned object as snake_case under a new `outcome` block:

```ts
  outcome: {
    had_ipo: em?.hadIpo ?? null,
    had_acquisition: em?.hadAcquisition ?? null,
    is_unicorn: em?.isUnicornFounder ?? null,
    ipo_market_cap_usd: em?.ipoMarketCapUsd ?? null,
    acquisition_price_usd: em?.acquisitionPriceUsd ?? null,
  },
```

Use the `extractedMetrics` already read in `fetchScorePayload` (the function already selects `profile` to derive `company_name`). Do NOT add the raw `profile` blob.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- score-payload`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/score-payload.ts tests/lib/score-payload.test.ts
git commit -m "feat(api): expose outcome/exit values in curated score payload"
```

---

### Task 5: Document backfill (do NOT run it)

The new exit fields are `null` on every existing row until a re-extraction + re-score runs. Per user decision we build the path but do not spend.

**Files:**
- Modify: `PRD/leaderboard-filtering-and-scoring.md` (progress log)

- [ ] **Step 1: Confirm the existing rescore path covers it**

The existing `/api/admin/rescore-all` → `/api/cron/scoring-tick` → `reEvaluate(evaluationId)` pipeline re-runs the full scoring prompt, which now populates the new fields and emits `founder_exit`. No new code needed for backfill. Verify by reading `docs/superpowers/plans/2026-05-26-rescore-all.md` — confirm `reEvaluate` re-extracts `extractedMetrics` (it does; it re-runs scoring end-to-end).

- [ ] **Step 2: Add a "backfill not yet run" note to the PRD progress log**

Prepend a progress entry (see CLAUDE.md format) noting: scoring change shipped; exit values are `null` on historical rows until an operator runs `POST /api/admin/rescore-all`; new/edited profiles get exit values automatically going forward.

- [ ] **Step 3: Commit**

```bash
git add PRD/leaderboard-filtering-and-scoring.md
git commit -m "docs: note exit-value backfill is pending operator-triggered rescore"
```

---

## Self-Review

- **Spec coverage:** founder_exit rule ✓ (Task 3), +1/$1M uncapped ✓ (Task 2-3), IPO=market cap ✓ (Task 3), replaces flat +10 & S-1 bonus ✓ (Task 3), sum multiple acquisitions ✓ (Task 3), new fields ipoMarketCapUsd/acquisitionPriceUsd ✓ (Task 1), backfill via existing tooling, not run ✓ (Task 5). Raise floor stays as-is (already `max(1, floor(...))`, no change needed) ✓.
- **Out of scope (correctly omitted):** no log-scaling/cap of `venture_raised`; no normalized display score (future item).
- **Risk surfaced:** scores become large/exit-dominated — intended; display normalization is a deferred follow-up, not in this plan.
