"use client";

import { useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { MentionLink, mentionSuggestion } from "@/components/admin/rich-text-mention";

// Serialize the editor doc to the `@[Name](evalId)` marker format the rest of
// the app stores + renders (MentionText / renderMentions). Each block becomes a
// line; mention nodes become markers; everything else is its text.
function serialize(editor: Editor): string {
  const lines: string[] = [];
  editor.state.doc.forEach((block) => {
    let line = "";
    block.forEach((inline) => {
      if (inline.type.name === "mention") {
        const a = inline.attrs as { label?: string; id?: string };
        line += `@[${a.label ?? ""}](${a.id ?? ""})`;
      } else if (inline.isText) {
        line += inline.text ?? "";
      }
    });
    lines.push(line);
  });
  return lines.join("\n").replace(/\n+$/, "").trim();
}

function esc(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Convert the stored `@[Name](evalId)` markers into editor HTML so an existing
// body re-opens with its mentions as chips. The MentionLink extension parses
// `a[data-mention-id]` back into mention nodes.
function markersToHtml(body: string): string {
  const lineToHtml = (line: string): string => {
    const re = /@\[([^\]]+)\]\(([^)]*)\)/g;
    let html = "";
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) {
      html += esc(line.slice(last, m.index));
      html += `<a class="mention" data-mention-id="${esc(m[2]!)}" href="">${esc(m[1]!)}</a>`;
      last = m.index + m[0].length;
    }
    html += esc(line.slice(last));
    return html || "<br>";
  };
  return body
    .split("\n")
    .map((l) => `<p>${lineToHtml(l)}</p>`)
    .join("");
}

// A rich @-mention input where mentions render as atomic GOLD chips (no leading
// "@", never wrap), backed by the shared TipTap mention extension. Reports the
// serialized body via onBody so callers store the same markers as before.
// `initialBody` pre-fills (for editing); `singleLine` blocks Enter (captions).
export function MentionChipInput({
  onBody,
  placeholder,
  initialBody,
  singleLine = false,
  className,
  minHeight = "6rem",
}: {
  onBody: (serialized: string) => void;
  placeholder?: string;
  initialBody?: string;
  singleLine?: boolean;
  className?: string;
  minHeight?: string;
}) {
  const [empty, setEmpty] = useState(!initialBody);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit, MentionLink.configure({ suggestion: mentionSuggestion })],
    content: initialBody ? markersToHtml(initialBody) : "",
    editorProps: {
      attributes: {
        class:
          className ??
          "w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-400 whitespace-pre-wrap break-words",
        ...(singleLine ? {} : { style: `min-height:${minHeight}` }),
      },
      // Single-line: swallow Enter so the caption stays one line.
      handleKeyDown: singleLine
        ? (_view, event) => {
            if (event.key === "Enter") return true;
            return false;
          }
        : undefined,
    },
    onUpdate: ({ editor: ed }) => {
      onBody(serialize(ed));
      setEmpty(ed.isEmpty);
    },
  });

  return (
    <div className="relative">
      <EditorContent editor={editor} />
      {empty && placeholder && (
        <div
          className={`pointer-events-none absolute truncate text-zinc-500 ${
            singleLine ? "left-2 right-2 top-1.5 text-xs" : "left-3 right-3 top-2 text-sm"
          }`}
        >
          {placeholder}
        </div>
      )}
    </div>
  );
}
