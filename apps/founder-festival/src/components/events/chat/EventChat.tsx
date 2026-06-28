import Link from "next/link";
import { listVisibleThreads, type ChatViewer } from "@/lib/event-chat";
import { relativeTime, renderMentions } from "@/lib/event-chat-shared";
import { UpvoteButton } from "@/components/events/chat/UpvoteButton";
import { VisibilityPill } from "@/components/events/chat/VisibilityPill";
import { ChatComposer } from "@/components/events/chat/ChatComposer";
import { SectionHeading } from "@/components/SectionHeading";

// The "Chat" section on the public event page (above the attendee list).
// HN-style compact thread list. Reading is gated by listVisibleThreads; posting
// requires a claimed member (ChatComposer), otherwise a claim prompt.
export async function EventChat({
  event,
  viewer,
}: {
  event: { id: string; slug: string; title: string };
  viewer: ChatViewer;
}) {
  const threads = await listVisibleThreads(event.id, viewer);

  return (
    <section className="flex flex-col gap-4">
      {viewer.isMember ? (
        // ChatComposer renders the "Chat" title + the "New thread" button on one row.
        <ChatComposer slug={event.slug} isAttendee={viewer.isAttendee} />
      ) : (
        <>
          <SectionHeading label="Chat" className="font-display text-2xl font-semibold" />
          <p className="text-sm text-zinc-400">
            <Link href="/?find=1" className="text-[#dfa43a] hover:underline">
              Claim your profile
            </Link>{" "}
            to start a thread, reply, and upvote.
          </p>
        </>
      )}

      {threads.length === 0 ? (
        <p className="text-sm text-zinc-500 italic">No threads yet — start the conversation.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-800 rounded-lg border border-zinc-800 overflow-hidden">
          {threads.map((t) => (
            <li key={t.id} className="flex items-start gap-3 p-3">
              <UpvoteButton
                slug={event.slug}
                targetType="thread"
                targetId={t.id}
                initialScore={t.score}
                initialVoted={t.viewerVoted}
                canVote={viewer.isMember}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-start justify-between gap-3">
                  <Link
                    href={`/events/${event.slug}/chat/${t.id}`}
                    className="min-w-0 truncate text-sm font-medium text-zinc-100 hover:text-[#dfa43a]"
                  >
                    {/* Mentions render gold (no @) but NOT as nested links — the
                        whole title is already the thread link. */}
                    {renderMentions(t.title).map((s, i) =>
                      s.kind === "mention" ? (
                        <span key={i} className="text-[#dfa43a]">{s.text.replace(/^@/, "")}</span>
                      ) : (
                        <span key={i}>{s.text}</span>
                      ),
                    )}
                  </Link>
                  <VisibilityPill visibility={t.visibility} />
                </div>
                <div className="text-xs text-zinc-500">
                  <Link href={t.author.href} className="hover:underline">
                    {t.author.name}
                  </Link>{" "}
                  · {relativeTime(t.createdAt)} ·{" "}
                  <Link href={`/events/${event.slug}/chat/${t.id}`} className="hover:underline">
                    {t.replyCount} {t.replyCount === 1 ? "reply" : "replies"}
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
