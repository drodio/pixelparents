## Progress Update as of 2026-06-22 08:58 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Addressed roborev (Low): `aboutWithName` now only linkifies when `href` is a clean internal path (`/^\/[^\s)]*$/`) — no whitespace or `)` that would break Markdown `](url)` syntax. A malformed href degrades to a plain bold name instead of emitting broken markup. Callers still pass `/hosts|/sponsors/<slug>`; this just removes the helper's dependence on caller cleanliness.

---

## Progress Update as of 2026-06-22 08:52 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
On public event pages, the host/sponsor **name** is now a gold clickable link to its `/hosts/<slug>` or `/sponsors/<slug>` page — matching the already-clickable logo. bd issue ff-yrr.

### Detail of changes made:
- `src/app/(authed)/events/[slug]/page.tsx`: `aboutWithName(name, blurb, href?)` gained an optional `href`. When provided it wraps the bold name in a Markdown link (`[**Name:**](href)`); brackets in the name are escaped so they can't break the link syntax. Both the Hosted-by and Sponsors cards now pass the same `href` they already use for the logo `<a>`.
- `CARD_PROSE` gained `[&_a_strong]:text-[#dfa43a]` — the name renders as a gold link wrapping bold text, and without this rule the existing `[&_strong]:text-zinc-100` would override the link color back to white.
- Renders inline as before ("Name: blurb… Read more") and stays inside the `ClampedHtml` clamp; the link survives `sanitizeRecapHtml` (it only strips script/style/on*/javascript:). `marked` confirmed to emit `<a href><strong>Name:</strong></a>`. No nested anchors — the name link is in a separate column from the logo link.
- Applied to BOTH hosts and sponsors (identical cards; the user asked for sponsors, hosts get the same treatment for consistency since their logo already links the same way).

### Potential concerns to address:
- A host/sponsor name containing a literal `]` is escaped; a name containing `*`/`_` could still interact with Markdown emphasis (pre-existing behavior — names were already injected into `**…**`). Acceptable parity.
