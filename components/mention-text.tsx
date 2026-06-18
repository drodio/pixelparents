import { renderCaption } from "@/lib/mentions";

// Renders a stored caption (with @[Name](id) markers) as text + amber @-chips.
// Pure — safe to use from server components.
export function MentionText({
  caption,
  className,
}: {
  caption: string | null | undefined;
  className?: string;
}) {
  const segments = renderCaption(caption ?? "");
  if (segments.length === 0) return null;
  return (
    <span className={className}>
      {segments.map((s, i) =>
        s.kind === "mention" ? (
          <span key={i} className="font-medium text-amber-400">
            {s.name}
          </span>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </span>
  );
}
