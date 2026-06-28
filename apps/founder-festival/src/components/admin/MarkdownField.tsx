"use client";

import { useState } from "react";
import { markdownToHtml } from "@/lib/markdown";

// A Markdown text field with a Write / Preview toggle. Stores raw Markdown; the
// preview renders it exactly as the public pages will. Used for the host/sponsor
// "About".
export function MarkdownField({
  value,
  onChange,
  rows = 5,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  const [preview, setPreview] = useState(false);
  const tab = (active: boolean) =>
    active ? "font-medium text-[#dfa43a]" : "text-zinc-500 hover:text-zinc-300";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-3 text-xs">
        <button type="button" onClick={() => setPreview(false)} className={tab(!preview)}>
          Write
        </button>
        <button type="button" onClick={() => setPreview(true)} className={tab(preview)}>
          Preview
        </button>
        <span className="ml-auto text-zinc-600">Markdown supported</span>
      </div>
      {preview ? (
        <div
          className="prose-recap min-h-[6rem] rounded-md border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-sm leading-relaxed text-zinc-200 [&_a]:text-[#dfa43a] [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
          dangerouslySetInnerHTML={{
            __html: markdownToHtml(value) || "<span style=\"color:#71717a\">Nothing to preview yet.</span>",
          }}
        />
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          placeholder={placeholder ?? "Markdown supported — **bold**, lists, [links](https://…)"}
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm text-white"
        />
      )}
    </div>
  );
}
