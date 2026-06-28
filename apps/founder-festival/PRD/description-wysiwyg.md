# Event description: WYSIWYG editor + HTML rendering

## Progress Update as of 2026-06-12 12:30 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
The admin event description is now a WYSIWYG rich-text editor (the same TipTap one used for
learnings) instead of a plain textarea, and the public page renders the description as
formatted HTML. Old plain/markdown descriptions still render correctly.

### Detail of changes made:
- `event-recap.ts` `descriptionToHtml(desc)`: normalizes a description to sanitized HTML —
  HTML stays HTML (sanitized); markdown/plain (Luma/older rows) goes through `markdownToHtml`.
  Used by both the public render and the admin editor's initial content.
- `EventDetailsEditor`: now wraps `RichTextEditor` (HTML out, debounced autosave) instead of a
  textarea. Admin page passes `descriptionToHtml(event.description)` as the initial HTML.
- `PATCH /api/admin/events/[id]/details`: sanitizes the description HTML before storing.
- Public `events/[slug]` description (3 spots: upcoming, past-claimed, past-unclaimed) renders
  HTML via `descriptionToHtml` in a prose container.
- Public render uses main's existing `ClampedHtml` (height-clamp + Read more) for the
  claimed past-event description; upcoming + unclaimed render the HTML in a prose div.
  (Reused `ClampedHtml` rather than rewriting `CollapsibleDescription`.)

### Potential concerns to address:
- Mixed formats during transition are handled by `descriptionToHtml` (no data migration needed).
  Re-Import from Luma stores Luma's markdown/plain; it's normalized on render + edit.
- Description is admin-authored; HTML is sanitized on save and on render (script/style/on*/js:).
