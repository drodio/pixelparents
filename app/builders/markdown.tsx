"use client";

import { useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Flattens react-markdown heading children into plain text for slug + copy. */
function textOf(children: ReactNode): string {
  if (children == null || typeof children === "boolean") return "";
  if (typeof children === "string" || typeof children === "number") {
    return String(children);
  }
  if (Array.isArray(children)) return children.map(textOf).join("");
  if (typeof children === "object" && "props" in (children as object)) {
    return textOf((children as { props?: { children?: ReactNode } }).props?.children);
  }
  return "";
}

/** GitHub-style slug: lowercase, strip punctuation, spaces → hyphens. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

/**
 * A heading that exposes a hover-revealed anchor link. Clicking it copies a
 * direct link to the section to the clipboard and scrolls there via the hash.
 */
function AnchorHeading({
  as: Tag,
  className,
  children,
}: {
  as: "h1" | "h2";
  className: string;
  children: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const id = slugify(textOf(children));

  const copyLink = () => {
    const url = `${window.location.origin}${window.location.pathname}#${id}`;
    // Update the address bar + scroll without a full navigation.
    history.replaceState(null, "", `#${id}`);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    void navigator.clipboard?.writeText(url).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {},
    );
  };

  return (
    <Tag id={id} className={`group scroll-mt-24 ${className}`}>
      <span className="inline-flex items-center gap-2">
        {children}
        <button
          type="button"
          onClick={copyLink}
          aria-label={`Copy link to “${textOf(children)}”`}
          title={copied ? "Link copied!" : "Copy link to this section"}
          className="opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
        >
          {copied ? (
            <span className="text-sm font-normal text-amber-400">Copied!</span>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="h-[0.7em] w-[0.7em] text-white/40 transition-colors hover:text-amber-400"
            >
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          )}
        </button>
      </span>
    </Tag>
  );
}

/**
 * Renders the builders.md source with the GoPixel dark theme.
 * Element styling lives here so editing builders.md never requires touching CSS.
 */
export default function Markdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <AnchorHeading
            as="h1"
            className="text-4xl font-semibold tracking-tight sm:text-5xl"
          >
            {children}
          </AnchorHeading>
        ),
        h2: ({ children }) => (
          <AnchorHeading as="h2" className="mt-8 text-2xl font-bold">
            {children}
          </AnchorHeading>
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
          <li className="rounded-xl border border-white/10 bg-white/[0.03] p-5 text-base leading-relaxed text-white/70 [&_strong]:text-white/70 [&_strong:first-child]:text-amber-400 [&_em]:!italic [&_em]:!text-white/70 [&_ul]:mt-3 [&_ul]:!block [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_ul>li]:!list-item [&_ul>li]:!rounded-none [&_ul>li]:!border-0 [&_ul>li]:!bg-transparent [&_ul>li]:!p-0 [&_ul>li]:marker:text-white/40">
            {children}
          </li>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold text-white/70">{children}</strong>
        ),
        em: ({ children }) => (
          <em className="not-italic text-white/50">{children}</em>
        ),
        a: ({ href, children }) => (
          <a
            href={href}
            className="text-inherit underline decoration-dotted decoration-amber-400 underline-offset-2 transition-colors hover:decoration-amber-300"
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
