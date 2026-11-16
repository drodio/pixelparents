import { and, desc, eq } from "drizzle-orm";
import { getDb, getSql, hasDatabase } from "@/lib/db";
import { blogPosts } from "@/lib/db/schema/blog";
import { blogToken } from "@/lib/blog";

let ensured: Promise<void> | null = null;
// Match the self-healing schema convention used by changelog and admin data.
export function ensureBlogTable(): Promise<void> {
  if (!ensured) ensured = (async () => {
    await getSql()`CREATE TABLE IF NOT EXISTS blog_posts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      share_token uuid NOT NULL DEFAULT gen_random_uuid(),
      title text NOT NULL, body text NOT NULL, published boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    )`;
    await getSql()`CREATE UNIQUE INDEX IF NOT EXISTS blog_posts_share_token_unique ON blog_posts(share_token)`;
  })().catch((err) => { ensured = null; throw err; });
  return ensured;
}

export async function getSharedBlogPost(token: string) {
  if (!blogToken.safeParse(token).success || !hasDatabase()) return null;
  await ensureBlogTable();
  const [post] = await getDb().select({ title: blogPosts.title, body: blogPosts.body, updatedAt: blogPosts.updatedAt })
    .from(blogPosts).where(and(eq(blogPosts.shareToken, token), eq(blogPosts.published, true))).limit(1);
  return post ?? null;
}

// Call only after checking the admin session; these rows include draft tokens.
export async function listBlogPosts() {
  if (!hasDatabase()) return [];
  await ensureBlogTable();
  return getDb().select().from(blogPosts).orderBy(desc(blogPosts.updatedAt));
}
