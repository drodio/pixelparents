## Progress Update as of 2026-05-28 11:35 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
PR #129's "PURE BOOKKEEPING" prompt rewrite was supposed to make
citations land on every row with sources. Instead it REGRESSED: drodio
re-scored on prod and ALL 18 founder rows came back with empty
citations (vs ~10 working from PR #126).

Likely cause: the "PURE BOOKKEEPING" framing and the full-row-cite
fallback ("cite the WHOLE reason as the phrase") combined to make the
AI treat the section as low-priority/optional. Plus the section grew
longer, pushing it deeper in the prompt buffer.

This PR re-stabilizes the prompt:
- Restores the firmer "every URL must appear" requirement.
- Adds a SURGICAL fix for the mixed-source contradiction: LinkedIn URLs
  are the ONE explicit exception (they don't need citing — the profile
  is already linked to their LinkedIn from the top of the page). All
  other URLs MUST be cited.
- "If sources contains BOTH LinkedIn and non-LinkedIn URLs, cite the
  non-LinkedIn ones and ignore the LinkedIn one — do NOT bail out."
- Replaces the "PURE BOOKKEEPING" framing with a direct REQUIRED.
- Adds a concrete example covering the previously-broken case (drodio
  blog + Flippa podcast on a single phrase).

### Why this approach (instead of full revert)
PR #126 had 10/18 citations and the gap was rows with mixed
LinkedIn + third-party sources where the AI couldn't reconcile two
rules. Going back to PR #126 verbatim restores the contradiction.
This PR keeps the AI's job simple ("cite every non-LinkedIn URL") and
makes the LinkedIn exception explicit so the model doesn't freeze.

### Potential concerns to address:
- If the next re-score still has rows with non-LinkedIn sources but
  empty citations, the model is failing to follow even this version
  of the rule. Next escalation: switch from generateText + free-form
  JSON to generateObject with the schema — that forces the AI into
  the shape via the AI Gateway's structured-output tier.
- The PR #127 diagnostic logs are still in eval-pipeline.ts. Useful
  to keep until citations land reliably, then remove.
