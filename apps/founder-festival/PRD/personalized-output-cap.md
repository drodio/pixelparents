# Fix: personalized learnings truncated mid-sentence

## Progress Update as of 2026-06-10 7:00 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Raised the AI personalized-learnings output cap from 1800 → 4000 tokens; the recap output
was hitting the limit and cutting off mid-sentence.

### Detail of changes made:
- `lib/personalized-learnings.ts` `generatePersonalizedAI`: `maxOutputTokens` 1800 → 4000.
  Affects both the live recap button and the admin AI-vs-Chief eval (both use this fn).

### Potential concerns to address:
- Higher output cap = slightly higher max cost per generation (still on-demand only).
