## Progress Update as of June 28, 2026 — 11:06 AM Pacific

### Summary of changes since last update
Two bodies of work, bundled into one PR to `main`: (1) a full content + styling
overhaul of the public `/builders` page, ratified as **v0.2** of the Pixel Parent
Builder Guidelines, plus a new versioned-guidelines archive; and (2) removal of the
public "anyone with the link" tier from the secret family-profile share feature, so
shared profiles can only be set to OHS-families or private.

### Detail of changes made:
- **/builders page (`builders.md`, `app/builders/markdown.tsx`, `app/builders/page.tsx`):**
  - Re-titled "Pixel Parent Builder Guidelines" (dropped inline `v0.1`); subtitle is now
    "v0.2: Guidelines ratified by the OHS Pixel Parents Tech Builder Group on June 28, 2026
    (view past versions)", where "view past versions" links to the GitHub `builders/versions` folder.
  - Restructured the prose bullets into per-section cards with nested plain-disc sub-bullets
    (Who we are / How we work together / How we work with OHS students / What we protect / Our ethos).
  - Added a "How we work with OHS students" box requiring a parent-mentor for any student builder.
  - "What we protect" now states we don't harvest OHS data; data must be inputted or authorized
    by current OHS families (minor-child data approved by a parent).
  - Added a Sparkle.ai mention + sub-bullet under the first FAQ (links to sparkle.ai and sparkle.ai/docs).
  - Markdown styling: first bold phrase / numbers / Q:/A: render gold (amber-400); all other bold
    is body-gray (white/70) bold; links are body-color text with a dotted amber (gold) underline
    (matching the Sparkle docs link approach), replacing the previous emerald/green links.
- **Versioned guidelines archive (`builders/versions/`):**
  - `v0.1.md` — snapshot of the version live on prod today (taken from `origin/main:builders.md`).
  - `README.md` — documents the scheme: current guidelines live in root `builders.md`; snapshot the
    outgoing version into this folder as `vX.Y.md` before each future ratified edit.
- **Secret share link privacy (`lib/share.ts` + callers, share UI, tests):** removed the
  `"link"` ("anyone with the link") visibility tier. `ShareVisibility` is now `"ohs" | "private"`;
  added `coerceShareVisibility()` that downgrades any legacy stored `"link"` rows to `"ohs"` at read
  time (stays OHS-visible, never public). UI/email copy and schema/db comments updated; `share.test.ts`
  updated. (Implemented earlier this session by an isolated worker; typecheck clean, 14/14 share tests pass.)

### Potential concerns to address:
- The "view past versions" link only resolves once this branch is merged to `main` (the `builders/versions/`
  folder must exist on `main`).
- **Deployment process for future versions:** archiving past versions is currently a documented manual
  step (snapshot `builders.md` → `builders/versions/<version>.md` before bumping the version). Recommended
  follow-up: a `.githooks/pre-commit` step that auto-snapshots the current version file whenever `builders.md`
  changes, so the archive can't drift from what ships. Not included here to keep this PR focused.
- Legacy `share_visibility = 'link'` DB rows are downgraded in code on read; an optional one-time SQL
  migration could rewrite them permanently.
