"use client";

import { useState } from "react";

// Event description that shows the first couple paragraphs with a "Read more"
// toggle, so a long description doesn't push the Learnings far down the page.
// Paragraphs are split on newline runs (Luma uses single \n between paragraphs).
const COLLAPSED_PARAGRAPHS = 2;

export function CollapsibleDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);

  const paragraphs = text
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const hasMore = paragraphs.length > COLLAPSED_PARAGRAPHS;
  // Collapsed: the first N paragraphs (blank-line separated for readability).
  // Expanded: the full original text.
  const shown =
    !hasMore || expanded ? text : paragraphs.slice(0, COLLAPSED_PARAGRAPHS).join("\n\n");

  return (
    <article className="text-zinc-300 leading-relaxed whitespace-pre-wrap break-words">
      {shown}
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="ml-1 text-[#dfa43a] hover:underline"
        >
          {expanded ? "Show less" : "… Read more"}
        </button>
      )}
    </article>
  );
}
