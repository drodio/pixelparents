"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MentionChipInput } from "@/components/MentionChipInput";
import { VISIBILITY_LABEL, type ChatVisibility } from "@/lib/event-chat-shared";
import { SectionHeading } from "@/components/SectionHeading";

// New-thread composer. Visibility defaults to "members"; "Attendees only" is
// offered only when the viewer is an attendee.
export function ChatComposer({ slug, isAttendee }: { slug: string; isAttendee: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<ChatVisibility>("members");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options: ChatVisibility[] = isAttendee ? ["members", "attendees", "public"] : ["members", "public"];

  async function submit() {
    if (!title.trim() || !body.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${slug}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: title.trim(), body, visibility }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (res.ok && data.id) {
        router.push(`/events/${slug}/chat/${data.id}`);
      } else {
        setError(data.error ?? "Couldn't post");
        setBusy(false);
      }
    } catch {
      setError("Network error");
      setBusy(false);
    }
  }

  return (
    <>
      {/* Title + "New thread" trigger on one row (button to the right of "Chat"). */}
      <div className="flex items-center justify-between gap-3">
        <SectionHeading label="Chat" className="font-display text-2xl font-semibold" />
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 rounded-md border border-[#dfa43a] px-4 py-1.5 text-sm text-[#dfa43a] hover:bg-[#dfa43a]/10"
          >
            + New thread
          </button>
        )}
      </div>

      {open && (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-800 p-4">
      <MentionChipInput singleLine onBody={setTitle} placeholder="Title — use @ to mention a member" />
      <MentionChipInput onBody={setBody} placeholder="Write something… use @ to mention a member" />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          Visibility
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as ChatVisibility)}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-white"
          >
            {options.map((v) => (
              <option key={v} value={v}>
                {VISIBILITY_LABEL[v]}
              </option>
            ))}
          </select>
        </label>
        <div className="ml-auto flex items-center gap-2">
          {error && <span className="text-sm text-red-400">{error}</span>}
          <button type="button" onClick={() => setOpen(false)} className="text-sm text-zinc-400 hover:text-zinc-200">
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !title.trim() || !body.trim()}
            className="rounded-md bg-[#dfa43a] px-4 py-1.5 text-sm font-medium text-black hover:bg-[#e8b455] disabled:opacity-50"
          >
            {busy ? "Posting…" : "Post thread"}
          </button>
        </div>
      </div>
    </div>
      )}
    </>
  );
}
