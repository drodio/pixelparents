"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// A small, SAFE markdown renderer for text contributions. react-markdown does
// NOT render raw HTML unless rehype-raw is added (we don't), so user markdown is
// rendered structurally without an HTML-injection vector. Links are forced to
// open in a new tab with noopener/nofollow (we never trust user-supplied hrefs).
// Styling matches the dark/amber theme; no headings larger than the card.
export function ContributionMarkdown({ content }: { content: string }) {
  return (
    <div className="text-sm leading-relaxed text-white/75">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <p className="mt-2 text-base font-semibold text-white">{children}</p>,
          h2: ({ children }) => <p className="mt-2 text-base font-semibold text-white">{children}</p>,
          h3: ({ children }) => <p className="mt-2 font-semibold text-white/90">{children}</p>,
          p: ({ children }) => <p className="my-2 whitespace-pre-line">{children}</p>,
          ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5 marker:text-white/40">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5 marker:text-white/40">{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          code: ({ children }) => (
            <code className="rounded bg-white/[0.08] px-1.5 py-0.5 font-mono text-[0.85em] text-amber-200">
              {children}
            </code>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-amber-400/40 pl-3 text-white/60">{children}</blockquote>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="underline decoration-dotted decoration-amber-400 underline-offset-2 hover:decoration-amber-300"
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
