# dossier-modal-center

## Progress Update as of 2026-06-22 03:55 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Centered the Deep Intelligence dossier modal body: the "Register / Sign in"
button, the credit-pack row, the "Run dossier" button, and the surrounding
labels/text are now centered instead of left-aligned.

### Detail of changes made:
- `src/components/ProfileDossierBox.tsx` (CreditsModal only):
  - Primary buttons (Register/Sign in, Run dossier — $50): `self-start` →
    `self-center`.
  - Both credit-pack grids: added `justify-center`.
  - Step labels, intro paragraph, signed-in/balance block, and the two helper
    lines: added `text-center` (info block also `items-center`).
- Pure className change; no logic, no migration.

### Potential concerns to address:
- None — purely presentational.
