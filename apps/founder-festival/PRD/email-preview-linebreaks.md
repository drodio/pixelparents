# email-preview-linebreaks

## Progress Update as of 2026-06-22 08:52 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Addressed roborev #147: added a single-quote + pre-existing-margin test, and documented why
per-side longhand-margin zeroing is unnecessary (declined as YAGNI).

### Detail of changes made:
- Test: `normalizeEmailBlocks("<p style='margin:2px'>A</p>")` → unchanged (covers the
  single-quote × existing-margin interaction). Suite now 31 cases.
- Doc note in `withParagraphMargin0`: the only paragraphs reaching it are TipTap's bare
  `<p>` (rarely `<p dir>`), which never carries inline margins — so partial-longhand inputs
  don't occur from our editor and per-side zeroing would be branching for a non-case.

## Progress Update as of 2026-06-22 08:50 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Addressed roborev #146 (2 Low edge cases in `withParagraphMargin0`): single-quoted styles
and longhand margins.

### Detail of changes made:
- `withParagraphMargin0` now matches both single- and double-quoted `style` values
  (preserving the original quote), so single-quoted styles no longer produce a second
  `style` attribute. The existing-margin guard also detects longhand (`margin-top`, etc.),
  so an intentional `margin-top:10px` is left intact rather than reset by an appended
  shorthand. Added single-quote + margin-longhand tests.

## Progress Update as of 2026-06-22 08:48 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Addressed roborev #144: made `normalizeEmailBlocks` robust to paragraphs that carry
attributes (the original bare-`<p>` regexes would skip `<p dir>`/`<p style>`/pasted
content, re-introducing the spacing divergence).

### Detail of changes made:
- `normalizeEmailBlocks` now matches `<p\b([^>]*)>…</p>` in a single pass, detects blank
  paragraphs even with attributes, and merges `margin:0` into any existing inline `style`
  via `withParagraphMargin0` (idempotent — never a duplicate `style` attr or margin).
- Added tests for attributed paragraphs, style-merge, and idempotency.
- Declined the Low tab-order finding: the two-column layout was explicitly requested; DOM
  order is logical top-to-bottom per column and no field's state/handler changed.

## Progress Update as of 2026-06-22 08:46 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Fixed a preview-vs-sent fidelity bug where a deliberate blank line (empty paragraph) in
the rich body didn't show in the preview or the delivered email, and reorganized the
composer so From / BCC / Subject sit at the top of the right column with the live preview
directly beside the Body.

### Detail of changes made:
- `email-render.ts`: new `normalizeEmailBlocks(html)` applied in the HTML body path
  (`buildEmailHtmlFromHtml`). TipTap serializes a blank line as an empty `<p></p>`, which
  collapses to zero height under both the app's CSS reset and email-client defaults — so the
  blank line disappeared. Now empty/whitespace-only paragraphs (`<p></p>`, `<p><br></p>`,
  `<p>&nbsp;</p>`) become a real blank line (`<p style="margin:0">&nbsp;</p>`), and every
  paragraph gets an inline `margin:0`. Inline styles win in every environment, so the
  in-app preview and the delivered email render identically (both consume the same
  `rendered.html`). Matches the editor model: tight paragraphs + explicit blank lines.
- `EmailComposer.tsx`: moved **From**, **BCC**, and **Subject** from the left column to the
  top of the right column, so the **Live preview** now starts beside the **Body** on the
  left. Left column is now Channel → Recipients → Body → Signature; right column is
  From → BCC → Subject → Live preview → Send-a-preview → Schedule/Send.
- Tests: `email-rich-body.test.ts` adds `normalizeEmailBlocks` cases + a `renderForRecipient`
  test asserting a deliberate blank line survives. Full email render suite green.

### Potential concerns to address:
- Paragraphs are pinned to `margin:0` (matching the editor's tight paragraphs + manual blank
  lines). Headings/lists/blockquote keep their own default spacing; if those ever need to be
  pixel-matched between preview and email, extend `normalizeEmailBlocks`.
- Column heights above Body (left: Channel+Recipients) vs above Live preview (right:
  From+BCC+Subject) are close but not pixel-identical, so the preview starts approximately —
  not exactly — level with the Body.
