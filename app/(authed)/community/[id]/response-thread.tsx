"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useReducedMotion, motion } from "framer-motion";
import {
  IconLock,
  IconCalendar,
  IconCircleCheck,
  IconTrash,
  IconClock,
  IconChart,
  IconPlus,
  IconX,
  IconCheck,
} from "@/components/icons";
import {
  REPLY_BODY_MAX,
  POLL_QUESTION_MAX,
  POLL_OPTION_MAX,
  POLL_MIN_OPTIONS,
  POLL_MAX_OPTIONS,
} from "@/lib/exchange-thread-validate";
import {
  replyToResponseAction,
  proposeEventAction,
  acceptEventProposalAction,
  declineEventProposalAction,
  deleteResponseMessageAction,
  createPollAction,
  votePollAction,
  closePollAction,
} from "./thread-actions";

// A single thread message projected into a serializable shape for the client. The
// server decides which private messages this viewer may see (only parties), so any
// message that reaches this component is already allowed to be rendered.
export type ThreadMessage = {
  id: string;
  createdAt: string | null; // ISO
  authorSignupId: string;
  authorName: string; // coarsened display label
  isOwn: boolean;
  kind: "comment" | "event_proposal" | "poll";
  visibility: "public" | "private";
  body: string | null;
  proposedEvent: {
    title: string;
    startsAt: string;
    endsAt: string | null;
    isOnline: boolean;
    location: string | null;
    onlineUrl: string | null;
    allDay: boolean;
  } | null;
  eventId: string | null;
  eventStatus: "proposed" | "accepted" | "declined" | null;
  // Whether THIS viewer authored the proposal (they can't accept their own).
  isProposer: boolean;
  // Poll payload + aggregated results (present only when kind === "poll"). Any
  // verified viewer can vote; viewerOptionIndex is this viewer's current choice.
  poll: {
    question: string;
    options: string[];
    closed: boolean;
    counts: number[];
    total: number;
    viewerOptionIndex: number | null;
  } | null;
};

const controlCls =
  "w-full rounded-md border border-white/15 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 focus:border-amber-400/50";

// Relative timestamp, rendered from local getters (respects the recent timezone
// fixes — we never re-parse a date-only string as UTC here).
function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";
  const diff = Date.now() - then;
  const sec = Math.round(diff / 1000);
  if (sec < 45) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(then).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Render a proposed event's when/where from LOCAL getters. All-day events show the
// calendar day only (no time) to match the events page's timezone-correct display.
function formatEventWhen(p: NonNullable<ThreadMessage["proposedEvent"]>): string {
  const start = new Date(p.startsAt);
  if (!Number.isFinite(start.getTime())) return "";
  if (p.allDay) {
    const d = start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    if (p.endsAt) {
      const end = new Date(p.endsAt);
      if (Number.isFinite(end.getTime()) && end.getTime() !== start.getTime()) {
        return `${d} – ${end.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · all day`;
      }
    }
    return `${d} · all day`;
  }
  const datePart = start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const timePart = start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  let out = `${datePart} · ${timePart}`;
  if (p.endsAt) {
    const end = new Date(p.endsAt);
    if (Number.isFinite(end.getTime())) {
      out += ` – ${end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
    }
  }
  return out;
}

export function ResponseThread({
  responseId,
  viewerIsParty,
  messages,
}: {
  responseId: string;
  viewerIsParty: boolean;
  messages: ThreadMessage[];
}) {
  const router = useRouter();
  const reduce = useReducedMotion();

  return (
    <div className="mt-4 border-t border-white/10 pt-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/40">
        Conversation
      </p>

      {messages.length === 0 ? (
        <p className="mt-2 text-xs text-white/40">
          {viewerIsParty
            ? "No messages yet. Start the conversation below."
            : "No public messages yet."}
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2.5">
          {messages.map((m) => (
            <li key={m.id}>
              {m.kind === "event_proposal" && m.proposedEvent ? (
                <EventProposalCard message={m} viewerIsParty={viewerIsParty} onChange={() => router.refresh()} reduce={Boolean(reduce)} />
              ) : m.kind === "poll" && m.poll ? (
                <PollCard message={m} viewerIsParty={viewerIsParty} onChange={() => router.refresh()} reduce={Boolean(reduce)} />
              ) : (
                <CommentBubble message={m} onDeleted={() => router.refresh()} />
              )}
            </li>
          ))}
        </ul>
      )}

      {viewerIsParty && <Composer responseId={responseId} onDone={() => router.refresh()} />}
      {!viewerIsParty && messages.length > 0 && (
        <p className="mt-3 text-[11px] text-white/35">
          You&apos;re viewing the public part of this conversation. Only the two people involved can
          reply, but anyone can vote in a poll.
        </p>
      )}
    </div>
  );
}

function CommentBubble({ message, onDeleted }: { message: ThreadMessage; onDeleted: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isPrivate = message.visibility === "private";

  const remove = () => {
    setError(null);
    startTransition(async () => {
      const res = await deleteResponseMessageAction({ messageId: message.id });
      if (res.ok) onDeleted();
      else setError(res.error);
    });
  };

  return (
    <div
      className={`rounded-xl border px-3 py-2 ${
        isPrivate
          ? "border-amber-400/20 bg-amber-400/[0.05]"
          : "border-white/10 bg-white/[0.02]"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">{message.authorName}</span>
          {isPrivate && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-200">
              <IconLock className="h-2.5 w-2.5" /> Private
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-white/40">{relativeTime(message.createdAt)}</span>
          {message.isOwn && (
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              aria-label="Delete message"
              className="text-white/30 transition hover:text-red-300 disabled:opacity-50"
            >
              <IconTrash className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      {message.body && (
        <p className="mt-1 whitespace-pre-wrap text-sm text-white/75">{message.body}</p>
      )}
      {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
    </div>
  );
}

function EventProposalCard({
  message,
  viewerIsParty,
  onChange,
  reduce,
}: {
  message: ThreadMessage;
  viewerIsParty: boolean;
  onChange: () => void;
  reduce: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const p = message.proposedEvent!;
  const isPrivate = message.visibility === "private";
  const accepted = message.eventStatus === "accepted";
  const declined = message.eventStatus === "declined";
  const canDecide = viewerIsParty && !message.isProposer && message.eventStatus === "proposed";

  const act = (kind: "accept" | "decline") => {
    setError(null);
    startTransition(async () => {
      const res =
        kind === "accept"
          ? await acceptEventProposalAction({ messageId: message.id })
          : await declineEventProposalAction({ messageId: message.id });
      if (res.ok) onChange();
      else setError(res.error);
    });
  };

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border p-3 ${
        accepted
          ? "border-emerald-400/30 bg-emerald-400/[0.06]"
          : declined
            ? "border-white/10 bg-white/[0.01] opacity-70"
            : "border-amber-400/25 bg-amber-400/[0.04]"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-200">
          <IconCalendar className="h-3.5 w-3.5" /> Event proposal
        </span>
        <div className="flex items-center gap-2">
          {isPrivate && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-200">
              <IconLock className="h-2.5 w-2.5" /> Private
            </span>
          )}
          <span className="text-[11px] text-white/40">{relativeTime(message.createdAt)}</span>
        </div>
      </div>

      <h4 className="mt-1.5 text-sm font-semibold text-white">{p.title}</h4>
      <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-white/65">
        <IconClock className="h-3 w-3 text-white/40" /> {formatEventWhen(p)}
      </p>
      <p className="mt-0.5 text-xs text-white/55">
        {p.isOnline ? (p.onlineUrl ? "Online" : "Online") : p.location ? `In person · ${p.location}` : "In person"}
      </p>
      {message.body && <p className="mt-1.5 whitespace-pre-wrap text-sm text-white/70">{message.body}</p>}
      <p className="mt-1 text-[11px] text-white/40">Proposed by {message.authorName}</p>

      {accepted ? (
        <Link
          href="/events"
          className="mt-2.5 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-300 hover:text-emerald-200"
        >
          <IconCircleCheck className="h-4 w-4" /> On the calendar
        </Link>
      ) : declined ? (
        <p className="mt-2.5 text-xs text-white/45">Declined</p>
      ) : canDecide ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => act("accept")}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-4 py-1.5 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:opacity-60"
          >
            <IconCalendar className="h-4 w-4" /> Add to the community calendar
          </button>
          <button
            type="button"
            onClick={() => act("decline")}
            disabled={pending}
            className="rounded-full border border-white/15 px-4 py-1.5 text-sm font-medium text-white/70 transition hover:bg-white/5 disabled:opacity-50"
          >
            Decline
          </button>
        </div>
      ) : message.isProposer && message.eventStatus === "proposed" ? (
        <p className="mt-2.5 text-xs text-white/45">Waiting for the other person to accept.</p>
      ) : null}
      {error && <p className="mt-1.5 text-xs text-red-300">{error}</p>}
    </motion.div>
  );
}

// A public-input poll. ANY verified viewer can vote (click an option to
// vote/change; click your current choice again to retract). Results — a filled
// bar + count + percentage per option — are visible to everyone. A party can close
// the poll, which freezes voting.
function PollCard({
  message,
  viewerIsParty,
  onChange,
  reduce,
}: {
  message: ThreadMessage;
  viewerIsParty: boolean;
  onChange: () => void;
  reduce: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const poll = message.poll!;
  const closed = poll.closed;
  const total = poll.total;

  const vote = (optionIndex: number) => {
    if (closed) return;
    setError(null);
    startTransition(async () => {
      const res = await votePollAction({ messageId: message.id, optionIndex });
      if (res.ok) onChange();
      else setError(res.error);
    });
  };

  const close = () => {
    setError(null);
    startTransition(async () => {
      const res = await closePollAction({ messageId: message.id });
      if (res.ok) onChange();
      else setError(res.error);
    });
  };

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border p-3 ${
        closed ? "border-white/10 bg-white/[0.01]" : "border-amber-400/25 bg-amber-400/[0.04]"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-200">
          <IconChart className="h-3.5 w-3.5" /> Poll
        </span>
        <span className="text-[11px] text-white/40">{relativeTime(message.createdAt)}</span>
      </div>

      <h4 className="mt-1.5 text-sm font-semibold text-white">{poll.question}</h4>

      <ul className="mt-3 flex flex-col gap-2">
        {poll.options.map((opt, i) => {
          const count = poll.counts[i] ?? 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const chosen = poll.viewerOptionIndex === i;
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => vote(i)}
                disabled={pending || closed}
                aria-pressed={chosen}
                className={`group relative w-full overflow-hidden rounded-lg border px-3 py-2 text-left transition disabled:cursor-default ${
                  chosen
                    ? "border-amber-400/60 bg-amber-400/[0.06]"
                    : "border-white/10 bg-white/[0.02] hover:border-amber-400/40"
                } ${closed ? "opacity-90" : ""}`}
              >
                {/* Filled bar showing the percentage. */}
                <span
                  aria-hidden
                  className={`absolute inset-y-0 left-0 ${reduce ? "" : "transition-[width] duration-500"} ${
                    chosen ? "bg-amber-400/25" : "bg-white/[0.06]"
                  }`}
                  style={{ width: `${pct}%` }}
                />
                <span className="relative flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-sm text-white/85">
                    {chosen && <IconCheck className="h-3.5 w-3.5 text-amber-300" />}
                    {opt}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-white/55">
                    {pct}% · {count}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <p className="text-[11px] text-white/45">
          {total} {total === 1 ? "vote" : "votes"} · by {message.authorName}
          {closed && " · Poll closed"}
        </p>
        {viewerIsParty && !closed && (
          <button
            type="button"
            onClick={close}
            disabled={pending}
            className="text-[11px] text-white/40 transition hover:text-white/70 disabled:opacity-50"
          >
            Close poll
          </button>
        )}
      </div>
      {!closed && (
        <p className="mt-1 text-[11px] text-white/30">
          Tap an option to vote — tap again to remove your vote.
        </p>
      )}
      {error && <p className="mt-1.5 text-xs text-red-300">{error}</p>}
    </motion.div>
  );
}

type Mode = "comment" | "private" | "event" | "poll";

function Composer({ responseId, onDone }: { responseId: string; onDone: () => void }) {
  const [mode, setMode] = useState<Mode>("comment");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Comment / private note fields.
  const [body, setBody] = useState("");

  // Event-proposal fields.
  const [evTitle, setEvTitle] = useState("");
  const [evNote, setEvNote] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("18:00");
  const [hasEnd, setHasEnd] = useState(false);
  const [endTime, setEndTime] = useState("19:00");
  const [isOnline, setIsOnline] = useState(false);
  const [location, setLocation] = useState("");
  const [onlineUrl, setOnlineUrl] = useState("");
  const [evPrivate, setEvPrivate] = useState(false);

  // Poll fields — a question + dynamic option inputs (start with 2, up to 6).
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);

  const setPollOption = (i: number, value: string) =>
    setPollOptions((opts) => opts.map((o, j) => (j === i ? value : o)));
  const addPollOption = () =>
    setPollOptions((opts) => (opts.length >= POLL_MAX_OPTIONS ? opts : [...opts, ""]));
  const removePollOption = (i: number) =>
    setPollOptions((opts) => (opts.length <= POLL_MIN_OPTIONS ? opts : opts.filter((_, j) => j !== i)));

  const reset = () => {
    setBody("");
    setEvTitle("");
    setEvNote("");
    setDate("");
    setLocation("");
    setOnlineUrl("");
    setPollQuestion("");
    setPollOptions(["", ""]);
  };

  const submit = () => {
    setError(null);
    startTransition(async () => {
      if (mode === "comment" || mode === "private") {
        const res = await replyToResponseAction({
          responseId,
          body,
          visibility: mode === "private" ? "private" : "public",
        });
        if (res.ok) {
          reset();
          onDone();
        } else setError(res.error);
        return;
      }
      if (mode === "poll") {
        const res = await createPollAction({
          responseId,
          question: pollQuestion,
          options: pollOptions,
        });
        if (res.ok) {
          reset();
          onDone();
        } else setError(res.error);
        return;
      }
      // Event proposal.
      const res = await proposeEventAction({
        responseId,
        visibility: evPrivate ? "private" : "public",
        note: evNote || null,
        title: evTitle,
        date,
        time: allDay ? null : time,
        endDate: hasEnd ? date : null,
        endTime: hasEnd && !allDay ? endTime : null,
        tzOffsetMinutes: new Date().getTimezoneOffset(),
        isOnline,
        location: isOnline ? null : location,
        onlineUrl: isOnline ? onlineUrl : null,
        allDay,
      });
      if (res.ok) {
        reset();
        onDone();
      } else setError(res.error);
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-3"
    >
      {/* Mode selector */}
      <div className="inline-flex flex-wrap gap-1 rounded-full border border-white/15 p-0.5">
        {(
          [
            ["comment", "Comment"],
            ["private", "Private note"],
            ["event", "Propose event"],
            ["poll", "Create poll"],
          ] as [Mode, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setMode(value);
              setError(null);
            }}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              mode === value ? "bg-amber-400 text-black" : "text-white/65 hover:bg-white/10"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "private" && (
        <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-amber-200/80">
          <IconLock className="h-3 w-3" /> Only the two of you will see this.
        </p>
      )}

      {mode === "event" ? (
        <div className="mt-3 flex flex-col gap-3">
          <input
            value={evTitle}
            onChange={(e) => setEvTitle(e.target.value)}
            placeholder="Event title (e.g. Coffee chat)"
            className={controlCls}
          />
          <label className="flex items-center gap-2 text-xs text-white/70">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="h-4 w-4 accent-amber-400"
            />
            All day
          </label>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-white/55">Date</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={`${controlCls} w-40`}
              />
            </label>
            {!allDay && (
              <>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-white/55">Start</span>
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className={`${controlCls} w-28`}
                  />
                </label>
                <label className="flex items-center gap-1.5 pb-2 text-[11px] text-white/60">
                  <input
                    type="checkbox"
                    checked={hasEnd}
                    onChange={(e) => setHasEnd(e.target.checked)}
                    className="h-3.5 w-3.5 accent-amber-400"
                  />
                  End time
                </label>
                {hasEnd && (
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-white/55">End</span>
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className={`${controlCls} w-28`}
                    />
                  </label>
                )}
              </>
            )}
          </div>

          <div className="inline-flex w-fit overflow-hidden rounded-full border border-white/15">
            <button
              type="button"
              onClick={() => setIsOnline(false)}
              className={`px-3 py-1.5 text-xs font-medium transition ${
                !isOnline ? "bg-amber-400 text-black" : "text-white/65 hover:bg-white/10"
              }`}
            >
              In person
            </button>
            <button
              type="button"
              onClick={() => setIsOnline(true)}
              className={`px-3 py-1.5 text-xs font-medium transition ${
                isOnline ? "bg-amber-400 text-black" : "text-white/65 hover:bg-white/10"
              }`}
            >
              Online
            </button>
          </div>
          {isOnline ? (
            <input
              value={onlineUrl}
              onChange={(e) => setOnlineUrl(e.target.value)}
              placeholder="https://zoom.us/j/…"
              className={controlCls}
            />
          ) : (
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Address or place name"
              className={controlCls}
            />
          )}
          <textarea
            value={evNote}
            onChange={(e) => setEvNote(e.target.value)}
            rows={2}
            placeholder="Add a note (optional)"
            className={controlCls}
          />
          <label className="flex items-center gap-2 text-xs text-white/70">
            <input
              type="checkbox"
              checked={evPrivate}
              onChange={(e) => setEvPrivate(e.target.checked)}
              className="h-4 w-4 accent-amber-400"
            />
            Keep this proposal private (just the two of you)
          </label>
        </div>
      ) : mode === "poll" ? (
        <div className="mt-3 flex flex-col gap-3">
          <p className="inline-flex items-center gap-1 text-[11px] text-amber-200/80">
            <IconChart className="h-3 w-3" /> Ask a public question — anyone viewing this post can vote.
          </p>
          <input
            value={pollQuestion}
            onChange={(e) => setPollQuestion(e.target.value)}
            maxLength={POLL_QUESTION_MAX}
            placeholder="Poll question (e.g. Which time works best?)"
            className={controlCls}
          />
          <div className="flex flex-col gap-2">
            {pollOptions.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={opt}
                  onChange={(e) => setPollOption(i, e.target.value)}
                  maxLength={POLL_OPTION_MAX}
                  placeholder={`Option ${i + 1}`}
                  className={controlCls}
                />
                {pollOptions.length > POLL_MIN_OPTIONS && (
                  <button
                    type="button"
                    onClick={() => removePollOption(i)}
                    aria-label={`Remove option ${i + 1}`}
                    className="shrink-0 rounded-md border border-white/15 p-1.5 text-white/45 transition hover:border-red-400/40 hover:text-red-300"
                  >
                    <IconX className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {pollOptions.length < POLL_MAX_OPTIONS && (
            <button
              type="button"
              onClick={addPollOption}
              className="inline-flex w-fit items-center gap-1.5 rounded-full border border-white/15 px-3 py-1 text-xs font-medium text-white/65 transition hover:bg-white/10"
            >
              <IconPlus className="h-3.5 w-3.5" /> Add option
            </button>
          )}
        </div>
      ) : (
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={REPLY_BODY_MAX}
          rows={3}
          placeholder={mode === "private" ? "Write a private note…" : "Write a reply…"}
          className={`${controlCls} mt-3`}
        />
      )}

      {error && <p className="mt-2 text-sm text-red-300">{error}</p>}

      <div className="mt-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-amber-400 px-5 py-1.5 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:opacity-50"
        >
          {pending
            ? "Sending…"
            : mode === "event"
              ? "Propose event"
              : mode === "poll"
                ? "Create poll"
                : mode === "private"
                  ? "Send private note"
                  : "Reply"}
        </button>
      </div>
    </form>
  );
}
