"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FiEdit2, FiTrash2 } from "react-icons/fi";
import { relativeTime, type ChatVisibility } from "@/lib/event-chat-shared";
import { MentionText } from "@/components/events/chat/MentionText";
import { VisibilityPill } from "@/components/events/chat/VisibilityPill";
import { MentionChipInput } from "@/components/MentionChipInput";

// The thread's root post (title + body + author line). When the viewer is the
// author it gains hover edit/delete controls + inline editing. Delete tombstones
// the thread if it has replies (server decides) else removes it and navigates
// back to the event.
export function ThreadRoot({
  slug,
  threadId,
  title,
  body,
  visibility,
  authorName,
  authorHref,
  createdAt,
  isOwner,
}: {
  slug: string;
  threadId: string;
  title: string;
  body: string;
  visibility: ChatVisibility;
  authorName: string;
  authorHref: string;
  createdAt: string;
  isOwner: boolean;
}) {
  const router = useRouter();
  const isDeleted = title === "[deleted]";
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);
  const [bodyDraft, setBodyDraft] = useState(body);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveEdit() {
    if (!titleDraft.trim() || !bodyDraft.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${slug}/chat/${threadId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: titleDraft, body: bodyDraft }),
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
      const res = await fetch(`/api/events/${slug}/chat/${threadId}`, { method: "DELETE" });
      const d = (await res.json().catch(() => ({}))) as { mode?: string; error?: string };
      if (res.ok) {
        if (d.mode === "deleted") router.push(`/events/${slug}`);
        else router.refresh();
      } else {
        setError(d.error ?? "Couldn't delete");
        setBusy(false);
      }
    } catch {
      setError("Network error");
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <MentionChipInput singleLine initialBody={title} onBody={setTitleDraft} placeholder="Title — use @ to mention a member" />
        <MentionChipInput initialBody={body} onBody={setBodyDraft} placeholder="Write something… use @ to mention a member" />
        <div className="flex items-center gap-2">
          {error && <span className="text-sm text-red-400">{error}</span>}
          <button type="button" onClick={() => { setEditing(false); setError(null); }} className="text-sm text-zinc-400 hover:text-zinc-200">
            Cancel
          </button>
          <button
            type="button"
            onClick={saveEdit}
            disabled={busy || !titleDraft.trim() || !bodyDraft.trim()}
            className="rounded-md bg-[#dfa43a] px-4 py-1.5 text-sm font-medium text-black hover:bg-[#e8b455] disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex min-w-0 flex-1 flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <h1 className={`font-display text-2xl font-bold ${isDeleted ? "italic text-zinc-500" : "text-zinc-100"}`}>
          {isDeleted ? "[deleted]" : <MentionText body={title} />}
        </h1>
        <VisibilityPill visibility={visibility} />
      </div>
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <a href={authorHref} className="text-zinc-300 hover:underline">
          {authorName}
        </a>{" "}
        · {relativeTime(createdAt)}
        {isOwner && !isDeleted && (
          <span className="ml-1 flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
            <button
              type="button"
              onClick={() => { setEditing(true); setTitleDraft(title); setBodyDraft(body); setConfirming(false); }}
              title="Edit your thread"
              aria-label="Edit your thread"
              className="text-zinc-500 hover:text-[#dfa43a]"
            >
              <FiEdit2 className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              title="Delete your thread"
              aria-label="Delete your thread"
              className="text-zinc-500 hover:text-red-400"
            >
              <FiTrash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          </span>
        )}
      </div>
      <div className={`text-sm ${isDeleted ? "italic text-zinc-500" : "text-zinc-200"}`}>
        {isDeleted ? "[deleted]" : <MentionText body={body} />}
      </div>
      {confirming && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-zinc-400">Delete this thread{" "}<span className="text-zinc-500">(replies, if any, are kept as “[deleted]”)</span>?</span>
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
    </div>
  );
}
