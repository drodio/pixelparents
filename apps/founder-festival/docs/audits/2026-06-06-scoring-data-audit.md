# Scoring & Data Audit — 2026-06-06

Read-only audit over **all 2,378 prod evaluations** (872 scored: non-low-signal,
non-code). Scripts are reusable and checked in:
- `scripts/audit-calibration.ts` — score distributions, spider coverage, dupes, data quality
- `scripts/audit-radar-attribution.ts` — lost-signal / attribution gaps

Findings are ranked by impact. Nothing here was auto-changed except where noted —
the consequential calls (calibration philosophy, duplicate deletion) are left for
DROdio to decide.

---

## 🔴 P1 — The founder score is valuation-dominated (leaderboard ≈ market cap)

The founder total is **extremely** skewed by the uncapped "+1 per $1M valuation /
market cap" traction term:

| metric | founder_score | founder_score **excluding** traction (technical+operator+domain+gtm) |
|---|---|---|
| median | 41 | 30 |
| p90 | 957 | 66 |
| p95 | 5,305 | 89 |
| p99 | 29,060 | 152 |
| **max** | **1,737,155** (bill-gates) | **255** |

The "skill" component (everything except traction) is a sane, bounded 0–255
distribution. The traction term adds **millions**. The entire top-15 leaderboard is
sorted purely by company market cap:

```
1,737,155  bill-gates       dom=traction(1,736,905)   ← Microsoft ~$1.74T
   91,957  john-collison     dom=traction(91,770)      ← Stripe ~$91.5B
   91,687  patrick-collison  dom=traction(91,505)
   78,109  brian-chesky      dom=traction(78,011)      ← Airbnb ~$78B
   …all dom=traction
```

**Why it matters:** the headline founder number conflates *founder credibility*
with *company market cap*. A genuinely elite technical/operator founder at a $200M
company (~score 250) ranks far below anyone attached to a mega-cap, regardless of
their personal contribution. The radar mitigates this per-axis (traction is its own
spoke, percentile-ranked), but the **leaderboard sort + the big number** are
effectively "who's attached to the biggest company."

**This is by design today** (the rubric calls valuation "UNCAPPED … one of the most
important founder signals"). So this is a **decision, not a bug.** Options:

- **(A) Keep it** — "biggest outcomes win" is a defensible leaderboard. Simplest.
- **(B) Log/compress the valuation term** — e.g. `points = round(k · log10(valuationUsd))`
  so a $1.7T company yields ~hundreds (still clearly #1) instead of 1.7M, letting
  skill axes matter in the total. Keeps ordering, compresses magnitude. **My lean.**
- **(C) Cap the traction term** (e.g. at 500–1000) — blunt; creates ties at the top.

Recommend (B). It's a real scoring-philosophy change — should be DROdio's call, and
would be a rescore-to-apply (or a one-pass recompute of the traction row from the
stored `peakValuationUsd`/market-cap, no re-research needed).

---

## 🔴 P2 — Neo structured investor facets are 0% populated in prod

The Neo enricher is supposed to populate structured investor fields, but across all
872 scored rows:

| field | populated |
|---|---|
| `investor_industry_focus` | **0** |
| `investor_check_size` | **0** |
| `investor_stage_focus` | **4** |
| `canonical_industries` | 2 |

Two downstream features are starved by this:

1. **Industry filter is empty** (`canonical_industries` 0.2%). The taxonomy + column
   + leaderboard predicate all shipped, but there's no upstream data for investors,
   and founders only populate via the new `industries` scorer field **on rescore**.
   So the leaderboard industry filter currently has ~nothing to filter on.
2. **"Capital Deployed" radar axis is nearly dead** (see P3) — `check_size` is its
   natural source and it's 0%.

**Needs investigation:** is Neo failing to match (LinkedIn-matched, VC-only, so a
subset by design), failing to fire, or is the write path to these columns
disconnected? Worth a targeted check of the Neo enricher's output on a known-VC
profile. (Did NOT debug overnight — flagging for direction.)

**Industry population path forward:** founders will populate `canonical_industries`
as they rescore (the `industries` field is live). A mass rescore would populate it;
the investor side needs the Neo issue resolved first.

---

## 🟠 P3 — "Capital Deployed" investor axis is mostly dead (4.3% coverage)

Investor axis coverage among the 440 investors with any investor signal:

| axis | coverage | among havers (med / p90 / max) |
|---|---|---|
| portfolio | 85.9% | 20 / 65 / 195 |
| firm | 58.4% | 15 / 45 / 84 |
| experience | 44.3% | 7 / 15 / 35 |
| outcomes | 21.4% | 15 / 50 / 215 |
| **capital** | **4.3%** | 18 / 100 / 100 |

96% of investors show ~0 on the Capital axis, so the spoke is almost always empty
and makes most investors' radars look lopsided. Root cause: AUM / fund-size /
check-size figures are rarely in free text, and the structured source
(`investor_check_size`, P2) is 0% populated. Options: (a) fix Neo check-size → feed
capital; (b) fold capital into `firm` and run a 4-axis investor radar; (c) leave as
aspirational once Neo lands. Recommend (a) once P2 is understood.

---

## 🟢 P4 — Lost-signal attribution fixes validated on live data

The attribution fixes shipped earlier today measurably worked (these are view-time,
so they already apply to all existing rows):

| | before | after |
|---|---|---|
| founder points unattributed | 1.3% | **0.02%** |
| investor points unattributed | 2.6% | **0.61%** |

The radar now reflects essentially all scored points. ✅

---

## 🟠 P5 — 25 duplicate-name pairs (possible duplicate profiles)

25 `full_name`s have >1 row, many with `-2` slug suffixes — a pattern that suggests
re-creation rather than two distinct same-named people:

```
charlie feng ×2     [charlie-feng, charlie-feng-2]
jimin kim ×2        [jimin-kim, jimin-kim-2]
grace chen ×2       [grace-chen, grace-chen-3]
navaneethan murugan ×2, brian leonard ×2, anmol sharma ×2, …
```

Some (e.g. "christina c.", "david c." — truncated names) are likely distinct people;
the `-2` slugs are the suspicious ones. **Needs human review before deletion** (prior
dupe cleanup is documented in memory). A `scripts/dedupe-cleanup.ts` already exists.
Did NOT delete anything — listing for review.

---

## 🟢 P6 — Data-quality baseline (healthy)

- **signal_quality:** 1,506 low / 581 medium / 291 high (of 2,378). ~63% low is
  expected for cold-scraped profiles that never claimed/enriched.
- **founder_status:** current 641 / past 150 / never 80 / null 1 — backfill complete.
- **investor_status:** current 415 / never 427 / past 29 / null 1 — complete.
- **Founder axis coverage:** operator 86.7%, traction 72.9%, gtm 44.7%, technical
  37.7%, domain 22.2%. domain/technical are naturally sparse (research / OSS folks);
  not a defect.
- **investor_score** distribution: median 1, p75 35, p90 68 — half the population has
  no investor signal (expected; most are founders).

---

## Priority recommendations

1. **Decide the valuation-magnitude question (P1).** Biggest lever on what the
   founder leaderboard *means*. Recommend log-compression (option B).
2. **Investigate why Neo facets are 0% (P2).** Unblocks the industry filter AND the
   capital axis in one shot.
3. **Review the 25 duplicate pairs (P5)** and delete confirmed dupes.
4. Once P2 is fixed, **route Neo check-size → capital axis (P3).**
5. The lost-signal + percentile fixes (P4) are confirmed good — no action.
