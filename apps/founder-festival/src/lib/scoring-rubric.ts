export const SCORING_RUBRIC = `
You are evaluating a person against TWO independent rubrics — Founder and Investor.
Apply both. The same person can score on both dimensions; if no signal exists for
a dimension, leave that breakdown empty (score 0).

For each rule that triggers, emit ONE row in the appropriate breakdown array with
the integer point value and a single-sentence reason citing the specific fact from
the search highlights.

==== FOUNDER RUBRIC ====
- isPastFounder=true: +5
- isCurrentFounder=true: +10
- FUNDING IS A TOP SIGNAL. Actively look for the founded company's fundraising in
  the highlights / grounding / enrichment — Series rounds, total raised, and the
  post-money VALUATION of the latest round (e.g. "raised $130M Series D at a $1.5B
  valuation"). You MUST populate the STRUCTURED FIELDS, not just mention figures in
  a reason:
    • extractedMetrics.totalRaisedUsd = total capital the company raised, in dollars.
    • extractedMetrics.peakValuationUsd = the company's highest known post-money
      valuation, in dollars. If ANY source says it was "valued at $X", raised "at a
      $X valuation", or calls it a "unicorn", set this field (e.g. $1.5B →
      1500000000). Recognizing the valuation in prose but leaving this field null is
      a BUG that severely underscores the founder — do not do it.
    • Set isUnicornFounder=true whenever peakValuationUsd ≥ $1B.
  A well-funded company whose numbers never reach these fields is the #1 cause of a
  founder being underscored — do not leave them null when the evidence is present.
- FOUNDER VALUATION (dollar-weighted; STILL-PRIVATE companies) — one of the most
  important founder signals; do NOT skip or under-weight it. For a company they
  founded that is still private and reached a known peak post-money valuation,
  award +1 per $1M of that valuation, UNCAPPED:
      points = max(1, floor(peakValuationUsd / 1,000,000))   ($1.5B → 1500, $500M → 500)
  Emit the row in EXACTLY this shape — all of points, rule, AND verification:
      {"points": 1500, "reason": "Apollo GraphQL last raised at a ~$1.5B valuation (Series D, 2021).", "rule": "founder_valuation", "verification": "corroborated"}
    • The rule: "founder_valuation" field is MANDATORY. WITHOUT IT the row is
      capped at +200 and the magnitude — the entire point of this rule — is
      destroyed. Always include it. (We saw a $1.5B founder score 120 instead of
      1500 because this tag was omitted — never repeat that.)
    • ALSO set extractedMetrics.peakValuationUsd to the exact figure (e.g. 1500000000).
    • VERIFICATION: a priced funding round reported by a reputable outlet
      (TechCrunch, Forbes, the company's own funding announcement) and/or listed on
      Crunchbase / PitchBook is "corroborated" (full weight) — "authoritative" if it
      is in the GROUNDED FACTS block. NEVER mark a well-reported priced round
      "single-source" or "self-asserted".
    • SUPERSEDES "Venture raised" for the SAME company — do NOT also emit a
      venture_raised row for it (that double-counts one fundraise). Use
      "Venture raised" only for companies with a known raise but NO known valuation.
    • PRIVATE ONLY. If the company already exited (acquired / IPO'd), use
      "FOUNDER EXIT" instead — never award both exit and valuation for one company.
- Venture raised: if totalRaisedUsd > 0 (and no founder_valuation was awarded for
  that company) then max(1, floor(totalRaisedUsd / 1,000,000)).
  Any verified raise gets at least +1 (so seed founders get a signal). $84.9M → +84.
  NO upper cap on this row — a $1B raise legitimately scores +1000. This row MUST
  set rule: "venture_raised" so the clamp pipeline knows to leave it uncapped.
  → reason MUST cite the exact dollar figure used.
- Y Combinator alum: +10
- FOUNDER EXIT (dollar-weighted) — for each company they founded that exited,
  award points on the SAME +1-per-$1M uncapped scale as "Venture raised":
  points = max(1, floor(exitValueUsd / 1,000,000)). This row MUST set
  rule: "founder_exit" so the clamp pipeline leaves it uncapped.
    • ACQUISITION: exitValueUsd = the acquisition / purchase price in USD. If
      they founded multiple acquired companies, SUM the prices into one
      acquisitionPriceUsd and award once on the sum.
    • IPO / still-public company: exitValueUsd = the HIGHER of (a) the company's
      CURRENT market capitalization today, or (b) its market cap AT IPO — NOT the
      proceeds raised. You MUST look up the CURRENT market cap for a company that is
      still publicly traded; the IPO-day figure is usually badly stale and would
      massively underscore the founder. (Real failure: NVIDIA IPO'd at ~$6B in 1999
      but is worth ~$3.5T today — using the $6B IPO figure scored its founder as if
      they run a $6B company. Microsoft, Apple, Amazon, Meta, etc. are all worth
      orders of magnitude more now than at IPO.) For a company that has since fallen
      below its IPO valuation, the IPO figure acts as a floor — award on whichever is
      higher. Example: NVIDIA → use ~$3.5T (current) → +3500000.
    • A sub-$1M exit floors to +1, mirroring the raise floor.
    • reason MUST cite the exact dollar figure used and whether it is current or at
      IPO (e.g. "NVIDIA currently trades at a ~$3.5T market cap." or "Sold Acme to
      Google for $400M.").
    • Set extractedMetrics.currentMarketCapUsd (current, if still public),
      extractedMetrics.ipoMarketCapUsd (at IPO), and/or acquisitionPriceUsd to the
      figures you used; award on max(currentMarketCapUsd, ipoMarketCapUsd) for an IPO.
- Current company is profitable (public signal): +10
- Any of their companies had co-founders: +5 (apply once total)
- Majestic Million prominence: the SYSTEM computes this bonus deterministically
  from the RESOLVED company domain's global rank (log curve; founders get the full
  amount, non-founder employees ×0.1). Do NOT emit a Majestic Million / domain-rank
  row yourself — it is added after you score, keyed on primaryCompanyDomain.

GITHUB BUILDER SUB-RULES (apply when the [github] enrichment section identifies
the subject's GitHub account; these are FOUNDER-RUBRIC points because popular
open-source projects are founder/builder signal):

  PRINCIPLE — IMPACT, NOT PRESENCE: technical depth is demonstrated IMPACT —
  popular OSS (stars), real usage (downloads, dependents), and a large developer
  following. It is NOT merely HAVING a GitHub account, how OLD the account is, or
  a single recent push to a starless personal repo. Weight impact HEAVILY and
  presence/age LIGHTLY. Two founders who both "have a GitHub" should look very
  different if one created a 40,000-star project and the other has none.

- ATTRIBUTION: for a FOUNDER, the most important OSS is usually the COMPANY's
  GitHub ORG, not their personal account. The SYSTEM computes a company-flagship
  OSS bonus in CODE from the resolved company domain (e.g. apollographql.com →
  apollographql/apollo-client's star count). So do NOT emit a TOP-repo star row
  for the flagship OSS of the company in primaryCompanyDomain — the system adds
  that after you score. Award the TOP-repo rule below only for the subject's OWN
  personal / other OSS repos (e.g. a widely-used project under their personal
  handle). Never let a sparse personal account hide a founder's real OSS impact.
- Identified as the subject's GitHub account (verified by name match or by URL
  cited in the highlights): +2 once. (Mere identification is low signal.)
- Active builder (10 or more public non-fork repos): +5 once.
- Tenured account (account age ≥ 5 years): +1 once. Account AGE is a WEAK
  technical signal by itself — an old account with no popular work is not
  "technically deep." Keep this minimal; do not let it inflate technical depth.
- Significant following (a real developer audience IS impact):
    1,000–4,999 followers: +5
    5,000–19,999 followers: +12
    20,000+ followers: +20
- TOP-repo star points — pick the SINGLE highest-starred non-fork PERSONAL repo
  (per ATTRIBUTION, the company org is handled in code). For any repo with at
  least 100 stars, award round(25 × log10(stars)). Logarithmic and uncapped so
  outlier OSS is rewarded proportionally — 100★ → +50, 1k → +75, 10k → +100,
  100k → +125, 1M → +150. Repos under 100 stars get 0. This row MUST set
  rule: "github_top_repo" so the clamp pipeline leaves it uncapped.
- Each ADDITIONAL non-fork repo with 1,000+ stars (counting from the second-
  highest downward, max 3 additional): +20 each. A serial OSS creator behind
  several popular projects should score very high.
- Reason text MUST reference the specific repo name and star count, e.g.
  "Created OSS project 'acme-cli' with 4,200 stars on GitHub."

GITHUB RECENCY SUB-RULES (apply when the [github] enrichment surfaces the
"Most recent push" / "Repo push counts" lines; FOUNDER-RUBRIC because the
existing GitHub rules above reward presence/identity/age and over-credit
people who haven't actually shipped public code in years. These rules
distinguish "ships code TODAY" from "had a GitHub account 14 years ago."
Mutually exclusive tiers based on the most-recent push date. The MAGNITUDE
depends on whether there is REAL building behind the activity: a recent push to
a STARLESS personal repo (a personal site, dotfiles, a toy) is NOT strong
technical signal. Define a "substantial builder" as an account with at least one
non-fork repo ≥ 500 stars OR ≥ 10 non-fork repos of real work):
- Recent ship — most recent public push within the last 90 days:
    +15 for a SUBSTANTIAL builder (as defined above);
    +3 otherwise (recent activity, but no popular OSS behind it).
  Reason cites the day count or specific repo, e.g.
  "Currently shipping public code (most recent push 7 days ago, repo 'styled-components')."
- Active in last year — most recent public push within the last 365 days
  (but >90d): +8 for a substantial builder, else +2. Reason cites months-ago.
- Dormant — most recent public push >5 years ago, OR the enrichment line
  says "No public repo push activity detected": -15. Reason cites the
  dormancy, e.g.
  "GitHub account is dormant: no public push in 7 years."
  • EXCEPTION: do NOT apply this Dormant penalty to a verified FOUNDER / CEO. A
    founder who isn't personally pushing public code is NOT negative signal —
    they're running a company, and the engineering happens in the company's org.
    Personal-account inactivity must never reduce a founder's score.
- These do NOT stack — apply at most ONE recency row per eval.

GITHUB CONTRIBUTION-GRAPH SUB-RULES (apply when the [github] enrichment surfaces
the "GitHub contributions (trailing 12 months)" / "PRIVATE/restricted
contributions" / "external repos" / "gists" / "Sponsors" lines — these come from
the GraphQL contribution graph, which measures ACTUAL recent output, not just
repo presence. FOUNDER-RUBRIC current-technical-depth. The point is to reward
people who SHIP, including those who ship privately):
- Trailing-12-month contribution volume — award ONCE on the total contributions
  figure (commits + PRs + reviews):
    250–999: +5
    1,000–2,999: +10
    3,000+: +18
  Reason cites the totals, e.g. "Actively shipping: 1,840 GitHub contributions in
  the last year (1,200 commits, 410 PRs, 230 reviews)."
- PRIVATE / restricted contributions — the dormant-public-profile fix. If the
  enrichment reports private/restricted contributions, award ONCE: +6 for 500+
  private contributions, else +3. This says the person ships code daily into
  PRIVATE repos even when their public profile looks quiet — direct
  current-technical-depth evidence. Reason cites the private count. This DOES
  stack with the volume tier above (distinct facets: public volume vs private
  activity). It also OVERRIDES the Dormant recency penalty — never apply Dormant
  when private contributions are present.
- External-repo contributions — contributed commits/PRs/reviews to repos they
  don't own: +1 per 5 external repos, cap +8. Open-source collaborator signal.
- Public gists — +2 once if 10+ public gists (practitioner-level code sharing).
- GitHub Sponsors enabled — +5 once (a recognized maintainer the community funds);
  +3 more if 10+ sponsors. Maps onto Technical Depth.

LIBRARIES.IO SUB-RULES (apply when the [librariesio] enrichment is present;
FOUNDER-RUBRIC technical depth. SourceRank is Libraries.io's COMPOSITE OSS-reputation
score — it folds in docs, contributors, dependents, recency, license, etc., so it is
much HARDER TO GAME than a raw star count. Reward the QUALITY/reputation facet here;
do NOT double-count the raw-star GitHub rules):
- Top SourceRank tier — award ONCE on the highest SourceRank among their repos:
    15–19: +4
    20–24: +8
    25+: +15
  Reason cites the repo + its SourceRank, e.g. "Maintains 'acme-cli' with a
  Libraries.io SourceRank of 24 (well-documented, widely-depended-on OSS)."
- Broad contributor base — a repo with 50+ contributors: +5 once. A project that
  attracted many engineers is one the community trusts enough to invest in.

PRODUCT HUNT BUILDER SUB-RULES (apply when the [producthunt] enrichment
section identifies the subject as a maker; these are FOUNDER-RUBRIC points
because shipping products on PH is founder/builder activity):
- Identified as a maker on Product Hunt (any product launched): +5 once.
- Per product launch they made, cap +20 total: +2 each.
- Per PH-FEATURED product (the enrichment marks it FEATURED), cap +15 total:
  +3 each. (Featuring = curated to the PH homepage — a quality signal.)
- TOP-product upvote tier — pick the single highest-upvoted product they made
  and award ONCE based on that product's vote count:
    100–499 upvotes: +5
    500–999 upvotes: +15
    1,000–4,999 upvotes: +30
    5,000+ upvotes: +50
- Each ADDITIONAL product with 500+ upvotes (counting from second-highest
  downward, max 2 additional): +10 each.
- Reason text should reference the specific product name and its upvote count,
  e.g. "Made 'Acme' on Product Hunt with 1,234 upvotes (FEATURED)."

HACKER NEWS SUB-RULES (apply when the [hackernews] enrichment section
identifies the subject's HN account; FOUNDER-RUBRIC points because HN standing
is technical-community / builder credibility. Karma is the net upvotes across
all their posts AND comments — the single best reputation summary):
- Identified Hacker News account (confirmed by the enrichment): +3 once.
- Karma tier — award ONCE based on the karma figure in the enrichment:
    500–1,999 karma: +3
    2,000–9,999 karma: +8
    10,000–49,999 karma: +15
    50,000+ karma: +25
- Active poster (20 or more story posts, per the enrichment): +5 once.
- TOP-post upvote tier — pick the single highest-pointed post and award ONCE:
    100–499 points: +3
    500+ points: +8
- SHOW HN LAUNCHES — a "Show HN" post is a PRODUCT-LAUNCH event (the founder shipped
  something and put it in front of the community), qualitatively stronger than
  commenting. When the enrichment reports Show HN posts, award ONCE: +4 if they have
  any Show HN post; +8 if any Show HN post reached 50+ points (a launch that
  resonated). Builder signal → Technical Depth.
- FRONT-PAGE VIRALITY — the enrichment line "N HN post(s) scored 100+ points (…front-
  paged…)" measures REACH/virality beyond participation. Award ONCE on N: 1 → +3;
  2–4 → +6; 5+ → +10. Maps onto GTM / Distribution (community reach).
- Reason text should reference the karma and/or a specific post, e.g.
  "Active on Hacker News with 12,400 karma." or
  "Posted 'Show HN: Acme' on HN (820 points)."

HACKER NEWS CONTENT ANALYSIS (apply when the [hackernews] enrichment includes a
"Sample of their HN comments" block). Karma/posts above measure REACH; the
comment/post CONTENT is where you assess what the person PERSONALLY knows and
does. Read the samples and emit AT MOST ONE row per dimension, only when the
content genuinely shows it. CRITICAL — attribute each to the right dimension by
PHRASING the reason with that dimension's vocabulary so it buckets correctly:
- INDIVIDUAL TECHNICAL DEPTH (the comments show real engineering substance — code,
  architecture, systems/compilers/databases/distributed-systems reasoning, not
  just startup opinions): up to +8. The reason MUST contain the words "technical
  depth" or "technically", e.g. "Demonstrates personal technical depth: detailed
  HN comments on database internals and query planning." This is INDIVIDUAL
  evidence — distinct from credit for founding a technical company. A founder of a
  technical company who only writes business/strategy comments does NOT get this.
- DOMAIN EXPERTISE (deep subject-matter knowledge of a field/industry — payments,
  bio, security, etc.): up to +6. The reason MUST contain "domain expertise",
  e.g. "Deep domain expertise in payments infrastructure, per detailed HN
  comments."
- TRACTION / GTM commentary maps to those dimensions only if clearly about
  fundraising/exits (traction) or growth/distribution (gtm); otherwise skip.
- Also populate extractedMetrics topics → the person's interest areas / industries
  inferred from the content (used for the Industries section).
- BE CONSERVATIVE: thin or purely-social comments earn NOTHING here. The point is
  to measure the PERSON, not the company they founded.

SEC EDGAR / FORM D SUB-RULES (apply when the [sec-edgar] enrichment section is
present; FOUNDER-RUBRIC because being a named related person on a Form D
exempt-offering filing confirms an officer/director role at a company that
raised private capital — this is the AUTHORITATIVE funding record):
- The SEC Form D dollar figures are AUTHORITATIVE and OVERRIDE press-snippet
  estimates. When the enrichment reports a Form D offering amount for a company
  the subject founded or leads, you MUST prefer that figure as
  extractedMetrics.totalRaisedUsd and as the input to the "Venture raised"
  founder rule above, and cite the SEC figure in the reason (e.g. "Raised
  $201.6M per Stripe's SEC Form D filing.").
- Being confirmed as a named related person satisfies the current-founder /
  operator signal: emit the +10 current-founder row if not already triggered.
- Do NOT double-count: capital-raised points still come ONLY from the existing
  "Venture raised" rule. This block improves the accuracy of that dollar figure
  and confirms the role; it does not add a separate capital-raised award.
- IPO / EXIT (FOUNDER): when the enrichment reports that a company the subject is
  a named related person on "has gone public" (filed an S-1 and now files
  10-K/10-Q), that is AUTHORITATIVE evidence of an exit. Emit the founder
  "FOUNDER EXIT" row for that company using rule: "founder_exit", set
  extractedMetrics.hadIpo=true, set extractedMetrics.ipoMarketCapUsd to the
  company's market cap at IPO AND extractedMetrics.currentMarketCapUsd to its
  CURRENT market cap if it is still publicly traded, and award the row on
  max(currentMarketCapUsd, ipoMarketCapUsd) per the FOUNDER EXIT rule above (a
  still-public company is almost always worth far more now than at IPO). Do NOT
  award a separate flat bonus — the dollar-weighted founder_exit row IS the exit
  award. This SEC IPO
  signal is authoritative verification; do not award it again from a press
  snippet about the same IPO (no double-count).
- INVESTMENT FUND (INVESTOR): when the enrichment reports the subject is a named
  related person (fund manager / GP) on a "pooled investment fund", that is
  AUTHORITATIVE evidence they run/co-run an investment fund. Apply the INVESTOR
  "Active GP / fund manager" (+15) row (and "Partner / Principal" if the firm is
  named) if not already triggered by another source, and treat the row as
  authoritative verification. The Form D "fund size" GROUNDS fund-manager status
  but is the fund's capital, NOT the subject's founder raise — never feed it into
  the founder "Venture raised" rule. Do NOT double-count: this confirms the
  role/fund size; it does not add a separate per-fund award beyond the GP row.

STACK OVERFLOW SUB-RULES (apply when the [stackoverflow] enrichment identifies
the subject's account; FOUNDER-RUBRIC because SO reputation is technical
credibility):
- Identified Stack Overflow account: +2 once.
- Reputation tier (award ONCE on the reputation figure):
    5,000–24,999: +3
    25,000–99,999: +8
    100,000+: +15
- Reason cites the reputation, e.g. "145k reputation on Stack Overflow."

NPM SUB-RULES (apply when the [npm] enrichment identifies the subject as a
package maintainer; FOUNDER-RUBRIC open-source builder signal):
- Identified npm maintainer (≥1 package): +2 once.
- Total monthly downloads across their packages (award ONCE):
    100k–999k/mo: +3
    1M–9.9M/mo: +8
    10M+/mo: +15
- Reason cites the top package and its downloads, e.g.
  "Maintains 'chalk' on npm (1.8B downloads/mo)."
- DIRECT DEPENDENTS tier (award ONCE — stronger OSS-impact signal than
  downloads; downloads can be inflated by CI runs, but a real public
  package depending on yours is a hard load-bearing signal). Read the
  "X direct npm dependents" figure from the enrichment:
    50–499 direct dependents: +5
    500–4,999 direct dependents: +15
    5,000–49,999 direct dependents: +30
    50,000+ direct dependents: +50
- Reason cites the dependent count, e.g.
  "Top package 'chalk' has 810 direct npm dependents (deps.dev)."

HUGGING FACE SUB-RULES (apply when the [huggingface] enrichment identifies the
subject as a model/dataset author; FOUNDER-RUBRIC AI/ML builder signal):
- Identified Hugging Face author (≥1 model): +3 once.
- Total model downloads (award ONCE):
    10k–99k: +3
    100k–999k: +8
    1M+: +15
- Reason cites the top model and its downloads.

KAGGLE SUB-RULES (apply when the [kaggle] enrichment identifies the subject as a
dataset/notebook author; FOUNDER-RUBRIC data-science / ML builder signal — a peer-
voted proxy for hands-on ML depth, complementary to [github] / [huggingface]):
- Identified Kaggle author (≥1 published dataset or notebook): +3 once.
- Total community upvotes across their Kaggle work (award ONCE):
    50–499: +3
    500–4,999: +8
    5,000+: +15
- Reason cites the published counts + their top item, e.g. "Published 18 datasets
  and 40 notebooks on Kaggle; top dataset has 1,200 upvotes." Do NOT also award the
  upvote bonus a second time for downloads — votes are the headline metric.

CRATES.IO SUB-RULES (apply when the [crates] enrichment identifies the subject as a
Rust crate author; FOUNDER-RUBRIC open-source builder signal, sibling to [npm] /
[github]). The Rust ecosystem is smaller than npm, so the download tiers are lower:
- Identified crates.io author (≥1 published crate): +2 once.
- Total crate downloads (award ONCE):
    100k–999k: +3
    1M–9.9M: +6
    10M+: +10
- Reason cites the top crate + downloads, e.g. "Maintains 'tokio' on crates.io
  (2.1B downloads)." Counts the SAME open-source contribution only once — if a
  project is already credited via [github], treat crates.io as corroboration of reach,
  not a second independent award.

TRANCO SUB-RULES (apply when the [tranco] enrichment reports a domain rank): Tranco
is an INDEPENDENT cross-check of the Majestic Million domain-reach signal. To avoid
double-counting, the domain-reach magnitude is awarded AT MOST ONCE across Majestic
Million (computed deterministically by the SYSTEM) and Tranco combined — Tranco does
NOT add points on top of an MM bonus for the same domain. Its role is to RAISE
CONFIDENCE / corroborate when MM agrees, and to provide a reach signal when MM is
silent but Tranco ranks the domain. Do NOT emit a separate Tranco point row when the
SYSTEM already emitted a Majestic Million row for the same company.

WIKIDATA SUB-RULES (apply when the [wikidata] enrichment matched a human
entity for the subject):
- Wikidata entity exists for the subject: +5 once (notability). To avoid
  double-counting with Wikipedia, award the notability bonus AT MOST ONCE
  across [wikipedia] and [wikidata] combined (max +5 total, not +5 each).
- If Wikidata asserts the subject is "founder of" / CEO / employer of a
  company, treat it as corroborating the founder/operator signal — it does NOT
  add points beyond the existing founder rules; it raises confidence.
- WIKIPEDIA PAGEVIEW MAGNITUDE — separate from the binary +5 notability above,
  reward HOW widely known they are when the [wikipedia] enrichment reports an
  average monthly pageview figure. Award ONCE on the figure (this is a magnitude
  signal — fame/prominence — distinct from merely HAVING a page):
    1,000–9,999 views/month: +3
    10,000–49,999: +6
    50,000+: +12
  Maps onto Domain Expertise / prominence. Reason cites the figure, e.g.
  "Wikipedia page averages ~120,000 views/month — widely-known public figure."

GOOGLE KNOWLEDGE GRAPH (apply when the [google-kg] enrichment reports a corroborated
entity): Google maintaining a knowledge panel for the person is a notability
THRESHOLD that's hard to manufacture. Award +4 once. Maps onto Domain Expertise /
prominence. It is a DISTINCT source from Wikipedia/Wikidata, so it may add on top of
them — but keep overall notability sensible: three notability sources do NOT mean
three large independent bonuses; this is a modest corroborating signal.

LINKEDIN FOLLOWERS (from the [brightdata] enrichment): DO NOT award any points
for LinkedIn follower or connection counts. The system scores follower reach
deterministically (1 point per 1,000 followers) and appends its own row — if you
also award points here it double-counts. Use the follower number only as context.

CRUNCHBASE COMPANY DATA (from the [crunchbase] enrichment): these are AUTHORITATIVE
third-party facts about the SUBJECT'S OWN company (already corroborated as theirs).
Treat them as strong evidence and mark rows backed by them "authoritative":
- Funding raised, valuation, # of rounds, and notable investors → use these
  numbers for the fundraising rows you'd already emit (don't ADD a second row —
  fold the authoritative figure into the company's existing raise/valuation row).
- An acquisition ("acquired by X") → an EXIT for the founder.
- Employee count / operating status → company scale (operator signal).
- Monthly web visits (Semrush) and app downloads (Apptopia) → product TRACTION /
  distribution. Award a modest traction row ONCE on the strongest such figure
  (e.g. 100k+ monthly visits or 100k+ downloads = a real, used product).
Only credit FOUNDER rows from this when the subject actually founded / leads the
company (per their LinkedIn role); a mere employee of a big company gets no
founder credit. As always, reasons state the FACT only — never point values.

LINKEDIN COMPANY DATA (from the [linkedin-company] enrichment — the subject's OWN
current company, exact identity): use the company headcount/size as an OPERATOR
scale signal and the company follower count as a DISTRIBUTION signal — but DON'T
double-count with the [crunchbase] employee/traffic figures (prefer the Crunchbase
authoritative number when both are present; otherwise award a single modest
operator/distribution row). Founder-credit only when they lead the company.

CRUNCHBASE PERSON DATA (from the [crunchbase-person] enrichment — the subject as a
named person, exact identity): board / advisor roles across companies are an
INVESTOR / operator-experience signal (award a modest investor or founder row once
on the count); a large number of tracked career roles signals operator depth; a
high news-article count is press notability (fold into prestige, don't double-count
with Wikipedia/KG). Modest weight — these corroborate, they're not big standalone
awards. Reasons state the FACT only — never point values.

USPTO PATENTS (from the [patents] enrichment — US patents naming the subject as an
inventor, already corroborated by assignee company): a real TECHNICAL / domain-
invention signal that they build novel technology. Award ONE technical-depth row
scaled to how many (a single patent is a meaningful signal; several granted patents
is strong). Routes to the Technical vector. Don't double-count with GitHub OSS —
this is a DISTINCT kind of technical evidence (invention vs open source).

X/TWITTER REACH (from the [twitter] enrichment — the subject's own X account they
linked on LinkedIn): the follower count is an audience / DISTRIBUTION signal. Award
a modest GTM/distribution row ONCE on a meaningful following (e.g. 10k+ followers).
Do NOT double-count with the LinkedIn follower reach (scored separately/
deterministically) — this is a different platform's audience.

YOUTUBE REACH (apply when the [youtube] enrichment reports company-corroborated
videos with view counts — talks, interviews, media coverage). This is a
thought-leadership / DISTRIBUTION reach signal. Award ONCE on the TOP corroborated
video's view count:
    10,000–99,999 views: +3
    100,000–999,999: +6
    1,000,000+: +10
  Maps onto GTM / Distribution. The enrichment already gated each video on the
  subject's own company appearing in its metadata, so treat it as theirs. Reason
  cites the top video + views, e.g. "Conference talk/interview with 480k YouTube
  views — strong thought-leadership reach."

OPENALEX SUB-RULES (apply when the [openalex] enrichment identifies the subject
as a researcher; FOUNDER-RUBRIC deep technical / domain-expertise signal):
- Identified researcher (the enrichment already gated on a real footprint): +3 once.
- h-index tier (award ONCE on the h-index figure):
    20–49: +5
    50–99: +10
    100+: +15
- Reason cites the h-index / citations, e.g.
  "Deep research credibility: h-index 42, 12,300 citations (OpenAlex)."

DEV.TO TECHNICAL-WRITING SUB-RULES (apply when the [devto] enrichment is
present; FOUNDER-RUBRIC current-technical-depth signal — published technical
articles are direct evidence that the person ships AND reasons about code in
public, distinct from passively "having a GitHub account." A high GitHub
account age WITHOUT this kind of public technical output is a weaker
technical-prowess signal than the existing rubric implies; these rules let
sustained dev.to writing make up the gap):
- Publishes on dev.to with confirmed identity (the enrichment fired at all):
  +2 once. Mere presence is low-value but non-zero — it costs effort to
  publish even one thing.
- Sustained technical writer — at least 5 articles tagged as TECHNICAL on the
  enrichment line ("N on technical topics" count): +6 once. Reason cites
  the technical-article count and the most-common technical tag, e.g.
  "Sustained dev.to author: 12 technical articles (top tags: typescript,
  nextjs)."
- High-impact article — top article has 200+ positive reactions: +6 once.
  Reason cites the article title and reaction count.
- Active in the last 12 months — most-recent-published date is within the
  last 365 days: +4 once. Pairs with the recency principle the GitHub
  rules use.
- These DO stack with each other (they reward distinct facets: presence,
  volume, quality, recency) but together cap at +18 from the [devto]
  section. If multiple fire, cite each contribution in its own row.

HN TOKENMAXXING SUB-RULES (apply when the [hn-tokenmaxxing] enrichment is
present; FOUNDER-RUBRIC current-technical-depth signal — being on the
curated leaderboard at tkmx.odio.dev means the subject is an active heavy
LLM-tooling user TODAY, which is what "ships code today" actually looks
like in 2026. Not just historical GitHub presence):
- Listed on the leaderboard: +10 once. The leaderboard is curated/opt-in,
  so being listed at all already signals deliberate engagement.
- 28-day total-tokens rank tier — award ONCE based on the rank field on
  the enrichment:
    Top 25 on a ~50-person board: +10
    Top 10: +20
    Top 5: +35
- Reason cites the rank + token volume, e.g.
  "Ranked #3 on the HN Tokenmaxxing 28-day leaderboard with 30.9B tokens."

PRESTIGE / RECOGNITION SUB-RULES (cross-cutting; applies to BOTH the Founder and
Investor rubrics). Third-party RECOGNITION is a real credibility signal that is
distinct from competency — award it consistently with the tiers below. Emit each
distinct honor as its OWN row, in whichever breakdown (founder vs investor) the
recognition pertains to: a personal / founder honor → founder; an investing-specific
honor (e.g. Forbes Midas List) → investor. Default to founder if ambiguous. Distinct
honors STACK — there is NO overall cap — but award each individual honor ONCE.
- TIER 1 — elite (+12 to +18): Thiel Fellowship; Rhodes / Marshall / Knight-Hennessy
  Scholar; MacArthur "Genius" Fellowship; Nobel Prize, Turing Award, Fields Medal,
  ACM Prize; election to the National Academy of Engineering / Sciences; medalist at a
  national or international academic olympiad (IMO / IOI / IPhO, etc.). Use the top of
  the range for the rarest (Nobel / Turing / MacArthur), the bottom for
  Thiel / olympiad. Reason cites the awarding body + year.
- TIER 2 — notable (+6 to +10): Forbes 30 Under 30; TIME100; Fortune 40 Under 40; a
  genuine FEATURE PROFILE of the subject in a tier-1 outlet (Wall Street Journal,
  New York Times, Forbes, Fortune, The Economist, Bloomberg) — a dedicated article
  about THEM, not a passing quote or a mention of their company.
- TIER 3 — minor (+2 to +4): a regional or industry award; a feature on a notable
  podcast; a profile in a smaller or trade outlet.
DOUBLE-COUNT GUARD — prestige is ONLY for recognition that has no dedicated rule
elsewhere. Do NOT also emit a prestige row for: Y Combinator / accelerator membership
(already scored as a founder / operator signal), Wikipedia / Wikidata notability
(already scored), or research citations / h-index (already scored via OpenAlex). One
honor, one row.
AXIS SUBSTANCE — when a recognition signal EVIDENCES a specific competency, NAME that
competency in the reason so it maps onto the right credibility axis and affects the
radar: e.g. "Wall Street Journal feature on their go-to-market playbook" (→ GTM),
"profiled for scaling the engineering org to 500" (→ operator), "recognized for deep
technical work on database internals" (→ technical depth), "award for domain
expertise in genomics" (→ domain). A recognition with NO specific competency (a bare
"Forbes 30 Under 30") still scores its points but is recognition-only — that is
intended, not a miss.

==== INVESTOR RUBRIC ====
Apply these in order. Several rules are deliberately easy-to-trigger so that a
person publicly identified as an active investor scores meaningfully even when
specific deal counts or dollar figures aren't disclosed in the highlights.

- Per active investment they've made: +1 each, capped at +50
  → If a source says "200+ angel investments" or similar, use that figure.
  → The GROUNDED FACTS block's "Investor portfolio: ~N companies invested in" line
    IS that authoritative count — use N directly for this rule. Its individual
    "Investment: <company> (ipo/acquisition/unicorn/active)" lines feed the
    portfolio-OUTCOME rules below (IPO +50, acquisition +20/+5, unicorn +30); each
    is a cited third-party fact, so mark those rows "authoritative"/"corroborated".
    This is the PRIMARY way a prolific ANGEL (not a VC-firm partner — e.g. an
    operator who personally backs many startups) earns a real investor score; do
    NOT leave such a person at 0 just because they aren't on NFX/Neo.
- Per $1M total deployed (cumulative across investments): +1 each, capped at +100
- Per portfolio IPO: +50
- Per portfolio acquisition (≥ $100M reported value): +20
- Per portfolio acquisition (smaller or undisclosed value): +5
- Per portfolio unicorn (still private, valuation > $1B): +30
- Partner / GP at a top-tier firm (Sequoia, Benchmark, a16z, Founders Fund,
  Greylock, Accel, Bessemer, Lightspeed, USV): +30
- Partner / Principal at any other recognized VC firm: +15
  (Apply for any firm with a website + public deal record; doesn't require deals
  to be listed inside the highlights.)
- Active GP / fund manager: +15 (apply when subject runs/co-runs an investment
  fund — angel syndicate, search fund, micro-VC, etc. — even if the fund isn't
  a recognized name. Apply once, in addition to "Partner / Principal" if both
  fit.)
- Publicly identified as an angel investor: +15
  (Apply when sources explicitly call the subject an angel investor, named angel,
  or similar — does NOT require marquee-tier reputation. If they're elevated to a
  household-name, marquee investor, use +25
  instead of +15.)
- Per year of investing experience, cap at 15 years: +1 each.
  → If a source gives a fund/firm founding year (e.g., "Acme Venture
  Partners (1997)"), count from that year to today as the floor; you do not
  need an explicit "X years of investing" phrase.

NFX SIGNAL SUB-RULES (apply when the [nfx] enrichment section is present; it is a
STRUCTURED investor directory and is far stronger than press-snippet inference):
- Being listed on NFX Signal confirms the subject is a recognized investor: emit
  the "Publicly identified as an angel investor" (+15) row if not already
  triggered by another source. If NFX shows a firm + fund size, prefer the
  "Active GP / fund manager" (+15) or "Partner / Principal" rows as applicable.
- The NFX "portfolio (N total)" count is an AUTHORITATIVE deal count: use N as
  the input to "Per active investment they've made" (+1 each, cap +50). Do NOT
  ALSO infer a separate investment count from press — NFX's figure wins.
- A CLAIMED NFX profile (the investor verified it themselves) is a strong
  corroboration signal: treat NFX-derived investor rows as "corroborated"
  verification (not self-asserted), and "authoritative" when the enrichment notes
  a LinkedIn match.
- "Leads rounds" + a stated check size confirm an active (not passive) investor —
  supports the GP/fund-manager rows; do not add separate points for these alone.
- "Current fund size" grounds fund-manager status but is NOT the same as capital
  raised by the subject as a FOUNDER — never feed NFX fund size into the founder
  "Venture raised" rule.
- Do NOT double-count: NFX improves the accuracy/evidence of the existing investor
  rules above; it does not create new point categories beyond mapping onto them.

==== CREDIBILITY TITLE ====
Emit a "credibilityTitle": ONE punchy sentence (≈ 4–14 words, no trailing period
needed) describing who this person is at their most impressive — shown as the
headline above their profile badges. Lead with the strongest, most-verifiable
credential and what they're doing now. Factual and specific; no hype, no scores,
no point values, no numbers you can't support.
  ✓ "4x-exited YC founder and angel investor now building Chief"
  ✓ "Stripe co-founder and CEO scaling internet payments"
  ✓ "Sequoia partner backing early-stage AI infrastructure"
  ✓ "Two-time enterprise SaaS founder, one acquisition by VMware"
  ✗ "+1200 founder points" (NEVER reference points/scores)
  ✗ "A highly impressive and accomplished leader" (vague hype, no specifics)
Set credibilityTitle to null ONLY when the signal is too thin to say anything
specific (the same low-signal case where scores are 0).

==== HARD CHECKS ====
1. founderScore MUST equal sum(founderBreakdown[].points)
2. investorScore MUST equal sum(investorBreakdown[].points)
3. combinedScore MUST equal founderScore + investorScore
4. Every reason text MUST cite numbers consistent with the calculation. If
   totalRaisedUsd was $8,000,000, never write "$83M" in the reason.
5. signalQuality is METADATA — it never prevents scoring. Always emit
   whatever points you can support from the highlights or LinkedIn page text,
   even when other rule inputs are uncertain. The ONLY case where every score
   is 0 and breakdowns are empty is when you cannot identify the subject as a
   real person at all (e.g., the URL points to a parked profile, you can't
   determine a fullName, and no source mentions them by name).
6. FOUNDER DETECTION IS A FLOOR, NOT A CEILING. If ANY source identifies
   the subject by name as a founder, co-founder, CEO, or "started" / "founded"
   a company, you MUST emit the corresponding +5 (past) or +10 (current)
   founder row — even if other fields like totalRaisedUsd or YC status are
   uncertain. Lacking detail on raises doesn't erase a confirmed founder role.

==== DOUBLE-VERIFICATION (per-row evidence tier) ====
Every breakdown row gets a "verification" tier and a "sources" array. We do NOT
cap scores — instead, HIGH-VALUE rows (|points| >= 25) are automatically
DOWN-WEIGHTED downstream unless they're well-evidenced. So classify honestly:

- "authoritative": backed by an official filing/record — a SEC EDGAR Form D /
  S-1 / Form ADV figure, a government grant award, or the GROUNDED FACTS block
  (which is third-party-sourced). Counts at full weight.
- "corroborated": stated by TWO OR MORE INDEPENDENT third-party sources (e.g.
  a TechCrunch article AND a Crunchbase profile — not two pages of the same
  outlet, and NOT the subject's own LinkedIn). Counts at full weight.
- "single-source": one third-party source, no corroboration. (×0.6 if high-value.)
- "self-asserted": the claim appears ONLY in the subject's own LinkedIn page
  text or personal site — no independent confirmation. (×0.25 if high-value.)

Put the supporting URLs in "sources". A row whose only evidence is the LinkedIn
page text MUST be "self-asserted". Prefer the GROUNDED FACTS block and named
enrichment sections — those are independent. This protects against someone
inflating their score by writing impressive but unverifiable claims about
themselves. Low-value rows (|points| < 25) are unaffected by tier, but still
set it accurately.

==== REASON TEXT STYLE ====
Each "reason" string is shown to the END USER on their score page. They MUST
read like short factual descriptions, not scoring math. Examples of GOOD reasons:
  ✓ "Current founder and CEO of Acme."
  ✓ "Raised $8M total across Acme and Foo."
  ✓ "Y Combinator W22 alum."
  ✓ "Three exits: Foo (acquired by Google), Bar (IPO), Baz (acquired)."
  ✓ "Partner at Sequoia."
  ✓ "Founder of armory.io."

Examples of BAD reasons (DO NOT EMIT THESE):
  ✗ "Founder of armory.io (+min(100, floor(10000/740077)) = 0)."
  ✗ "Raised $8M → +80 (10×8)."
  ✗ "YC alum; awarding +10."
  ✗ Any reason containing "+N", "→", "min(", "floor(", "=", or formulas.

Keep each reason to ONE clean sentence. No parentheticals containing math.
No score totals embedded in the prose. The score column already shows the
points; the reason explains the FACT.

==== PER-PHRASE CITATIONS ====
REQUIRED: every breakdown row emits a "citations" array in addition to the
row-level "sources". Each entry pairs a SPECIFIC SUBSTRING of the reason
text (the "phrase") with the URL(s) that back THAT phrase. The phrase MUST
appear VERBATIM in the reason — character-exact substring match (same
case, same punctuation, same spaces). The UI renders matched phrases with
a subtle underline and a hover popover listing the sources.

HARD RULE: if the row's "sources" array contains ANY non-LinkedIn URL,
"citations" MUST be non-empty. Every non-LinkedIn URL in "sources" must
appear in at least one citation entry. LinkedIn URLs (linkedin.com/...)
are the ONE exception: they don't need to be cited (the score is already
linked to their LinkedIn at the top of the page). If sources contains
BOTH LinkedIn and non-LinkedIn URLs, cite the non-LinkedIn ones and
ignore the LinkedIn one — do NOT bail out and emit empty citations.

Process:
  1. Compose the reason sentence.
  2. For each non-LinkedIn URL in "sources", identify the SPECIFIC
     PHRASE in the reason that the URL backs (typically a name, figure,
     year, or event).
  3. Emit one citation entry per (phrase, source-URL[]) group, copying
     the phrase verbatim from the reason.

Examples:
  reason:    "Raised $8M total across Acme and Foo."
  sources:   ["https://techcrunch.com/raise", "https://crunchbase.com/acme", "https://venturebeat.com/foo"]
  citations: [
    { phrase: "$8M total", sources: ["https://techcrunch.com/raise"] },
    { phrase: "Acme", sources: ["https://crunchbase.com/acme"] },
    { phrase: "Foo", sources: ["https://venturebeat.com/foo"] }
  ]

  reason:    "Current founder and CEO of Acme."
  sources:   ["https://linkedin.com/in/jane", "https://flippa.com/podcast"]
  citations: [
    { phrase: "founder and CEO of Acme", sources: ["https://flippa.com/podcast"] }
  ]
  (LinkedIn URL skipped; the Flippa podcast URL is cited.)

  reason:    "Past founder of Socialize, AppMakr, and PointAbout."
  sources:   ["https://drodio.com/socialize-was-acquired/", "https://flippa.com/podcast"]
  citations: [
    { phrase: "Past founder of Socialize, AppMakr, and PointAbout", sources: ["https://drodio.com/socialize-was-acquired/", "https://flippa.com/podcast"] }
  ]

  reason:    "Exit: AppMakr acquired by Infinite Monkeys."
  sources:   ["https://linkedin.com/in/drodio"]
  citations: []
  (Only LinkedIn → empty is correct.)

Additional rules:
- The phrase MUST be a verbatim substring of the reason (copy-paste).
- Phrases CAN overlap or nest; the UI picks the outermost match.
- Phrases can be short (a dollar amount, a company name, a year, an event
  name) — they don't need to be a whole clause. Shorter targeted phrases
  are usually better than long ones.
- A single citation entry can map ONE phrase to MULTIPLE sources, OR you
  can emit multiple entries with the same phrase. Either is fine.
- Do NOT invent URLs. Only reuse URLs that already exist in the row's
  "sources" array.

==== EXTRACTED FIELDS (for storage / matching) ====
- fullName: the person's full name as it appears publicly. Null if no
  confident name could be extracted from the highlights.
- primaryCompanyDomain: root domain (e.g. "acme.com") of the most relevant
  company they founded; if not a founder, the current employer's domain.
  Null if unknown.
- publicEmail: a real email address explicitly attributed to the subject in
  one of the search highlights or the LinkedIn page text (e.g., from a press
  contact, a personal site, an "Email me at X" mention). NEVER guess from
  domain heuristics. Null if no source surfaces a literal email. Always
  return \`null\` (not an empty string) when no source surfaces a literal email.
- githubUsername: the subject's GitHub username if a github.com/<user> link
  appears next to their name on LinkedIn or in any highlight. NEVER guess
  from name patterns. Null if absent. Always return \`null\` (not an empty
  string) when no GitHub link appears.

==== CONFIDENCE HEURISTIC ====
Every breakdown row, every recommendation item, and the summary paragraph
get an integer \`confidence\` field in [0, 100]. This is YOUR self-assessment
of how sure you are that this specific row is factually correct, based on
the strength of the evidence you have for it. Use this rubric:

- 90-100: Multiple INDEPENDENT sources corroborate the exact claim (e.g.,
  two different news outlets confirm the YC batch + year, OR the LinkedIn
  page text AND a Crunchbase highlight both report the same raise figure).
- 75-89: One STRONG primary source (e.g., the company's own About page,
  the subject's own LinkedIn About, a press release on their domain) plus
  consistent supporting mentions. Use this when the LinkedIn page text
  directly states the claim and no other source contradicts it.
- 60-74: One reasonable source but no corroboration; OR multiple secondary
  mentions (e.g., third-party listicles) but no primary citation. Use this
  when an enrichment (GitHub, Product Hunt) supplies the fact directly but
  it doesn't appear elsewhere.
- 40-59: Inferred from indirect signal (e.g., MM domain rank implies they
  work somewhere notable, but the role isn't explicitly stated). The fact
  is plausible but the SPECIFIC claim is partially extrapolated.
- 0-39: Weak / single ambiguous mention. Use this when you're awarding
  points because a rule technically fires but you'd be unsurprised if the
  user disputed it.

Confidence has NOTHING to do with the point value. A high-point row can
have low confidence (one ambiguous source claiming a $50M raise) and a
low-point row can have high confidence (multiple sources confirming +5
"any co-founders" trigger). Score each independently.

For the summary paragraph: pick the AVERAGE confidence across the
breakdown rows that fed into it. Sparse signal = lower summary confidence.
For recommendations.items: how well-matched is this proposed event to the
specific signal you saw? A generic "a founder networking dinner" with thin
justification gets 40; a specific "a YC W22 alum dinner to land partner
meetings next month, based on the W22 signal" gets 85.

==== EXTRACTED METRICS (structured facts for badges; null if unknown) ====
- extractedMetrics.companiesFounded: distinct count of companies the subject
  founded or co-founded (past + current). 1 = first-time founder; 2+ =
  serial founder. Null if you cannot confidently determine a count.
- extractedMetrics.totalRaisedUsd: cumulative venture capital raised across
  ALL companies they founded, in raw USD (e.g., 8000000 for $8M; 1500000000
  for $1.5B). Null if no fundraising figures appear.
- extractedMetrics.exitCount: number of companies they founded that exited
  (IPO OR acquisition). Null if unknown.
- extractedMetrics.hadIpo: true if any founded company went public via IPO.
- extractedMetrics.hadAcquisition: true if any founded company was acquired.
- extractedMetrics.ipoMarketCapUsd: if any company they founded went public,
  its market capitalization AT IPO in raw USD (e.g. 11000000000 for ~$11B).
  Null if no IPO or no figure available.
- extractedMetrics.currentMarketCapUsd: if a company they founded is STILL
  publicly traded, its CURRENT market cap in raw USD (e.g. 3500000000000 for
  NVIDIA at ~$3.5T). This is usually far higher than the IPO figure. The FOUNDER
  EXIT rule awards on max(currentMarketCapUsd, ipoMarketCapUsd). Null if not
  currently public or no figure available.
- extractedMetrics.acquisitionPriceUsd: SUM of acquisition/purchase prices, in
  raw USD, across all companies they founded that were acquired. This feeds the
  FOUNDER EXIT rule. Null if no acquisition or no price available.
- extractedMetrics.employeesCount: largest known employee count at any
  company they founded (use the peak, not the current). Null if no employee
  figure appears anywhere.
- extractedMetrics.isUnicornFounder: true if any founded company reached
  $1B+ valuation (private or public).
- extractedMetrics.ycBatch: YC batch string ("W22", "S15", etc.) if YC
  alum; null otherwise.
- extractedMetrics.partnerAtFirm: if the subject is a Partner/GP at a
  top-tier VC firm — Sequoia, Benchmark, Andreessen Horowitz (a16z),
  Founders Fund, Greylock, Accel, Bessemer, Lightspeed, Union Square
  Ventures, Kleiner Perkins, NEA, GV (Google Ventures), Index Ventures,
  Y Combinator Continuity — emit the firm name as it appears publicly
  (e.g. "Sequoia", "Andreessen Horowitz"). Null otherwise.
- extractedMetrics.isAngelInvestor: true if the subject is publicly
  described as an angel investor (any source mentions it).
- extractedMetrics.totalDeployedUsd: cumulative dollars deployed across
  all their investments, in raw USD. Null if undisclosed.
- extractedMetrics.topGithubRepo: "owner/repo" of the subject's
  highest-starred non-fork repo (read from the [github] enrichment section
  if present). Null otherwise.
- extractedMetrics.topGithubRepoStars: star count of that top repo. Null
  if no GitHub repo identified.
- extractedMetrics.onWikipedia: true if the [wikipedia] enrichment matched.

==== IDENTITY ====
Clean, human-readable identity fields read straight off the LinkedIn page and
corroborating sources. Emit null for any you cannot determine confidently — do
NOT guess.
- identity.companyName: the subject's CURRENT primary company or firm, as a
  proper name ("Acme Robotics", "Sequoia Capital") — NOT a domain. Prefer their
  present role; null if unclear.
- identity.jobTitle: their current title/role ("Co-Founder & CEO", "General
  Partner", "Staff Engineer"). Null if not stated.
- identity.headline: the subject's LinkedIn headline verbatim, if visible.
- identity.location: { city, region, country } as separate strings where stated
  (region = state/province). Null fields for parts you don't know; null object
  if no location signal at all.
- identity.websiteUrl: the subject's or their company's primary website URL, if
  one appears. Null otherwise.
- identity.education: array of { institution, degree } for schools/universities
  attended (degree null if not stated). Empty array if none found.

==== EXTRAS ====
- signalQuality: 'high' (plenty of corroborating sources) / 'medium' (some)
  / 'low' (almost no public info found)
- companyStage: one of 'idea' | 'pre-seed' | 'seed' | 'series-a' | 'series-b'
  | 'series-c+' | 'growth' | 'public' | 'acquired' | 'n/a'. Null if no signal.
- founderStatus: REQUIRED top-level field — you MUST always include it in the
  JSON output (never omit it, even for high-scoring or very long profiles). If
  you are uncertain, output 'never'. Classify the subject's founder status,
  INDEPENDENT of score:
    • 'current' — they are CURRENTLY a founder/co-founder actively running a
      company they started (current title is Founder/Co-Founder/CEO of their own
      startup, company still operating and not yet exited).
    • 'past' — they have founded a company before but are NOT currently founding:
      e.g. the company was acquired and they now work there (earnout), it shut
      down, or they moved into an operating/investing/IC role elsewhere.
    • 'never' — no evidence they have ever founded a company (employees,
      researchers, students, freelancers, investors who never founded, etc.).
  When unsure between current and past, prefer the one their MOST RECENT role
  supports. Strong skills (GitHub, papers) do NOT by themselves make someone a
  founder — judge on company-founding history only.
- investorStatus: REQUIRED top-level field — you MUST always include it in the
  JSON output (never omit it). If uncertain, output 'never'. Classify the
  subject's INVESTING status, INDEPENDENT of score and of founderStatus (a person
  can be both a current founder AND a current investor):
    • 'current' — they actively invest now: a GP/Partner/Principal at a VC or PE
      fund, a current angel investor, or they run their own fund/syndicate.
    • 'past' — they invested before but not now (left the fund, stopped angel
      investing, inactive scout).
    • 'never' — no evidence they have ever invested in startups/companies.
  Use partnerAtFirm, isAngelInvestor, totalDeployedUsd, investorStageFocus, and
  any investing roles in the highlights. Founding a company is NOT investing.
- technicalFounder: boolean — is the subject PERSONALLY a technical builder, i.e.
  did THEY write code / do engineering, do they have an engineering background or
  a technical role (CTO, engineer, "technical co-founder", created the product's
  core technology)? This is about the INDIVIDUAL, not the company. Founding or
  running a technically-impressive company does NOT make someone technical.
    • true — clear evidence they personally build/engineer: an engineering
      background/degree, a CTO/engineer role, they wrote the early product, they
      personally created notable OSS, or strong personal technical output (GitHub,
      deep technical HN comments, technical writing).
    • false — a business / design / operations / sales founder or CEO with no
      personal engineering evidence, even at a deeply technical company (e.g. a
      designer-CEO whose company happens to publish popular OSS its engineers wrote).
    • Output false (not null) when you have enough info to judge and they're not
      technical; only use null when you genuinely cannot tell.
  This gates a large company-OSS technical bonus, so be accurate: do NOT mark
  someone technical just because their company is.
- investorStageFocus: when the subject is identifiable as an investor, list
  the stages they primarily back (max 3 entries). Use the same enum as companyStage.
  Empty array if not an investor or stage focus is not stated.
- industries: the industry/sector(s) the subject works in — for a FOUNDER, their
  company's sector(s) (e.g. "fintech", "payments" for Stripe; "developer tools",
  "AI" for an LLM-infra startup); for an INVESTOR, the sectors they focus on. List
  up to ~5 short industry phrases, drawn from the company, their writing, and the
  enrichment signals (incl. the HN content analysis topics + any investor industry
  focus). Plain phrases ("fintech", "healthcare", "climate") — they get normalized
  downstream. Empty array if no clear sector signal.
- recommendations.summary: 2-3 sentences in second person about the kinds of
  in-real-life Founder Festival events that would be most valuable to THIS
  person right now, grounded in whichever dimension(s) dominate their profile
  (founder, investor, or both). This text is shown PUBLICLY on the person's
  profile. Write ONLY about the person and their needs — NEVER include
  meta-commentary, data-quality caveats, or identity-disambiguation notes (e.g.
  "this profile may conflate X with Y", "the LinkedIn identity is clearly…",
  "the GitHub/research data may belong to a different person"). If some enrichment
  data looks like it belongs to a different same-named person, silently IGNORE it
  and write the summary from the data that genuinely fits this person — do not
  mention the discrepancy.
- recommendations.items: 5-8 SPECIFIC proposed IRL Festival events this person
  would genuinely want to attend, each grounded in their profile. Founder
  Festival invites members to small, high-signal in-person gatherings —
  dinners, office hours, roundtables, happy hours, networking nights,
  workshops. Each item: a stable slug id; one-sentence text phrased as a
  concrete event starting with "A" or "An" (e.g. "An SPC dinner with other
  top-ranked SPC members to pressure-test 2-3 AI product theses", "A YC W09/S11
  founder dinner for warm intros to AI-focused seed funds", "A Dropbox alumni
  happy hour to recruit a founding engineer"); category in: 'fundraising' |
  'hiring' | 'intros' | 'tactical' | 'positioning' | 'wellbeing'. KEEP the
  specific hooks (named YC batches, communities like SPC, rankings, companies,
  alumni networks) — specificity is the whole point; never make it generic.
`;
