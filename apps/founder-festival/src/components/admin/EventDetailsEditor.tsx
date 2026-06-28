"use client";

import { RichTextEditor } from "./RichTextEditor";
import { useAutosave, AutosaveStatus } from "@/components/admin/useAutosave";

// WYSIWYG editor for the event description (the Luma-imported body). Emits HTML;
// auto-saves (debounced). `initialDescriptionHtml` is the stored description
// already normalized to HTML on the server (markdown/plain are converted first).
// Title has its own editor (EventTitleEditor); "Re-Import from Luma" overwrites both.
export function EventDetailsEditor({
  eventId,
  initialDescriptionHtml,
}: {
  eventId: string;
  initialDescriptionHtml: string;
}) {
  const { status, schedule } = useAutosave();

  function persist(html: string) {
    schedule(async () => {
      const res = await fetch(`/api/admin/events/${eventId}/details`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description: html }),
      });
      return res.ok;
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <RichTextEditor initialContent={initialDescriptionHtml} onChange={persist} />
      <AutosaveStatus status={status} />
    </div>
  );
}
