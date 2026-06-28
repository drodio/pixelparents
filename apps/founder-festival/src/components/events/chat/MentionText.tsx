import { renderMentions } from "@/lib/event-chat-shared";

// Renders a chat body, turning @[Name](evalId) markers into profile links.
// whitespace-pre-wrap preserves the author's line breaks.
export function MentionText({ body }: { body: string }) {
  const segs = renderMentions(body);
  return (
    <span className="whitespace-pre-wrap break-words">
      {segs.map((s, i) =>
        s.kind === "mention" ? (
          <a key={i} href={`/profile?e=${s.evalId}`} className="text-[#dfa43a] hover:underline">
            {s.text.replace(/^@/, "")}
          </a>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </span>
  );
}
