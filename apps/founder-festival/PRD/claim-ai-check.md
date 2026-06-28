## Progress Update as of 2026-06-09 Pacific

### Summary
"Claim Review Console" increment 1: a "Run AI Check" button on each pending owner-
edited claim. LLM searches independent public data about the claim + person and
returns a verifiability confidence (0-100) + verdict — to cut the human's review load.

### Detail
- `src/lib/claim-ai-check.ts` — aiCheckClaim(fullName, claim): Exa public-data search
  → generateText (anthropic/claude-sonnet-4-6) → {confidence, verdict, summary, sources}.
  Skeptical prompt (absence of evidence = unverified, not true). Best-effort, never throws.
- `api/score-items/[id]/ai-check` — admin-gated endpoint.
- `PendingItemRow.tsx` — "Run AI Check" button (middle, between confirm/reject) +
  color-coded result display (verdict + confidence + summary + sources).
- Live-verified (a well-known payments-company founder → partial 85%).

### Next (same Claim Review Console plan)
2. Edit pencil (reuse `modify`) + approval email (hello@festival.so template).
3. Email User (outbound compose) + thread data model (migration).
4. Inbound reply webhook + Request #NNNNN threading (needs Resend Inbound + DNS).
