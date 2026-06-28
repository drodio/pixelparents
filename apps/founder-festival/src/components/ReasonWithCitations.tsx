"use client";

import { useRef, useState } from "react";
import {
  decorateReason,
  domainOf,
  type Citation,
} from "@/lib/decorate-reason";

// Renders a score-breakdown reason string with per-phrase citations: each
// AI-emitted phrase gets a subtle gold underline, hover shows the sources
// in a small popover, and clicking the phrase opens all sources in new
// tabs (Cmd-click → just the first one). Variant A from the citation
// brainstorm.

type Props = {
  reason: string;
  citations: Citation[];
};

export function ReasonWithCitations({ reason, citations }: Props) {
  const chunks = decorateReason(reason, citations);
  return (
    <>
      {chunks.map((c, i) =>
        c.kind === "text" ? (
          <span key={i}>{c.text}</span>
        ) : (
          <Phrase key={i} text={c.text} sources={c.sources} />
        ),
      )}
    </>
  );
}

function Phrase({ text, sources }: { text: string; sources: string[] }) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function show() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  }
  function hideSoon() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  }
  function openAll(e: React.MouseEvent) {
    // Cmd / Ctrl click → let the browser handle the single anchor href.
    // Plain click → open every source in a new tab.
    if (e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    for (const url of sources) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <span
      className="relative inline-block"
      onMouseEnter={show}
      onMouseLeave={hideSoon}
    >
      <a
        href={sources[0] ?? "#"}
        onClick={openAll}
        target="_blank"
        rel="noopener noreferrer"
        className="cursor-pointer border-b border-amber-400/40 hover:border-amber-300 transition-colors"
      >
        {text}
      </a>
      {open && <CitationPopover sources={sources} />}
    </span>
  );
}

function CitationPopover({ sources }: { sources: string[] }) {
  return (
    <span
      role="tooltip"
      className="absolute z-10 left-1/2 -translate-x-1/2 top-full mt-2 w-72 rounded-lg border border-zinc-700 bg-[#1c1c1c] shadow-xl p-3 flex flex-col gap-2 text-sm"
    >
      <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
        {sources.length} source{sources.length === 1 ? "" : "s"} · click phrase to open all
      </span>
      <ul className="flex flex-col gap-1.5">
        {sources.map((url) => (
          <li key={url}>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="group/cit flex items-baseline gap-2"
            >
              <span className="text-zinc-100 group-hover/cit:text-amber-300 transition-colors truncate">
                {prettifyTitle(url)}
              </span>
              <span className="text-xs text-zinc-500 group-hover/cit:text-amber-400 transition-colors shrink-0">
                {domainOf(url)}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </span>
  );
}

// We don't have stored page titles for citation URLs (the AI emits URLs
// only), so derive a quick human-readable label from the path. Drops the
// query string, replaces hyphens with spaces, title-cases the last
// non-empty segment. Falls back to the full URL if anything looks weird.
function prettifyTitle(url: string): string {
  try {
    const u = new URL(url);
    const segments = u.pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1] ?? "";
    if (!last) return u.hostname.replace(/^www\./, "");
    const human = last
      .replace(/[-_]+/g, " ")
      .replace(/\.[a-z0-9]+$/i, "")
      .trim();
    if (!human) return u.hostname;
    return human.charAt(0).toUpperCase() + human.slice(1);
  } catch {
    return url;
  }
}
