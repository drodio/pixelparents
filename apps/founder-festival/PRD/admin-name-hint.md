## Progress Update as of 2026-06-08 Pacific

### Summary
Admin "name hint" — score profiles no public API can read (private LinkedIn, where
Exa AND EnrichLayer both fail, e.g. pjlconsulting). A super-admin attaches name +
roles/about; it's prepended to the research as authoritative content and re-scores.

### Detail
- schema: `evaluations.manual_profile_hint` text (migration 0040). Applied to DEV;
  PROD migration GATED on DROdio confirmation (classifier-blocked the vague "yes").
- pipeline: researchSubject(linkedinUrl, manualHint?) prepends the hint; threaded
  reEvaluate → computeFreshScore → researchSubject. Persists across re-scores.
- API: POST /api/admin/profiles/[id]/hint (super-admin) sets hint + reEvaluate.
- UI: ManualHintButton in AdminProfileBox (name input + about textarea + Save&Re-score).
- tsc clean, tests pass, no schema drift.

### Gating / order of operations
PR is DRAFT. Merging the code before the prod column exists would break prod queries
(they select manual_profile_hint). On approval: (1) apply prod migration, (2) merge.
Couldn't end-to-end test the re-score locally (no Anthropic key in worktree).
