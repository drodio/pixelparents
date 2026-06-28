# email-pill-url-adjacency

## Progress Update as of 2026-06-22 09:35 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Addressed roborev #156: added pill-adjacency render tests; declined the "gate by variable
kind" finding (the global no-space is explicitly user-requested).

### Detail of changes made:
- Tests: a pill directly followed by punctuation renders with no spurious space
  (`{{first-name}},` → "Jane,"); a pill + normal space + word keeps the space and doesn't
  over-capture the URL.
- Declined #1 (gate no-space to URL variables): the user explicitly wants any variable pill
  to render contiguously with appended text across the board; member mentions (prose links)
  still keep their trailing space, which is an editor-command behavior (not render-testable).

## Progress Update as of 2026-06-22 09:33 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Let a variable pill be immediately followed (no space) by appended text so you can build
section deep links inline — e.g. an `{{event-url}}` pill followed directly by
`?section=Attendee+Insights` renders to
`https://festival.so/events/<slug>?section=Attendee+Insights`.

### Detail of changes made:
- `VariablePillInput.tsx`: the `@` variable-suggestion command no longer inserts a trailing
  space after a variable pill — the cursor lands right after the pill, so typed text (a query
  string, punctuation, etc.) is contiguous with the resolved value. Member mentions keep their
  trailing space (they're prose links). The render engine already substitutes a marker
  regardless of what follows it, so `{{event-url}}?section=…` resolves correctly in both bare
  text (auto-linkified) and inside a Cmd-K link href.
- Tests (`email-rich-body.test.ts`): an `{{event-url}}` pill directly followed by
  `?section=Attendee+Insights` renders as one URL; same as a link href.

### Notes / dependencies:
- The `?section=` value must EXACTLY match the section heading's label (case-sensitive, spaces
  as `+`) — the resolver in PR #424 matches `data-section` literally. So use
  `?section=Attendee+Insights`, not `attendee-insights`.
- The event-page section scroll/highlight itself ships in the other agent's PR #424
  (`docs-emdash`), not yet merged. This change only guarantees the email produces the correct
  URL; the deep-link behavior activates once #424 lands.
- Use the **Event URL** variable (`{{event-url}}`, which renders the event's URL), not Event
  name (which renders the title text).

### Potential concerns to address:
- Dropping the auto-space is a small global behavior change for all variable pills; it also
  avoids the old spurious space-before-punctuation. Members unaffected.
