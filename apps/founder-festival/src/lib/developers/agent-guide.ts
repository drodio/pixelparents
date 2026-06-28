// Generates the Markdown a developer pastes into their coding agent (Claude
// Code, etc.) so the agent knows how to call the Founder Score API. Pure.
export function buildAgentGuide(opts: { baseUrl: string }): string {
  // NEVER embed a real API key here. This markdown is rendered in the UI and
  // copied around, so the key stays a placeholder the developer fills in
  // themselves — we don't want a live secret sitting in plain text.
  const key = "[USER WILL PROVIDE API KEY IN sk_festival_live_*** format]";
  const base = opts.baseUrl.replace(/\/+$/, "");
  return `==================================
AI Coding Agent Instructions: This is the API for https://Festival.so — founder & investor scores, the public leaderboard, qualifying events, and the industry taxonomy. Use it to get high-quality signal on founders and investors. Looking up profiles already in the system is FREE; if a profile is NOT in the system yet and the account has prepaid credits, you can score it on demand and the credits are deducted automatically (POST with mode "score_if_needed" — see "Score a new person"). Claimed profiles are most reliable: the individual authenticated and claimed that profile for themselves. Unclaimed profiles may have incorrect data.

Everything this API returns is PUBLIC profile data — exactly what a visitor sees on the website. It NEVER returns private contact info (no emails, no phone numbers) and NEVER returns anything a person marked private.
==================================

# Founder Festival API — agent guide

## Authentication
Send your API key as a Bearer token on every request:

\`\`\`
Authorization: Bearer ${key}
\`\`\`

All endpoints require this header. Errors share a shape: \`{ "error": "<code>" }\` with an HTTP status (401 invalid/missing key · 400 bad input · 404 not found · 429 daily rate limit · 402 payment required · 503 temporarily unavailable).

## Endpoints at a glance
| Method & path | What it does | Cost |
| --- | --- | --- |
| \`GET /api/v1/resolve\` | name (+company) → ranked LinkedIn candidates | free |
| \`GET /api/v1/score\` | full public profile for an already-scored person | free |
| \`POST /api/v1/score\` | cache hit (free) or score a NEW person (spends credits) | free / paid |
| \`GET /api/v1/search\` | search scored people by name / company | free |
| \`GET /api/v1/leaderboard\` | the public leaderboard, filterable + paginated | free |
| \`GET /api/v1/events\` | published events (+ \`?badge=\` filter) | free |
| \`GET /api/v1/events/{slug}\` | one event + hosts, sponsors, photos, recap | free |
| \`GET /api/v1/event-badges\` | the event category-badge vocabulary | free |
| \`GET /api/v1/industries\` | the canonical industry taxonomy | free |
| \`GET /api/v1/credits\` | your remaining credit balance | free |

---

## Find someone's LinkedIn URL — free
Don't have their URL? Resolve it from a name (+ optional company) using OUR search — you do NOT need your own web search:

\`\`\`
GET ${base}/api/v1/resolve?name=<full name>&company=<optional company>
Authorization: Bearer ${key}
\`\`\`

Returns ranked candidates: \`{ "candidates": [ { "url", "name", "headline" }, ... ] }\`. Pick the right person (check \`name\` + \`headline\` — common names have many matches), then pass their \`url\` to the score endpoints.

## Look up a full profile — free for anyone already in the system
\`\`\`
GET ${base}/api/v1/score?linkedin_url=<the person's LinkedIn URL>
Authorization: Bearer ${key}
\`\`\`

- **200** — the full public profile JSON (fields below). Free.
- **404** — we haven't scored this person yet. To score them now, use the paid POST below.

## Score a new person — spends credits
If someone isn't in the system yet, score them on demand. POST and opt in with \`mode: "score_if_needed"\`:

\`\`\`
POST ${base}/api/v1/score
Authorization: Bearer ${key}
Content-Type: application/json

{ "linkedin_url": "<the person's LinkedIn URL>", "mode": "score_if_needed" }
\`\`\`

- **Already scored** → returns the profile for **free** (\`cached: true\`).
- **Not yet scored**, with \`mode: "score_if_needed"\` → we run a fresh scoring (web research + LLM), **deduct credits**, and return the new profile (\`cached: false\`, with \`cost.charged_cents\`). The charge is variable, based on our measured cost (typically $1–$5 per record).
- Newly scored people join the public leaderboard and become free cached lookups for everyone afterward.
- \`mode\` defaults to \`"cached_only"\` (never spends): on a cache miss it returns **404**.
- **402 payment_required** — balance too low; the body has \`price_cents\`, \`balance_cents\`, and a \`topup_url\`. Buy credits, then retry.

### Profile response fields
Identity & headline:
- \`linkedin_url\`, \`full_name\`, \`first_name\`, \`last_name\`, \`company_name\`, \`company_url\`.
- \`profile_href\` — the person's page on Festival (path; prefix with \`${base}\`).
- \`avatar_url\` — their photo, only when they've claimed the profile (else null).
- \`claimed\` (bool) — whether the person verified & claimed this profile.
- \`credibility_title\` — a one-sentence headline describing the person (e.g. "4x-exited YC founder and angel now building Chief"); null if none.
- \`location\` — \`{ city, region, country }\`, only when a claimed owner set it (else null).
- \`signal_quality\` — high | medium | low (how much public evidence backs the score).

Scores:
- \`scores.overall\` / \`scores.founder\` / \`scores.investor\` — each \`{ score, percentile }\` (percentile = rank vs everyone we've scored).
- \`founder_status\` / \`investor_status\` — \`current\` | \`past\` | \`never\` | null.
- \`founder_rows\` / \`investor_rows\` — the individual scored signals: \`{ reason, confidence, status }\` (status = likely | pending | confirmed | rejected). Per-row point values are not exposed.
- \`badges\` — achievement badge ids (e.g. \`yc\`, \`ipo\`, \`unicorn\`, \`partner\`, \`leads-rounds\`).
- \`family_badges\` — public family/pets tags: \`{ label, filter_key }\` (e.g. \`{ "label": "Daughter", "filter_key": "children" }\`); use \`filter_key\` with the leaderboard \`?family=\` filter.
- \`canonical_industries\` — normalized industry slugs (see \`/api/v1/industries\`).
- \`outcome\` — founder traction facts: \`{ had_ipo, had_acquisition, is_unicorn, ipo_market_cap_usd, acquisition_price_usd }\`.

Investor focus (\`investor\`):
- \`stage_focus\` (e.g. \`["seed","series-a"]\`), \`industry_focus\`, \`leads_rounds\` (bool|null), \`check_size\` (\`{ min_usd, max_usd }\` | null).
- \`neo\` — \`{ on_neo, slug }\` (link to their neo.com profile when present).

Guidance:
- \`what_you_likely_need\` — \`{ text, status, confidence }\`: plain-language summary of what would most help this person.
- \`current_priorities\` — recommended focus areas: \`{ id, text, category, rating, private }\`. Items the owner marked private come back with \`text\`/\`category\` = null and \`private: true\`.

Credibility radar (\`credibility.founder\` / \`credibility.investor\`, each an array of axes or null when the person has no signal on that dimension):
- Founder axes: technical, traction, operator, domain, gtm. Investor axes: portfolio, outcomes, firm, experience, capital.
- Each axis: \`{ key, label, axis_label, score /*0–100 percentile*/, coverage, evidence: [ { reason } ] }\`. \`evidence\` is the per-axis drill-down.

Peer matrix (\`matrix.founder\` / \`matrix.investor\`, each \`{ similar, complement, opposite }\` or null):
- \`similar\` — most like this person; \`complement\` — strengths that best fill this person's gaps; \`opposite\` — least like them.
- Each entry: \`{ full_name, profile_href, avatar_url, display_score }\` (up to 5 per list).

Meta: \`scored_at\`, \`cached\` (bool), \`cost\` (\`{ charged_cents, basis }\`).

## Search the leaderboard — free
\`\`\`
GET ${base}/api/v1/search?q=<name or company>
Authorization: Bearer ${key}
\`\`\`
Returns \`{ query, results: [ <leaderboard row>, ... ] }\` (up to 100). Multi-word queries match across name + company (every word must appear). Accepts the same filters as the leaderboard (below) to scope a search.

## Browse the leaderboard — free
\`\`\`
GET ${base}/api/v1/leaderboard?sort=combined&limit=50
Authorization: Bearer ${key}
\`\`\`
Returns \`{ results, next_cursor }\`. Each row: \`{ linkedin_url, full_name, company_name, company_url, profile_href, scores: { founder, investor, combined }, badges, founder_status, investor_status, canonical_industries }\`.

Query params (all optional, combine freely):
- \`sort\` = \`combined\` | \`founder\` | \`investor\` (default combined).
- \`role\` = \`founder\` | \`investor\` | \`both\` — only show people with a positive score on that dimension.
- \`top\` = \`lowest\` to reverse the order (default highest first).
- \`limit\` = 1..100 (default 50). Pagination: pass \`cursor=<next_cursor>\` from the previous response; a null \`next_cursor\` means the last page.
- \`industry\` = comma-separated industry slugs (see \`/api/v1/industries\`). Matches if ANY slug overlaps.
- \`family\` = comma-separated from \`children\`,\`spouse\`,\`partner\`,\`dog\`,\`cat\`,\`pet\` — founders who publicly share that family relationship (the \`filter_key\` from a profile's \`family_badges\`).
- \`stage\` = comma-separated company stages. \`outcome\` = comma-separated from \`ipo\`,\`acquired\`,\`unicorn\`. \`badge\` = comma-separated badge ids.
- \`raised_min\` / \`raised_max\` (USD), \`team_min\` (headcount).

## Events — free
\`\`\`
GET ${base}/api/v1/events
GET ${base}/api/v1/events?badge=<slug>,<slug>
GET ${base}/api/v1/events/<slug>
GET ${base}/api/v1/event-badges
Authorization: Bearer ${key}
\`\`\`
Lists published events (drafts excluded), newest first. Each event: \`{ slug, title, host_name, starts_at, ends_at, venue, capacity, status, description, cover_url, luma_url, source, badges: [ { name, slug } ] }\`. Pass \`?badge=<slug>\` (comma-separated) to filter to events carrying ANY of those category badges; \`GET /api/v1/event-badges\` returns the whole badge vocabulary (\`{ badges: [ { name, slug } ] }\`).

\`GET /api/v1/events/<slug>\` adds the full public event content: \`hosts: [ { name, blurb, icon_url, url } ]\`, \`sponsors: [ { name, blurb, logo_url, website_url } ]\`, \`photos: [ { url, caption } ]\` (public-tier only), and \`recap_html\` (the public post-event write-up; null if none). No host contact info, applicant data, attendee rosters, or attendee-only photos/recap are ever returned. The single-event route 404s for unknown or draft slugs.

## Industry taxonomy — free
\`\`\`
GET ${base}/api/v1/industries
Authorization: Bearer ${key}
\`\`\`
Returns \`{ industries: [ { slug, label }, ... ] }\` — the exact slugs used in a profile's \`canonical_industries\` and accepted by the leaderboard/search \`industry\` filter.

## Check your credit balance
\`\`\`
GET ${base}/api/v1/credits
Authorization: Bearer ${key}
\`\`\`
Returns \`{ "balance_cents": <number> }\`.

## Example tasks
- "What's the founder score for https://linkedin.com/in/<handle>? Show the credibility radar."
- "Find 'Chris Hartley at Instacart', then give me their founder score and who they're most complementary to."
- "Score each LinkedIn URL in this list and rank by overall score; if someone's missing, score them with my credits."
- "Show the top 25 fintech founders on the leaderboard." (\`/leaderboard?role=founder&industry=fintech&limit=25\`)
- "List upcoming Festival events and their venues."
- "Enrich my CRM: fetch each contact's founder score, percentile, and industries; score on demand if missing."

## Notes
- Looking up existing profiles, searching, the leaderboard, events, and the taxonomy are always FREE. Scoring a NEW person spends credits (POST with \`mode: "score_if_needed"\` only).
- Everything returned is public; never expect emails or phone numbers from this API.
- Back off when you receive a 429. Check \`/api/v1/credits\` and top up on the developers page.
`;
}
