import { marked } from "marked";
import { sanitizeRecapHtml } from "@/lib/event-recap";

// Render admin-authored Markdown (host/sponsor "About") to sanitized HTML.
// `breaks: true` keeps single newlines as <br> so paragraph breaks survive;
// the recap sanitizer strips script/style/on*/javascript:. Isomorphic — safe in
// server components and in the admin live-preview.
export function markdownToHtml(md: string | null | undefined): string {
  const t = md?.trim();
  if (!t) return "";
  const html = marked.parse(t, { async: false, breaks: true, gfm: true }) as string;
  return sanitizeRecapHtml(html);
}

// Plain text with HTML stripped — for social-card / meta descriptions and other
// plain-text contexts where raw tags ("<p><strong>…") would leak through.
// Block-level closers become spaces so words don't run together.
export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|br)\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Plain text with Markdown stripped — for the index-card summaries (first N
// words) where raw "**bold**" / "[x](y)" syntax would look broken.
export function markdownToText(md: string | null | undefined): string {
  return markdownToHtml(md)
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
