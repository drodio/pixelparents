"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { FiChevronDown } from "react-icons/fi";
import { EmailComposer, type ComposerAttendee, type ComposerEvent } from "./EmailComposer";

type CampaignSummary = {
  id: string;
  channel: string;
  fromAddress: string;
  subjectTemplate: string;
  recipientCount: number;
  sentToLabel: string;
  status: string;
  scheduledFor: string | null;
  sentAt: string | null;
  createdAt: string;
};

type Detail = {
  campaign: {
    subjectTemplate: string;
    bodyTemplate: string;
    fromAddress: string;
    status: string;
    sentAt: string | null;
    scheduledFor: string | null;
  };
  recipients: Array<{ toEmail: string; fullName: string | null }>;
  delivered: Array<{ toEmail: string; subject: string; sentAt: string }>;
};

function channelLabel(c: string): string {
  if (c === "both") return "Email + Text";
  if (c === "text") return "Text";
  return "Email";
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function statusPill(status: string): { text: string; cls: string } {
  switch (status) {
    case "sent": return { text: "Sent", cls: "bg-emerald-500/15 text-emerald-400" };
    case "scheduled": return { text: "Scheduled", cls: "bg-sky-500/15 text-sky-400" };
    case "sending": return { text: "Sending", cls: "bg-amber-500/15 text-amber-400" };
    case "failed": return { text: "Failed", cls: "bg-red-500/15 text-red-400" };
    default: return { text: status, cls: "bg-zinc-700/40 text-zinc-300" };
  }
}

export function EmailsTextsPanel({
  eventId,
  initialCampaigns,
  attendees,
  event,
  personalizedByEval,
  connectionsByEval,
  fromOptions,
  initialSignature,
  defaultPreviewEmail,
}: {
  eventId: string;
  initialCampaigns: CampaignSummary[];
  attendees: ComposerAttendee[];
  event: ComposerEvent;
  personalizedByEval: Record<string, string>;
  connectionsByEval: Record<string, string>;
  fromOptions: ReadonlyArray<{ value: string; label: string }>;
  initialSignature: string;
  defaultPreviewEmail: string;
}) {
  const router = useRouter();
  const [composing, setComposing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, Detail | "loading" | "error">>({});

  async function toggleRow(id: string) {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    if (!details[id] || details[id] === "error") {
      setDetails((d) => ({ ...d, [id]: "loading" }));
      try {
        const res = await fetch(`/api/admin/events/${eventId}/emails/${id}`);
        if (!res.ok) throw new Error();
        const data = (await res.json()) as Detail;
        setDetails((d) => ({ ...d, [id]: data }));
      } catch {
        setDetails((d) => ({ ...d, [id]: "error" }));
      }
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {!composing && (
        <button
          type="button"
          onClick={() => setComposing(true)}
          className="self-start rounded-md bg-[#dfa43a] px-4 py-2 text-sm font-semibold text-black hover:bg-[#e7b75c]"
        >
          Send an Email and/or Text
        </button>
      )}

      {composing && (
        <EmailComposer
          eventId={eventId}
          attendees={attendees}
          event={event}
          personalizedByEval={personalizedByEval}
          connectionsByEval={connectionsByEval}
          fromOptions={fromOptions}
          initialSignature={initialSignature}
          defaultPreviewEmail={defaultPreviewEmail}
          onCancel={() => setComposing(false)}
          onSent={() => { setComposing(false); router.refresh(); }}
        />
      )}

      {/* Past communications */}
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Past communications</h4>
        {initialCampaigns.length === 0 ? (
          <p className="text-sm text-zinc-500">No emails or texts sent for this event yet.</p>
        ) : (
          <div className="overflow-hidden rounded-md border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-4 py-2.5 text-left">Sent to</th>
                  <th className="px-4 py-2.5 text-left">Subject</th>
                  <th className="px-4 py-2.5 text-left">Via</th>
                  <th className="px-4 py-2.5 text-left">On</th>
                  <th className="px-4 py-2.5 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {initialCampaigns.map((c) => {
                  const open = openId === c.id;
                  const det = details[c.id];
                  const pill = statusPill(c.status);
                  const when = c.sentAt ?? c.scheduledFor ?? c.createdAt;
                  return (
                    <Fragment key={c.id}>
                      <tr
                        onClick={() => toggleRow(c.id)}
                        className="cursor-pointer border-t border-zinc-800/70 hover:bg-zinc-900/50"
                      >
                        <td className="px-4 py-2.5 text-zinc-200">
                          <span className="inline-flex items-center gap-1.5">
                            <FiChevronDown className={`text-zinc-600 transition-transform ${open ? "" : "-rotate-90"}`} />
                            {c.sentToLabel}
                          </span>
                        </td>
                        <td className="max-w-[260px] truncate px-4 py-2.5 text-zinc-400">{c.subjectTemplate}</td>
                        <td className="px-4 py-2.5 text-zinc-400">{channelLabel(c.channel)}</td>
                        <td className="px-4 py-2.5 text-zinc-400">{fmt(when)}</td>
                        <td className="px-4 py-2.5">
                          <span className={`rounded-md px-2 py-0.5 text-xs ${pill.cls}`}>{pill.text}</span>
                        </td>
                      </tr>
                      {open && (
                        <tr className="border-t border-zinc-800/70 bg-[#0f0f0f]">
                          <td colSpan={5} className="px-4 py-3">
                            {det === "loading" && <p className="text-sm text-zinc-500">Loading…</p>}
                            {det === "error" && <p className="text-sm text-red-400">Couldn&apos;t load details.</p>}
                            {det && det !== "loading" && det !== "error" && (
                              <div className="flex flex-col gap-2 text-sm">
                                <div className="text-zinc-400">
                                  <span className="text-zinc-500">From:</span> {det.campaign.fromAddress}
                                </div>
                                <div className="text-zinc-300">
                                  <span className="text-zinc-500">Subject template:</span> {det.campaign.subjectTemplate}
                                </div>
                                <div className="whitespace-pre-wrap rounded border border-zinc-800 bg-zinc-900/50 p-2 text-zinc-300">
                                  {det.campaign.bodyTemplate || "(empty body)"}
                                </div>
                                <div className="text-zinc-400">
                                  <span className="text-zinc-500">Recipients ({det.recipients.length}):</span>{" "}
                                  {det.recipients.map((r) => r.fullName || r.toEmail).join(", ")}
                                </div>
                                {det.delivered.length > 0 && (
                                  <div className="text-zinc-500">
                                    Delivered to {det.delivered.length} · last at {fmt(det.delivered[0]?.sentAt ?? null)}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
