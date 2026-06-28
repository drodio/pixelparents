import Link from "next/link";
import { notFound } from "next/navigation";
import { getEventBySlug } from "@/lib/events";
import { getViewerEvaluationId, isEventAttendee } from "@/lib/attendee";
import { getThreadForView } from "@/lib/event-chat";
import { canPostChat } from "@/lib/event-chat-shared";
import { UpvoteButton } from "@/components/events/chat/UpvoteButton";
import { ThreadRoot } from "@/components/events/chat/ThreadRoot";
import { ChatReplyTree } from "@/components/events/chat/ChatReplyTree";
import { ReplyComposer } from "@/components/events/chat/ReplyComposer";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ slug: string; threadId: string }> };

// Permalink for a single chat thread: the post + its nested replies. Access is
// gated by the thread's visibility (getThreadForView returns null otherwise).
export default async function ChatThreadPage({ params }: PageProps) {
  const { slug, threadId } = await params;
  const event = await getEventBySlug(slug);
  if (!event) notFound();

  const evalId = await getViewerEvaluationId();
  const isMember = !!evalId;
  const isAttendee = await isEventAttendee(event.id, evalId);
  const viewer = { evalId, isMember, isAttendee };

  const thread = await getThreadForView(threadId, viewer);
  if (!thread || thread.eventId !== event.id) notFound();

  const canVote = isMember;
  const canParticipate = canPostChat(thread.visibility, { isMember, isAttendee });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Link href={`/events/${slug}`} className="text-sm text-zinc-400 hover:underline">
        ← {event.title}
      </Link>

      <article className="flex gap-3">
        <UpvoteButton
          slug={slug}
          targetType="thread"
          targetId={thread.id}
          initialScore={thread.score}
          initialVoted={thread.viewerVoted}
          canVote={canVote}
        />
        <ThreadRoot
          slug={slug}
          threadId={thread.id}
          title={thread.title}
          body={thread.body}
          visibility={thread.visibility}
          authorName={thread.author.name}
          authorHref={thread.author.href}
          createdAt={thread.createdAt}
          isOwner={!!evalId && thread.author.evalId === evalId}
        />
      </article>

      <div className="border-t border-zinc-800 pt-4">
        {canParticipate ? (
          <ReplyComposer slug={slug} threadId={thread.id} />
        ) : (
          <p className="text-sm text-zinc-400">
            {isMember ? (
              "Only attendees can reply to this thread."
            ) : (
              <>
                <Link href="/?find=1" className="text-[#dfa43a] hover:underline">
                  Claim your profile
                </Link>{" "}
                to reply and upvote.
              </>
            )}
          </p>
        )}
      </div>

      <ChatReplyTree
        slug={slug}
        threadId={thread.id}
        comments={thread.comments}
        canVote={canVote}
        canParticipate={canParticipate}
        viewerEvalId={evalId}
      />
    </div>
  );
}
