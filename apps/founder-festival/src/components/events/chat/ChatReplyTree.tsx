"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FiEdit2, FiTrash2 } from "react-icons/fi";
import type { CommentNode } from "@/lib/event-chat";
import { relativeTime } from "@/lib/event-chat-shared";
import { UpvoteButton } from "@/components/events/chat/UpvoteButton";
import { ReplyComposer } from "@/components/events/chat/ReplyComposer";
import { MentionText } from "@/components/events/chat/MentionText";
import { MentionChipInput } from "@/components/MentionChipInput";

// Recursive nested replies (HN-style). Each comment: upvote + author + body +
// a compact reply box. canParticipate = viewer may post in this thread.
// viewerEvalId lets a comment's author edit/delete their own comment.
export function ChatReplyTree({
  slug,
  threadId,
  comments,
  canVote,
  canParticipate,
  viewerEvalId = null,
  depth = 0,
}: {
  slug: string;
  threadId: string;
  comments: CommentNode[];
  canVote: boolean;
  canParticipate: boolean;
  viewerEvalId?: string | null;
  depth?: number;
}) {
  if (comments.length === 0) return null;
  // Tighter nesting indent on phones (ml-3/pl-3) so deeply-nested replies don't
  // compress the comment text to an unreadable column; full indent from sm up.
  return (
    <ul className={`flex flex-col gap-4 ${depth > 0 ? "ml-3 sm:ml-5 border-l border-zinc-800 pl-3 sm:pl-4" : ""}`}>
      {comments.map((c) => (
        <CommentItem
          key={c.id}
          c={c}
          slug={slug}
          threadId={threadId}
          canVote={canVote}
          canParticipate={canParticipate}
          viewerEvalId={viewerEvalId}
          depth={depth}
        />
      ))}
    </ul>
  );
}

function CommentItem({
  c,
  slug,
  threadId,
  canVote,
  canParticipate,
  viewerEvalId,
  depth,
}: {
  c: CommentNode;
  slug: string;
  threadId: string;
  canVote: boolean;
  canParticipate: boolean;
  viewerEvalId: string | null;
  depth: number;
}) {
  const router = useRouter();
  const isMine = !!viewerEvalId && c.author.evalId === viewerEvalId;
  const isDeleted = c.body === "[deleted]";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(c.body);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveEdit() {
    if (!draft.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${slug}/chat/comment/${c.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: draft }),
      });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      } else {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setError(d.error ?? "Couldn't save");
      }
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${slug}/chat/comment/${c.id}`, { method: "DELETE" });
      if (res.ok) {
        setConfirming(false);
        router.refresh();
      } else {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setError(d.error ?? "Couldn't delete");
        setBusy(false);
      }
    } catch {
      setError("Network error");
      setBusy(false);
    }
  }

  return (
    <li id={`c-${c.id}`} className="group flex gap-2">
      <UpvoteButton
        slug={slug}
        targetType="comment"
        targetId={c.id}
        initialScore={c.score}
        initialVoted={c.viewerVoted}
        canVote={canVote}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <a href={c.author.href} className="text-zinc-300 hover:underline">
            {c.author.name}
          </a>{" "}
          · {relativeTime(c.createdAt)}
          {isMine && !isDeleted && !editing && (
            // Edit/delete: faint on mobile (no hover), reveal on hover from sm up.
            <span className="ml-1 flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
              <button
                type="button"
                onClick={() => { setEditing(true); setDraft(c.body); setConfirming(false); }}
                title="Edit your comment"
                aria-label="Edit your comment"
                className="text-zinc-500 hover:text-[#dfa43a]"
              >
                <FiEdit2 className="h-3.5 w-3.5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                title="Delete your comment"
                aria-label="Delete your comment"
                className="text-zinc-500 hover:text-red-400"
              >
                <FiTrash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </span>
          )}
        </div>

        {editing ? (
          <div className="flex flex-col gap-2">
            <MentionChipInput initialBody={c.body} onBody={setDraft} minHeight="3rem" />
            <div className="flex items-center gap-2">
              {error && <span className="text-xs text-red-400">{error}</span>}
              <button type="button" onClick={() => { setEditing(false); setError(null); }} className="text-xs text-zinc-400 hover:text-zinc-200">
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={busy || !draft.trim()}
                className="rounded-md bg-[#dfa43a] px-3 py-1 text-xs font-medium text-black hover:bg-[#e8b455] disabled:opacity-50"
              >
                {busy ? "…" : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <div className={`text-sm ${isDeleted ? "italic text-zinc-500" : "text-zinc-200"}`}>
            {isDeleted ? "[deleted]" : <MentionText body={c.body} />}
          </div>
        )}

        {confirming && !editing && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-zinc-400">Delete this comment?</span>
            {error && <span className="text-red-400">{error}</span>}
            <button type="button" onClick={() => { setConfirming(false); setError(null); }} className="text-zinc-400 hover:text-zinc-200">
              Cancel
            </button>
            <button
              type="button"
              onClick={doDelete}
              disabled={busy}
              className="rounded-md bg-red-500/90 px-2.5 py-1 font-medium text-white hover:bg-red-500 disabled:opacity-50"
            >
              {busy ? "…" : "Delete"}
            </button>
          </div>
        )}

        {canParticipate && !editing && (
          <ReplyComposer slug={slug} threadId={threadId} parentCommentId={c.id} compact />
        )}
        {c.replies.length > 0 && (
          <ChatReplyTree
            slug={slug}
            threadId={threadId}
            comments={c.replies}
            canVote={canVote}
            canParticipate={canParticipate}
            viewerEvalId={viewerEvalId}
            depth={depth + 1}
          />
        )}
      </div>
    </li>
  );
}
