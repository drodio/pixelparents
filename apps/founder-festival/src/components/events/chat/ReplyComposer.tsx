"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MentionChipInput } from "@/components/MentionChipInput";

// Reply box for a thread (parentCommentId null) or a comment (nested). On
// success it refreshes the permalink page to show the new reply.
export function ReplyComposer({
  slug,
  threadId,
  parentCommentId = null,
  compact = false,
}: {
  slug: string;
  threadId: string;
  parentCommentId?: string | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!compact);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bump to remount the (uncontrolled) chip editor so it visually clears after a
  // successful post — setBody("") alone can't reset TipTap's internal content.
  const [formKey, setFormKey] = useState(0);

  async function submit() {
    if (!body.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${slug}/chat/${threadId}/reply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body, parentCommentId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        setBody("");
        setFormKey((k) => k + 1);
        if (compact) setOpen(false);
        router.refresh();
      } else {
        setError(data.error ?? "Couldn't reply");
      }
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-zinc-400 hover:text-zinc-200">
        Reply
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <MentionChipInput key={formKey} onBody={setBody} minHeight={compact ? "3rem" : "4.5rem"} placeholder="Reply… use @ to mention a member" />
      <div className="flex items-center gap-2">
        {error && <span className="text-xs text-red-400">{error}</span>}
        {compact && (
          <button type="button" onClick={() => setOpen(false)} className="text-xs text-zinc-400 hover:text-zinc-200">
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={busy || !body.trim()}
          className="rounded-md bg-[#dfa43a] px-3 py-1 text-xs font-medium text-black hover:bg-[#e8b455] disabled:opacity-50"
        >
          {busy ? "…" : "Reply"}
        </button>
      </div>
    </div>
  );
}
