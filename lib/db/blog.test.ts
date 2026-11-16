import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ hasDatabase: vi.fn(), sql: vi.fn(), select: vi.fn(), where: vi.fn(), limit: vi.fn() }));
vi.mock("@/lib/db", () => ({ hasDatabase: mocks.hasDatabase, getSql: () => mocks.sql, getDb: () => ({ select: mocks.select }) }));
import { getSharedBlogPost } from "./blog";
import { blogPosts } from "./schema/blog";
import { PgDialect } from "drizzle-orm/pg-core";
beforeEach(() => {
  vi.clearAllMocks(); mocks.hasDatabase.mockReturnValue(true);
  mocks.sql.mockResolvedValue([]); mocks.limit.mockResolvedValue([]);
  mocks.where.mockReturnValue({ limit: mocks.limit });
  mocks.select.mockReturnValue({ from: () => ({ where: mocks.where }) });
});
it("rejects malformed capabilities before database access", async () => {
  expect(await getSharedBlogPost("guessable-slug")).toBeNull();
  expect(mocks.select).not.toHaveBeenCalled();
});
it("requires both the exact token and publication in the database query", async () => {
  const capability = "00000000-0000-4000-8000-000000000001";
  expect(await getSharedBlogPost(capability)).toBeNull();
  const query = new PgDialect().sqlToQuery(mocks.where.mock.calls[0][0]);
  expect(query.sql).toContain('"share_token" = $1');
  expect(query.sql).toContain('"published" = $2');
  expect(query.params).toEqual([capability, true]);
  expect(mocks.select).toHaveBeenCalledWith({ title: blogPosts.title, body: blogPosts.body, updatedAt: blogPosts.updatedAt });
});
