"use client";

import { useState } from "react";

type Choice = "auto_approve" | "ask" | "auto_deny";

const OPTIONS: { value: Choice; label: string }[] = [
  { value: "auto_approve", label: "Auto-accept all" },
  { value: "ask", label: "Review requests" },
  { value: "auto_deny", label: "Don't accept requests" },
];

// "Allow event connection requests?" — a single 3-way choice. Used per-event
// (scope = event id, with the event-only note) and as the global default in
// /account (scope = "global", note omitted).
export function EventConnectionPref({
  scope,
  initial,
  showEventNote = false,
}: {
  scope: string;
  initial: Choice;
  showEventNote?: boolean;
}) {
  const [choice, setChoice] = useState<Choice>(initial);
  const [saved, setSaved] = useState(false);

  async function pick(next: Choice) {
    setChoice(next);
    const res = await fetch("/api/connections/event-pref", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scope, choice: next }),
    });
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1200);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-800 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-200">Allow event connection requests from attendees?</h3>
        {saved && <span className="text-xs text-emerald-400">✓ Saved</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => pick(o.value)}
            aria-pressed={choice === o.value}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              choice === o.value
                ? "border-[#dfa43a] bg-[#dfa43a]/10 text-[#dfa43a]"
                : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {showEventNote && (
        <p className="text-xs text-zinc-500">
          These settings apply to this event only. You can change your global defaults in your{" "}
          <a href="/account" className="text-[#dfa43a] hover:underline">
            account
          </a>
          .
        </p>
      )}
    </div>
  );
}
