# learnings-mentions

## Progress Update as of 2026-06-08 10:55 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Three polish fixes from code review: MentionList now returns `null` instead of "No profiles found" when `items.length === 0` (hides dropdown for both short-query and genuine-no-results cases); extensions array in RichTextEditor wrapped in `useMemo([enableMentions])` to avoid rebuild on every render; Escape branch comment in `mentionSuggestion.render.onKeyDown` updated to accurately describe `@tiptap/suggestion`'s own handling.

### Detail of changes made:
- `src/components/admin/rich-text-mention.tsx`: removed "No profiles found" div; empty branch now returns `null`. Updated Escape comment to: `// @tiptap/suggestion handles Escape itself; returning true here is a harmless no-op if it ever reaches us`.
- `src/components/admin/RichTextEditor.tsx`: added `useMemo` to react import; wrapped extensions array construction in `useMemo<AnyExtension[]>(() => { ... }, [enableMentions])`.

### Potential concerns to address:
- None; tsc clean, 15/15 tests pass, build clean.

## Progress Update as of 2026-06-08 12:20 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Task 5: wired `enableMentions` opt-in prop into `RichTextEditor.tsx` and enabled it on both `<RichTextEditor>` instances in `EventLearningsEditor.tsx`. Build passes clean after 2 deviations from the plan.

### Detail of changes made:
- `src/components/admin/RichTextEditor.tsx`: added `enableMentions?: boolean` prop; conditional `MentionLink.configure({ suggestion: mentionSuggestion })` in extensions array.
- `src/components/admin/EventLearningsEditor.tsx`: added `enableMentions` prop to both `<RichTextEditor>` instances.
- `package.json` / `pnpm-lock.yaml`: also added `@tiptap/core@^3.26.0` as direct dep (pnpm doesn't hoist it by default, needed for `AnyExtension` import).

### Deviations from plan:
1. Added `AnyExtension[]` type annotation on extensions array (plan's implicit type inference failed because `extensions.push(MentionLink...)` mixed `Extension<StarterKitOptions>` and `Node<MentionOptions>` types). Fixed by importing `AnyExtension` from `@tiptap/core`.
2. `@tiptap/core` had to be added as a direct dep (same issue as `@tiptap/suggestion` in Task 1 — pnpm doesn't hoist transitive deps to top-level `node_modules`).

### Potential concerns to address:
- None; build is clean.

## Progress Update as of 2026-06-08 12:15 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Task 4: created `src/components/admin/rich-text-mention.tsx` — the `MentionLink` TipTap node (extends base Mention with custom attrs/parseHTML/renderHTML/renderText) and `mentionSuggestion` config (no-tippy React dropdown). TypeScript clean after one deviation from the plan.

### Detail of changes made:
- `src/components/admin/rich-text-mention.tsx`: `MentionLink` (Mention.extend), `MentionList` (forwardRef React dropdown), `mentionSuggestion` (SuggestionOptions config).
- Deviation: ref callbacks changed from `ref={(r) => (listRef.current = r)}` (returns value, TS error) to `ref={(r) => { listRef.current = r; }}` (void return). React Ref callback type requires void return.

### Potential concerns to address:
- None new.

## Progress Update as of 2026-06-08 12:10 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Task 3 (sanitizer invariant): added 2 characterization tests to `tests/lib/event-recap.test.ts` asserting that `sanitizeRecapHtml` already preserves mention anchors (class + data-mention-id + internal href) and still strips dangerous attributes. All 13 tests pass immediately — no source change needed.

### Detail of changes made:
- `tests/lib/event-recap.test.ts`: 2 new tests in `sanitizeRecapHtml` describe block.

### Potential concerns to address:
- None new.

## Progress Update as of 2026-06-08 12:05 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Task 2 (TDD): created `src/lib/mention-anchor.ts` (pure `mentionAnchorSpec` builder) and `tests/lib/mention-anchor.test.ts`. 2 tests pass.

### Detail of changes made:
- `src/lib/mention-anchor.ts`: exports `MentionAttrs` type and `mentionAnchorSpec` function that returns a ProseMirror DOMOutputSpec tuple `["a", {...}, label]`.
- `tests/lib/mention-anchor.test.ts`: unit tests for happy path and null attrs. All pass.

### Potential concerns to address:
- None new.

## Progress Update as of 2026-06-08 12:00 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Task 1: installed `@tiptap/extension-mention@3.26.0` and `@tiptap/suggestion@3.26.0` as direct deps. Both resolve at 3.26.0, matching the installed `@tiptap/react`/`@tiptap/pm`. Note: `@tiptap/suggestion` was added as a direct dep (not just transitive) because pnpm does not hoist it to the top-level `node_modules/@tiptap/` without explicit inclusion.

### Detail of changes made:
- `package.json` gains `"@tiptap/extension-mention": "^3.26.0"` and `"@tiptap/suggestion": "^3.26.0"`.
- `pnpm-lock.yaml` updated.

### Potential concerns to address:
- `@tiptap/extension-mention` 3.26 uses `configure()` options (`renderHTML`, `renderText`) rather than `extend()` method overrides — plan's `Mention.extend()` approach for `parseHTML/renderHTML/renderText` needs verification against actual 3.26 API.

## Progress Update as of 2026-06-09 10:25 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Wrote the task-by-task implementation plan (`docs/superpowers/plans/2026-06-09-learnings-mentions.md`, 6 tasks, TDD). Confirmed vitest env is node (no jsdom) → pure mention-anchor builder is unit-tested; editor UI is build+manual verified.

### Detail of changes made:
- Plan: (1) add @tiptap/extension-mention, (2) pure mention-anchor spec builder + tests, (3) pin sanitizer-preserves-anchor invariant, (4) Mention node + no-tippy suggestion dropdown, (5) opt-in enableMentions on RichTextEditor + enable in both learnings editors, (6) verify + PR.

### Potential concerns to address:
- Confirm @tiptap/extension-mention 3.26 pulls a compatible @tiptap/core major (no skew with @tiptap/react).

# learnings-mentions

## Progress Update as of 2026-06-09 10:15 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Wrote the approved design spec for @mention-a-profile support in the event
learnings editors (`docs/superpowers/specs/2026-06-09-learnings-mentions-design.md`).
No feature code yet — next step is the implementation plan.

### Detail of changes made:
- Design: a TipTap Mention node (via `@tiptap/extension-mention`) that
  autocompletes profiles using the existing `/api/leaderboard/search` and
  serializes to a plain anchor `<a href="<profileHref>" data-mention-id="<evalId>"
  class="mention">Name</a>` (name only, no "@"). The recap sanitizer already
  preserves `<a>`/class/data-*, and the recap container styles anchors gold — so
  storage, save API, sanitizer, and public render are all UNCHANGED.
- Scope: opt-in `enableMentions` prop on the shared `RichTextEditor`, enabled for
  both learnings editors only.
- New module `rich-text-mention.tsx` holds the Mention node + the no-tippy React
  suggestion dropdown.

### Potential concerns to address:
- Need `@tiptap/extension-mention` (+ `@tiptap/suggestion`) added via pnpm.
- Baked canonical href could go stale on username change; `/profile?e=<id>`
  fallback + `data-mention-id` keep links valid / re-resolvable (out of scope v1).
