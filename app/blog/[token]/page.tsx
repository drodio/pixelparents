import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSharedBlogPost } from "@/lib/db/blog";
import { BlogContent } from "@/components/blog-content";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Shared post — GoPixel",
  robots: { index: false, follow: false, noarchive: true },
  referrer: "no-referrer",
};

// Outside (authed): possession of the random link is all a reader needs.
export default async function BlogPostPage({ params }: { params: Promise<{ token: string }> }) {
  const post = await getSharedBlogPost((await params).token);
  if (!post) notFound();
  return <main className="min-h-dvh bg-black px-6 py-12 text-white">
    <article className="mx-auto max-w-3xl">
      <p className="text-sm font-semibold tracking-widest text-amber-400">GoPixel · Shared post</p>
      <h1 className="mb-8 mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">{post.title}</h1>
      <BlogContent body={post.body} />
    </article>
  </main>;
}
