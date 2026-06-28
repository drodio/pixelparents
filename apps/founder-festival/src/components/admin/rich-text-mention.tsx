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

  if (items.length === 0) return null;

  return (
    <ul className="max-h-[50vh] w-72 overflow-y-auto rounded-md border border-zinc-800 bg-[#151515] py-1 shadow-xl shadow-black/40">
      {items.map((it, i) => (
        <li key={it.id}>
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); command(it); }}
            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${i === sel ? "bg-zinc-800/70" : "hover:bg-zinc-800/40"}`}
          >
            <span className="min-w-0 flex-1 truncate">
              <span className="text-[#dfa43a]">{it.label}</span>
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
  // Style the live "@query" decoration gold while typing (see globals.css).
  decorationClass: "mention-suggestion-active",
  items: async ({ query }) => {
    if (query.trim().length < 2) return [];
    try {
      const res = await fetch(`/api/leaderboard/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) return [];
      const data: { rows: Array<{ id: string; fullName: string | null; nickname: string | null; profileHref: string; companyName: string | null; combinedScore: number }> } = await res.json();
      return data.rows.slice(0, 8).map((r) => ({
        id: r.id,
        label: r.nickname?.trim() || r.fullName || "Unknown",
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
    const listRef: { current: ListHandle | null } = { current: null };

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
        root.render(<MentionList ref={(r) => { listRef.current = r; }} items={props.items} command={(it) => props.command(it)} />);
        position(props.clientRect?.() ?? null);
      },
      onUpdate: (props) => {
        root?.render(<MentionList ref={(r) => { listRef.current = r; }} items={props.items} command={(it) => props.command(it)} />);
        position(props.clientRect?.() ?? null);
      },
      onKeyDown: (props) => {
        if (props.event.key === "Escape") return true; // @tiptap/suggestion handles Escape itself; returning true here is a harmless no-op if it ever reaches us
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
