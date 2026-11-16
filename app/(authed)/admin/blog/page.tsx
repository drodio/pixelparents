import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { isAdminEmail } from "@/lib/admin";
import { listBlogPosts } from "@/lib/db/blog";
import { BlogEditor } from "./editor";

export const dynamic = "force-dynamic";
export default async function AdminBlogPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const user = await currentUser();
  if (!await isAdminEmail(user?.primaryEmailAddress?.emailAddress)) notFound();
  const posts = await listBlogPosts();
  const { id } = await searchParams;
  const selected = posts.find((p) => p.id === id);
  if (id && !selected) notFound();
  return <main className="mx-auto max-w-4xl space-y-8">
    <div className="flex items-center justify-between"><h1 className="text-3xl font-semibold">Blog</h1><Link href="/admin/blog" className="text-amber-400">New post</Link></div>
    <BlogEditor key={selected?.id ?? "new"} post={selected} />
    <section className="space-y-4" aria-label="Blog posts">
      <h2 className="text-xl font-semibold">Posts</h2>
      {!posts.length && <p className="text-white/60">No posts yet.</p>}
      {posts.map((post) => <div key={post.id} className="space-y-2 rounded-xl border border-white/10 p-4">
        <Link href={`/admin/blog?id=${post.id}`} className="font-semibold text-amber-400">{post.title}</Link>
        <p className="text-sm text-white/60">{post.published ? "Published" : "Draft — reading link disabled"}</p>
        {post.published && <a href={`/blog/${post.shareToken}`} target="_blank" rel="noreferrer" className="block break-all text-sm text-amber-400 underline">/blog/{post.shareToken}</a>}
      </div>)}
    </section>
  </main>;
}
