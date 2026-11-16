import { describe, expect, it } from "vitest";
import { blogInput, blogMediaUrl, blogVideo, isPrivateBlogUrl } from "./blog";

describe("blog content", () => {
  it("validates content and bounds stored input", () => {
    expect(blogInput.safeParse({ title: " ", body: "text", published: true }).success).toBe(false);
    expect(blogInput.safeParse({ title: "Title", body: "a".repeat(100001), published: false }).success).toBe(false);
    expect(blogInput.parse({ title: " Title ", body: " text ", published: false })).toEqual({ title: "Title", body: "text", published: false });
  });
  it("only embeds secure media URLs without credentials", () => {
    for (const value of ["javascript:alert(1)", "data:image/svg+xml,test", "http://example.test/a.png", "https://user:pass@example.test/a.png", "/api/private-photo"]) expect(blogMediaUrl(value)).toBeNull();
    expect(blogMediaUrl("https://example.test/photo.jpg")).toBe("https://example.test/photo.jpg");
  });
  it("canonicalizes supported video providers and rejects spoofed hosts", () => {
    expect(blogVideo("https://youtu.be/abcdefghijk?t=20")?.src).toBe("https://www.youtube-nocookie.com/embed/abcdefghijk");
    expect(blogVideo("https://www.youtube.com/watch?v=abcdefghijk")?.kind).toBe("embed");
    expect(blogVideo("https://vimeo.com/12345")?.src).toBe("https://player.vimeo.com/video/12345");
    expect(blogVideo("https://youtube.com.evil.test/watch?v=abcdefghijk")).toBeNull();
    expect(blogVideo("https://example.test/video.mp4?signature=example")?.kind).toBe("file");
  });
  it("excludes reader and editor URLs from analytics", () => {
    for (const path of ["/blog/test", "/admin/blog?id=example", "https://gopixel.org/blog/test"]) expect(isPrivateBlogUrl(path)).toBe(true);
    expect(isPrivateBlogUrl("/dashboard")).toBe(false);
  });
});
