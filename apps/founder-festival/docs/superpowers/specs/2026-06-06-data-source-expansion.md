# Data-Source Expansion — Design & Build Plan

Turns DROdio's 2026-06-06 brainstorm into an actionable, prioritized plan. The
organizing principle is **not** free-vs-paid — it's **identity-safety**, because the
product's whole value is accuracy (the rbranson same-name saga). Every source below
is tagged with how we keep it from attaching the wrong person's data.

---

## 0. The unlock: a shared Identity-Corroboration Fingerprint

DROdio's framing: *"if it's somebody named Karen Smith but she's writing an AI/ML
paper AND she has Hugging Face models, then it's probably her. A couple of signals
provide enough confidence."*

This generalizes the existing `githubMatchConfidence` (name match + company
correlation) into a **reusable identity primitive** that every new name-based source
must pass before its data is allowed to score. Build it once, in
`src/lib/enrichers/identity.ts`, and have arXiv/OpenAlex/Semantic Scholar/ORCID/
DBLP/Codeforces/Kaggle all call it.

### `corroborationConfidence(candidate, subject): number` (0–1)

A candidate record (e.g. an arXiv author "K. Smith" with field tags `[cs.LG, cs.AI]`
at "Stanford") is scored against everything we ALREADY know about the subject:

| Signal | Weight | Source of the subject side |
|---|---|---|
| **Full name match** (first+last, not just last) | gate (required) | extracted fullName |
| **Field / topic overlap** — paper field ∈ subject's company sector / bio / dev.to tags / HF model domain | +0.4 | `extractedMetrics.topics`, company industry, dev.to tags |
| **Co-platform identity in the same domain** — has GitHub/HF/dev.to presence in the matching field | +0.35 | already-resolved enricher handles |
| **Affiliation match** — author institution/company ∈ subject's known employers/education | +0.4 | LinkedIn page text, Wikidata employer/educatedAt |
| **Co-author / link corroboration** — an Exa-surfaced URL ties the subject to this work | +0.35 | searchHighlights |
| **ORCID / DOI cross-link** — the record is linked from a profile we already trust | +0.5 | grounding |
| **Name commonness penalty** — common surname (Smith/Wang/Kim) ⇒ require MORE corroboration | −0.2 | static frequency list |

**Accept at ≥ 0.6, requiring at least TWO independent positive signals** (never a
lone name match). This is exactly the Karen-Smith rule: name + (field OR co-platform
OR affiliation) ⇒ confident. A bare name match on a common name ⇒ rejected.

Key design notes:
- **Field overlap is the workhorse.** A founder building a genomics startup who has
  a paper tagged `q-bio` is almost certainly the author; the same name on a paper
  tagged `hep-th` (particle physics) is almost certainly NOT. Topic vectors do most
  of the disambiguation.
- **Reuse already-resolved handles.** By the time academic enrichers run, we already
  have confidence-gated GitHub/HF/SO identities — "they have HF models in ML" is a
  free, strong corroborator.
- **Log what was rejected** so we can audit false-negatives later.
- Existing `githubMatchConfidence` should be refactored to call this shared primitive
  (company-correlation becomes the "affiliation match" signal).

This single primitive converts the entire "risky academic cluster" from
unshippable to shippable.

---

## 1. Shipped tonight ✅
- **GitHub GraphQL contribution graph** (#223, merged) — trailing-12-mo commits/PRs/
  reviews + **private-contribution count** (ships-privately fix) + gists + sponsors.
  Identity-safe (reuses confirmed login).
- **Dollar log-curve calibration** (#225, draft — gated on approval) — see audit.

## 2. Ready to build — keyless + identity-safe (no waiting on you)
These key off an ALREADY-resolved handle/domain, so no new match risk. Each needs a
new `Enricher` registry entry + a deepened waterfall step + rubric rules.

| Source | Keyed on | Signal | Waterfall step |
|---|---|---|---|
| **Package registries** — PyPI, crates.io, RubyGems, pub.dev, NuGet, pkg.go.dev | package author / repo link → confirmed GitHub | cross-ecosystem OSS footprint (a multi-language founder is hard to fake) | "Scanning PyPI / crates.io / RubyGems for your packages" |
| **Wayback Machine** (`archive.org/wayback/available`) | company domain | first-seen date = founding-year verification | "Checking the Wayback Machine for your company's first appearance" |
| **crt.sh** (cert transparency) | company domain | oldest SSL cert = independent founding timestamp | "Checking SSL certificate history for company age" |
| **Wikipedia pageviews** (`wikimedia.org/.../metrics/pageviews`) | already-resolved Wikipedia title | notability *magnitude* (10k views/mo = genuinely known) | deepen existing "Checking Wikipedia" |
| **Tranco list** (CSV) | company domain | domain-rank cross-check vs Majestic | deepen existing Majestic step |

**Note on EXA query expansion** (patents / academic / press / podcasts / conferences
/ findSimilar): high-leverage but each *extra* Exa search costs money, so it's **not
free** — deferred to the paid-pass per your "free ones first." The cheap version
(adding terms to the single existing query) is already partly done for prestige;
more terms dilute 10 result slots, so a dedicated paid pass is the right move.

## 3. Ready to build — keyless but NAME-BASED (need the §0 fingerprint first)
Build `corroborationConfidence` (§0), then these become safe:

| Source | Endpoint | Signal |
|---|---|---|
| **Semantic Scholar** | `api.semanticscholar.org/graph/v1` (keyless) | author h-index / citationCount — cross-checks OpenAlex |
| **arXiv** | `export.arxiv.org/api/query` | preprints = active deep-tech researcher; field tags drive corroboration |
| **CrossRef** | `api.crossref.org/works` | citation graph, co-authors, venues |
| **DBLP** | `dblp.org/search/publ/api` | CS publications at top venues (ACM/IEEE/USENIX/NeurIPS) — very high SNR for CS founders |
| **ORCID** | `pub.orcid.org/v3.0/{id}` | when an ORCID is surfaced, it's a strong identifier — affiliations/works/funding |
| **Codeforces** | `codeforces.com/api/user.info` | competitive-programming rating (handle needed → corroborate via GitHub/bio) |

We already have **OpenAlex** (h-index) with disambiguation — fold the new academic
sources into the same identity gate to avoid double-counting and false matches.

## 4. Needs a free account/key — register, drop into Vercel, I'll wire
| Source | Register at | Signal |
|---|---|---|
| Libraries.io | libraries.io/account | SourceRank + dependent-repos across 32 ecosystems |
| Podcast Index | api.podcastindex.org | podcast guest appearances (tier-1 = credibility) |
| Google Cloud key | console.cloud.google.com (enable Knowledge Graph + YouTube Data) | notability threshold + talk reach |
| Lens.org | lens.org | patents + scholarly in one call |
| USPTO PatentsView | search.patentsview.org (free key) | US patents by inventor + CPC class (domain) |
| Product Hunt | producthunt.com/v2/oauth/applications | repeat product launches + upvotes |
| Reddit | reddit.com/prefs/apps | company discussion + founder AMAs |
| Kaggle | kaggle.com → account → API token | ML competition rank, notebook votes |
| Stack Exchange | works keyless (300/day); stackapps.com key for 10k/day | broader than SO: Security.SE, MathOverflow, etc. |
| OpenCorporates | opencorporates.com/api_accounts | serial-founder registry across 140 jurisdictions |
| OpenPageRank / BuiltWith | domcop.com/openpagerank · builtwith.com | domain authority / tech stack |
| GDELT | keyless (`api.gdeltproject.org`) | global press volume + tone (company-name keyed → lower risk) |

## 5. Investor-specific (mostly via existing SEC enricher + EXA)
- **SEC EDGAR full-text (EFTS)** — deepen the existing sec-edgar enricher: Form ADV
  (AUM → feeds the dead **capital** axis), 13D/13G (>5% public bets), Form 4 (insider
  history), S-1 selling shareholders (exits). Keyless. High value; investor verification.
- **Forbes Midas List / YC company DB / CB Insights unicorn tracker** — EXA-crawlable
  (paid pass). Midas List membership → strong investor-credibility + the **outcomes**
  axis.
- **Fix Neo first** (see audit P2): the structured investor facets are 0% populated,
  which is why the industry filter + capital axis are empty. Higher ROI than any new
  investor source.

## 6. Paid pass (your call later)
Crunchbase Pro (~$600/mo, portfolio depth) · SimilarWeb (traffic) · PitchBook
(fund returns) · Clearbit (~$99/mo) · Proxycurl (~$0.10/call structured LinkedIn) ·
Listen Notes ($15/mo). The EXA query expansion (patents/press/podcasts) also lands
here since extra Exa searches cost per-eval.

---

## Recommended build order
1. **`corroborationConfidence` primitive (§0)** — unblocks the whole academic cluster; refactor `githubMatchConfidence` onto it.
2. **Package registries** (§2) — biggest keyless technical-breadth win, identity-safe.
3. **Wayback + crt.sh** (§2) — cheap, safe founding-date verification.
4. **Semantic Scholar + arXiv + DBLP** (§3) behind the §0 gate — deep-tech credibility.
5. **SEC EFTS deepening** (§5) — investor verification + feeds the capital axis.
6. Wire each key-gated source (§4) as you add keys.

Every source ships with: a registry entry, a deepened waterfall step (so users see
it being checked), rubric rules, the identity gate, a per-source timeout, fail-safe
empty-on-error, and tests.
