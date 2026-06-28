## Progress Update as of 2026-05-28 10:30 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Tightens the per-phrase citations prompt. After DROdio re-scored Nazar
Gulyk on prod and saw zero decoration (citations arrays were all empty
even though row-level `sources` had real URLs), I diagnosed that the AI
was treating citations as optional. The previous wording explicitly said
"Empty citations array is fine. Better than fabricating" — easy out for
a conservative model.

### Detail of changes made:
- `src/lib/scoring.ts` PER-PHRASE CITATIONS section rewritten:
  - Opens with "REQUIRED:" instead of "In addition to...".
  - New "HARD RULE": if the row's `sources` array is non-empty,
    `citations` MUST also be non-empty. Every URL in `sources` must
    appear in at least one citation entry. The phrasing makes the
    row-level `sources` the AI's own answer key — it already knows
    which URLs are relevant; the citation just maps each URL to the
    phrase it backs.
  - Added a 3-step Process block: (1) write the reason, (2) for each
    URL in sources identify the backing phrase, (3) emit one citation
    per (phrase, urls) group.
  - Added a third concrete example modeled on real reason text from
    investor scoring ("Publicly identified as a San Francisco–based
    angel investor.").
  - "Empty citations is fine" softened to: only valid when sources is
    ALSO empty (LinkedIn-only-backed row). Removes the easy out.
  - Tightened "do NOT invent URLs" rule explicitly.

### Potential concerns to address:
- If the model now over-cites (emits citations for phrases backed
  ambiguously by sources), `sanitizeCitations` still drops anything
  whose phrase isn't a verbatim substring. Hallucination guard still
  holds.
- The prompt grew another ~25 lines. Next score will tell us if it
  costs more tokens noticeably or if other fields drift.
- Did NOT add raw-AI-output logging — was tempted, but the prompt fix
  is the leading hypothesis. If a fresh score still produces empty
  citations after this, we'll know it's a model/schema problem and
  can add logging then.
