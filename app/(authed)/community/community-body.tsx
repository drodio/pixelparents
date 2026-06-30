import Link from "next/link";
import { renderCaption } from "@/lib/mentions";

// Renders a Community post body / response that may contain @[Name](signupId)
// mention markers. Pure + server-safe (mirrors components/mention-text.tsx, but
// for member mentions rather than photo-caption child tags). A mention links to
// the member's /directory profile ONLY when a token is provided for it in
// `linkById` (i.e. the member shares a profile); otherwise it renders as a plain
// amber name chip — never a link to a private profile, and never any contact
// info. Plain text runs preserve whitespace/newlines like the original body.
export function CommunityBody({
  body,
  linkById,
  className,
}: {
  body: string | null | undefined;
  // signupId -> share token (absent → render the name, no link).
  linkById?: Map<string, string | null>;
  className?: string;
}) {
  const segments = renderCaption(body ?? "");
  // No markers → render the raw text (fast path, preserves the exact string).
  if (!segments.some((s) => s.kind === "mention")) {
    return <p className={className}>{body}</p>;
  }
  return (
    <p className={className}>
      {segments.map((s, i) => {
        if (s.kind === "text") return <span key={i}>{s.text}</span>;
        const token = linkById?.get(s.id) ?? null;
        if (token) {
          return (
            <Link
              key={i}
              href={`/directory/${token}`}
              className="font-medium text-amber-300 hover:text-amber-200"
            >
              @{s.name}
            </Link>
          );
        }
        return (
          <span key={i} className="font-medium text-amber-300">
            @{s.name}
          </span>
        );
      })}
    </p>
  );
}
