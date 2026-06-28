"use client";

import { useCallback, useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { useEditor, EditorContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import type { SuggestionOptions } from "@tiptap/suggestion";
import {
  EMAIL_VARIABLES,
  variableLabel,
  EVENT_DATE_FORMATS,
  DEFAULT_EVENT_DATE_FORMAT,
  type VariableDef,
} from "@/lib/email-variables";
import { templateToDoc } from "@/lib/email-template-doc";
import { looksLikeHtmlBody } from "@/lib/email-render";

// A template editor whose @-mentions are VARIABLE pills ({{first-name}}, …) and,
// in `rich` mode, also Festival members (inserted as profile hyperlinks). Rich
// mode adds bold/italic/links/lists/headings/quotes (with Cmd-B/I/K) and
// serializes to HTML; plain mode (the subject) serializes to the `{{key}}` marker
// string. Both share the same pills and @-suggestion.

const BASE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://festival.so").replace(/\/+$/, "");

// The marker a pill serializes to — exactly what the send engine parses.
function markerText(key: string, max: number | null, fmt: string | null): string {
  if (max) return `{{${key}:max=${max}}}`;
  if (fmt) return `{{${key}:fmt=${fmt}}}`;
  return `{{${key}}}`;
}

// ── The pill NodeView (one React component per inserted variable) ────────────
function PillView({ node, updateAttributes }: NodeViewProps) {
  const key = node.attrs.key as string;
  const max = (node.attrs.max as number | null) ?? null;
  const fmt = (node.attrs.fmt as string | null) ?? null;
  const def = EMAIL_VARIABLES.find((v) => v.key === key);
  const canTruncate = !!def?.canTruncate;
  const canFormat = !!def?.canFormat;
  const clickable = canTruncate || canFormat;
  const spanRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [draft, setDraft] = useState<string>(max != null ? String(max) : "");

  function openPopover() {
    if (!clickable) return;
    const r = spanRef.current?.getBoundingClientRect();
    if (r) setPos({ left: r.left + window.scrollX, top: r.bottom + window.scrollY + 4 });
    setDraft(max != null ? String(max) : "");
    setOpen(true);
  }
  function applyMax() {
    const n = parseInt(draft, 10);
    updateAttributes({ max: Number.isFinite(n) && n > 0 ? n : null });
    setOpen(false);
  }
  function clearMax() {
    updateAttributes({ max: null });
    setOpen(false);
  }
  function chooseFmt(id: string) {
    updateAttributes({ fmt: id });
    setOpen(false);
  }

  const label = variableLabel(key);
  // For the date pill, show the active format's example (default when unset).
  const effectiveFmt = canFormat ? (fmt ?? DEFAULT_EVENT_DATE_FORMAT) : null;
  const fmtExample = effectiveFmt ? EVENT_DATE_FORMATS.find((f) => f.id === effectiveFmt)?.example : null;
  const title = canFormat
    ? "Click to choose a date format"
    : canTruncate
      ? "Click to set a max-character cap"
      : undefined;

  return (
    <NodeViewWrapper as="span" className="inline-block align-baseline">
      <span
        ref={spanRef}
        onClick={openPopover}
        title={title}
        className={`mx-px rounded-md bg-[#dfa43a]/15 px-1.5 py-0.5 text-[0.9em] font-medium text-[#dfa43a] ${clickable ? "cursor-pointer hover:bg-[#dfa43a]/25" : ""}`}
        contentEditable={false}
      >
        {label}
        {max != null && <span className="ml-1 text-[#dfa43a]/70">≤{max}</span>}
        {fmtExample && <span className="ml-1 text-[#dfa43a]/70">· {fmtExample}</span>}
      </span>
      {open &&
        pos &&
        createPortal(
          <>
            {/* click-away */}
            <div className="fixed inset-0 z-[70]" onClick={() => setOpen(false)} />
            <div
              className="absolute z-[71] w-56 rounded-md border border-zinc-800 bg-[#151515] p-3 shadow-xl shadow-black/40"
              style={{ left: pos.left, top: pos.top }}
            >
              {canFormat ? (
                <>
                  <p className="mb-2 text-xs text-zinc-400">
                    Date format for <span className="text-zinc-200">{label}</span>
                  </p>
                  <div className="flex flex-col gap-1">
                    {EVENT_DATE_FORMATS.map((f) => {
                      const active = effectiveFmt === f.id;
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => chooseFmt(f.id)}
                          className={`flex items-center justify-between rounded px-2 py-1.5 text-left text-sm ${active ? "bg-[#dfa43a]/15 text-[#dfa43a]" : "text-zinc-200 hover:bg-zinc-800/70"}`}
                        >
                          <span>{f.example}</span>
                          {active && <span className="text-xs">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <>
                  <p className="mb-2 text-xs text-zinc-400">
                    Max characters for <span className="text-zinc-200">{label}</span>
                  </p>
                  <input
                    type="number"
                    min={1}
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); applyMax(); }
                      if (e.key === "Escape") setOpen(false);
                    }}
                    placeholder="e.g. 500"
                    className="mb-2 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-[#dfa43a]"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <button type="button" onClick={clearMax} className="text-xs text-zinc-500 hover:text-zinc-300">
                      No cap
                    </button>
                    <button
                      type="button"
                      onClick={applyMax}
                      className="rounded bg-[#dfa43a] px-2.5 py-1 text-xs font-medium text-black hover:bg-[#e7b75c]"
                    >
                      Apply
                    </button>
                  </div>
                </>
              )}
            </div>
          </>,
          document.body,
        )}
    </NodeViewWrapper>
  );
}

// ── The pill node: a Mention variant keyed on a static variable catalog ──────
const VariablePill = Mention.extend({
  name: "variablePill",
  addAttributes() {
    return {
      key: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-key"),
        renderHTML: (attrs) => ({ "data-key": attrs.key }),
      },
      max: {
        default: null,
        parseHTML: (el) => {
          const m = el.getAttribute("data-max");
          return m ? parseInt(m, 10) : null;
        },
        renderHTML: (attrs) => (attrs.max ? { "data-max": String(attrs.max) } : {}),
      },
      fmt: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-fmt"),
        renderHTML: (attrs) => (attrs.fmt ? { "data-fmt": String(attrs.fmt) } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-var-pill]" }];
  },
  // Serialize to a span carrying the data-attrs (so it round-trips back into a
  // pill on reload) whose TEXT is the marker — so the send engine's renderTemplate
  // substitutes it just like a bare {{key}}.
  renderHTML({ node }) {
    const key = node.attrs.key as string;
    const max = node.attrs.max as number | null;
    const fmt = node.attrs.fmt as string | null;
    const attrs: Record<string, string> = { "data-var-pill": "", "data-key": key, class: "var-pill" };
    if (max) attrs["data-max"] = String(max);
    if (fmt) attrs["data-fmt"] = String(fmt);
    return ["span", attrs, markerText(key, max, fmt)];
  },
  // The marker string the editor serializes to in plain (getText) mode.
  renderText({ node }) {
    return markerText(node.attrs.key as string, node.attrs.max as number | null, node.attrs.fmt as string | null);
  },
  addNodeView() {
    return ReactNodeViewRenderer(PillView);
  },
});

// ── @-suggestion: variables (always) + Festival members (rich mode) ──────────
type SuggItem =
  | { kind: "var"; def: VariableDef }
  | { kind: "member"; name: string; href: string };

function suggKey(it: SuggItem): string {
  return it.kind === "var" ? `v:${it.def.key}` : `m:${it.href}`;
}
function suggHeader(it: SuggItem): string {
  if (it.kind === "member") return "Festival members";
  return it.def.group === "attendee" ? "Attendee variables" : "Event variables";
}

async function fetchMembers(q: string): Promise<{ name: string; href: string }[]> {
  try {
    const res = await fetch(`/api/admin/members/search?q=${encodeURIComponent(q)}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { members?: { name: string; href: string }[] };
    return Array.isArray(data.members) ? data.members : [];
  } catch {
    return [];
  }
}

type ListHandle = { onKeyDown: (e: KeyboardEvent) => boolean };
type ListProps = { items: SuggItem[]; command: (item: SuggItem) => void };

const SuggList = forwardRef<ListHandle, ListProps>(function SuggList({ items, command }, ref) {
  const [sel, setSel] = useState(0);
  // Reset the highlighted row whenever the suggestion list changes (new query /
  // async member results). A deliberate effect-driven reset.
  // eslint-disable-next-line react-hooks/set-state-in-effect
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
      {items.map((it, i) => {
        const header = suggHeader(it);
        const showHeader = i === 0 || suggHeader(items[i - 1]) !== header;
        return (
          <li key={suggKey(it)}>
            {showHeader && (
              <div className="px-3 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                {header}
              </div>
            )}
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); command(it); }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${i === sel ? "bg-zinc-800/70" : "hover:bg-zinc-800/40"}`}
            >
              {it.kind === "var" ? (
                <>
                  <span className="min-w-0 flex-1 truncate text-zinc-100">{it.def.label}</span>
                  {it.def.canTruncate && <span className="shrink-0 text-[10px] text-zinc-500">truncatable</span>}
                  {it.def.canFormat && <span className="shrink-0 text-[10px] text-zinc-500">formattable</span>}
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-[#dfa43a]">{it.name}</span>
                  <span className="shrink-0 text-[10px] text-zinc-500">profile link</span>
                </>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
});

// Build the @-suggestion. In rich mode it also queries Festival members and
// inserts the chosen one as a hyperlink to their (absolute) profile URL.
function buildSuggestion(rich: boolean): Omit<SuggestionOptions<SuggItem>, "editor"> {
  return {
    char: "@",
    // Gold the in-progress "@query" text while typing — same treatment as the
    // chat mention input (see .mention-suggestion-active in globals.css).
    decorationClass: "mention-suggestion-active",
    items: async ({ query }) => {
      const q = query.trim();
      const ql = q.toLowerCase();
      const vars: SuggItem[] = EMAIL_VARIABLES.filter(
        (v) => !ql || v.label.toLowerCase().includes(ql) || v.key.includes(ql),
      ).map((def) => ({ kind: "var", def }));
      if (!rich || q.length < 2) return vars;
      const members = await fetchMembers(q);
      return [...vars, ...members.map((m) => ({ kind: "member" as const, name: m.name, href: m.href }))];
    },
    command: ({ editor, range, props }) => {
      if (props.kind === "var") {
        // No trailing space: the cursor lands right after the pill so you can
        // append text with no gap — e.g. a {{event-url}} pill followed directly by
        // "?section=Attendee+Insights" renders as one contiguous URL.
        editor
          .chain()
          .focus()
          .insertContentAt(range, { type: "variablePill", attrs: { key: props.def.key, max: null, fmt: null } })
          .run();
      } else {
        const href = /^https?:\/\//i.test(props.href) ? props.href : `${BASE_URL}${props.href}`;
        editor
          .chain()
          .focus()
          .insertContentAt(range, [
            { type: "text", text: props.name, marks: [{ type: "link", attrs: { href } }] },
            { type: "text", text: " " },
          ])
          .run();
      }
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
          container.style.zIndex = "80"; // above the link popover (71) + its overlay (70)
          document.body.appendChild(container);
          root = createRoot(container);
          root.render(<SuggList ref={(r) => { listRef.current = r; }} items={props.items} command={(it) => props.command(it)} />);
          position(props.clientRect?.() ?? null);
        },
        onUpdate: (props) => {
          root?.render(<SuggList ref={(r) => { listRef.current = r; }} items={props.items} command={(it) => props.command(it)} />);
          position(props.clientRect?.() ?? null);
        },
        onKeyDown: (props) => {
          if (props.event.key === "Escape") return true;
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
}

function TBtn({ active, onClick, label, title }: { active?: boolean; onClick: () => void; label: string; title: string }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className={`rounded px-2 py-1 text-xs font-medium ${active ? "bg-[#dfa43a]/20 text-[#dfa43a]" : "text-zinc-300 hover:bg-zinc-800"}`}
    >
      {label}
    </button>
  );
}

function Toolbar({ editor, onLink }: { editor: Editor; onLink: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-t-md border border-b-0 border-zinc-700 bg-zinc-900/60 px-2 py-1">
      <TBtn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} label="B" title="Bold (⌘B)" />
      <TBtn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} label="I" title="Italic (⌘I)" />
      <TBtn active={editor.isActive("link")} onClick={onLink} label="🔗" title="Link (⌘K)" />
      <span className="mx-1 h-4 w-px bg-zinc-700" />
      <TBtn active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} label="H2" title="Heading 2" />
      <TBtn active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} label="H3" title="Heading 3" />
      <TBtn active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} label="• List" title="Bullet list" />
      <TBtn active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} label="1. List" title="Numbered list" />
      <TBtn active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} label="❝" title="Quote" />
    </div>
  );
}

export function VariablePillInput({
  value,
  onChange,
  multiline = false,
  rich = false,
  autoFocus = false,
  placeholder,
  ariaLabel,
  minHeightClass = "min-h-[44px]",
}: {
  value: string;
  onChange: (template: string) => void;
  multiline?: boolean;
  // Rich mode: HTML output, formatting toolbar/shortcuts, and member @-mentions.
  rich?: boolean;
  // Focus the editor on mount (used by the link-URL field in the link popover).
  autoFocus?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  minHeightClass?: string;
}) {
  const suggestion = useMemo(() => buildSuggestion(rich), [rich]);
  const [linkPop, setLinkPop] = useState<{ from: number; to: number; left: number; top: number; href: string } | null>(null);
  // Held in a ref so the editor's Cmd-K handler (created once) always calls the
  // latest opener without re-initializing the editor.
  const openLinkRef = useRef<() => void>(() => {});
  const editor = useEditor({
    immediatelyRender: false,
    autofocus: autoFocus ? "end" : false,
    extensions: [
      rich
        ? StarterKit.configure({
            heading: { levels: [2, 3] },
            codeBlock: false,
            horizontalRule: false,
            strike: false,
            code: false,
            link: {
              openOnClick: false,
              autolink: false,
              defaultProtocol: "https",
              // Permit our variable markers ({{…}}) and the usual safe schemes;
              // the send-time sanitizer is the real guard against javascript: etc.
              isAllowedUri: (url, ctx) =>
                url.includes("{{") || /^(https?:|mailto:|\/)/i.test(url) ? true : ctx.defaultValidate(url),
            },
          })
        : StarterKit.configure({
            // Plain-text subject: no rich blocks. Paragraphs + hard breaks only.
            heading: false,
            bulletList: false,
            orderedList: false,
            listItem: false,
            blockquote: false,
            codeBlock: false,
            horizontalRule: false,
            bold: false,
            italic: false,
            strike: false,
            code: false,
          }),
      VariablePill.configure({ suggestion }),
    ],
    // Rich HTML templates load as HTML (pills round-trip via parseHTML); legacy
    // plain-text marker templates load through templateToDoc so they get pills.
    content: rich && looksLikeHtmlBody(value) ? value : templateToDoc(value),
    editorProps: {
      attributes: {
        "aria-label": ariaLabel ?? "Message template",
        class: `tiptap-vars ${minHeightClass} w-full border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus-within:border-[#dfa43a] ${
          rich
            ? "rounded-b-md [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-[#dfa43a] [&_a]:underline [&_strong]:font-semibold [&_blockquote]:border-l-2 [&_blockquote]:border-zinc-600 [&_blockquote]:pl-3 [&_blockquote]:text-zinc-400"
            : "rounded-md"
        }`,
      },
      // Subject is single-line: swallow Enter so it can't add paragraphs.
      // Rich body: Cmd/Ctrl-K opens the inline link editor.
      handleKeyDown: (_view, event) => {
        if (!multiline && event.key === "Enter") return true;
        if (rich && (event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
          event.preventDefault();
          openLinkRef.current();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      if (rich) onChange(editor.isEmpty ? "" : editor.getHTML());
      else onChange(editor.getText({ blockSeparator: "\n" }));
    },
  });

  // Open the inline link editor for the current selection (toolbar 🔗 or Cmd-K).
  const openLink = useCallback(() => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const href = (editor.getAttributes("link").href as string | undefined) ?? "";
    let left = 0;
    let top = 0;
    try {
      const c = editor.view.coordsAtPos(from);
      left = c.left + window.scrollX;
      top = c.bottom + window.scrollY + 6;
    } catch {
      /* coordsAtPos can throw on an empty doc — fall back to the top-left origin */
    }
    setLinkPop({ from, to, left, top, href });
  }, [editor]);

  // Keep the Cmd-K handler pointed at the latest opener.
  useEffect(() => {
    openLinkRef.current = openLink;
  }, [openLink]);

  function applyLink(href: string) {
    if (!editor || !linkPop) return;
    const sel = { from: linkPop.from, to: linkPop.to };
    const h = href.trim();
    const chain = editor.chain().focus().setTextSelection(sel).extendMarkRange("link");
    if (h) chain.setLink({ href: h }).run();
    else chain.unsetLink().run();
    setLinkPop(null);
  }
  function removeLink() {
    if (!editor || !linkPop) return;
    editor.chain().focus().setTextSelection({ from: linkPop.from, to: linkPop.to }).extendMarkRange("link").unsetLink().run();
    setLinkPop(null);
  }

  // Placeholder shows via overlay when empty.
  const isEmpty = !value || value.replace(/<[^>]*>/g, "").trim().length === 0;

  return (
    <div className="relative" data-empty={isEmpty ? "true" : "false"} data-placeholder={placeholder ?? ""}>
      {rich && editor && <Toolbar editor={editor} onLink={openLink} />}
      <EditorContent editor={editor} />
      {isEmpty && placeholder && (
        <span className={`pointer-events-none absolute left-3 text-sm text-zinc-600 ${rich ? "top-[42px]" : "top-2"}`}>{placeholder}</span>
      )}
      {linkPop && (
        <LinkPopover
          left={linkPop.left}
          top={linkPop.top}
          initialHref={linkPop.href}
          onApply={applyLink}
          onRemove={removeLink}
          onClose={() => setLinkPop(null)}
        />
      )}
    </div>
  );
}

// Inline link editor anchored near the selection. The URL field is a (non-rich)
// VariablePillInput, so you can type a plain URL OR @-mention a variable — the
// chosen variable becomes a pill that serializes into the href (e.g. a link whose
// URL is {{profile-url}} resolves per recipient). Replaces the old window.prompt.
function LinkPopover({
  left,
  top,
  initialHref,
  onApply,
  onRemove,
  onClose,
}: {
  left: number;
  top: number;
  initialHref: string;
  onApply: (href: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState(initialHref);

  // Esc closes the popover.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <>
      {/* click-away */}
      <div className="fixed inset-0 z-[70]" onMouseDown={onClose} />
      <div
        className="absolute z-[71] w-80 rounded-md border border-zinc-700 bg-[#151515] p-3 shadow-xl shadow-black/40"
        style={{ left, top }}
      >
        <p className="mb-1.5 text-[11px] text-zinc-500">
          Link URL — type <span className="text-zinc-300">@</span> to insert a variable (e.g. profile-url)
        </p>
        <VariablePillInput
          value={url}
          onChange={setUrl}
          autoFocus
          ariaLabel="Link URL"
          placeholder="https://… or @variable"
        />
        <div className="mt-2 flex items-center justify-between">
          <button type="button" onClick={onRemove} className="text-xs text-zinc-500 hover:text-zinc-300">
            Remove link
          </button>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="text-xs text-zinc-400 hover:text-zinc-200">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onApply(url)}
              className="rounded bg-[#dfa43a] px-2.5 py-1 text-xs font-medium text-black hover:bg-[#e7b75c]"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
