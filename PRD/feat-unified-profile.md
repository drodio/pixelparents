## Progress Update as of July 8, 2026 — 4:24 AM Pacific

### Summary of changes since last update
First entry. Delivers the "unified AI-enriched profile" decision — treat AI
enrichment as a human-machine partnership (machine proposes, human approves/edits/
rejects) presented as part of the member's profile, NOT a separate siloed block.
Reframes and de-silos the enrichment UI across the family editor and the public
profile. tsc / lint / build green.

### Detail of changes made:
- `app/(authed)/family/enrichment-panel.tsx`: retitled "Auto-built profile" →
  "AI-assisted profile"; added a human-in-control line ("We draft this from your
  public data — it's YOUR profile, and you're in full control to edit, approve, or
  clear any of it"); flattened the siloed nested bordered box (border/bg/padding
  removed) so the bio/expertise flows as ONE unified editable section rather than a
  block-within-a-block; relabeled the sub-header to "Your bio & expertise ·
  AI-drafted, editable".
- `components/profile-view.tsx`: softened the loud "Auto-built profile" badge on
  the public "About" section to a subtle "AI-assisted" indicator (with partnership
  tooltip copy), so the section reads as the member's own About rather than a
  machine-generated silo.

### Potential concerns to address:
- This unifies the FRAMING + visual siloing. A deeper step — merging the enriched
  fields inline into the main profile-field form (so bio/expertise sit alongside
  the hand-entered fields with per-field accept/reject) — is a larger,
  design-subjective refactor left as a documented follow-up.
- Bidirectional family mapping (discover siblings/relatives from a profile) is NOT
  in this PR — it needs a getSharedProfileByToken loader extension to surface
  linkable family members; filed as a follow-up so it can be designed deliberately.
