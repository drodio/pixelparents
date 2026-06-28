# Founder Festival MVP — Design Spec

**Date**: 2026-05-21
**Branch**: `main`
**Status**: Approved, in implementation

## 1. Purpose & scope

festival.so is a gated landing site that scores visitors against a founder profile rubric. The MVP must:

- Accept a LinkedIn URL (or bypass invite code) as the entry point.
- Use Exa + Claude to evaluate the URL's owner against a fixed scoring rubric and a Majestic Million ranking.
- Render a black "welcome / score" page with a transparent breakdown table.
- Provide a "claim your score" path that verifies identity via LinkedIn / GitHub / work-email OAuth.
- Persist evaluations, codes, users, and recommendations in Neon Postgres.
- Be deployable on Vercel under festival.so today.

Out of scope for MVP: Stripe / membership fees, recommendation rating UI, events listing, admin dashboard, transactional email, social share, mobile-specific layout polish.

## 2. Scoring rubric

For each item, the AI is responsible for extracting the underlying fact AND assigning the point value with a one-line human-readable reason. Final score is the sum of `breakdown[].points`.

| Signal | Points |
|---|---|
| Past founder | +5 |
| Current founder | +10 |
| Venture raised (per $1M) | +10 |
| Y Combinator alum | +10 |
| Exit / sold company (per exit) | +10 |
| Current company is profitable | +10 |
| Any of the above had co-founders | +5 |
| Founded a company → `min(100, 10000 / majestic_million_rank)` | up to +100 |
| Currently works at a company (not founder) → `min(100, 10000 / majestic_million_rank) * 0.1` | up to +10 |

The breakdown table on the welcome page renders one row per non-zero `breakdown[]` item.

## 3. User flows

### 3.1 URL flow (primary)
```
/                              user types linkedin handle, clicks Continue
  → POST /api/eval             { linkedinUrl } → returns { evaluationId }
  → /welcome?e=<evaluationId>  black bg, score, breakdown, Re-Score button, Show-me-events button
       ↓ Show me events
  → /claim                     LinkedIn | GitHub | Email options
       ↓ OAuth callback
  → POST /api/claim/match      matches Clerk claims to evaluation.linkedinUrl/profile
       ├ high|medium → /verified ("Events coming soon")
       └ low         → "couldn't confirm" → loop, after 3 attempts → "Contact us"
```

### 3.2 Code flow (alternate entry)
```
/                              user clicks "Have an invite code?" → enters code
  → POST /api/redeem           { code } → returns { evaluationId, assignedScore }
  → /welcome?e=<evaluationId>  no Re-Score button; breakdown row reads "You're in via invite code"
```

### 3.3 Low-signal branch
If Exa returns insufficient data (no LinkedIn match found, profile entirely private), `/api/eval` returns `status: 'low-signal'` and the client redirects to `/not-this-round` instead of `/welcome`.

## 4. Architecture

```
                    festival.so (Vercel, Next.js 16 App Router)
                                    │
   /  ─────────────────────────────  /api/eval (server action)
   shadowy tent on black            1. canonicalize linkedinUrl
   • LinkedIn URL input             2. SELECT cached eval → return if exists
   • Code input (toggle)            3. Exa /search type=deep with outputSchema → profile + grounding
                                    4. lookup MM rank in Neon for any company domains
                                    5. AI Gateway / Claude generateObject → score + breakdown + recs
                                    6. INSERT evaluations row
                                    7. return { evaluationId, score, breakdown, status }
                                    │
                                    ▼
                              /welcome (server component reads evaluation)
                                    │
                                    ▼
                              /claim → Clerk OAuth → /api/claim/match
                                    │
                                    ▼
                              /verified
```

Cron job at `/api/cron/refresh-mm` runs weekly (Sundays 03:00 UTC) to upsert the latest Majestic Million CSV into Neon.

## 5. Data model (Neon / Drizzle)

```ts
// evaluations  — keyed by linkedinUrl, one row per scored profile
{
  id:                uuid PK
  linkedin_url:      text UNIQUE NOT NULL       // canonicalized
  full_name:         text
  score:             int NOT NULL
  signal_quality:    text NOT NULL              // 'high' | 'medium' | 'low'
  breakdown:         jsonb                      // [{ points: number, reason: string }]
  profile:           jsonb                      // structured Exa profile output
  company_stage:     text                       // for future fee calc + recommendations
  recommendations:   jsonb                      // { summary, items: [{id,text,category}] }
  exa_grounding:     jsonb                      // citations from Exa, for audit
  pricing:           jsonb DEFAULT '{}'         // reserved for future Stripe fee snapshot
  source:            text NOT NULL              // 'url' | 'code'
  source_code:       text                       // bypass_codes.code if source='code'
  created_at:        timestamptz DEFAULT now()
  updated_at:        timestamptz DEFAULT now()
}

// bypass_codes
{
  id:                uuid PK
  code:              text UNIQUE NOT NULL       // case-insensitive lookup
  max_uses:          int NOT NULL
  uses_count:        int NOT NULL DEFAULT 0
  expires_at:        timestamptz
  assigned_score:    int                        // optional, for content tiering
  note:              text
  created_at:        timestamptz DEFAULT now()
  revoked_at:        timestamptz
}

// majestic_million  (refreshed weekly)
{
  rank:              int PK
  domain:            text NOT NULL
  refreshed_at:      timestamptz
}
// idx: domain

// users  — Clerk-linked rows only created when someone claims
{
  id:                uuid PK
  clerk_user_id:     text UNIQUE NOT NULL
  evaluation_id:     uuid REFERENCES evaluations(id)
  verified_at:       timestamptz
  verified_via:      text                       // 'linkedin' | 'github' | 'email'
  match_confidence:  text                       // 'high' | 'medium' | 'low'
  created_at:        timestamptz DEFAULT now()
}

// recommendation_responses  — reserved schema for v1.5 UI
{
  id:                uuid PK
  evaluation_id:     uuid REFERENCES evaluations(id)
  item_id:           text NOT NULL              // matches evaluations.recommendations.items[].id
  rating:            int NOT NULL               // 1=Hell No, 2=Soft No, 3=Soft Yes, 4=Hell Yes
  edited_text:       text
  created_at:        timestamptz DEFAULT now()
  UNIQUE(evaluation_id, item_id)
}

// rate_limit  — Neon-backed simple counter
{
  ip:                text NOT NULL
  day:               date NOT NULL              // truncated to UTC date
  count:             int NOT NULL DEFAULT 0
  PRIMARY KEY (ip, day)
}
```

## 6. API surface

| Route | Method | Purpose |
|---|---|---|
| `/api/eval` | POST | Run eval for a LinkedIn URL. Rate-limited (3/IP/day). |
| `/api/redeem` | POST | Validate + atomically decrement a bypass code. |
| `/api/rescore` | POST | Force re-eval; requires session cookie or Clerk user. |
| `/welcome` | GET | Server component reads `?e=<id>` and renders. |
| `/claim/[provider]` | route group | Clerk OAuth handlers — LinkedIn / GitHub / Email. |
| `/api/claim/match` | POST | Server-side identity match after OAuth callback. |
| `/api/cron/refresh-mm` | GET | Weekly cron. Auth via `MM_REFRESH_SECRET` header. |

## 7. External services

| Service | Use | Env var |
|---|---|---|
| Neon Postgres | All persistence | `DATABASE_URL`, `DATABASE_URL_UNPOOLED` |
| Clerk | Auth on the claim flow | `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` |
| Exa | Research on LinkedIn URL | `EXA_API_KEY` |
| Vercel AI Gateway | Claude calls | `AI_GATEWAY_API_KEY` (auto-provisioned by Vercel) |
| Majestic Million | Domain ranking | downloads.majestic.com/majestic_million.csv (free) |

Clerk dashboard must have LinkedIn + GitHub OAuth enabled (manual config). Email is built-in.

## 8. Identity match algorithm (`/claim`)

| Provider | Match rule | Confidence |
|---|---|---|
| LinkedIn | Clerk OAuth returns LinkedIn vanity name → compare against `evaluations.linkedin_url` (case-insensitive, slash-tolerant) | High if exact, Low otherwise |
| GitHub | Clerk OAuth returns GitHub username + display name + email. Compare against `evaluations.profile.githubUrls[]` (added to PROFILE_SCHEMA below) OR exact display-name match. | Medium if any match, Low otherwise |
| Email | Magic link to `name@<domain>`. Domain must match `evaluations.profile.currentCompany.domain`. | Medium if domain matches, Low otherwise |

Flow on callback:
1. Read Clerk session claims.
2. Compute confidence per the table.
3. If `high` or `medium`: INSERT `users` row with `verified_via`, `match_confidence`. Redirect `/verified`.
4. If `low`: render "couldn't confirm" → user picks another provider. After 3 attempts: "Contact us."

## 9. Eval implementation detail

**Exa call** (single `/search` with `type: "deep"`):
```ts
const result = await exa.search(
  `${linkedinUrl} founder profile background companies funding`,
  {
    type: "deep",
    numResults: 10,
    outputSchema: PROFILE_SCHEMA,        // see below
    contents: { highlights: true },
  }
);
```

`PROFILE_SCHEMA` extracts:
```ts
{
  fullName: string,
  headline: string,
  isCurrentFounder: boolean,
  isPastFounder: boolean,
  currentCompany: { name, domain, stage, isProfitable, raisedUsd, yc, hadCofounders } | null,
  pastCompanies: Array<{ name, domain, exited, raisedUsd, yc, hadCofounders }>,
  githubUrls: string[],                          // any GitHub URLs found alongside profile
  signalQuality: 'high' | 'medium' | 'low',
}
```

**Majestic Million lookup**: collect all domains from `currentCompany.domain` and `pastCompanies[].domain`; one `SELECT domain, rank FROM majestic_million WHERE domain = ANY($1)` query.

**Claude call** via AI Gateway with `generateObject`:
```ts
const { object } = await generateObject({
  model: "anthropic/claude-opus-4-7",
  schema: SCORING_SCHEMA,
  prompt: buildScoringPrompt({ profile, mmRanks, rubric }),
});
// object = { score, breakdown: [{points, reason}], recommendations: { summary, items: [...] } }
```

The prompt embeds the rubric from Section 2 verbatim and instructs Claude to:
1. Apply each rule to the profile.
2. Emit one breakdown row per rule that triggered (skip zeros).
3. Sum and confirm `score === sum(breakdown.points)`.
4. Generate a 2-3 sentence `recommendations.summary` based on the profile + company stage.
5. Generate 5-8 specific `recommendations.items` with categories like `fundraising`, `hiring`, `intros`, `tactical`, `mental-health`.

## 10. Error handling & edge cases

| Scenario | Behavior |
|---|---|
| Exa returns no useful results | `signal_quality='low'`, status `low-signal` → `/not-this-round` |
| Exa rate limit / 5xx | Retry once with 1s backoff, then 503 + retry copy |
| Claude timeout >30s | 503 + retry copy; no row written |
| Invalid LinkedIn URL format | 400 + client validation: `^https?://(www\.)?linkedin\.com/in/[^/]+/?$` |
| Code expired/exhausted | 400 + "This code can't be used. Reach out if you think this is a mistake." |
| Same IP 4× in 24h | 429 + "Slow down". IP source: first hop of `x-forwarded-for`, fall back to `x-real-ip`, fall back to connection remote. |
| MM cron fails | Logged, alert via Vercel; old data still queryable |
| Bypass code race | Atomic `UPDATE … SET uses_count=uses_count+1 WHERE code=$1 AND uses_count < max_uses RETURNING …` |

## 11. Out of scope (explicitly)

- Stripe / subscriptions / fee calc (column reserved, no code)
- Recommendation rating UI (table exists, no page)
- Events listing (`/verified` is a stub)
- Admin UI (codes managed via SQL snippet in `docs/admin-codes.md`)
- Transactional email
- Social share / OG image
- Analytics beyond Vercel built-in
- a11y polish beyond reasonable defaults
- Mobile-specific layout polish

## 12. Implementation assumptions

Approved by user with explicit "take whatever assumptions you need":

1. Splash tent uses CSS grayscale/opacity on the existing PNG. SVG redesign deferred.
2. Bypass codes are created via SQL snippet documented in `docs/admin-codes.md`. No admin UI.
3. Rate limiting is Neon-backed (one row per IP/day). Upstash KV is a v1.5 upgrade.
4. MM cron schedule: Sundays 03:00 UTC.
5. Eval latency budget: 30s end-to-end. Loading state shown.
6. AI model: `anthropic/claude-opus-4-7` via AI Gateway with auto-provisioned key.
7. Identity match thresholds: LinkedIn exact = High; GitHub URL/name = Medium; work-email domain = Medium; anything else = Low.
8. Tests focus on scoring math + critical paths. e2e and visual regression deferred.
9. `PRD/main.md` is updated on every commit per project workflow.
10. Initial MM data is bootstrapped from `scripts/data/majestic_million.csv` (gitignored, supplied by operator). Cron refresh job downloads fresh CSVs from majestic.com going forward.
