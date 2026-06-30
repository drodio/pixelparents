# feat/builders-student-section

## Progress Update as of June 29, 2026 — 8:43 PM Pacific

### Summary of changes since last update
Initial branch work: added a "Student builders" section plus a "Getting started"
developer-setup subsection at the bottom of the public `/builders` page, and
extended the README's Claude Code setup with the Claude desktop app option. No
behavior or data changes — content/markup only.

### Detail of changes made:
- **`app/builders/page.tsx`** — after the existing `builders.md` markdown article
  and a visual divider, added two JSX `<section>`s (kept in the page, not in
  `builders.md`, so we control the exact anchor ids + render the optional
  WhatsApp link and `<pre>`/`<code>` setup blocks):
  - `id="student-builders"` (so `/builders#student-builders` scrolls there, with
    `scroll-mt-24` to clear the header): explains what a student builder is and
    the "learn by shipping" ethos; an amber callout stating the **parent-mentor
    requirement is policy** (mirrors the existing rule in `builders.md`); a link
    to the open-source repo `https://github.com/drodio/pixelparents`; and a
    "Jump to" line with real in-page anchors — `#how-to-get-involved-as-a-pixel-parent-builder`
    and `#frequently-asked-questions` (the slugs `app/builders/markdown.tsx`
    auto-generates from the `builders.md` H2s) plus `#getting-started`.
  - `id="getting-started"`: Claude Code CLI flow in a styled `<pre><code>`
    (`git clone` → `cd pixelparents` → `claude -p "<starter prompt>"`), the
    `npm install -g @anthropic-ai/claude-code` prereq, and a card describing the
    Claude desktop app (Mac/Windows) and running Claude Code inside it.
  - Parent-mentor "find a mentor" line links to `NEXT_PUBLIC_DRODIO_WHATSAPP_URL`
    when that env var is set, else falls back to generic "message Daniel on
    WhatsApp" copy — same pattern as `components/student-verify.tsx`. **No phone
    number is committed.**
  - Added module-level `linkClass` / `preClass` / `REPO_URL` constants and read
    `WHATSAPP_URL` from `process.env` (the page is a server component, so this is
    safe and matches how the existing student-verify widget reads it).
- **`README.md`** — added a "Prefer a desktop app?" subsection under
  "Contributing with Claude Code" describing the Claude desktop app + running
  Claude Code inside it. The existing CLI clone/`claude -p` flow already covered
  the command-line path.

### Potential concerns to address:
- Pure content/markup change; no DB, API, or auth surface touched. `/builders`
  is public (no auth), so the new sections are visible to everyone — intended.
- The WhatsApp link only renders when `NEXT_PUBLIC_DRODIO_WHATSAPP_URL` is set in
  Vercel env; until then the generic copy shows. Nothing to commit for that.
- Anchor slugs for the "Jump to" links are derived from the current `builders.md`
  H2 headings — if those headings are renamed, update these anchors to match.
