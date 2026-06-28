# Branch: `delete-match-linkedin-handle` — progress log

Branched from `main` (post PR #67).

## Progress Update as of 2026-05-26 7:15 PM Pacific
*(Most recent updates at top)*

### The bug (reported again)
After "delete profile", re-running the same LinkedIn URL ("drodio")
returned a CACHED result instead of scoring fresh. PR #50 was supposed
to fix this but didn't cover this case.

### Diagnosis (from dev DB)
The drodio eval (`cf123c12`) existed with `source=url`,
`githubUsername="drodio"`, `publicEmail=null`, and ZERO claim rows —
an UNCLAIMED orphan. Delete's identity-match only matched:
- claim rows (none),
- the eval's githubUsername vs the user's **GitHub external account**
  (none, if they signed in via LinkedIn),
- verified email vs publicEmail (null).
It never matched by the LinkedIn handle or the user's Clerk username,
so the orphan survived and `/api/eval`'s URL cache returned it.

### Fix
Broadened the identity-match in `/api/account/delete`:
- Collect ALL handles the Clerk identity goes by — every external
  account username (GitHub, LinkedIn) PLUS the Clerk username. A
  person's handle is usually the same everywhere ("drodio").
- Match evals where any handle equals the stored `githubUsername` OR
  the LinkedIn vanity handle in `linkedin_url` (anchored: `%/in/<h>`
  and `%/in/<h>/`, so `/in/drodio` matches but `/in/drodio-jr` does
  not).
- Verified-email → publicEmail match unchanged.
The existing "no other claimer" gate still protects shared/claimed
evals — only unclaimed (or solely-self-claimed) evals are deleted.

### Also done
- Wiped the existing orphan `cf123c12` from the dev Neon branch so the
  next `drodio` run is fresh.

### Files
- `src/app/api/account/delete/route.ts`.

### Verified
- `pnpm tsc --noEmit` clean.

### Potential concerns
- If a user has NO usable handle (Clerk username null + no OAuth
  account username + null publicEmail), an unclaimed orphan could
  still slip through. Rare; the common case (handle == "drodio") is
  now covered. A fully bulletproof fix would stamp the signed-in
  clerk_user_id onto evals at run time — larger change, deferred.
