# `GET /api/v1/leaderboard`

Public, key-authed, **free cached read** of the Founder Festival leaderboard with
faceted filtering and keyset pagination. Mirrors the conventions of
`GET /api/v1/score` (snake_case params, `Authorization: Bearer sk_festival_live_…`).

## Auth

```
Authorization: Bearer sk_festival_live_<your-key>
```

Missing/invalid/revoked key → `401 { "error": "invalid_api_key" }`.
Per-key daily cap (default 2000, env `API_LEADERBOARD_PER_DAY_LIMIT`) →
`429 { "error": "rate_limit", "limit": 2000, "resetsAt": "midnight UTC" }`.

## Query parameters

| Param | Type | Default | Notes |
|---|---|---|---|
| `role` | `founder` \| `investor` \| `both` | `both` | `founder`/`investor` require a positive score on that dimension; `both` = everyone (the old "combined" view). |
| `stage` | csv of stage enums | — | `idea,pre-seed,seed,series-a,series-b,series-c+,growth,public,acquired`. |
| `outcome` | csv of `ipo,acquired,unicorn` | — | Matches `hadIpo` / `hadAcquisition` / `isUnicornFounder`. |
| `raised_min` | int (USD) | — | `totalRaisedUsd >= raised_min`. |
| `raised_max` | int (USD) | — | `totalRaisedUsd <= raised_max`. |
| `team_min` | int | — | Peak `employeesCount >= team_min`. |
| `badge` | csv of badge ids | — | `yc, serial-founder, unicorn, ipo, acquired, exits, raised, employees, partner, angel, deployed, oss, wiki`. (`claimed`/`mm` not filterable yet.) |
| `sort` | `founder` \| `investor` \| `combined` | mirrors `role` | Sort dimension. |
| `limit` | int | 50 | Clamped to **1..100**. |
| `cursor` | opaque string | — | Pass back the previous response's `next_cursor` for the next page. |

**Facet semantics:** **OR within a facet, AND across facets** (standard faceted
search). Invalid facet members are silently dropped. The base gate (excludes
low-signal, code-redeemed, hidden, and test-handle rows) always applies.

## Response

```json
{
  "results": [
    {
      "linkedin_url": "https://www.linkedin.com/in/example",
      "full_name": "Ada Lovelace",
      "company_name": "Analytical Engines",
      "company_url": "https://example.com",
      "profile_href": "/profile/ada",
      "scores": { "founder": 1200, "investor": 0, "combined": 1200 },
      "badges": ["yc", "ipo", "serial-founder"]
    }
  ],
  "next_cursor": "eyJzIjoxMjAwLCJpIjoiZTQ5In0"
}
```

- The raw `profile` blob is **never** returned (PII/margin rule). Only badge ids
  are emitted (not internal badge state).
- `next_cursor` is `null` when the last page was returned (fewer rows than
  `limit`). Otherwise pass it back as `cursor` to fetch the next page. Cursors
  are opaque — do not parse them.

## Pagination example

```bash
# Page 1
curl -H "Authorization: Bearer sk_festival_live_…" \
  "https://festival.so/api/v1/leaderboard?role=founder&stage=series-a,series-b&limit=50"

# Page 2 — feed next_cursor back as cursor
curl -H "Authorization: Bearer sk_festival_live_…" \
  "https://festival.so/api/v1/leaderboard?role=founder&stage=series-a,series-b&limit=50&cursor=eyJzIjoxMjAwLCJpIjoiZTQ5In0"
```

> **Exit values:** outcome dollar figures (`ipoMarketCapUsd`/`acquisitionPriceUsd`)
> are populated by the exit-weighted scoring change once a rescore runs; they are
> surfaced on `GET /api/v1/score` under `outcome`, not on this list endpoint.
