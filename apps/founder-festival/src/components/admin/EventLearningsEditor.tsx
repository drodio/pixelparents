"use client";

import { useState } from "react";
import { RichTextEditor } from "./RichTextEditor";
import { useAutosave, AutosaveStatus } from "@/components/admin/useAutosave";

// Edits the three recap learnings tiers (public / members / attendees);
// auto-saves (debounced) as you type.
export function EventLearningsEditor({
  eventId,
  initialPublic,
  initialMembers,
  initialAttendees,
}: {
  eventId: string;
  initialPublic: string;
  initialMembers: string;
  initialAttendees: string;
}) {
  const [pub, setPub] = useState(initialPublic);
  const [mem, setMem] = useState(initialMembers);
  const [att, setAtt] = useState(initialAttendees);
  const { status, schedule } = useAutosave();

  function persist(nextPub: string, nextMem: string, nextAtt: string) {
    schedule(async () => {
      const res = await fetch(`/api/admin/events/${eventId}/learnings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          learningsPublic: nextPub,
          learningsMembers: nextMem,
          learningsAttendees: nextAtt,
        }),
      });
      return res.ok;
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-zinc-300">
          Public learnings <span className="text-zinc-500">— shown to everyone (green)</span>
        </label>
        <RichTextEditor
          initialContent={initialPublic}
          enableMentions
          onChange={(html) => {
            setPub(html);
            persist(html, mem, att);
          }}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-zinc-300">
          Members-only learnings{" "}
          <span className="text-zinc-500">— any claimed member (purple)</span>
        </label>
        <RichTextEditor
          initialContent={initialMembers}
          enableMentions
          onChange={(html) => {
            setMem(html);
            persist(pub, html, att);
          }}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-zinc-300">
          Attendee-only learnings{" "}
          <span className="text-zinc-500">— only RSVP&apos;d + claimed attendees (amber)</span>
        </label>
        <RichTextEditor
          initialContent={initialAttendees}
          enableMentions
          onChange={(html) => {
            setAtt(html);
            persist(pub, mem, html);
          }}
        />
      </div>
      <AutosaveStatus status={status} />
    </div>
  );
}
