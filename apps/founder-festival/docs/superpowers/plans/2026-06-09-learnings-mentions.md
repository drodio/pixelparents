# Learnings @mentions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins `@`-mention a Festival profile in the event learnings editors; the mention renders as a clickable gold link to that profile in the published recap.

**Architecture:** A TipTap Mention node (opt-in on the shared `RichTextEditor`) autocompletes profiles via the existing `/api/leaderboard/search` and serializes to a plain `<a href data-mention-id class="mention">Name</a>`. The recap sanitizer already preserves anchors + class + data-attrs and the recap container styles anchors gold, so storage, the save API, the sanitizer, and the public render path are all unchanged.

**Tech Stack:** Next.js App Router, TipTap 3.26 (`@tiptap/react` + `@tiptap/starter-kit`, adding `@tiptap/extension-mention`), React, Vitest (node env — no DOM, so DOM-free logic is unit-tested and the editor UI is build+manual verified).

**Spec:** `docs/superpowers/specs/2026-06-09-learnings-mentions-design.md`
**Branch:** `learnings-mentions` (already created; spec committed).

---

## File Structure

- **Modify** `package.json` / `pnpm-lock.yaml` — add `@tiptap/extension-mention`.
- **Create** `src/lib/mention-anchor.ts` — pure, DOM/DB-free builder for the mention's anchor output spec (so it's unit-testable in the node env and shared by the node's `renderHTML`).
- **Create** `tests/lib/mention-anchor.test.ts` — unit tests for that builder.
- **Modify** `tests/lib/event-recap.test.ts` — pin that `sanitizeRecapHtml` preserves a mention anchor.
- **Create** `src/components/admin/rich-text-mention.tsx` — the TipTap Mention node (attrs/parseHTML/renderHTML) + the no-tippy React suggestion dropdown.
- **Modify** `src/components/admin/RichTextEditor.tsx` — opt-in `enableMentions` prop.
- **Modify** `src/components/admin/EventLearningsEditor.tsx` — enable mentions on both editors.

> **PRD reminder:** `.husky/pre-commit` requires a new entry in `PRD/learnings-mentions.md` staged with every commit. Commit with `git -c core.hooksPath=.husky commit …`; never `--no-verify`.

---

### Task 1: Add the `@tiptap/extension-mention` dependency

**Files:** `package.json`, `pnpm-lock.yaml`, `PRD/learnings-mentions.md`

- [ ] **Step 1: Install (pinned to match the other @tiptap packages, ^3.26.0)**

Run: `pnpm add @tiptap/extension-mention@^3.26.0`
Expected: package.json gains `"@tiptap/extension-mention": "^3.26.0"`; `pnpm-lock.yaml` updates. (`@tiptap/suggestion` resolves transitively as a dependency of extension-mention.)

- [ ] **Step 2: Verify it imports and version-matches**

Run: `pnpm ls @tiptap/extension-mention @tiptap/suggestion`
Expected: both resolve at 3.26.x (same major/minor as `@tiptap/react`). If extension-mention pulls a different @tiptap/core major than the installed `@tiptap/react`/`@tiptap/pm`, STOP and report — a version skew will break the editor.

- [ ] **Step 3: Commit**

Prepend a `PRD/learnings-mentions.md` entry, then:
```bash
git add package.json pnpm-lock.yaml PRD/learnings-mentions.md
git -c core.hooksPath=.husky commit -m "build: add @tiptap/extension-mention for learnings mentions"
```

---

### Task 2: Pure mention-anchor builder (TDD)

**Files:** Create `src/lib/mention-anchor.ts`, `tests/lib/mention-anchor.test.ts`; `PRD/learnings-mentions.md`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/mention-anchor.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mentionAnchorSpec, type MentionAttrs } from "@/lib/mention-anchor";

describe("mentionAnchorSpec", () => {
  it("builds an <a class=mention data-mention-id href> spec with the label as text", () => {
    const attrs: MentionAttrs = { id: "eval-1", label: "Jordan Lee", href: "/profile/founder/jordan-lee" };
    expect(mentionAnchorSpec(attrs)).toEqual([
      "a",
      { class: "mention", "data-mention-id": "eval-1", href: "/profile/founder/jordan-lee" },
      "Jordan Lee",
    ]);
  });

  it("omits null id/href and falls back to empty label text", () => {
    expect(mentionAnchorSpec({ id: null, label: null, href: null })).toEqual(["a", { class: "mention" }, ""]);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm exec vitest run tests/lib/mention-anchor.test.ts`
Expected: FAIL — `@/lib/mention-anchor` doesn't exist.

- [ ] **Step 3: Implement**

Create `src/lib/mention-anchor.ts`:

```ts
// Pure, DOM/DB-free builder for the anchor a profile-mention serializes to.
// Shared by the TipTap mention node's renderHTML so the exact output is
// unit-tested without a DOM. The published recap styles all anchors gold, so
// this renders as a clickable gold link to the profile.
export type MentionAttrs = { id: string | null; label: string | null; href: string | null };

// ProseMirror DOMOutputSpec: ["a", attrs, textContent]. Null id/href are omitted
// so a malformed mention degrades to a plain (non-link) span of text.
export function mentionAnchorSpec(attrs: MentionAttrs): ["a", Record<string, string>, string] {
  const a: Record<string, string> = { class: "mention" };
  if (attrs.id) a["data-mention-id"] = attrs.id;
  if (attrs.href) a["href"] = attrs.href;
  return ["a", a, attrs.label ?? ""];
}
```

- [ ] **Step 4: Run it, expect PASS**

Run: `pnpm exec vitest run tests/lib/mention-anchor.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/mention-anchor.ts tests/lib/mention-anchor.test.ts PRD/learnings-mentions.md
git -c core.hooksPath=.husky commit -m "feat: pure mention-anchor output-spec builder + tests"
```

---

### Task 3: Pin the sanitizer invariant (TDD characterization)

**Files:** Modify `tests/lib/event-recap.test.ts`; `PRD/learnings-mentions.md`

- [ ] **Step 1: Add the test** (this asserts existing behavior the feature relies on — it should pass immediately)

In `tests/lib/event-recap.test.ts`, inside the existing `describe("sanitizeRecapHtml", …)` block, add:

```ts
  it("preserves a profile mention anchor (class + data-mention-id + internal href)", () => {
    const html =
      '<p>Great chat with <a href="/profile/founder/jordan-lee" data-mention-id="eval-1" class="mention">Jordan Lee</a>!</p>';
    expect(sanitizeRecapHtml(html)).toBe(html);
  });

  it("still strips a javascript: href and inline handler on a mention-shaped anchor", () => {
    expect(
      sanitizeRecapHtml('<a href="javascript:alert(1)" data-mention-id="x" onclick="x()">n</a>'),
    ).toBe('<a href="alert(1)" data-mention-id="x">n</a>');
  });
```

- [ ] **Step 2: Run it, expect PASS** (characterization — no source change)

Run: `pnpm exec vitest run tests/lib/event-recap.test.ts`
Expected: PASS. If the first assertion FAILS, the sanitizer strips something a mention needs — STOP and report (the design assumed it does not); do not weaken the sanitizer without escalating.

- [ ] **Step 3: Commit**

```bash
git add tests/lib/event-recap.test.ts PRD/learnings-mentions.md
git -c core.hooksPath=.husky commit -m "test: pin sanitizeRecapHtml preserves mention anchors"
```

---

### Task 4: The Mention node + suggestion dropdown module

**Files:** Create `src/components/admin/rich-text-mention.tsx`; `PRD/learnings-mentions.md`

This module has no unit test (it needs a DOM/editor); it's verified by the build (Task 5/6) and manual smoke. Keep it focused: the node config + a small React suggestion dropdown.

- [ ] **Step 1: Create the module**

Create `src/components/admin/rich-text-mention.tsx`:

```tsx
"use client";

import Mention from "@tiptap/extension-mention";
import type { SuggestionOptions } from "@tiptap/suggestion";
import { createRoot, type Root } from "react-dom/client";
import { useEffect, useImperativeHandle, useState, forwardRef } from "react";
import { mentionAnchorSpec, type MentionAttrs } from "@/lib/mention-anchor";

// One profile option in the @-mention dropdown.
type MentionItem = { id: string; label: string; href: string; company: string | null; score: number };

// ── The TipTap node ────────────────────────────────────────────────────────
// Serializes to <a class="mention" data-mention-id href>Label</a> via the pure
// mentionAnchorSpec; parseHTML brings saved mentions back into the editor when
// re-editing learnings. No leading "@" in the rendered label (per design).
export const MentionLink = Mention.extend({
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-mention-id"),
        renderHTML: () => ({}), // output handled by renderHTML below
      },
      label: {
        default: null,
        parseHTML: (el) => el.textContent,
        renderHTML: () => ({}),
      },
      href: {
        default: null,
        parseHTML: (el) => el.getAttribute("href"),
        renderHTML: () => ({}),
      },
    };
  },
  parseHTML() {
    return [{ tag: "a[data-mention-id]" }];
  },
  renderHTML({ node }) {
    return mentionAnchorSpec(node.attrs as MentionAttrs);
  },
  renderText({ node }) {
    return (node.attrs as MentionAttrs).label ?? "";
  },
});

// ── The dropdown list (React) ──────────────────────────────────────────────
type ListProps = { items: MentionItem[]; command: (item: MentionItem) => void };
type ListHandle = { onKeyDown: (e: KeyboardEvent) => boolean };

const MentionList = forwardRef<ListHandle, ListProps>(function MentionList({ items, command }, ref) {
  const [sel, setSel] = useState(0);
  useEffect(() => setSel(0), [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: (e) => {
      if (e.key === "ArrowDown") { setSel((s) => (s + 1) % Math.max(items.length, 1)); return true; }
      if (e.key === "ArrowUp") { setSel((s) => (s - 1 + items.length) % Math.max(items.length, 1)); return true; }
      if (e.key === "Enter" || e.key === "Tab") { if (items[sel]) command(items[sel]); return true; }
      return false;
    },
  }));

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-zinc-800 bg-[#151515] px-3 py-2 text-sm text-zinc-500 shadow-xl shadow-black/40">
        No profiles found
      </div>
    );
  }
  return (
    <ul className="max-h-[50vh] w-72 overflow-y-auto rounded-md border border-zinc-800 bg-[#151515] py-1 shadow-xl shadow-black/40">
      {items.map((it, i) => (
        <li key={it.id}>
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); command(it); }}
            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${i === sel ? "bg-zinc-800/70" : "hover:bg-zinc-800/40"}`}
          >
            <span className="min-w-0 flex-1 truncate text-zinc-100">
              {it.label}
              {it.company && <span className="text-zinc-500">, {it.company}</span>}
            </span>
            <span className="shrink-0 font-mono text-xs tabular-nums text-zinc-400">{it.score.toLocaleString("en-US")}</span>
          </button>
        </li>
      ))}
    </ul>
  );
});

// ── The suggestion config (no tippy — a positioned container + React root) ──
export const mentionSuggestion: Omit<SuggestionOptions<MentionItem>, "editor"> = {
  char: "@",
  items: async ({ query }) => {
    if (query.trim().length < 2) return [];
    try {
      const res = await fetch(`/api/leaderboard/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) return [];
      const data: { rows: Array<{ id: string; fullName: string | null; profileHref: string; companyName: string | null; combinedScore: number }> } = await res.json();
      return data.rows.slice(0, 8).map((r) => ({
        id: r.id,
        label: r.fullName ?? "Unknown",
        href: r.profileHref,
        company: r.companyName,
        score: r.combinedScore,
      }));
    } catch {
      return [];
    }
  },
  command: ({ editor, range, props }) => {
    editor
      .chain()
      .focus()
      .insertContentAt(range, [
        { type: "mention", attrs: { id: props.id, label: props.label, href: props.href } },
        { type: "text", text: " " },
      ])
      .run();
  },
  render: () => {
    let container: HTMLDivElement | null = null;
    let root: Root | null = null;
    let listRef: { current: ListHandle | null } = { current: null };

    const position = (rect: DOMRect | null) => {
      if (!container || !rect) return;
      container.style.left = `${rect.left + window.scrollX}px`;
      container.style.top = `${rect.bottom + window.scrollY + 4}px`;
    };

    return {
      onStart: (props) => {
        container = document.createElement("div");
        container.style.position = "absolute";
        container.style.zIndex = "60";
        document.body.appendChild(container);
        root = createRoot(container);
        // forwardRef target so onKeyDown can reach the list
        root.render(<MentionList ref={(r) => (listRef.current = r)} items={props.items} command={(it) => props.command(it)} />);
        position(props.clientRect?.() ?? null);
      },
      onUpdate: (props) => {
        root?.render(<MentionList ref={(r) => (listRef.current = r)} items={props.items} command={(it) => props.command(it)} />);
        position(props.clientRect?.() ?? null);
      },
      onKeyDown: (props) => {
        if (props.event.key === "Escape") return true; // let TipTap close it
        return listRef.current?.onKeyDown(props.event) ?? false;
      },
      onExit: () => {
        root?.unmount();
        container?.remove();
        container = null;
        root = null;
        listRef.current = null;
      },
    };
  },
};
```

> Note: `@tiptap/suggestion`'s `SuggestionOptions` generic + `render` lifecycle (`onStart/onUpdate/onKeyDown/onExit`) is the standard TipTap mention pattern. If the installed 3.26 types name a field differently (e.g. `clientRect` nullability), adjust to the real types from `node_modules/@tiptap/suggestion` — do not fight the types; match them.

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors. If the suggestion/types differ from above, reconcile against the installed `@tiptap/suggestion` types.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/rich-text-mention.tsx PRD/learnings-mentions.md
git -c core.hooksPath=.husky commit -m "feat: TipTap profile-mention node + suggestion dropdown"
```

---

### Task 5: Opt-in `enableMentions` on RichTextEditor + enable in learnings

**Files:** Modify `src/components/admin/RichTextEditor.tsx`, `src/components/admin/EventLearningsEditor.tsx`; `PRD/learnings-mentions.md`

- [ ] **Step 1: Add the prop + conditional extension in `RichTextEditor.tsx`**

Add the import at the top:
```tsx
import { MentionLink, mentionSuggestion } from "./rich-text-mention";
```

Change the component signature + `useEditor` extensions. The props become:
```tsx
export function RichTextEditor({
  initialContent,
  onChange,
  placeholder,
  enableMentions = false,
}: {
  initialContent: string;
  onChange: (html: string) => void;
  placeholder?: string;
  enableMentions?: boolean;
}) {
```
And build the extensions list conditionally (replace the inline `extensions: [...]`):
```tsx
  const extensions = [StarterKit.configure({ link: { openOnClick: false } })];
  if (enableMentions) {
    extensions.push(MentionLink.configure({ suggestion: mentionSuggestion }));
  }
  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: initialContent || "",
    editorProps: {
      attributes: {
        class:
          "min-h-[8rem] px-3 py-2 text-sm text-zinc-100 focus:outline-none [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-[#dfa43a] [&_blockquote]:border-l-2 [&_blockquote]:border-zinc-600 [&_blockquote]:pl-3 [&_blockquote]:text-zinc-400",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });
```
(Leave the rest of the component — Toolbar, the sync `useEffect`, the returned JSX — unchanged. The `enableMentions` dependency does not change at runtime, so the extensions list is stable for the editor's lifetime, which is correct.)

- [ ] **Step 2: Enable mentions on both learnings editors in `EventLearningsEditor.tsx`**

Add `enableMentions` to both `<RichTextEditor … />` instances:
```tsx
        <RichTextEditor
          initialContent={initialPublic}
          enableMentions
          onChange={(html) => {
            setPub(html);
            persist(html, att);
          }}
        />
```
and likewise the attendee editor:
```tsx
        <RichTextEditor
          initialContent={initialAttendees}
          enableMentions
          onChange={(html) => {
            setAtt(html);
            persist(pub, html);
          }}
        />
```

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: "✓ Compiled successfully", no type errors.

- [ ] **Step 4: Manual smoke (dev server)**

Run `pnpm dev`, open `/admin/events/<a real event id>`, scroll to Learnings. In the public learnings field type `@` then ≥2 letters of a known profile name → a dropdown appears → arrow/enter selects → the name is inserted. Save (autosaves). Confirm via the public recap (`/events/<slug>`) that the name renders as a gold clickable link to that profile. Also re-open the admin page and confirm the saved mention still shows in the editor (parseHTML round-trip).

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/RichTextEditor.tsx src/components/admin/EventLearningsEditor.tsx PRD/learnings-mentions.md
git -c core.hooksPath=.husky commit -m "feat(admin): enable profile @mentions in event learnings editors"
```

---

### Task 6: Final verify + PR

- [ ] **Step 1: Full check**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run tests/lib/mention-anchor.test.ts tests/lib/event-recap.test.ts && pnpm build`
Expected: tsc clean; tests pass; build compiles.

- [ ] **Step 2: Push + PR**

```bash
git push -u origin learnings-mentions
gh pr create --base main --head learnings-mentions \
  --title "feat: @mention profiles in event learnings" \
  --body "See docs/superpowers/specs/2026-06-09-learnings-mentions-design.md. Type @ in a learnings field to insert a clickable gold link to a profile; serializes to <a data-mention-id class=mention>. No storage/API/sanitizer/render changes (sanitizer already preserves the anchor)."
```

- [ ] **Step 3:** No prod migration (no schema change) — note that in the PR.

---

## Self-Review notes (checked)
- **Spec coverage:** dependency (T1), anchor serialization + name-only (T2 + T4 renderHTML via mentionAnchorSpec), sanitizer-preservation invariant (T3), autocomplete via leaderboard search + no-tippy dropdown (T4), opt-in `enableMentions` scoped to learnings only + same-tab links (T5), testing (T2/T3 unit + T5 manual). All spec sections map to a task.
- **Type consistency:** `MentionAttrs` (id/label/href) defined in T2 is used unchanged in T4's node; `MentionItem` (adds company/score) is the dropdown shape; `enableMentions` prop name consistent across T5. The search-row fields (`id`, `fullName`, `profileHref`, `companyName`, `combinedScore`) match `LeaderboardRow`.
- **No DOM in node tests:** unit tests cover only the pure `mentionAnchorSpec` + the string sanitizer; the editor/suggestion (DOM) is build+manual verified — deliberate, since the repo's vitest env is `node` with no jsdom.
