# dossier-rerun

## Progress Update as of 2026-06-22 03:20 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Existing (ready) dossiers can now be re-run to update them. Hovering the "View"
box reveals a small link — "or re-run the dossier to update it" — that opens the
same run modal used when no dossier exists. The run endpoint now permits
re-running a ready/failed dossier (previously 409'd).

### Detail of changes made:
- `src/components/ProfileDossierBox.tsx` — the ready state now wraps the View link
  + a hover/focus-revealed re-run button in a `group` container; the button opens
  `CreditsModal` (reused verbatim). Re-run is a normal paid run (or free via the
  super-admin Admin button). The CreditsModal is now rendered in the ready branch
  too.
- `src/app/api/dossier/run/route.ts` — dedupe now blocks ONLY `status==="running"`
  (was running OR ready). A ready/failed dossier can be re-run; `startDossier`
  overwrites the row (resets shareUrl/status → running), so the box flips back to
  "Generating…" and the existing auto-refresh + green-flash handle completion.

### Potential concerns to address:
- The re-run link is hover/focus-revealed, so it's effectively invisible on touch
  devices (no hover). Acceptable per the request; revisit if mobile re-run is
  needed.
- Re-running overwrites the prior shareUrl immediately (set null until the new run
  completes), so the old dossier link is unavailable during regeneration. Expected
  for an "update it" action.
