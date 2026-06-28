// Pure, DB/DOM-free conversion between a template STRING (what the send engine
// consumes — `{{key}}` / `{{key:max=N}}` markers) and the ProseMirror/TipTap
// document the pill editor renders. Kept pure so the round-trip is unit-tested
// without a browser. Serialization back to a string is handled by the editor's
// getText() (each pill's renderText emits its marker), so only the string→doc
// direction lives here.

import { isVariableKey } from "@/lib/email-variables";

// Minimal ProseMirror JSON shapes we emit (avoids a hard dep on TipTap types in
// this pure module).
type TextNode = { type: "text"; text: string };
type PillNode = { type: "variablePill"; attrs: { key: string; max: number | null; fmt: string | null } };
type InlineNode = TextNode | PillNode;
type ParagraphNode = { type: "paragraph"; content?: InlineNode[] };
export type TemplateDoc = { type: "doc"; content: ParagraphNode[] };

// Same marker grammar as renderTemplate() in email-variables.ts: an optional
// `:max=N` (digits only, truncatable values) or `:fmt=<id>` (event-date) modifier.
const MARKER = /\{\{\s*([a-z][a-z-]*)\s*(?::max=(\d+)|:fmt=([a-z0-9]+))?\s*\}\}/gi;

// Split one line of template text into inline nodes (text + pills). An unknown
// variable key is kept verbatim as text so nothing silently disappears.
function lineToInline(line: string): InlineNode[] {
  const out: InlineNode[] = [];
  let last = 0;
  MARKER.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MARKER.exec(line)) !== null) {
    const key = m[1].toLowerCase();
    if (!isVariableKey(key)) continue; // leave unknown markers as plain text
    if (m.index > last) out.push({ type: "text", text: line.slice(last, m.index) });
    const max = m[2] ? parseInt(m[2], 10) : null;
    const fmt = m[3] ? m[3].toLowerCase() : null;
    out.push({
      type: "variablePill",
      attrs: { key, max: Number.isFinite(max as number) ? max : null, fmt },
    });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ type: "text", text: line.slice(last) });
  return out;
}

// template string → TipTap doc. Newlines become separate paragraphs (so a single
// blank line is preserved as an empty paragraph). Always returns at least one
// paragraph so the editor has a valid document.
export function templateToDoc(template: string): TemplateDoc {
  const lines = (template ?? "").split("\n");
  const content: ParagraphNode[] = lines.map((line) => {
    const inline = lineToInline(line);
    return inline.length ? { type: "paragraph", content: inline } : { type: "paragraph" };
  });
  if (content.length === 0) content.push({ type: "paragraph" });
  return { type: "doc", content };
}
