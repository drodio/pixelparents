"use client";

import { Fragment, useState } from "react";
import { FiChevronDown } from "react-icons/fi";
import type { MemberMessageRow } from "@/lib/member-messages";

// Forward-only inbox of member-facing emails (event blasts, connection requests,
// other member emails). Rows expand inline to show the message body. An event
// pill deep-links to that event's public page.

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

// Bare "Name <addr>" → display name when present, else the address.
function senderName(from: string): string {
  const m = from.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/);
  return m ? m[1].trim() : from;
}

export function MessagesSection({ messages }: { messages: MemberMessageRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (messages.length === 0) {
    return <p className="text-sm text-zinc-500">No messages yet. Event emails and connection requests will show up here.</p>;
  }

  return (
    <div className="overflow-hidden rounded-md border border-zinc-800">
      <table className="w-full text-sm">
        <thead className="bg-zinc-900 text-xs uppercase tracking-wider text-zinc-500">
          <tr>
            <th className="px-4 py-2.5 text-left">Subject</th>
            <th className="px-4 py-2.5 text-left">From</th>
            <th className="px-4 py-2.5 text-left">Date</th>
            <th className="px-4 py-2.5 text-left">Pertaining to</th>
          </tr>
        </thead>
        <tbody>
          {messages.map((m) => {
            const open = openId === m.id;
            return (
              <Fragment key={m.id}>
                <tr
                  onClick={() => setOpenId(open ? null : m.id)}
                  className="cursor-pointer border-t border-zinc-800/70 hover:bg-zinc-900/50"
                >
                  <td className="px-4 py-2.5 text-zinc-200">
                    <span className="inline-flex items-center gap-1.5">
                      <FiChevronDown className={`text-zinc-600 transition-transform ${open ? "" : "-rotate-90"}`} />
                      <span className="max-w-[280px] truncate">{m.subject}</span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-zinc-400">{senderName(m.fromAddress)}</td>
                  <td className="px-4 py-2.5 text-zinc-400">{fmt(m.sentAt)}</td>
                  <td className="px-4 py-2.5">
                    {m.eventId && m.eventSlug ? (
                      <a
                        href={`/events/${m.eventSlug}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-block rounded-md bg-[#dfa43a]/15 px-2 py-0.5 text-xs font-medium text-[#dfa43a] hover:bg-[#dfa43a]/25"
                      >
                        {m.eventTitle ?? "Event"}
                      </a>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>
                </tr>
                {open && (
                  <tr className="border-t border-zinc-800/70 bg-[#0f0f0f]">
                    <td colSpan={4} className="px-4 py-3">
                      <div className="whitespace-pre-wrap text-sm text-zinc-300">{m.body || "(no content)"}</div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
