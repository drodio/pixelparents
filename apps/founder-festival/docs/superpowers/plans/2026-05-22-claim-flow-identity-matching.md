# Claim Flow Identity Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the loose `"high" | "medium" | "low"` identity match with a 100%-only typed `MatchResult` that grants ownership of an evaluation, plus three new UX surfaces (success banner, retry-via-LinkedIn modal banner, "score yours instead" overlay), and the eval-time data extraction that backs the new email and GitHub match tiers.

**Architecture:** A single server-side `matchConfidence()` returns a discriminated union (`match | no-match`). The `/claim/callback` route reads it and redirects to `/welcome` with one of three query params (`?claimed`, `?claim_failed`, `?claim_mismatch`). The welcome page renders new client components based on which param is present. `evaluations.profile` JSONB gains `publicEmail` + `githubUsername` extracted by Claude during scoring. The `users` table gains a `verified_signal` column recording exactly which check confirmed the claim.

**Tech Stack:** Next.js App Router 16, Clerk (LinkedIn OIDC + GitHub OAuth + email link), Drizzle ORM + Postgres (Neon), Vitest, Tailwind.

---

## File Structure

**Created:**
- `src/components/ClaimSuccessBanner.tsx` — gold confirmation banner; reads `?claimed`, strips it on mount, dismissable.
- `src/components/MismatchOverlay.tsx` — full-screen "this is X's profile — score yours?" overlay with an inline LinkedIn-URL form.
- `drizzle/<auto>_add_verified_signal.sql` — generated migration adding the `users.verified_signal` column.

**Modified:**
- `src/lib/scoring.ts` — adds `publicEmail` + `githubUsername` to `SCORING_SCHEMA`; new identity section in the rubric.
- `src/lib/eval-pipeline.ts` — persists the two new fields into `evaluations.profile`.
- `src/db/schema.ts` — adds `verifiedSignal: text("verified_signal")` to the `users` table.
- `src/lib/identity-match.ts` — full rewrite; returns `MatchResult` with `MatchSignal` / `NoMatchReason`.
- `src/app/claim/callback/route.ts` — consumes the new `MatchResult`; three redirect branches; writes `verified_signal`.
- `src/components/ClaimProfileModal.tsx` — accepts an optional `initialBanner` prop; implements real email-link auth (replaces the stub).
- `src/app/welcome/page.tsx` — reads `?claimed | ?claim_failed | ?claim_mismatch`; renders new components; threads banner state into `Recommendations` + `EventsCTA`.
- `src/components/Recommendations.tsx` + `src/components/EventsCTA.tsx` — pass an optional `initialBanner` through to the modal.
- `tests/lib/identity-match.test.ts` — full replacement with cases per signal + per no-match reason.
- `tests/lib/scoring.test.ts` — one extra fixture confirming the new fields parse.

---

## Task 0: Branch hygiene

**Files:** none.

- [ ] **Step 1: Confirm clean tree on `polish`**

```bash
git -C /Users/drodio/projects/founder-festival status
```
Expected: `On branch polish`, working tree clean (or only PRD/polish.md staged from the prior commit).

- [ ] **Step 2: Pull latest**

```bash
git -C /Users/drodio/projects/founder-festival pull --ff-only
```

- [ ] **Step 3: Verify tests pass before any edits**

```bash
cd /Users/drodio/projects/founder-festival && npm test -- --run
```
Expected: existing suite passes (any pre-existing failures noted but not fixed by this plan).

---

## Task 1: Diagnose Clerk LinkedIn external_account shape

The matcher relies on Clerk populating `external_account.username` with the LinkedIn vanity URL slug. LinkedIn OIDC's `/v2/userinfo` does **not** return a vanity field, so this needs runtime verification before any matcher work.

**Files:**
- Modify: `src/app/claim/callback/route.ts:53-72` (`toClerkClaim`)

- [ ] **Step 1: Add temporary diagnostic logging**

Edit `src/app/claim/callback/route.ts` — inside `toClerkClaim`, after `const accounts = user.externalAccounts ?? [];` add:

```ts
  // DIAGNOSTIC — remove after verifying LinkedIn vanity availability
  console.log("[claim-diagnostic] externalAccounts:", JSON.stringify(accounts, null, 2));
  console.log("[claim-diagnostic] primaryEmail:", user.emailAddresses?.[0]?.emailAddress);
  console.log("[claim-diagnostic] firstName/lastName:", user.firstName, user.lastName);
```

- [ ] **Step 2: Restart dev server**

```bash
lsof -ti:3000 | xargs -r kill -TERM; sleep 1; cd /Users/drodio/projects/founder-festival && npm run dev
```
Wait for `Ready in NNms`.

- [ ] **Step 3: Trigger LinkedIn sign-in (manual)**

In a browser: open `http://localhost:3000/welcome?e=<any-existing-eval-id>`, click a rating button, choose "Continue with LinkedIn", sign in.

- [ ] **Step 4: Inspect the server log**

Look at the dev server stdout for `[claim-diagnostic] externalAccounts:` and record the full JSON. Specifically:
- Does the LinkedIn entry have a `username` field? Is it the vanity?
- Is there a `publicMetadata.vanity` or similar?
- What's in `verification` and `imageUrl`?

- [ ] **Step 5: Decide path forward**

Three outcomes:

1. **`username` is the vanity** (e.g., `"jonstaenberg"`) → no extra work; matcher uses existing extraction.
2. **`username` is empty but vanity is elsewhere** (e.g., in `imageUrl` path or `publicMetadata`) → write a small adapter in Task 7 to pull from the correct location.
3. **No vanity anywhere on the external account** → use Clerk's `getUserOauthAccessToken` server-side, then call `https://api.linkedin.com/v2/userinfo` with `Authorization: Bearer <token>` and read the `preferred_username` or hit `/v2/me?projection=(vanityName)` if `r_liteprofile` is granted.

Document the chosen path inline in `identity-match.ts` (a one-paragraph comment above the LinkedIn branch).

- [ ] **Step 6: Remove the diagnostic logs**

Delete the three `console.log("[claim-diagnostic] …")` lines added in Step 1.

- [ ] **Step 7: Commit**

```bash
git -C /Users/drodio/projects/founder-festival add src/app/claim/callback/route.ts
git -C /Users/drodio/projects/founder-festival commit -m "Diagnose Clerk LinkedIn external_account.username availability

Manual verification: <paste-the-finding-from-Step-5>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

(The commit message body captures the finding so the next session has it. If the diagnostic revealed `username` is the vanity, the commit message says so; if not, it records the chosen fallback.)

---

## Task 2: Extend SCORING_SCHEMA with publicEmail + githubUsername

**Files:**
- Modify: `src/lib/scoring.ts` (schema block around line 116; rubric prose around line 96)
- Modify: `tests/lib/scoring.test.ts`

- [ ] **Step 1: Write the failing schema test**

Add to `tests/lib/scoring.test.ts`:

```ts
import { SCORING_SCHEMA } from "@/lib/scoring";

describe("SCORING_SCHEMA — identity fields", () => {
  it("accepts publicEmail + githubUsername when present", () => {
    const parsed = SCORING_SCHEMA.parse({
      fullName: "Patrick Collison",
      primaryCompanyDomain: "stripe.com",
      publicEmail: "patrick@stripe.com",
      githubUsername: "patrickc",
      founderScore: 10,
      investorScore: 0,
      combinedScore: 10,
      signalQuality: "high",
      companyStage: "growth",
      founderBreakdown: [{ points: 10, reason: "Founder of Stripe." }],
      investorBreakdown: [],
      recommendations: { summary: "x", items: [] },
    });
    expect(parsed.publicEmail).toBe("patrick@stripe.com");
    expect(parsed.githubUsername).toBe("patrickc");
  });

  it("accepts null publicEmail + null githubUsername", () => {
    const parsed = SCORING_SCHEMA.parse({
      fullName: "X",
      primaryCompanyDomain: null,
      publicEmail: null,
      githubUsername: null,
      founderScore: 0,
      investorScore: 0,
      combinedScore: 0,
      signalQuality: "low",
      companyStage: null,
      founderBreakdown: [],
      investorBreakdown: [],
      recommendations: { summary: "", items: [] },
    });
    expect(parsed.publicEmail).toBeNull();
    expect(parsed.githubUsername).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/drodio/projects/founder-festival && npx vitest run tests/lib/scoring.test.ts -t "identity fields"
```
Expected: FAIL with "Required" or "Unrecognized key" depending on Zod strict mode.

- [ ] **Step 3: Add the schema fields**

In `src/lib/scoring.ts`, inside `SCORING_SCHEMA = z.object({...})`, add after `primaryCompanyDomain`:

```ts
  // Email explicitly attributed to the subject in any source. Null unless a
  // literal address appears (never guessed from domain heuristics).
  publicEmail: z.string().nullable(),
  // GitHub username only if a github.com/<user> link appears next to the
  // subject's name on LinkedIn or in an Exa highlight. Never guessed.
  githubUsername: z.string().nullable(),
```

(Note: `z.string()` not `z.string().email()` — Claude may surface partial addresses we want to keep verbatim for debugging; the match function lowercases-and-compares without re-validating.)

- [ ] **Step 4: Add the rubric prose**

In the same file, find `==== EXTRACTED FIELDS (for storage / matching) ====` (around line 96) and replace its body with:

```
==== EXTRACTED FIELDS (for storage / matching) ====
- fullName: the person's full name as it appears publicly. Null if no
  confident name could be extracted from the highlights.
- primaryCompanyDomain: root domain (e.g. "acme.com") of the most relevant
  company they founded; if not a founder, the current employer's domain.
  Null if unknown.
- publicEmail: a real email address explicitly attributed to the subject in
  one of the search highlights or the LinkedIn page text (e.g., from a press
  contact, a personal site, an "Email me at X" mention). NEVER guess from
  domain heuristics. Null if no source surfaces a literal email.
- githubUsername: the subject's GitHub username if a github.com/<user> link
  appears next to their name on LinkedIn or in any highlight. NEVER guess
  from name patterns. Null if absent.
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd /Users/drodio/projects/founder-festival && npx vitest run tests/lib/scoring.test.ts -t "identity fields"
```
Expected: PASS (both cases).

- [ ] **Step 6: Re-run the full test suite**

```bash
cd /Users/drodio/projects/founder-festival && npm test -- --run
```
Expected: no regressions.

- [ ] **Step 7: Commit**

```bash
git -C /Users/drodio/projects/founder-festival add src/lib/scoring.ts tests/lib/scoring.test.ts
git -C /Users/drodio/projects/founder-festival commit -m "Scoring schema: add publicEmail + githubUsername (observed only)

Both nullable strings; Claude must extract from literal mentions in
highlights or LinkedIn page text, never infer from name+domain.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Persist new identity fields in eval-pipeline

**Files:**
- Modify: `src/lib/eval-pipeline.ts` (the `profile:` object inside the `.insert(evaluations).values({...})` call)

- [ ] **Step 1: Locate the persistence block**

Open `src/lib/eval-pipeline.ts` and find the `profile: {` block inside `runEval` (currently stores `fullName`, `primaryCompanyDomain`, `mmHits`).

- [ ] **Step 2: Add the two new fields**

Change:

```ts
      profile: {
        fullName: scoring.fullName,
        primaryCompanyDomain: scoring.primaryCompanyDomain,
        mmHits,
      },
```

to:

```ts
      profile: {
        fullName: scoring.fullName,
        primaryCompanyDomain: scoring.primaryCompanyDomain,
        publicEmail: scoring.publicEmail,
        githubUsername: scoring.githubUsername,
        mmHits,
      },
```

- [ ] **Step 3: Confirm TypeScript compiles**

```bash
cd /Users/drodio/projects/founder-festival && npx tsc --noEmit -p .
```
Expected: clean (or only the pre-existing unrelated test errors).

- [ ] **Step 4: Commit**

```bash
git -C /Users/drodio/projects/founder-festival add src/lib/eval-pipeline.ts
git -C /Users/drodio/projects/founder-festival commit -m "Eval pipeline: persist publicEmail + githubUsername on profile

Reads them straight off the scoring result; nullable, no validation
beyond what the schema enforces.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Add `verified_signal` column to users

**Files:**
- Modify: `src/db/schema.ts`
- Created (by `drizzle-kit generate`): `drizzle/<auto>_add_verified_signal.sql`

- [ ] **Step 1: Edit the Drizzle schema**

Open `src/db/schema.ts` and find the `users` table definition (around line 80). Add a column after `matchConfidence`:

```ts
    matchConfidence: text("match_confidence"),
    // Exact identity signal that confirmed the claim. One of:
    //   "linkedin-vanity" | "github-username" | "email-exact" | "email-name-company"
    // Null on legacy rows that pre-date this column.
    verifiedSignal: text("verified_signal"),
```

- [ ] **Step 2: Generate the migration**

```bash
cd /Users/drodio/projects/founder-festival && npm run db:generate
```
Expected: a new file `drizzle/NNNN_<name>.sql` containing `ALTER TABLE "users" ADD COLUMN "verified_signal" text;`. Capture the filename.

- [ ] **Step 3: Inspect the migration**

```bash
cat drizzle/<the-generated-file>.sql
```
Expected: exactly one `ALTER TABLE` statement. If Drizzle picked up unrelated drift, fix the schema first.

- [ ] **Step 4: Push the migration to the dev DB**

```bash
cd /Users/drodio/projects/founder-festival && npm run db:push
```
Expected: confirms the column was added.

- [ ] **Step 5: Verify the column exists**

```bash
psql "$DATABASE_URL_UNPOOLED" -c "\\d users" 2>/dev/null || echo "(skip if psql not installed; column is verified by drizzle-kit output above)"
```

- [ ] **Step 6: Commit**

```bash
git -C /Users/drodio/projects/founder-festival add src/db/schema.ts drizzle/
git -C /Users/drodio/projects/founder-festival commit -m "Users: add verified_signal column (nullable text)

Records which exact check confirmed a claim. Lets the UI show
'Confirmed via LinkedIn account match' etc. on success.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Helper — `localPartMatchesName(localPart, fullName)`

This is the engine of the "email name+company" tier. Decomposed first because it's pure logic with rich test coverage.

**Files:**
- Modify: `src/lib/identity-match.ts` (add the helper without removing the old `matchConfidence` yet — that comes in Task 7)
- Modify: `tests/lib/identity-match.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/lib/identity-match.test.ts`:

```ts
import { localPartMatchesName } from "@/lib/identity-match";

describe("localPartMatchesName", () => {
  it.each([
    ["patrick", "Patrick Collison"],
    ["collison", "Patrick Collison"],
    ["patrickcollison", "Patrick Collison"],
    ["patrick.collison", "Patrick Collison"],
    ["patrick_collison", "Patrick Collison"],
    ["patrick-collison", "Patrick Collison"],
    ["pcollison", "Patrick Collison"],
    ["p.collison", "Patrick Collison"],
    ["p_collison", "Patrick Collison"],
    ["collisonpatrick", "Patrick Collison"],
    ["collison.patrick", "Patrick Collison"],
  ])("'%s' matches '%s'", (local, name) => {
    expect(localPartMatchesName(local, name)).toBe(true);
  });

  it.each([
    ["patrick", "Patrick"], // single-token name — must still match "patrick"
    ["smith", "Mary Jane Smith"], // multi-token: only first+last considered
    ["mary.smith", "Mary Jane Smith"],
  ])("'%s' matches '%s'", (local, name) => {
    expect(localPartMatchesName(local, name)).toBe(true);
  });

  it("ignores middle tokens (mary.jane.smith does NOT match)", () => {
    expect(localPartMatchesName("mary.jane.smith", "Mary Jane Smith")).toBe(false);
  });

  it("strips +suffix", () => {
    expect(localPartMatchesName("patrick.collison+spam", "Patrick Collison")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(localPartMatchesName("PATRICK", "patrick collison")).toBe(true);
  });

  it("normalizes diacritics (José → jose)", () => {
    expect(localPartMatchesName("jose", "José García")).toBe(true);
    expect(localPartMatchesName("jose.garcia", "José García")).toBe(true);
  });

  it("rejects unrelated local-parts", () => {
    expect(localPartMatchesName("admin", "Patrick Collison")).toBe(false);
    expect(localPartMatchesName("info", "Patrick Collison")).toBe(false);
    expect(localPartMatchesName("xyz", "Patrick Collison")).toBe(false);
  });

  it("returns false on empty inputs", () => {
    expect(localPartMatchesName("", "Patrick Collison")).toBe(false);
    expect(localPartMatchesName("patrick", "")).toBe(false);
    expect(localPartMatchesName("patrick", "   ")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd /Users/drodio/projects/founder-festival && npx vitest run tests/lib/identity-match.test.ts -t "localPartMatchesName"
```
Expected: FAIL — "is not a function" or import error.

- [ ] **Step 3: Implement the helper**

Append to `src/lib/identity-match.ts`:

```ts
// Strip diacritics by NFD-normalizing and dropping combining marks (U+0300–U+036F).
function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function tokenizeName(fullName: string): { first: string; last: string } | null {
  const cleaned = stripDiacritics(fullName).toLowerCase().trim();
  if (!cleaned) return null;
  const tokens = cleaned.split(/[\s]+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const first = tokens[0];
  const last = tokens.length > 1 ? tokens[tokens.length - 1] : first; // single-token name: first === last
  return { first, last };
}

function buildLocalPartCandidates(first: string, last: string): Set<string> {
  const same = first === last;
  const set = new Set<string>([
    first,
    last,
    same ? "" : `${first}${last}`,
    same ? "" : `${first}.${last}`,
    same ? "" : `${first}_${last}`,
    same ? "" : `${first}-${last}`,
    same ? "" : `${first[0]}${last}`,
    same ? "" : `${first[0]}.${last}`,
    same ? "" : `${first[0]}_${last}`,
    same ? "" : `${last}${first}`,
    same ? "" : `${last}.${first}`,
  ]);
  set.delete("");
  return set;
}

export function localPartMatchesName(rawLocalPart: string, rawFullName: string): boolean {
  const local = stripDiacritics(rawLocalPart.trim().toLowerCase()).split("+")[0];
  if (!local) return false;
  const tokens = tokenizeName(rawFullName);
  if (!tokens) return false;
  return buildLocalPartCandidates(tokens.first, tokens.last).has(local);
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd /Users/drodio/projects/founder-festival && npx vitest run tests/lib/identity-match.test.ts -t "localPartMatchesName"
```
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git -C /Users/drodio/projects/founder-festival add src/lib/identity-match.ts tests/lib/identity-match.test.ts
git -C /Users/drodio/projects/founder-festival commit -m "Identity match: add localPartMatchesName helper + tests

Pure function. Tokenizes fullName on whitespace, takes first + last
tokens (ignores middles), NFD-normalizes diacritics, lowercases, and
compares against a fixed set of common local-part patterns. Strips
+suffix segments.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Helper — `domainMatches(claim, target)`

Allows exact root-domain match plus subdomain-of-target match.

**Files:**
- Modify: `src/lib/identity-match.ts`
- Modify: `tests/lib/identity-match.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/lib/identity-match.test.ts`:

```ts
import { domainMatches } from "@/lib/identity-match";

describe("domainMatches", () => {
  it("exact match", () => {
    expect(domainMatches("stripe.com", "stripe.com")).toBe(true);
  });
  it("subdomain of target matches", () => {
    expect(domainMatches("eu.stripe.com", "stripe.com")).toBe(true);
    expect(domainMatches("payments.eu.stripe.com", "stripe.com")).toBe(true);
  });
  it("parent of target does NOT match", () => {
    expect(domainMatches("stripe.com", "eu.stripe.com")).toBe(false);
  });
  it("similar-name domains do not match (no substring trick)", () => {
    expect(domainMatches("notstripe.com", "stripe.com")).toBe(false);
    expect(domainMatches("stripe.com.attacker.com", "stripe.com")).toBe(false);
  });
  it("case-insensitive", () => {
    expect(domainMatches("Stripe.COM", "stripe.com")).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd /Users/drodio/projects/founder-festival && npx vitest run tests/lib/identity-match.test.ts -t "domainMatches"
```
Expected: FAIL — import error.

- [ ] **Step 3: Implement**

Add to `src/lib/identity-match.ts`:

```ts
export function domainMatches(claim: string, target: string): boolean {
  const c = claim.trim().toLowerCase();
  const t = target.trim().toLowerCase();
  if (!c || !t) return false;
  if (c === t) return true;
  return c.endsWith(`.${t}`);
}
```

- [ ] **Step 4: Run to verify pass**

```bash
cd /Users/drodio/projects/founder-festival && npx vitest run tests/lib/identity-match.test.ts -t "domainMatches"
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C /Users/drodio/projects/founder-festival add src/lib/identity-match.ts tests/lib/identity-match.test.ts
git -C /Users/drodio/projects/founder-festival commit -m "Identity match: add domainMatches helper + tests

Accepts exact or subdomain-of-target. The 'attacker.com' suffix
attack is prevented by anchoring on a leading dot.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Rewrite `matchConfidence` with MatchResult type + update callback

This task rewrites the public API of `identity-match.ts` and updates `/claim/callback/route.ts` to consume it. **Both files must commit together** — the old `matchConfidence` returning `"high" | "medium" | "low"` would break callers if removed alone.

**Files:**
- Modify: `src/lib/identity-match.ts` (replace exported `matchConfidence`)
- Modify: `src/app/claim/callback/route.ts` (consume new shape, new redirect branches, write `verifiedSignal`)
- Replace: `tests/lib/identity-match.test.ts` (the existing "high/medium/low" cases at the top of the file are now invalid)

- [ ] **Step 1: Replace the old test cases with new ones**

Replace the contents of `tests/lib/identity-match.test.ts` ABOVE the `describe("localPartMatchesName", ...)` and `describe("domainMatches", ...)` blocks (i.e., the original 6 tests starting at line 6) with this new block:

```ts
import { describe, it, expect } from "vitest";
import { matchConfidence } from "@/lib/identity-match";

const evalUrl = "https://linkedin.com/in/jane";

describe("matchConfidence — LinkedIn", () => {
  it("exact vanity match → linkedin-vanity", () => {
    const r = matchConfidence(
      { provider: "linkedin", linkedinUrl: evalUrl },
      evalUrl,
      null,
    );
    expect(r).toEqual({ kind: "match", signal: "linkedin-vanity" });
  });

  it("vanity mismatch → no-match linkedin-vanity-mismatch", () => {
    const r = matchConfidence(
      { provider: "linkedin", linkedinUrl: "https://linkedin.com/in/otherperson" },
      evalUrl,
      null,
    );
    expect(r).toEqual({ kind: "no-match", reason: "linkedin-vanity-mismatch" });
  });

  it("missing claim url → no-match linkedin-vanity-mismatch", () => {
    const r = matchConfidence({ provider: "linkedin" }, evalUrl, null);
    expect(r).toEqual({ kind: "no-match", reason: "linkedin-vanity-mismatch" });
  });

  it("normalizes www. and trailing slash", () => {
    const r = matchConfidence(
      { provider: "linkedin", linkedinUrl: "https://www.linkedin.com/in/jane/" },
      evalUrl,
      null,
    );
    expect(r).toEqual({ kind: "match", signal: "linkedin-vanity" });
  });
});

describe("matchConfidence — GitHub", () => {
  it("stored username matches claim username → github-username", () => {
    const r = matchConfidence(
      { provider: "github", githubUsername: "patrickc" },
      evalUrl,
      { fullName: "Patrick Collison", githubUsername: "patrickc" },
    );
    expect(r).toEqual({ kind: "match", signal: "github-username" });
  });

  it("case-insensitive github match", () => {
    const r = matchConfidence(
      { provider: "github", githubUsername: "PatrickC" },
      evalUrl,
      { fullName: "Patrick Collison", githubUsername: "patrickc" },
    );
    expect(r).toEqual({ kind: "match", signal: "github-username" });
  });

  it("no stored username → no-match github-no-stored-username", () => {
    const r = matchConfidence(
      { provider: "github", githubUsername: "anyone" },
      evalUrl,
      { fullName: "Patrick Collison" },
    );
    expect(r).toEqual({ kind: "no-match", reason: "github-no-stored-username" });
  });

  it("stored username present but claim differs → github-username-mismatch", () => {
    const r = matchConfidence(
      { provider: "github", githubUsername: "imposter" },
      evalUrl,
      { fullName: "Patrick Collison", githubUsername: "patrickc" },
    );
    expect(r).toEqual({ kind: "no-match", reason: "github-username-mismatch" });
  });

  it("claim has no username → github-username-mismatch", () => {
    const r = matchConfidence(
      { provider: "github" },
      evalUrl,
      { fullName: "Patrick Collison", githubUsername: "patrickc" },
    );
    expect(r).toEqual({ kind: "no-match", reason: "github-username-mismatch" });
  });
});

describe("matchConfidence — Email exact tier", () => {
  it("exact publicEmail match → email-exact", () => {
    const r = matchConfidence(
      { provider: "email", email: "Patrick@Stripe.com" },
      evalUrl,
      { fullName: "Patrick Collison", primaryCompanyDomain: "stripe.com", publicEmail: "patrick@stripe.com" },
    );
    expect(r).toEqual({ kind: "match", signal: "email-exact" });
  });

  it("non-matching publicEmail falls through to name+company tier", () => {
    const r = matchConfidence(
      { provider: "email", email: "patrick.collison@stripe.com" },
      evalUrl,
      { fullName: "Patrick Collison", primaryCompanyDomain: "stripe.com", publicEmail: "patrick@stripe.com" },
    );
    expect(r).toEqual({ kind: "match", signal: "email-name-company" });
  });
});

describe("matchConfidence — Email name+company tier", () => {
  it("first.last@company → email-name-company", () => {
    const r = matchConfidence(
      { provider: "email", email: "patrick.collison@stripe.com" },
      evalUrl,
      { fullName: "Patrick Collison", primaryCompanyDomain: "stripe.com" },
    );
    expect(r).toEqual({ kind: "match", signal: "email-name-company" });
  });

  it("subdomain of stored domain matches", () => {
    const r = matchConfidence(
      { provider: "email", email: "patrick.collison@eu.stripe.com" },
      evalUrl,
      { fullName: "Patrick Collison", primaryCompanyDomain: "stripe.com" },
    );
    expect(r).toEqual({ kind: "match", signal: "email-name-company" });
  });

  it("wrong domain → email-no-signal", () => {
    const r = matchConfidence(
      { provider: "email", email: "patrick.collison@google.com" },
      evalUrl,
      { fullName: "Patrick Collison", primaryCompanyDomain: "stripe.com" },
    );
    expect(r).toEqual({ kind: "no-match", reason: "email-no-signal" });
  });

  it("right domain, wrong local-part → email-no-signal", () => {
    const r = matchConfidence(
      { provider: "email", email: "support@stripe.com" },
      evalUrl,
      { fullName: "Patrick Collison", primaryCompanyDomain: "stripe.com" },
    );
    expect(r).toEqual({ kind: "no-match", reason: "email-no-signal" });
  });

  it("no profile at all → email-no-signal", () => {
    const r = matchConfidence(
      { provider: "email", email: "anyone@stripe.com" },
      evalUrl,
      null,
    );
    expect(r).toEqual({ kind: "no-match", reason: "email-no-signal" });
  });

  it("missing email on claim → email-no-domain", () => {
    const r = matchConfidence(
      { provider: "email" },
      evalUrl,
      { fullName: "Patrick Collison", primaryCompanyDomain: "stripe.com" },
    );
    expect(r).toEqual({ kind: "no-match", reason: "email-no-domain" });
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
cd /Users/drodio/projects/founder-festival && npx vitest run tests/lib/identity-match.test.ts
```
Expected: the old assertions on `.toBe("high")` / `.toBe("low")` will fail because `matchConfidence` now needs to return an object (after Step 3). For now they fail because the new test cases compare against object shapes that don't yet exist as exports.

- [ ] **Step 3: Rewrite `identity-match.ts`**

Replace the body of `src/lib/identity-match.ts` keeping the helpers from Tasks 5 & 6, and replacing the old types + matchConfidence:

```ts
// Subset of the eval's stored profile JSONB that identity matching cares about.
// Populated by Claude during scoring (see SCORING_SCHEMA).
export type MatchProfile = {
  fullName?: string | null;
  primaryCompanyDomain?: string | null;
  publicEmail?: string | null;
  githubUsername?: string | null;
};

export type ClerkClaim = {
  provider: "linkedin" | "github" | "email";
  linkedinUrl?: string;
  githubUsername?: string;
  email?: string;
};

export type MatchSignal =
  | "linkedin-vanity"
  | "github-username"
  | "email-exact"
  | "email-name-company";

export type NoMatchReason =
  | "linkedin-vanity-mismatch"
  | "github-no-stored-username"
  | "github-username-mismatch"
  | "email-no-domain"
  | "email-no-signal";

export type MatchResult =
  | { kind: "match"; signal: MatchSignal }
  | { kind: "no-match"; reason: NoMatchReason };

export function matchConfidence(
  claim: ClerkClaim,
  evaluationLinkedinUrl: string,
  profile: MatchProfile | null,
): MatchResult {
  if (claim.provider === "linkedin") {
    if (!claim.linkedinUrl) {
      return { kind: "no-match", reason: "linkedin-vanity-mismatch" };
    }
    return normalize(claim.linkedinUrl) === normalize(evaluationLinkedinUrl)
      ? { kind: "match", signal: "linkedin-vanity" }
      : { kind: "no-match", reason: "linkedin-vanity-mismatch" };
  }

  if (claim.provider === "github") {
    const stored = profile?.githubUsername?.toLowerCase().trim();
    if (!stored) {
      return { kind: "no-match", reason: "github-no-stored-username" };
    }
    const claimUser = claim.githubUsername?.toLowerCase().trim();
    if (!claimUser) {
      return { kind: "no-match", reason: "github-username-mismatch" };
    }
    return claimUser === stored
      ? { kind: "match", signal: "github-username" }
      : { kind: "no-match", reason: "github-username-mismatch" };
  }

  if (claim.provider === "email") {
    const claimEmail = claim.email?.toLowerCase().trim();
    if (!claimEmail || !claimEmail.includes("@")) {
      return { kind: "no-match", reason: "email-no-domain" };
    }
    const [localPart, claimDomain] = claimEmail.split("@");
    if (!localPart || !claimDomain) {
      return { kind: "no-match", reason: "email-no-domain" };
    }

    // Tier 1: exact match against publicEmail
    const storedEmail = profile?.publicEmail?.toLowerCase().trim();
    if (storedEmail && storedEmail === claimEmail) {
      return { kind: "match", signal: "email-exact" };
    }

    // Tier 2: domain matches primaryCompanyDomain AND local-part matches subject's name
    const targetDomain = profile?.primaryCompanyDomain;
    const fullName = profile?.fullName ?? "";
    if (
      targetDomain &&
      fullName.trim() &&
      domainMatches(claimDomain, targetDomain) &&
      localPartMatchesName(localPart, fullName)
    ) {
      return { kind: "match", signal: "email-name-company" };
    }

    return { kind: "no-match", reason: "email-no-signal" };
  }

  // Exhaustiveness guard
  return { kind: "no-match", reason: "email-no-signal" };
}

function normalize(u: string): string {
  return u.trim().toLowerCase().replace(/\/$/, "").replace("www.", "");
}

// [domainMatches and localPartMatchesName + helpers remain as added in Tasks 5 & 6 below.]
```

Make sure the file still contains the helpers and `stripDiacritics` / `tokenizeName` / `buildLocalPartCandidates` from Tasks 5 & 6 (do not remove them; just reorder so the public-facing exports appear at the top).

- [ ] **Step 4: Update `/claim/callback/route.ts` to consume the new shape**

Replace the body of `src/app/claim/callback/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/db";
import { evaluations, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { matchConfidence, type ClerkClaim, type MatchProfile } from "@/lib/identity-match";

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.redirect(new URL("/claim", req.url));

  const url = new URL(req.url);
  const evaluationId = url.searchParams.get("e");
  if (!evaluationId) return NextResponse.redirect(new URL("/", req.url));

  const [evalRow] = await db.select().from(evaluations).where(eq(evaluations.id, evaluationId)).limit(1);
  if (!evalRow) return NextResponse.redirect(new URL("/", req.url));

  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL(`/claim?e=${evaluationId}`, req.url));

  const claim = toClerkClaim(user);
  const profileBlob = (evalRow.profile as MatchProfile | null) ?? null;
  const profile: MatchProfile | null = profileBlob
    ? {
        fullName: evalRow.fullName ?? profileBlob.fullName,
        primaryCompanyDomain: profileBlob.primaryCompanyDomain,
        publicEmail: profileBlob.publicEmail,
        githubUsername: profileBlob.githubUsername,
      }
    : (evalRow.fullName ? { fullName: evalRow.fullName } : null);

  const result = matchConfidence(claim, evalRow.linkedinUrl, profile);
  const ret = url.searchParams.get("return") ?? "welcome";
  const welcomeUrl = (extra: string) =>
    new URL(`/welcome?e=${evaluationId}&${extra}`, req.url);

  if (result.kind === "match") {
    await db
      .insert(users)
      .values({
        clerkUserId: userId,
        evaluationId,
        verifiedAt: new Date(),
        verifiedVia: claim.provider,
        matchConfidence: "high",
        verifiedSignal: result.signal,
      })
      .onConflictDoUpdate({
        target: users.clerkUserId,
        set: {
          evaluationId,
          verifiedAt: new Date(),
          verifiedVia: claim.provider,
          matchConfidence: "high",
          verifiedSignal: result.signal,
        },
      });
    if (ret === "welcome") {
      return NextResponse.redirect(welcomeUrl(`claimed=${result.signal}`));
    }
    return NextResponse.redirect(new URL("/verified", req.url));
  }

  // no-match branches
  if (claim.provider === "linkedin") {
    return NextResponse.redirect(welcomeUrl(`claim_mismatch=1`));
  }
  return NextResponse.redirect(welcomeUrl(`claim_failed=${claim.provider}`));
}

function toClerkClaim(user: NonNullable<Awaited<ReturnType<typeof currentUser>>>): ClerkClaim {
  const accounts = user.externalAccounts ?? [];
  const linkedin = accounts.find((a) => a.provider.startsWith("linkedin"));
  if (linkedin) {
    // Note (Task 1 diagnostic): adjust extraction here based on what Clerk
    // actually returns. If `username` is not the vanity, replace with the
    // chosen fallback (e.g., parse imageUrl, or call LinkedIn API).
    const vanity = (linkedin as unknown as { username?: string }).username;
    return {
      provider: "linkedin",
      linkedinUrl: vanity ? `https://linkedin.com/in/${vanity}` : undefined,
    };
  }
  const github = accounts.find((a) => a.provider.startsWith("github"));
  if (github) {
    return {
      provider: "github",
      githubUsername: (github as unknown as { username?: string }).username,
    };
  }
  const email = user.emailAddresses?.[0]?.emailAddress;
  return { provider: "email", email };
}
```

(Note: dropped `githubDisplayName` from `ClerkClaim` since the new GitHub rule no longer uses it. If you see test failures because some old test still passes `githubDisplayName`, those tests were already removed in Step 1.)

- [ ] **Step 5: Run the full identity-match test file**

```bash
cd /Users/drodio/projects/founder-festival && npx vitest run tests/lib/identity-match.test.ts
```
Expected: all cases PASS (LinkedIn × 4, GitHub × 5, Email exact × 2, Email name+company × 6, localPartMatchesName cases, domainMatches cases).

- [ ] **Step 6: Type-check**

```bash
cd /Users/drodio/projects/founder-festival && npx tsc --noEmit -p .
```
Expected: clean (or only pre-existing unrelated test errors).

- [ ] **Step 7: Commit**

```bash
git -C /Users/drodio/projects/founder-festival add src/lib/identity-match.ts src/app/claim/callback/route.ts tests/lib/identity-match.test.ts
git -C /Users/drodio/projects/founder-festival commit -m "Identity match: typed MatchResult + new signals; callback consumes it

Replaces 'high|medium|low' with a discriminated union ('match' with a
MatchSignal, or 'no-match' with a NoMatchReason). LinkedIn vanity is
the only LinkedIn signal; GitHub requires a stored github_username;
email has exact (stored publicEmail) + name+company tiers. Callback
writes verified_signal and branches redirects: ?claimed on match,
?claim_failed on github/email no-match, ?claim_mismatch on linkedin
no-match. Old 'medium' is no longer written.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: ClaimSuccessBanner component

**Files:**
- Create: `src/components/ClaimSuccessBanner.tsx`

- [ ] **Step 1: Create the component file**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Signal = "linkedin-vanity" | "github-username" | "email-exact" | "email-name-company";

const LABELS: Record<Signal, string> = {
  "linkedin-vanity": "LinkedIn account match",
  "github-username": "GitHub username match",
  "email-exact": "Email match",
  "email-name-company": "Email match (name + company)",
};

export function ClaimSuccessBanner() {
  const router = useRouter();
  const params = useSearchParams();
  const claimed = params.get("claimed") as Signal | null;
  const [visible, setVisible] = useState(true);

  // Strip the query param on mount so a hard refresh doesn't re-show the banner.
  useEffect(() => {
    if (!claimed) return;
    const next = new URLSearchParams(params.toString());
    next.delete("claimed");
    const qs = next.toString();
    const path = window.location.pathname + (qs ? `?${qs}` : "");
    router.replace(path, { scroll: false });
  }, [claimed, params, router]);

  if (!claimed || !LABELS[claimed] || !visible) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-between gap-4 rounded-md border border-[#dfa43a]/40 bg-[#dfa43a]/10 px-4 py-3 text-sm text-[#dfa43a]"
    >
      <span>
        ✓ Confirmed you own this profile via <strong>{LABELS[claimed]}</strong>.
      </span>
      <button
        type="button"
        onClick={() => setVisible(false)}
        className="text-[#dfa43a]/70 hover:text-[#dfa43a]"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/drodio/projects/founder-festival && npx tsc --noEmit -p .
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git -C /Users/drodio/projects/founder-festival add src/components/ClaimSuccessBanner.tsx
git -C /Users/drodio/projects/founder-festival commit -m "Add ClaimSuccessBanner — gold one-liner with auto query-strip

Reads ?claimed=<signal>, renders the human label, calls router.replace
on mount to strip the param so reloads don't repeat the banner.
Dismissable via ×.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: MismatchOverlay component

**Files:**
- Create: `src/components/MismatchOverlay.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function extractLinkedinHandle(input: string): string {
  let s = input.trim();
  s = s.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  const m = s.match(/linkedin\.com\/in\/(.+)/i);
  if (m) s = m[1];
  return s.split(/[/?#]/)[0];
}

type Props = {
  fullName: string | null;
  open: boolean;
  onClose: () => void;
};

export function MismatchOverlay({ fullName, open, onClose }: Props) {
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const url = `https://linkedin.com/in/${extractLinkedinHandle(handle)}`;
    try {
      const res = await fetch("/api/eval", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ linkedinUrl: url }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Something went wrong");
        setBusy(false);
        return;
      }
      const next = json.status === "low-signal"
        ? `/not-this-round?e=${json.evaluationId}`
        : `/welcome?e=${json.evaluationId}`;
      router.push(next);
    } catch {
      setError("Network error — please try again");
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#1c1c1c] border border-zinc-800 rounded-lg max-w-md w-full p-6 sm:p-8 flex flex-col gap-6 text-zinc-100"
      >
        <div className="flex justify-between items-start">
          <h2 className="font-display text-2xl font-bold">
            This is {fullName ? `${fullName}'s` : "someone else's"} profile.
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200 text-sm shrink-0 ml-2"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <p className="text-sm text-zinc-400 leading-relaxed">
          Want to score yours instead?
        </p>
        <form onSubmit={submit} className="flex flex-col gap-2">
          <div className="flex flex-col sm:flex-row sm:items-stretch border border-zinc-800 rounded-md overflow-hidden bg-black">
            <span className="px-3 pt-3 pb-1 sm:py-3 text-zinc-500 select-none sm:border-r sm:border-zinc-800 text-xs sm:text-sm whitespace-nowrap">
              https://linkedin.com/in/
            </span>
            <input
              autoFocus
              value={handle}
              onChange={(e) => setHandle(extractLinkedinHandle(e.target.value))}
              placeholder="your-handle"
              className="flex-1 px-3 pb-3 pt-1 sm:py-3 bg-transparent text-zinc-100 placeholder:text-zinc-600 outline-none text-sm"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
          <button
            type="submit"
            disabled={busy || handle.trim() === ""}
            className="rounded-md bg-[#dfa43a] text-black font-medium py-3 disabled:opacity-40"
          >
            {busy ? "Working…" : "Check My Score"}
          </button>
        </form>
        {error && <div className="text-sm text-red-400 text-center">{error}</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/drodio/projects/founder-festival && npx tsc --noEmit -p .
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git -C /Users/drodio/projects/founder-festival add src/components/MismatchOverlay.tsx
git -C /Users/drodio/projects/founder-festival commit -m "Add MismatchOverlay — score-yours-instead modal on LinkedIn mismatch

Shown when ?claim_mismatch=1 is in the URL. Tells the user this is
someone else's profile, pre-focused input for their own LinkedIn
handle, POST /api/eval and bounce to the new /welcome (or
/not-this-round on low-signal).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: ClaimProfileModal — accept `initialBanner`, implement real email link

**Files:**
- Modify: `src/components/ClaimProfileModal.tsx`

- [ ] **Step 1: Add `initialBanner` prop and update strategy handler**

Replace `src/components/ClaimProfileModal.tsx` with:

```tsx
"use client";

import { useState } from "react";
import { useSignIn } from "@clerk/nextjs";

type Props = {
  open: boolean;
  onClose: () => void;
  evaluationId: string;
  initialBanner?: {
    kind: "claim_failed";
    provider: "github" | "email";
  } | null;
};

export function ClaimProfileModal({ open, onClose, evaluationId, initialBanner }: Props) {
  const { signIn } = useSignIn();
  const [step, setStep] = useState<"providers" | "email-entry" | "email-sent">("providers");
  const [email, setEmail] = useState("");
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);

  async function goSso(strategy: "oauth_linkedin_oidc" | "oauth_github") {
    if (!signIn) return;
    const redirectCallbackUrl = `/claim/callback?e=${evaluationId}&return=welcome`;
    await signIn.sso({
      strategy,
      redirectUrl: "/claim/sso-callback",
      redirectCallbackUrl,
    });
  }

  async function startEmailLink() {
    if (!signIn || !email) return;
    setEmailErr(null);
    setEmailBusy(true);
    try {
      const created = await signIn.create({ identifier: email });
      const emailFactor = created.supportedFirstFactors?.find(
        (f) => f.strategy === "email_link",
      );
      if (!emailFactor || !("emailAddressId" in emailFactor)) {
        throw new Error("Email link auth isn't enabled on this Clerk instance.");
      }
      await signIn.prepareFirstFactor({
        strategy: "email_link",
        emailAddressId: (emailFactor as { emailAddressId: string }).emailAddressId,
        redirectUrl: `${window.location.origin}/claim/sso-callback?e=${evaluationId}&return=welcome`,
      });
      setStep("email-sent");
    } catch (err) {
      setEmailErr(err instanceof Error ? err.message : "Could not send link.");
    } finally {
      setEmailBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#1c1c1c] border border-zinc-800 rounded-lg max-w-md w-full p-6 sm:p-8 flex flex-col gap-6 text-zinc-100"
      >
        <div className="flex justify-between items-center">
          <h2 className="font-display text-2xl font-bold">Claim Your Profile</h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200 text-sm"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {initialBanner?.kind === "claim_failed" && step === "providers" && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            We couldn&apos;t confirm you own this profile via{" "}
            <strong>{initialBanner.provider === "github" ? "GitHub" : "email"}</strong>.
            Try LinkedIn instead.
          </div>
        )}

        {step === "providers" && (
          <>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Before we show you events and allow you to score and tune your
              needs, we need to verify that you&apos;re the person we scored.
            </p>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Sign in below. We&apos;ll match the account against the LinkedIn
              profile we evaluated.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => goSso("oauth_linkedin_oidc")}
                className={`rounded-md font-medium py-3 transition-opacity ${
                  initialBanner?.kind === "claim_failed"
                    ? "bg-[#dfa43a] text-black hover:opacity-90"
                    : "bg-white text-black hover:opacity-90"
                }`}
              >
                Continue with LinkedIn
              </button>
              <button
                onClick={() => goSso("oauth_github")}
                className={`rounded-md border py-3 transition-colors ${
                  initialBanner?.kind === "claim_failed"
                    ? "border-zinc-800 text-zinc-500 hover:border-zinc-700"
                    : "border-zinc-700 text-zinc-100 hover:border-zinc-500"
                }`}
              >
                Continue with GitHub
              </button>
              <button
                onClick={() => setStep("email-entry")}
                className={`rounded-md border py-3 transition-colors ${
                  initialBanner?.kind === "claim_failed"
                    ? "border-zinc-800 text-zinc-500 hover:border-zinc-700"
                    : "border-zinc-700 text-zinc-100 hover:border-zinc-500"
                }`}
              >
                Continue with email
              </button>
            </div>
          </>
        )}

        {step === "email-entry" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              startEmailLink();
            }}
            className="flex flex-col gap-3"
          >
            <label className="text-xs uppercase tracking-[0.2em] text-zinc-500">
              Email
            </label>
            <input
              autoFocus
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="rounded-md bg-black border border-zinc-800 text-zinc-100 px-3 py-3 text-sm outline-none"
            />
            <button
              type="submit"
              disabled={emailBusy || email.trim() === ""}
              className="rounded-md bg-white text-black font-medium py-3 disabled:opacity-40"
            >
              {emailBusy ? "Sending…" : "Send sign-in link"}
            </button>
            <button
              type="button"
              onClick={() => setStep("providers")}
              className="text-xs text-zinc-500 hover:text-zinc-300 self-center"
            >
              ← Back to providers
            </button>
            {emailErr && <div className="text-sm text-red-400 text-center">{emailErr}</div>}
          </form>
        )}

        {step === "email-sent" && (
          <div className="flex flex-col gap-3 text-center">
            <p className="text-base text-zinc-200">
              Check <strong>{email}</strong> for a sign-in link.
            </p>
            <p className="text-xs text-zinc-500">
              The link will sign you in and verify your identity in one step.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/drodio/projects/founder-festival && npx tsc --noEmit -p .
```
Expected: clean. If Clerk's `signIn.create` types don't match, cast `(created as any).supportedFirstFactors` — this is an MVP and the field exists at runtime.

- [ ] **Step 3: Commit**

```bash
git -C /Users/drodio/projects/founder-festival add src/components/ClaimProfileModal.tsx
git -C /Users/drodio/projects/founder-festival commit -m "ClaimProfileModal: initialBanner prop + real email-link flow

When initialBanner = claim_failed, render a yellow inline banner and
emphasize LinkedIn (gold, others muted). Email button is no longer a
stub — it swaps the modal into a 2-step email entry → 'check your
inbox' flow using signIn.prepareFirstFactor with strategy=email_link
and a redirectUrl that lands at the existing /claim/sso-callback.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Wire query params into /welcome page

**Files:**
- Modify: `src/app/welcome/page.tsx`
- Modify: `src/components/Recommendations.tsx` (accept `initialBanner` prop, pass through to internal modal)
- Modify: `src/components/EventsCTA.tsx` (accept `initialBanner` prop, pass through to internal modal)

- [ ] **Step 1: Read query params on the page**

Open `src/app/welcome/page.tsx`. Update the `PageProps` type:

```ts
type PageProps = { searchParams: Promise<{ e?: string; claimed?: string; claim_failed?: string; claim_mismatch?: string }> };
```

In `WelcomePage`, after `const { e } = await searchParams;`, add:

```ts
  const { e, claimed, claim_failed: claimFailed, claim_mismatch: claimMismatch } = await searchParams;
```

(Update the earlier `await searchParams` destructure to include all four fields.)

- [ ] **Step 2: Import the new components**

At the top of the file:

```ts
import { ClaimSuccessBanner } from "@/components/ClaimSuccessBanner";
import { MismatchOverlay } from "@/components/MismatchOverlay";
```

- [ ] **Step 3: Render the new surfaces inside `<main>`**

Just below the opening `<main …>`, render the success banner (it self-hides if `?claimed` is absent):

```tsx
        <ClaimSuccessBanner />
```

At the bottom of `<main>` (just before `</main>`), render the overlay client-side. Since this is a server component, wrap in a small client wrapper or use a thin client component. Simpler: render unconditionally — `MismatchOverlay`'s `open` prop is driven by a small client wrapper.

Create a tiny client wrapper INSIDE `src/components/MismatchOverlay.tsx` (append at the bottom of the file from Task 9):

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MismatchOverlay } from "./MismatchOverlay";

// Renders the overlay only when ?claim_mismatch=1; strips the param on close.
export function MismatchOverlayController({ fullName }: { fullName: string | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(params.get("claim_mismatch") === "1");
  }, [params]);

  function close() {
    setOpen(false);
    const next = new URLSearchParams(params.toString());
    next.delete("claim_mismatch");
    const qs = next.toString();
    router.replace(window.location.pathname + (qs ? `?${qs}` : ""), { scroll: false });
  }

  return <MismatchOverlay fullName={fullName} open={open} onClose={close} />;
}
```

Then in `src/app/welcome/page.tsx`, import and render it:

```ts
import { MismatchOverlayController } from "@/components/MismatchOverlay";
```

Inside the page, just before `</main>` or as a sibling of `<main>`:

```tsx
        <MismatchOverlayController fullName={row.fullName ?? profileFullName ?? null} />
```

- [ ] **Step 4: Thread `initialBanner` into Recommendations + EventsCTA**

Compute on the page:

```ts
  const initialClaimBanner =
    claimFailed === "github" || claimFailed === "email"
      ? { kind: "claim_failed" as const, provider: claimFailed as "github" | "email" }
      : null;
```

Pass it through:

```tsx
        {recs && (
          <Recommendations
            evaluationId={row.id}
            summary={recs.summary}
            prePopulated={recs.items ?? []}
            savedResponses={savedResponses}
            isOwner={isOwner}
            initialBanner={initialClaimBanner}
          />
        )}
        <EventsCTA evaluationId={row.id} isOwner={isOwner} initialBanner={initialClaimBanner} />
```

- [ ] **Step 5: Add the prop to Recommendations**

Open `src/components/Recommendations.tsx`. In `type Props`:

```ts
  initialBanner?: {
    kind: "claim_failed";
    provider: "github" | "email";
  } | null;
```

In the component signature: `({ evaluationId, summary, prePopulated, savedResponses, isOwner, initialBanner }: Props)`.

When rendering `ClaimProfileModal`, pass `initialBanner={initialBanner}`. Also: when `initialBanner` is non-null on mount AND `!isOwner`, auto-open the modal so the user sees the banner without having to click a rating button:

```ts
  const [claimOpen, setClaimOpen] = useState(initialBanner?.kind === "claim_failed" && !isOwner);
```

- [ ] **Step 6: Mirror the change in EventsCTA**

Open `src/components/EventsCTA.tsx`. Same `Props` addition, same auto-open behavior:

```ts
  initialBanner?: { kind: "claim_failed"; provider: "github" | "email" } | null;

  const [open, setOpen] = useState(props.initialBanner?.kind === "claim_failed" && !props.isOwner);
```

Pass `initialBanner` through to `ClaimProfileModal`.

- [ ] **Step 7: Type-check**

```bash
cd /Users/drodio/projects/founder-festival && npx tsc --noEmit -p .
```
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git -C /Users/drodio/projects/founder-festival add src/app/welcome/page.tsx src/components/Recommendations.tsx src/components/EventsCTA.tsx src/components/MismatchOverlay.tsx
git -C /Users/drodio/projects/founder-festival commit -m "Welcome: render ClaimSuccessBanner / MismatchOverlay / claim_failed banner

Reads three new query params from the callback (?claimed, ?claim_failed,
?claim_mismatch). Success → gold banner above main, auto-strips param.
GitHub/email no-match → modal auto-opens with a yellow banner steering
to LinkedIn. LinkedIn vanity mismatch → full-screen overlay offering to
score the visitor's own profile.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Manual smoke test

This task is verification-only — no commits unless something needs fixing.

**Files:** none.

- [ ] **Step 1: Restart dev server**

```bash
lsof -ti:3000 | xargs -r kill -TERM; sleep 1; cd /Users/drodio/projects/founder-festival && npm run dev
```
Wait for "Ready".

- [ ] **Step 2: Smoke test — success on LinkedIn**

In browser:
1. Open `http://localhost:3000`, score a new LinkedIn URL where you control the LinkedIn account.
2. On `/welcome`, click any rating button.
3. In the modal, click "Continue with LinkedIn", sign in.
4. Expected: redirect to `/welcome?e=…&claimed=linkedin-vanity` then param strips, gold banner shows: "✓ Confirmed you own this profile via **LinkedIn account match**." Rating buttons now save without re-prompting.

- [ ] **Step 3: Smoke test — LinkedIn vanity mismatch**

1. While still signed in as the same LinkedIn account, manually navigate to a DIFFERENT eval's `/welcome` page (one that's not your LinkedIn profile).
2. Click a rating button. (Or test directly via `/welcome?e=…&claim_mismatch=1`.)
3. Sign in via LinkedIn again (your session may still be active; if not, redo).
4. Expected: full-screen MismatchOverlay shows "This is `<name>`'s profile. Want to score yours instead?" with an input field. Submitting your own handle starts a new eval and redirects.

- [ ] **Step 4: Smoke test — GitHub no-match**

1. On an eval that has no `githubUsername` in profile, click a rating button.
2. Click "Continue with GitHub", sign in.
3. Expected: redirect to `/welcome?e=…&claim_failed=github`, modal auto-opens with yellow banner: "We couldn't confirm you own this profile via **GitHub**. Try LinkedIn instead." LinkedIn button is highlighted gold.

- [ ] **Step 5: Smoke test — Email link**

1. On any eval, click "Continue with email", enter an email, click "Send sign-in link".
2. Expected: modal swaps to "Check your inbox" state. Open the email, click the link.
3. Expected: signed in. If the email's local-part + domain match the profile → success banner. Otherwise → `?claim_failed=email`.

- [ ] **Step 6: Verify Clerk dashboard enables email link**

If Step 5 errors with "Email link auth isn't enabled on this Clerk instance":
1. Open `dashboard.clerk.com` → Founder Festival → **User & Authentication → Email, Phone, Username** → enable **Email address** + **Email verification link**.
2. Retry Step 5.

- [ ] **Step 7: Inspect DB rows**

```bash
psql "$DATABASE_URL_UNPOOLED" -c "select clerk_user_id, evaluation_id, verified_via, match_confidence, verified_signal from users order by verified_at desc limit 5;"
```
Expected: at least one row with `match_confidence='high'` and `verified_signal` set to one of the four signal literals.

---

## Self-Review

**Spec coverage:**

| Spec section | Implementing task(s) |
|---|---|
| §1 Eval-time data extraction (schema + prompt) | Task 2 |
| §1 Persist new fields in `evaluations.profile` | Task 3 |
| §2 LinkedIn match | Task 7 |
| §2 GitHub match | Task 7 |
| §2 Email exact tier | Task 7 |
| §2 Email name+company tier | Tasks 5 + 6 + 7 |
| §3 Callback redirect branches | Task 7 |
| §3 ClaimSuccessBanner | Task 8 |
| §3 MismatchOverlay + "score yours instead" form | Task 9 |
| §3 ClaimProfileModal failure banner + LinkedIn emphasis | Task 10 |
| §3 Wire query params on /welcome | Task 11 |
| §4 Clerk LinkedIn vanity diagnostic | Task 1 |
| Data model: `users.verified_signal` | Task 4 |
| Tests for identity-match.ts | Tasks 5, 6, 7 |
| Tests for SCORING_SCHEMA accepts new fields | Task 2 |
| Email link real implementation (spec implies all 3 providers work) | Task 10 |
| Manual smoke test all branches | Task 12 |

No gaps.

**Placeholder scan:** No TBDs, no "implement later", every step has either exact code or an exact command with expected output. Email-link `signIn.prepareFirstFactor` call uses the actual Clerk API surface.

**Type consistency:** `MatchResult`, `MatchSignal`, `NoMatchReason` defined in Task 7; consumed in Task 7's callback edit and Task 8's `ClaimSuccessBanner` (which only takes the signal as a string literal union — kept in sync via the `Record<Signal, string>` type-checked map). `ClerkClaim` lost `githubDisplayName` — the old test cases that used it were replaced in Task 7 Step 1. `initialBanner` prop shape `{ kind: "claim_failed"; provider: "github" | "email" } | null` consistent across `ClaimProfileModal`, `Recommendations`, `EventsCTA`, and the `/welcome` page (Tasks 10, 11).

---

Plan complete and saved to `docs/superpowers/plans/2026-05-22-claim-flow-identity-matching.md`.

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration with isolation between steps.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints for review.

Which approach?
