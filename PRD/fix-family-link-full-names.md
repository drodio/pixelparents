# fix/family-link-full-names

## Progress Update as of [August 15, 2026 — 6:58 PM Pacific]

### Summary of changes since last update

Family link requests now name people by full name instead of first name only,
in-app and by email. From the Aug 14 student walkthrough. typecheck / lint /
test (1005) / build all exit 0.

### Detail of changes made:

- `lib/family-links.ts` — new `displayName()` helper. Joins first + last, falls
  back to whichever exists, returns null when there's genuinely no name so
  callers can still say "Someone".
- `membersMovedByLink()` now takes `lastName` and lists movers by full name.
- `lib/db/family-links.ts` — both naming sites use it: the in-app request row
  (`fromName`) and the notification email (`meName`). The members query now
  selects `lastName`, which it previously didn't.
- 4 new tests (19 in that file).

### Why this mattered more than it looks

Verbatim from the walkthrough: "where it says someone wants to link, Ava and OHS
student put the full name ... Make sure that it uses the full name of Ava Yu."

Approving a link merges two families' profile and child information. "Ava wants
to join your family" is not a decidable question in a community with more than
one Ava, and the safe reaction to an ambiguous request is to ignore it, which
silently blocks the person who is waiting.

### Potential concerns to address:

- Backlog captured in `gopixel-feedback-plan.md` at the repo root. Several doc
  items (merged role box, LinkedIn copy, PTC/BTSN tags) were already done in
  earlier passes and are marked as such.
- Still open from the same walkthrough: link approval status looks stale across
  accounts, the family visibility panel offers parent-only fields to students,
  and phone input has no international support.
