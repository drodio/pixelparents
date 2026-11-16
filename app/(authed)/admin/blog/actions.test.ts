import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ currentUser: vi.fn(), isAdminEmail: vi.fn(), ensure: vi.fn(), insert: vi.fn(), update: vi.fn(), revalidate: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ currentUser: mocks.currentUser }));
vi.mock("@/lib/admin", () => ({ isAdminEmail: mocks.isAdminEmail }));
vi.mock("@/lib/db/blog", () => ({ ensureBlogTable: mocks.ensure }));
vi.mock("@/lib/db", () => ({ getDb: () => ({ insert: mocks.insert, update: mocks.update }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { saveBlogPost } from "./actions";
beforeEach(() => { vi.clearAllMocks(); mocks.currentUser.mockResolvedValue(null); mocks.isAdminEmail.mockResolvedValue(false); });
function form() { const f = new FormData(); f.set("title", "Example"); f.set("body", "Content"); return f; }
it("rejects direct non-admin action calls before touching storage", async () => {
  expect(await saveBlogPost({}, form())).toEqual({ error: "Admin access required." });
  expect(mocks.ensure).not.toHaveBeenCalled();
  expect(mocks.insert).not.toHaveBeenCalled();
});
it("creates a draft and returns its id for subsequent saves", async () => {
  mocks.isAdminEmail.mockResolvedValue(true);
  const values = vi.fn(() => ({ returning: async () => [{ id: "saved" }] }));
  mocks.insert.mockReturnValue({ values });
  expect(await saveBlogPost({}, form())).toEqual({ saved: true, id: "saved" });
  expect(values).toHaveBeenCalledWith({ title: "Example", body: "Content", published: false });
});
it("rejects invalid content and edit ids", async () => {
  mocks.isAdminEmail.mockResolvedValue(true);
  const f = form(); f.set("id", "bad");
  expect(await saveBlogPost({}, f)).toHaveProperty("error");
  f.delete("id"); f.set("body", "");
  expect(await saveBlogPost({}, f)).toHaveProperty("error");
  expect(mocks.ensure).not.toHaveBeenCalled();
});
it("revokes publication and rotates links on the existing post", async () => {
  mocks.isAdminEmail.mockResolvedValue(true);
  const set = vi.fn(() => ({ where: () => ({ returning: async () => [{ id: "saved" }] }) }));
  mocks.update.mockReturnValue({ set });
  const f = form(); f.set("id", "00000000-0000-4000-8000-000000000001"); f.set("rotate", "on");
  expect(await saveBlogPost({}, f)).toHaveProperty("saved", true);
  expect(set).toHaveBeenCalledWith(expect.objectContaining({ published: false, shareToken: expect.stringMatching(/^[\da-f-]{36}$/) }));
});
