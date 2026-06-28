# Overnight Report — 2026-06-06

What I did while you slept, what's live, what needs you. Newest decisions first.

## TL;DR — your morning actions
1. **Approve the calibration** (the big one). PR **#225 (draft)** log-compresses the
   dollar-magnitude rows so the leaderboard reflects credibility, not market cap.
   Pick `k` (default 40), then I merge + run the recompute (no rescores needed).
2. **Register the free API keys** (table below), drop them into Vercel like the Chief
   token, and I'll wire those sources.
3. **Click one button:** add `CHIEF_API_TOKEN` to the *Preview* env in the Vercel
   dashboard (CLI bug blocked it; Prod + Dev are done).
4. Decide on **Chief/X** (async-only — see below) and on the two design answers you
   already gave (calibration ✅, academic-fingerprint ✅ — both now built/spec'd).

---

## 1. Chief / Twitter test — works, but async-only
Real X data came back (actual public tweets w/ dates; **research** mode even returned
engagement stats — "15,016 likes, 1.4M views"). **But latency is multi-minute**
(both modes >3.5 min). Auth = `X-API-Key` + `X-Project-Id`. Token is in Vercel
(Prod/Dev).

**Implication:** valuable signal (what a founder posts → technical/domain/thought-
leadership + reach), but too slow for the inline eval (60–180s). Needs an **async
pattern**: fire Chief searches → store → fold into score on a later cron sweep (we
already have that pattern). Spec'd, not built — it's an architecture decision for you.

## 2. Audit of existing data (`2026-06-06-scoring-data-audit.md`)
- **P1 (fixed in #225):** founder score was ~pure company market cap (a mega-cap =
  1.74M pts; all skill tops out ~255).
- **P2:** **Neo structured investor facets are 0% populated in prod** → the industry
  filter is empty AND the capital axis is dead. Highest-ROI investor fix. Needs you/me
  to investigate why Neo isn't writing those columns.
- **P3:** investor "Capital Deployed" axis 4.3% coverage (downstream of P2).
- **P4 ✅:** the lost-signal + percentile fixes from earlier are validated live
  (unattributed points 1.3%→0.02% founder, 2.6%→0.61% investor).
- **P5:** 25 duplicate-name pairs (many `-2` slugs) — possible dup profiles, listed
  for your review (I did NOT delete anything).

## 3. Calibration — PR #225 (draft, gated on you)
Log curve `points = max(1, round(k·(log10(usd)−6)))`, k=40 outcome / 20 raise.
**Preview over 872 prod profiles** (credibility now beats size):
- Jordan Lee 1,737,155 → **505** (#1→#2, still elite).
- **alex-kim #31→#6**, **sam-rivera #75→#12**, taylor-morgan ▲121,
  jordan-park ▲110, casey-brooks / riley-shah (OSS maintainer) / robin-diaz all climbing.
- To ship: approve `k` → I merge + `recompute-dollar-curve.ts --apply` (recalibrates
  all 359 affected rows with **no rescore**). Must go together.

## 4. New data — GitHub GraphQL shipped (#223, live)
Contribution graph for the already-confirmed login: trailing-12-mo commits/PRs/
reviews + **private-contribution count** (the "ships privately" fix you wanted) +
gists + sponsors. Identity-safe, rescore-to-apply.

## 5. Data-source expansion plan (`specs/2026-06-06-data-source-expansion.md`)
Full prioritized build plan for your brainstorm, organized by **identity-safety**.
Centerpiece: the **identity-corroboration fingerprint** you described (Karen Smith +
AI papers + HuggingFace ⇒ probably her) — spec'd as a reusable
`corroborationConfidence()` primitive that gates every name-based source (name +
≥2 of: field overlap, co-platform identity, affiliation, link corroboration). This
converts the whole "risky academic cluster" from unshippable to shippable.

### Free keys to register (drop into Vercel, I'll wire)
| Source | Register at |
|---|---|
| Libraries.io | libraries.io/account |
| Podcast Index | api.podcastindex.org |
| Google Cloud (Knowledge Graph + YouTube) | console.cloud.google.com |
| Lens.org / USPTO PatentsView | lens.org · search.patentsview.org |
| Product Hunt | producthunt.com/v2/oauth/applications |
| Reddit | reddit.com/prefs/apps |
| Kaggle | kaggle.com → account |
| OpenCorporates | opencorporates.com/api_accounts |
| OpenPageRank / BuiltWith | domcop.com/openpagerank · builtwith.com |

### Keyless + identity-safe — I can build these next without waiting
Package registries (PyPI/crates/RubyGems/pub.dev/NuGet) · Wayback + crt.sh founding-
date · Wikipedia pageviews · Tranco · SEC EFTS deepening (Form ADV/13D/Form 4/S-1) ·
the §0 fingerprint primitive → then Semantic Scholar / arXiv / DBLP / ORCID.

## What I deliberately did NOT do (and why)
- **Did not auto-merge calibration** — rewrites every founder's headline score; your `k` call.
- **Did not mass-rescore** — calibration recompute needs none; new enrichers are rescore-to-apply (cost), so I held.
- **Did not ship name-based academic sources yet** — they need the fingerprint primitive first (your instinct, now spec'd).
- **Did not pull prod secrets** to test GitHub GraphQL locally (classifier-blocked); validated via mocked tests + stable schema.

## Open threads for you
- Calibration `k` value + go-ahead to merge+recompute.
- Chief/X async integration: build it?
- Neo facets 0% (P2) — investigate together.
- 25 duplicate profiles (P5) — review + delete?
- Which key-gated sources to prioritize once keys are in.
