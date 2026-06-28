# email-rich-body

## Progress Update as of 2026-06-22 08:24 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Addressed roborev review #132 (3 Low) on the previous fix commit: fixed the balanced-paren
URL case, documented the pill-unwrap assumption, and declined the best-effort-sanitizer note.

### Detail of changes made:
- `wrapBareUrls` now keeps a trailing `)` that balances a `(` inside the URL (Wikipedia
  `…/Foo_(bar)`) while still trimming unbalanced/sentence punctuation; added 2 tests.
- `unwrapPillSpans` comment now states inner values are escapeValues-escaped text (never
  nested spans), so the non-greedy match is always correct (roborev's suggested doc fix).
- Declined the unquoted-`on*` regex finding: intentional best-effort defense-in-depth
  (TipTap is the primary guard and never emits handlers; email-render stays DB-free/client-
  importable, so no parser dep). Recorded on the review.

## Progress Update as of 2026-06-22 08:21 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Addressed roborev review #131 (5 Low findings) on the rich-body feature — all accepted
and fixed: hardened the sanitizer, fixed linkify, stopped leaking pill markup into mail,
and closed the test gaps.

### Detail of changes made:
- `sanitizeEmailHtml`: now also strips **unquoted** `on*` handlers and neutralizes
  `javascript:`/`data:`/`vbscript:` **only inside href/src** (so a literal "javascript:" in
  body text is preserved, not mangled).
- `linkifyOutsideAnchors` / new shared `wrapBareUrls`: trims trailing sentence punctuation
  so `https://a.com/x.` no longer swallows the `.` into the href. Plain path reuses it.
- New `unwrapPillSpans`: the HTML render path drops `<span data-var-pill …>` scaffolding to
  its inner value, so outgoing email carries no internal authoring markup. Bonus: a
  `{{profile-url}}` pill in body text now unwraps to a bare URL → auto-linkified.
- Tests: added sanitizer (unquoted/data:/vbscript:/literal-text), linkify-punctuation,
  `unwrapPillSpans`, pill-scaffolding-stripped, profile-url-pill→link, and a new
  `tests/app/members-search.test.ts` (403 / short-query / mapping / error→empty). Email
  suite now 65 green.

## Progress Update as of 2026-06-22 08:16 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Turned the event email **body** into a rich-text (WYSIWYG) editor: bold/italic/links/
lists/headings/quotes with ⌘B/⌘I/⌘K, plus a combined `@` menu that inserts variable
pills **or** @-mentions a Festival member as a hyperlink to their profile. Link hrefs may
contain variables (e.g. `{{profile-url}}`) so a link can resolve to each recipient's own
profile. Renamed the recipient profile-URL variable label and made pasted URLs clickable.
The body now serializes to HTML through the whole send pipeline; the subject stays plain
text. All single-feature; bundles four related asks the user made in sequence.

### Detail of changes made:
- **Editor** (`VariablePillInput.tsx`): new `rich` prop. Rich mode enables StarterKit
  bold/italic/link/headings(2,3)/lists/blockquote, adds a formatting toolbar, a `Mod-k`
  link shortcut (prompt accepts `{{…}}` markers), and serializes via `getHTML()` (empty →
  ""). The variable PillNode now `renderHTML`s to a `<span data-var-pill …>{{marker}}</span>`
  so pills round-trip on reload AND the marker is substitutable at send. The `@` suggestion
  is now a factory: variables always, plus async Festival-member results in rich mode
  (inserted as `<a href>` to the absolute profile URL). Initial content loads HTML when the
  value looks like HTML, else via `templateToDoc` (legacy plain templates still work).
- **Member search API**: `GET /api/admin/members/search?q=` (grant `manage_events`) →
  `searchLeaderboard` → `[{name, href}]`.
- **Render engine** (`email-render.ts`): `looksLikeHtmlBody` picks HTML vs legacy plain path.
  HTML path: `renderTemplate(..., {escapeValues:true})` (escapes recipient values so they
  can't break markup or inject tags, incl. inside `href`s) → `sanitizeEmailHtml` (strips
  script/style/on*/javascript:) → `linkifyOutsideAnchors` (bare URLs become links; existing
  anchors untouched) → envelope. Plain path unchanged. `renderForRecipient` also returns an
  `htmlToText` plain copy for the message log.
- `email-variables.ts`: `renderTemplate` gained `escapeValues`; `profile-url` label renamed
  to "Recipient's Festival profile URL".
- Styling: rich editor + preview pane get Tailwind child-variants so headings/lists/quotes/
  links render in-app (emails use client defaults). Composer body hint updated.
- Tests: `email-rich-body.test.ts` (14) — escapeValues, HTML detection, sanitize, linkify-
  outside-anchors, bold/pill/value-escape/href-variable/member-link/bare-URL/plain-text-copy/
  legacy-fallback. Full email suite 54 green. tsc + lint clean.

### Potential concerns to address:
- Link UX uses `window.prompt` (matches the existing event-description editor). Functional;
  a inline popover would be nicer later.
- The send-time sanitizer is regex-based (same one used for event recaps/descriptions) and is
  the real guard; the editor's `isAllowedUri` is permissive by design (admin-only) so variable
  markers survive. Editor content is admin-authored, not user input.
- Legacy plain-text templates render via the plain path (escape + nl2br); only bodies with real
  tags take the HTML path. A legacy body containing a literal `<tag>` would shift paths, but
  none are expected in practice.
