"use client";

import { useEffect, useMemo, useState } from "react";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { VariablePillInput } from "./VariablePillInput";
import { renderForRecipient, type CampaignRecipient } from "@/lib/email-render";
import { type EventForVars } from "@/lib/email-variables";
import { draftStorageKey, isDraftEmpty, parseDraft, serializeDraft, type EmailDraft } from "@/lib/email-draft";

// One emailable attendee (only those with an address are candidates).
export type ComposerAttendee = {
  evaluationId: string | null;
  name: string | null;
  nickname: string | null;
  email: string;
  profileHref: string | null;
  combinedScore: number | null;
};

export type ComposerEvent = {
  title: string;
  descriptionHtml: string | null;
  slug: string;
  startsAtIso: string;
  venue: string | null;
};

const BASE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://festival.so").replace(/\/+$/, "");

function attendeeToRecipient(a: ComposerAttendee): CampaignRecipient {
  return {
    toEmail: a.email,
    clerkUserId: null,
    evaluationId: a.evaluationId,
    fullName: a.name,
    nickname: a.nickname,
    profileHref: a.profileHref,
    companyName: null, // not available on the admin attendee row yet
  };
}

export function EmailComposer({
  eventId,
  attendees,
  event,
  personalizedByEval,
  connectionsByEval,
  fromOptions,
  initialSignature,
  defaultPreviewEmail,
  onSent,
  onCancel,
}: {
  eventId: string;
  attendees: ComposerAttendee[];
  event: ComposerEvent;
  personalizedByEval: Record<string, string>;
  connectionsByEval: Record<string, string>;
  fromOptions: ReadonlyArray<{ value: string; label: string }>;
  initialSignature: string;
  defaultPreviewEmail: string;
  onSent?: () => void;
  onCancel?: () => void;
}) {
  const draftKey = draftStorageKey(eventId);
  // The composer only mounts on a user click (never server-rendered), so reading
  // localStorage in a lazy initializer is safe — no hydration mismatch — and lets
  // us seed every field from a saved draft without a load effect.
  const [initialDraft] = useState<Partial<EmailDraft> | null>(() =>
    parseDraft(typeof window !== "undefined" ? window.localStorage.getItem(draftKey) : null),
  );

  const [channelEmail, setChannelEmail] = useState(true);
  const [channelText, setChannelText] = useState(false);
  const [from, setFrom] = useState(
    initialDraft?.from && fromOptions.some((o) => o.value === initialDraft.from)
      ? initialDraft.from
      : fromOptions[0]?.value ?? "",
  );
  const [bcc, setBcc] = useState(initialDraft?.bcc ?? "");
  const [subject, setSubject] = useState(initialDraft?.subject ?? "");
  const [body, setBody] = useState(initialDraft?.body ?? "");
  const [signature, setSignature] = useState(initialDraft?.signature ?? initialSignature);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialDraft?.selected ?? []));
  const [previewIdx, setPreviewIdx] = useState(0);
  const [previewEmail, setPreviewEmail] = useState(defaultPreviewEmail);
  const [scheduleMode, setScheduleMode] = useState<"now" | "on">(initialDraft?.scheduleMode ?? "now");
  const [scheduleAt, setScheduleAt] = useState(initialDraft?.scheduleAt ?? "");
  const [busy, setBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  // Whether we restored a saved draft on mount (drives the "Draft restored" hint).
  const [draftRestored, setDraftRestored] = useState(!!initialDraft);

  // Persist the draft on every change. An "empty" draft removes the key (so a
  // sent/cleared composer leaves nothing behind). No setState here, so no
  // hydration race: initial state already reflects any saved draft.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const draft = { from, bcc, subject, body, signature, selected: [...selected], scheduleMode, scheduleAt };
    try {
      if (isDraftEmpty(draft)) window.localStorage.removeItem(draftKey);
      else window.localStorage.setItem(draftKey, serializeDraft(draft));
    } catch {
      /* storage disabled or over quota — autosave is best-effort */
    }
  }, [draftKey, from, bcc, subject, body, signature, selected, scheduleMode, scheduleAt]);

  // Wipe the saved draft and reset the composed fields (after a send, or on
  // demand via "Discard draft"). Leaves From + signature as sensible defaults.
  function clearDraft() {
    try {
      if (typeof window !== "undefined") window.localStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
    setSubject("");
    setBody("");
    setBcc("");
    setSelected(new Set());
    setScheduleMode("now");
    setScheduleAt("");
    setDraftRestored(false);
  }

  const selectedList = useMemo(
    () => attendees.filter((a) => selected.has(a.email.toLowerCase())),
    [attendees, selected],
  );
  const allSelected = attendees.length > 0 && selectedList.length === attendees.length;

  function toggleOne(email: string) {
    const k = email.toLowerCase();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(attendees.map((a) => a.email.toLowerCase())));
  }

  const eventForVars: EventForVars = useMemo(
    () => ({
      title: event.title,
      descriptionHtml: event.descriptionHtml,
      slug: event.slug,
      startsAt: new Date(event.startsAtIso),
      venue: event.venue,
      attendeeCount: selectedList.length || attendees.length,
    }),
    [event, selectedList.length, attendees.length],
  );

  // The attendee currently shown in the preview pane (cycle through the selected
  // set; fall back to the first candidate so the preview is never blank).
  const previewRecipient = useMemo(() => {
    const pool = selectedList.length ? selectedList : attendees;
    if (pool.length === 0) return null;
    const a = pool[Math.min(previewIdx, pool.length - 1)];
    return attendeeToRecipient(a);
  }, [selectedList, attendees, previewIdx]);

  const rendered = useMemo(() => {
    if (!previewRecipient) return null;
    const personalizedHtml = previewRecipient.evaluationId
      ? personalizedByEval[previewRecipient.evaluationId] ?? null
      : null;
    const connectionsHtml = previewRecipient.evaluationId
      ? connectionsByEval[previewRecipient.evaluationId] ?? null
      : null;
    return renderForRecipient({
      subjectTemplate: subject,
      bodyTemplate: body,
      signatureText: signature,
      recipient: previewRecipient,
      event: eventForVars,
      personalizedHtml,
      connectionsHtml,
      baseUrl: BASE_URL,
    });
  }, [previewRecipient, subject, body, signature, eventForVars, personalizedByEval, connectionsByEval]);

  const previewPool = selectedList.length ? selectedList : attendees;

  function validate(): string | null {
    if (!channelEmail) return "Email is the only channel available right now — keep it checked.";
    if (!from) return "Choose a From address.";
    if (!subject.trim()) return "Add a subject.";
    if (selectedList.length === 0) return "Select at least one recipient.";
    if (scheduleMode === "on" && !scheduleAt) return "Pick a date and time to schedule.";
    return null;
  }

  async function send() {
    const err = validate();
    if (err) { setNote({ kind: "err", text: err }); return; }
    setBusy(true);
    setNote(null);
    try {
      const scheduledForIso =
        scheduleMode === "on" && scheduleAt ? new Date(scheduleAt).toISOString() : null;
      const res = await fetch(`/api/admin/events/${eventId}/emails`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: channelText ? "both" : "email",
          fromAddress: from,
          subjectTemplate: subject,
          bodyTemplate: body,
          signatureText: signature,
          bccAddress: bcc.trim() || null,
          recipients: selectedList.map(attendeeToRecipient),
          scheduledForIso,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNote({ kind: "err", text: `Couldn't send: ${data?.error ?? res.status}` });
        return;
      }
      if (data.scheduled) {
        setNote({ kind: "ok", text: `Scheduled for ${new Date(data.scheduledFor).toLocaleString()}.` });
      } else {
        setNote({ kind: "ok", text: `Sent: ${data.sent} · skipped ${data.skipped} · failed ${data.failed}.` });
      }
      // The draft is sent/scheduled — clear the saved copy so it won't reappear.
      clearDraft();
      onSent?.();
    } catch {
      setNote({ kind: "err", text: "Network error — try again." });
    } finally {
      setBusy(false);
    }
  }

  async function sendPreview() {
    if (!from) { setNote({ kind: "err", text: "Choose a From address first." }); return; }
    if (!subject.trim()) { setNote({ kind: "err", text: "Add a subject first." }); return; }
    if (!previewEmail.trim()) { setNote({ kind: "err", text: "Enter an address to send the preview to." }); return; }
    if (!previewRecipient) { setNote({ kind: "err", text: "No attendee to render the preview for." }); return; }
    setPreviewBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/emails/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toEmail: previewEmail.trim(),
          fromAddress: from,
          subjectTemplate: subject,
          bodyTemplate: body,
          signatureText: signature,
          recipient: previewRecipient,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setNote({ kind: "err", text: `Preview failed: ${data?.error ?? res.status}` }); return; }
      setNote({ kind: "ok", text: `Preview sent to ${previewEmail.trim()}.` });
    } catch {
      setNote({ kind: "err", text: "Network error sending preview." });
    } finally {
      setPreviewBusy(false);
    }
  }

  const fieldLabel = "text-xs font-semibold uppercase tracking-wider text-zinc-500";

  return (
    <div className="rounded-md border border-zinc-800 bg-[#0f0f0f] p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h4 className="font-display text-base font-semibold text-zinc-100">Compose</h4>
          <span className="text-[11px] text-zinc-600">
            {draftRestored ? "Draft restored · autosaves as you type" : "Autosaves as you type"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {!isDraftEmpty({ from, bcc, subject, body, signature, selected: [...selected], scheduleMode, scheduleAt }) && (
            <button
              type="button"
              onClick={clearDraft}
              className="text-sm text-zinc-500 hover:text-zinc-300"
            >
              Discard draft
            </button>
          )}
          {onCancel && (
            <button type="button" onClick={onCancel} className="text-sm text-zinc-500 hover:text-zinc-300">
              Cancel
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ── Left: the form ─────────────────────────────────────────── */}
        <div className="flex flex-col gap-4">
          {/* Channel */}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-zinc-200">
              <input type="checkbox" checked={channelEmail} onChange={(e) => setChannelEmail(e.target.checked)} />
              Email
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-500" title="Texts are coming soon">
              <input type="checkbox" checked={channelText} onChange={(e) => setChannelText(e.target.checked)} disabled />
              Text <span className="text-[10px] uppercase tracking-wider text-zinc-600">soon</span>
            </label>
          </div>

          {/* Recipients */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className={fieldLabel}>Recipients</span>
              <span className="text-xs text-zinc-500">{selectedList.length} selected</span>
            </div>
            <div className="max-h-56 overflow-y-auto rounded-md border border-zinc-800">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-zinc-900 text-xs uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th className="px-3 py-2 text-left">
                      <label className="flex items-center gap-2 normal-case tracking-normal text-zinc-300">
                        <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                        All attendees
                      </label>
                    </th>
                    <th className="px-3 py-2 text-left">Email</th>
                    <th className="px-3 py-2 text-right">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {attendees.length === 0 && (
                    <tr><td colSpan={3} className="px-3 py-4 text-zinc-500">No attendees with an email address.</td></tr>
                  )}
                  {attendees.map((a) => {
                    const k = a.email.toLowerCase();
                    return (
                      <tr key={k} className="border-t border-zinc-800/70">
                        <td className="px-3 py-1.5">
                          <label className="flex items-center gap-2 text-zinc-200">
                            <input type="checkbox" checked={selected.has(k)} onChange={() => toggleOne(a.email)} />
                            <span className="truncate">{a.name ?? "—"}</span>
                          </label>
                        </td>
                        <td className="px-3 py-1.5 text-zinc-400">{a.email}</td>
                        <td className="px-3 py-1.5 text-right font-mono tabular-nums text-zinc-400">
                          {a.combinedScore != null ? a.combinedScore.toLocaleString("en-US") : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Body */}
          <div>
            <label className={fieldLabel}>Body</label>
            <p className="mb-1.5 mt-0.5 text-[11px] text-zinc-600">
              Rich text — ⌘B bold, ⌘I italic, ⌘K link (a link URL can be a variable like{" "}
              <code className="text-zinc-400">{"{{profile-url}}"}</code>). Type @ to insert a variable or
              @-mention a Festival member as a profile link.
            </p>
            <VariablePillInput
              value={body}
              onChange={setBody}
              multiline
              rich
              ariaLabel="Body"
              placeholder="Write your message…"
              minHeightClass="min-h-[180px]"
            />
          </div>

          {/* Signature */}
          <div>
            <label className={fieldLabel}>Signature</label>
            <textarea
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              rows={5}
              className="mt-1.5 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-[#dfa43a]"
            />
          </div>
        </div>

        {/* ── Right: From / BCC / Subject, then the live preview ──────── */}
        <div className="flex flex-col gap-3">
          {/* From */}
          <div>
            <label className={fieldLabel}>From</label>
            <select
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-[#dfa43a]"
            >
              {fromOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* BCC */}
          <div>
            <label className={fieldLabel}>BCC</label>
            <p className="mb-1.5 mt-0.5 text-[11px] text-zinc-600">
              Optional. Copied on every recipient&apos;s email — the BCC inbox gets one
              message per recipient. Separate multiple addresses with commas.
            </p>
            <input
              type="text"
              value={bcc}
              onChange={(e) => setBcc(e.target.value)}
              placeholder="you@festival.so, ops@festival.so"
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-[#dfa43a]"
            />
          </div>

          {/* Subject */}
          <div>
            <label className={fieldLabel}>Subject</label>
            <p className="mb-1.5 mt-0.5 text-[11px] text-zinc-600">Type @ to insert a variable.</p>
            <VariablePillInput
              value={subject}
              onChange={setSubject}
              ariaLabel="Subject"
              placeholder="Subject line…"
            />
          </div>

          <div className="flex items-center justify-between">
            <span className={fieldLabel}>Live preview</span>
            {previewPool.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <button
                  type="button"
                  onClick={() => setPreviewIdx((i) => (i - 1 + previewPool.length) % previewPool.length)}
                  className="rounded p-1 hover:bg-zinc-800"
                  aria-label="Previous attendee"
                ><FiChevronLeft /></button>
                <span className="min-w-0 max-w-[160px] truncate">
                  {previewPool[Math.min(previewIdx, previewPool.length - 1)]?.name ?? "—"}
                </span>
                <button
                  type="button"
                  onClick={() => setPreviewIdx((i) => (i + 1) % previewPool.length)}
                  className="rounded p-1 hover:bg-zinc-800"
                  aria-label="Next attendee"
                ><FiChevronRight /></button>
                <span className="text-zinc-600">
                  {Math.min(previewIdx, previewPool.length - 1) + 1}/{previewPool.length}
                </span>
              </div>
            )}
          </div>

          <div className="rounded-md border border-zinc-800 bg-white p-4 text-black">
            {rendered ? (
              <>
                <div className="mb-2 border-b border-zinc-200 pb-2">
                  <span className="text-xs text-zinc-500">Subject:</span>{" "}
                  <span className="text-sm font-semibold text-zinc-900">{rendered.subject || "(no subject)"}</span>
                </div>
                <div className="email-preview text-sm [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-[#2563eb] [&_a]:underline [&_strong]:font-semibold [&_blockquote]:border-l-2 [&_blockquote]:border-zinc-300 [&_blockquote]:pl-3" dangerouslySetInnerHTML={{ __html: rendered.html }} />
              </>
            ) : (
              <p className="text-sm text-zinc-500">Select a recipient to preview.</p>
            )}
          </div>

          {/* Send a preview */}
          <div className="rounded-md border border-zinc-800 p-3">
            <span className={fieldLabel}>Send a preview</span>
            <p className="mb-2 mt-0.5 text-[11px] text-zinc-600">
              Renders for the attendee shown above, delivered to this address. Not logged.
            </p>
            <div className="flex gap-2">
              <input
                type="email"
                value={previewEmail}
                onChange={(e) => setPreviewEmail(e.target.value)}
                className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-[#dfa43a]"
              />
              <button
                type="button"
                onClick={sendPreview}
                disabled={previewBusy}
                className="shrink-0 rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
              >
                {previewBusy ? "Sending…" : "Send preview"}
              </button>
            </div>
          </div>

          {/* Schedule + Send */}
          <div className="rounded-md border border-zinc-800 p-3">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-zinc-200">
                <input type="radio" name="sched" checked={scheduleMode === "now"} onChange={() => setScheduleMode("now")} />
                Send now
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-200">
                <input type="radio" name="sched" checked={scheduleMode === "on"} onChange={() => setScheduleMode("on")} />
                Send on
              </label>
              {scheduleMode === "on" && (
                <input
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={(e) => setScheduleAt(e.target.value)}
                  className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-[#dfa43a]"
                />
              )}
            </div>
            <button
              type="button"
              onClick={send}
              disabled={busy}
              className="mt-3 w-full rounded-md bg-[#dfa43a] px-4 py-2 text-sm font-semibold text-black hover:bg-[#e7b75c] disabled:opacity-50"
            >
              {busy ? "Working…" : scheduleMode === "on" ? "Schedule send" : `Send to ${selectedList.length || 0} now`}
            </button>
          </div>

          {note && (
            <p className={`text-sm ${note.kind === "ok" ? "text-emerald-400" : "text-red-400"}`}>{note.text}</p>
          )}
        </div>
      </div>
    </div>
  );
}
