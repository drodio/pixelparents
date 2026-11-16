import { z } from "zod";

export const blogInput = z.object({
  title: z.string().trim().min(1, "Add a title.").max(200),
  body: z.string().trim().min(1, "Add some content.").max(100_000),
  published: z.boolean(),
});
export const blogToken = z.string().uuid();

export function isPrivateBlogUrl(value: string): boolean {
  try {
    const path = new URL(value, "https://gopixel.org").pathname;
    return path === "/blog" || path.startsWith("/blog/") || path === "/admin/blog" || path.startsWith("/admin/blog/");
  } catch { return false; }
}

// Media is loaded by the browser, never fetched by the server. Raw HTML is
// disabled by the Markdown renderer; only explicit HTTPS URLs may embed media.
export function blogMediaUrl(value: string | undefined): string | null {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function blogVideo(value: string): { kind: "embed" | "file"; src: string } | null {
  const safe = blogMediaUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  let id: string | null = null;
  if (url.hostname === "youtu.be") id = url.pathname.slice(1);
  if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname)) {
    id = url.pathname === "/watch" ? url.searchParams.get("v") : url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)$/)?.[1] ?? null;
  }
  if (id && /^[\w-]{11}$/.test(id)) return { kind: "embed", src: `https://www.youtube-nocookie.com/embed/${id}` };
  if (["vimeo.com", "www.vimeo.com"].includes(url.hostname) && /^\/\d+$/.test(url.pathname)) {
    return { kind: "embed", src: `https://player.vimeo.com/video${url.pathname}` };
  }
  if (/\.(mp4|webm|ogg)$/i.test(url.pathname)) return { kind: "file", src: safe };
  return null;
}
