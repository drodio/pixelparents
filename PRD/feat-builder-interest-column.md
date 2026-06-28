## Progress Update as of June 28, 2026 — 2:33 PM Pacific

### Summary of changes since last update
First entry for this branch. Added a new REQUIRED "builder interest" question to
`/signup` and a corresponding "Builder?" column to the admin parents table.
Minimal, focused change — no migration, no unrelated WIP.

### Detail of changes made:
- `lib/options.ts`: new exported `BUILDER_INTEREST = ["builder","aspiring","no"]`.
- `app/signup/actions.ts`: `patchSignup` does a read-modify-write into the
  existing `signups.extra` JSONB under key `builderInterest` (so other extra keys
  aren't clobbered). `completeSignup` now collects zod errors + a required
  `builderInterest` check together before returning; notify-once logic reuses the
  same `extra` variable.
- `app/signup/signup-form.tsx`: new radio fieldset (3 options) inserted between
  the OHS-affiliation and Technical-depth fieldsets, with conditional helper
  panels for "builder"/"aspiring" choices linking to the public builder
  guidelines page. Answer auto-saves immediately on selection.
- `app/(authed)/admin/page.tsx`: reads `extra.builderInterest` into the row.
- `app/(authed)/admin/parents-table.tsx`: new sortable "Builder?" column
  rendering Yes: Technical / Yes: Curious / No; expanded-photos `colSpan` bumped
  13 → 14.
- Stored in existing `signups.extra` JSONB column — NO database migration needed.
- `npx tsc --noEmit` passes clean.

### Potential concerns to address:
- The question is required only at `completeSignup` (the "Continue →" path). The
  legacy `submitSignup` server action does not collect or require it; if that path
  is still reachable it won't capture builder interest.
- Builder interest is intentionally not surfaced in the admin edit form or the
  developer `/api/v1/options` surface — out of scope for this PR.
