import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { BlogContent } from "./blog-content";

it("renders photos and supported videos inline", () => {
  const html = renderToStaticMarkup(createElement(BlogContent, { body: "![Example](https://example.test/photo.jpg)\n\n[Video](https://youtu.be/abcdefghijk)\n\n[Clip](https://example.test/clip.mp4)" }));
  expect(html).toContain('src="https://example.test/photo.jpg"');
  expect(html).toContain('src="https://www.youtube-nocookie.com/embed/abcdefghijk"');
  expect(html).toContain("<video");
  expect(html).toContain('referrerPolicy="no-referrer"');
});
it("does not render raw HTML, scripts, or unsafe media", () => {
  const html = renderToStaticMarkup(createElement(BlogContent, { body: '<script>alert(1)</script>\n\n<iframe src="https://example.test"></iframe>\n\n![bad](javascript:alert)\n\n[bad](javascript:alert)' }));
  expect(html).not.toContain("<script");
  expect(html).not.toContain("<iframe");
  expect(html).not.toContain("javascript:");
  expect(html).not.toContain("<img");
});
