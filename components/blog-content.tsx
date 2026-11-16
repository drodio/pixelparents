import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { blogMediaUrl, blogVideo } from "@/lib/blog";

export function BlogContent({ body }: { body: string }) {
  return <div className="space-y-5 break-words leading-relaxed text-white/85">
    <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{
      h1: ({ children }) => <h2 className="mt-8 text-3xl font-semibold text-white">{children}</h2>,
      h2: ({ children }) => <h2 className="mt-8 text-2xl font-semibold text-white">{children}</h2>,
      h3: ({ children }) => <h3 className="mt-6 text-xl font-semibold text-white">{children}</h3>,
      ul: ({ children }) => <ul className="list-disc space-y-2 pl-6">{children}</ul>,
      ol: ({ children }) => <ol className="list-decimal space-y-2 pl-6">{children}</ol>,
      blockquote: ({ children }) => <blockquote className="border-l-2 border-amber-400 pl-4 text-white/65">{children}</blockquote>,
      pre: ({ children }) => <pre className="overflow-x-auto rounded-lg bg-white/5 p-4">{children}</pre>,
      img: ({ src, alt }) => {
        const safe = blogMediaUrl(typeof src === "string" ? src : undefined);
        // External blog media has no app blob credentials; no referrer leaks.
        // eslint-disable-next-line @next/next/no-img-element
        return safe ? <img src={safe} alt={alt ?? ""} loading="lazy" referrerPolicy="no-referrer" className="inline-block h-auto max-w-full rounded-xl" /> : null;
      },
      a: ({ href, children }) => {
        const video = blogVideo(href ?? "");
        if (video?.kind === "file") return <video controls preload="metadata" src={video.src} className="inline-block w-full rounded-xl" aria-label="Blog video">Your browser does not support video. <a href={video.src}>Download video</a></video>;
        if (video?.kind === "embed") return <iframe src={video.src} title={typeof children === "string" ? children : "Blog video"} loading="lazy" referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-presentation" allow="fullscreen; picture-in-picture" allowFullScreen className="inline-block aspect-video w-full rounded-xl border-0" />;
        return <a href={href} target="_blank" rel="noopener noreferrer" className="text-amber-400 underline">{children}</a>;
      },
    }}>{body}</ReactMarkdown>
  </div>;
}
