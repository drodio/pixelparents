import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getSharedBlogPost: vi.fn() }));
vi.mock("@/lib/db/blog", () => ({ getSharedBlogPost: mocks.getSharedBlogPost }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not-found"); } }));
import BlogPostPage, { metadata } from "./page";
beforeEach(() => vi.clearAllMocks());
it("renders a shared post without requiring a session", async () => {
  mocks.getSharedBlogPost.mockResolvedValue({ title: "Example", body: "Content" });
  const result = await BlogPostPage({ params: Promise.resolve({ token: "example" }) });
  expect(result.type).toBe("main");
  expect(mocks.getSharedBlogPost).toHaveBeenCalledWith("example");
  expect(metadata.robots).toMatchObject({ index: false, follow: false });
});
it("returns not found for revoked, draft or unknown posts", async () => {
  mocks.getSharedBlogPost.mockResolvedValue(null);
  await expect(BlogPostPage({ params: Promise.resolve({ token: "missing" }) })).rejects.toThrow("not-found");
});
