"use server";

import { randomUUID } from "node:crypto";
import { currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { isAdminEmail } from "@/lib/admin";
import { blogInput, blogToken } from "@/lib/blog";
import { getDb } from "@/lib/db";
import { ensureBlogTable } from "@/lib/db/blog";
import { blogPosts } from "@/lib/db/schema/blog";

export type BlogState = { error?: string; saved?: boolean; id?: string };

export async function saveBlogPost(_previous: BlogState, data: FormData): Promise<BlogState> {
  const user = await currentUser();
  if (!await isAdminEmail(user?.primaryEmailAddress?.emailAddress)) return { error: "Admin access required." };
  const parsed = blogInput.safeParse({ title: data.get("title"), body: data.get("body"), published: data.get("published") === "on" });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const id = data.get("id");
  let savedId = id ? String(id) : undefined;
  if (id && !blogToken.safeParse(id).success) return { error: "Invalid post." };
  try {
    await ensureBlogTable();
    if (id) {
      const rows = await getDb().update(blogPosts).set({ ...parsed.data, updatedAt: new Date(),
        ...(data.get("rotate") === "on" ? { shareToken: randomUUID() } : {}),
      }).where(eq(blogPosts.id, String(id))).returning({ id: blogPosts.id });
      if (!rows.length) return { error: "Post no longer exists." };
    } else {
      const [created] = await getDb().insert(blogPosts).values(parsed.data).returning({ id: blogPosts.id });
      savedId = created.id;
    }
  } catch {
    return { error: "Could not save the post. Please retry." };
  }
  revalidatePath("/admin/blog");
  return { saved: true, id: savedId };
}
