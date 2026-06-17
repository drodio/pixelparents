"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders the builders.md source with the Pixel Parents dark theme.
 * Element styling lives here so editing builders.md never requires touching CSS.
 */
export default function Markdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="mt-8 text-2xl font-bold">{children}</h2>
        ),
        p: ({ children }) => (
          <p className="text-base leading-relaxed text-white/70 [&>em]:text-white/50">
            {children}
          </p>
        ),
        ul: ({ children }) => (
          <ul className="flex flex-col gap-5">{children}</ul>
        ),
        li: ({ children }) => (
          <li className="rounded-xl border border-white/10 bg-white/[0.03] p-5 text-base leading-relaxed text-white/70 [&>strong]:text-white">
            {children}
          </li>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold text-white">{children}</strong>
        ),
        em: ({ children }) => (
          <em className="not-italic text-white/50">{children}</em>
        ),
        a: ({ href, children }) => (
          <a
            href={href}
            className="font-medium text-emerald-400 underline-offset-2 hover:underline"
          >
            {children}
          </a>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
