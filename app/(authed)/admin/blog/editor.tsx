"use client";
import { useActionState, useState } from "react";
import { saveBlogPost, type BlogState } from "./actions";
import { BlogContent } from "@/components/blog-content";

export function BlogEditor({ post }: { post?: { id: string; title: string; body: string; published: boolean } }) {
  const [state, action, pending] = useActionState<BlogState, FormData>(async (previous, data) => {
    const result = await saveBlogPost(previous, data);
    return { ...result, id: result.id ?? previous.id };
  }, {});
  const [body, setBody] = useState(post?.body ?? "");
  const [preview, setPreview] = useState(false);
  const input = "mt-2 w-full rounded-lg border border-white/20 bg-black p-3 text-white";
  return <form action={action} className="space-y-5 rounded-2xl border border-white/15 p-5">
    {(post?.id || state.id) && <input type="hidden" name="id" value={post?.id ?? state.id} />}
    <h2 className="text-xl font-semibold">{post ? "Edit post" : "New post"}</h2>
    <label className="block">Title<input name="title" defaultValue={post?.title} required maxLength={200} className={input} /></label>
    <label className="block">Content<textarea name="body" value={body} onChange={(e) => setBody(e.target.value)} required maxLength={100000} rows={14} className={`${input} font-mono text-sm`} /></label>
    <p className="text-sm text-white/60">Use Markdown for text. Add photos with ![Photo description](https://…). Embed a YouTube, Vimeo, or MP4/WebM video with [Video title](https://…). Raw HTML is disabled.</p>
    <button type="button" onClick={() => setPreview(!preview)} className="text-amber-400 underline">{preview ? "Hide preview" : "Preview content"}</button>
    {preview && <section aria-label="Content preview" className="rounded-xl border border-white/10 p-5"><BlogContent body={body} /></section>}
    <label className="flex gap-2"><input type="checkbox" name="published" defaultChecked={post?.published} />Published — anyone with the link can read</label>
    {post && <label className="flex gap-2"><input type="checkbox" name="rotate" />Replace secret link (old link will stop working)</label>}
    <p className="text-sm text-white/60">Uncheck Published to revoke access. These links are unlisted, not password protected; readers can forward them. Embedded media must also be accessible to your readers.</p>
    {state.error && <p role="alert" className="text-red-400">{state.error}</p>}
    {state.saved && <p role="status" className="text-emerald-400">Saved. Use the post list below to open or copy the reading link.</p>}
    <button disabled={pending} className="rounded-full bg-amber-400 px-5 py-2 font-semibold text-black disabled:opacity-50">{pending ? "Saving…" : "Save post"}</button>
  </form>;
}
